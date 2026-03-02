# Mediquery: Data Ingestion & ETL Architecture

> **Status**: Legacy (Superseded by OMOP CDM) | **Last Updated**: February 2026 | **Owner**: Platform Engineering

---

> [!WARNING]
> This document details the legacy custom MySQL-based ETL ingestion layer. The project is currently actively transitioning to the **OMOP CDM v5.4 standard on PostgreSQL**, orchestrated by the new `data-pipeline/` using Python, Polars, and Alembic (see `docs/plans/active/omop_synthea_migration.md`). The architectural concepts (Bronze, Silver, Gold and schema-per-tenant) remain relevant, but the table entities (`lab_results`, etc.) are entirely deprecated.

## Executive Summary

Mediquery ingests medical operational data from customer-provided files, transforms it through a standardized pipeline, and loads it into tenant-isolated databases. The LangGraph AI agent then queries these databases using natural language → SQL.

PostgreSQL application-data schema migrations are managed separately through the dedicated `packages/db` package (Drizzle schema + migration runtime) and are executed by the Docker `migrator` service.

This document covers the **data ingestion and ETL pipeline** — the system that turns raw CSV/Parquet uploads into queryable, validated, tenant-isolated KPI data.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DATA INGESTION & ETL PIPELINE                        │
│                                                                             │
│   ┌───────────────┐    ┌─────────────────┐    ┌─────────────────────────┐  │
│   │  DATA SOURCES │    │  BRONZE LAYER   │    │    SILVER LAYER         │  │
│   │               │    │  (S3 / MinIO)   │    │    (Polars in-memory)   │  │
│   │  CSV uploads  │───▶│                 │───▶│                         │  │
│   │  Parquet files│    │  Immutable raw  │    │  ✓ Schema validation    │  │
│   │  API feeds    │    │  files archived │    │  ✓ Type casting         │  │
│   │               │    │  by tenant+date │    │  ✓ Unit standardization │  │
│   └───────────────┘    └─────────────────┘    │  ✓ Null handling        │  │
│                                                └──────────┬──────────────┘  │
│                                                           │                 │
│                                                           ▼                 │
│                         ┌─────────────────────────────────────────────┐     │
│                         │         VALIDATION GATE                     │     │
│                         │         (Great Expectations)                │     │
│                         │                                             │     │
│                         │  ✓ oil_vol >= 0, gas_vol >= 0               │     │
│                         │  ✓ dates not in future                      │     │
│                         │  ✓ lat/lon within valid Medical ranges          │     │
│                         │  ✓ foreign key integrity (patient_id exists)   │     │
│                         │                                             │     │
│                         │  PASS → continue    FAIL → quarantine + alert│    │
│                         └──────────────────────┬──────────────────────┘     │
│                                                │                            │
│                                                ▼                            │
│                         ┌──────────────────────────────────────────┐        │
│                         │          GOLD LAYER                      │        │
│                         │          MySQL 8.4 (Percona / AWS Aurora)│        │
│                         │                                          │        │
│                         │  ┌──────────────┐  ┌──────────────┐     │        │
│                         │  │ tenant_abc   │  │ tenant_xyz   │     │        │
│                         │  │  patients│  │  patients│    │        │
│                         │  │  lab_results │  │  lab_results │     │        │
│                         │  │  conn_times  │  │  conn_times  │     │        │
│                         │  └──────────────┘  └──────────────┘     │        │
│                         └──────────────────────────────────────────┘        │
│                                                │                            │
└────────────────────────────────────────────────┼────────────────────────────┘
                                                 │
                                          USE tenant_abc
                                                 │
                                    ┌────────────▼────────────┐
                                    │   LangGraph AI Agent    │
                                    │   (Text-to-SQL)         │
                                    │                         │
                                    │   "What is avg wait     │
                                    │    production?"         │
                                    │         ↓               │
                                    │   SELECT AVG(oil_vol)   │
                                    │   FROM lab_results;     │
                                    └─────────────────────────┘
```

---

## Data Flow: Step by Step

| Step             | What Happens                                                  | Where              | Tooling                                |
| ---------------- | ------------------------------------------------------------- | ------------------ | -------------------------------------- |
| **1. Upload**    | Customer data files land in cloud storage                     | S3 / MinIO         | Manual upload or API                   |
| **2. Catalog**   | Files are cataloged by tenant, table type, and date           | S3 path convention | Dagster sensor                         |
| **3. Extract**   | Raw files are read into memory                                | Bronze → Memory    | Polars `read_csv()` / `read_parquet()` |
| **4. Transform** | Column renaming, type casting, unit conversion, null handling | In-memory          | Polars DataFrames                      |
| **5. Validate**  | Data quality checks against expectation suites                | In-memory          | Great Expectations                     |
| **6. Load**      | Validated data written to tenant-specific MySQL database      | Memory → Gold      | SQLAlchemy + `USE <db>`                |
| **7. Query**     | AI agent generates SQL against tenant data                    | MySQL              | LangGraph + LLM                        |

---

## The Medallion Architecture

### Bronze Layer — Raw Data Archive

**Storage**: S3 / MinIO  
**Format**: CSV, Parquet (as received from customer)  
**Retention**: Indefinite (enables full reprocessing)

**Path convention**:

```
s3://mediquery-raw/
└── tenant_id=abc/
    ├── table=patients/
    │   ├── 2026-01-15_initial_load.csv
    │   └── 2026-02-01_update.csv
    ├── table=lab_results/
    │   ├── 2026-01-15_jan_production.csv
    │   └── 2026-02-01_feb_production.csv
    └── table=wait_times/
        └── 2026-01-15_initial_load.csv
```

**Key principles**:

- Files are **immutable** — never modified after upload
- Every file is **partitioned** by tenant and table type
- Date in filename enables **incremental processing**
- Original format preserved for **audit trail**

### Silver Layer — Cleaned Data

**Storage**: In-memory (Polars DataFrames)  
**Format**: Typed, validated DataFrames  
**Retention**: Ephemeral (recreated from Bronze on each run)

Each table type has a dedicated **transformer** that enforces the schema contract:

| Transformer                  | Input (Raw CSV)                     | Output (Clean DataFrame)                                                                          |
| ---------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| `WellMetadataTransformer`    | Arbitrary column names, mixed types | `patient_name: Utf8`, `status: Utf8`, `lat: Float64`, `lon: Float64`, `mrn_number: Utf8`             |
| `KpiGeneralTransformer`      | String dates, string numbers        | `production_date: Date`, `oil_vol_bbl: Float64`, `gas_vol_mcf: Float64`, `water_vol_bbl: Float64` |
| `ConnectionTimesTransformer` | Various formats                     | `patient_id: Utf8`, `capacity: Float64`, `connection_date: Date`                                     |

**Transformation operations**:

- **Column mapping**: Source names → canonical names (e.g., `Patient Name` → `patient_name`)
- **Type casting**: `"2026-01-15"` → `Date`, `"1234.56"` → `Float64`
- **Unit standardization**: Convert to standard units (barrels, MCF, etc.)
- **Null handling**: Replace missing values with appropriate defaults or nulls
- **Deduplication**: Remove exact duplicate rows

### Gold Layer — Queryable Tenant Data

**Storage**: MySQL 8.4 (Percona, AWS Aurora-compatible)  
**Format**: Relational tables with indexes  
**Isolation**: Database-per-tenant (hard isolation)

Each tenant gets an **identical set of tables** (the Schema Contract):

```sql
-- Example: tenant_abc database
USE tenant_abc;

CREATE TABLE patients (
    id          VARCHAR(36) PRIMARY KEY,
    patient_name   VARCHAR(255) NOT NULL,
    status      VARCHAR(50),       -- Active, Shut-In, P&A, Clinical, Completed
    mrn_number  VARCHAR(20),
    latitude    DECIMAL(10, 6),
    longitude   DECIMAL(10, 6),
    spud_date   DATE,
    county      VARCHAR(100),
    state       VARCHAR(50),
    hospital    VARCHAR(255),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE lab_results (
    id               VARCHAR(36) PRIMARY KEY,
    patient_id          VARCHAR(36) NOT NULL,
    production_date  DATE NOT NULL,
    oil_vol_bbl      DECIMAL(12, 2),
    gas_vol_mcf      DECIMAL(12, 2),
    water_vol_bbl    DECIMAL(12, 2),
    runtime_hours    DECIMAL(6, 2),
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id),
    UNIQUE KEY uq_well_date (patient_id, production_date)
);

CREATE TABLE wait_times (
    id               VARCHAR(36) PRIMARY KEY,
    patient_id          VARCHAR(36) NOT NULL,
    capacity         DECIMAL(12, 2),
    connection_date  DATE,
    disconnect_date  DATE,
    status           VARCHAR(50),
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id)
);
```

**Loading strategy**:

- **Append mode**: Add new rows (daily production data)
- **Upsert mode**: `INSERT ... ON DUPLICATE KEY UPDATE` (idempotent reloads)
- **Replace mode**: `TRUNCATE` + `INSERT` (full table refresh)

---

## Tenant Isolation Model

```
                    ┌──────────────┐
                    │  PostgreSQL  │     ← App data (users, chat, tenants registry)
                    │  (App Data)  │
                    └──────┬───────┘
                           │
                    tenant_db claim
                      in JWT token
                           │
                    ┌──────▼───────┐
                    │  MySQL 8.4   │     ← KPI data (database-per-tenant)
                    │  (KPI Data)  │
                    │              │
                    │  USE tenant_abc ──────▶ Agent sees ONLY abc's tables
                    │  USE tenant_xyz ──────▶ Agent sees ONLY xyz's tables
                    │              │
                    └──────────────┘
```

**Why database-per-tenant?**

The AI agent **generates SQL dynamically**. Row-Level Security (RLS) relies on `WHERE tenant_id = ?` being present in every query — a single AI mistake could leak cross-tenant data. With database-per-tenant, `SELECT * FROM lab_results` is safe by any definition because the database itself contains only that tenant's data.

---

## Pipeline Orchestration (Dagster)

Once the manual ETL scripts are proven, they are wrapped in **Dagster** for scheduling, monitoring, and reliability.

```
┌─────────────────────── Dagster Orchestrator ──────────────────────┐
│                                                                    │
│   ┌──────────────┐   ┌──────────────┐   ┌───────────────────┐    │
│   │ bronze_*     │──▶│ silver_*     │──▶│ validated_*       │    │
│   │ (S3 ingest)  │   │ (transform)  │   │ (GE quality gate) │    │
│   └──────────────┘   └──────────────┘   └────────┬──────────┘    │
│                                                    │               │
│                                                    ▼               │
│                                          ┌─────────────────┐      │
│                                          │ gold_*          │      │
│                                          │ (MySQL load)    │      │
│                                          └─────────────────┘      │
│                                                                    │
│   Schedule: Daily at 06:00 UTC                                     │
│   Partitions: tenant × date (per-tenant failure isolation)         │
│   Monitoring: Dagster UI at :3000                                  │
│   Backfills: On-demand for historical data                         │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

**Key orchestration features**:

- **Per-tenant partitions**: Tenant A's failure doesn't block Tenant B
- **Incremental processing**: Watermark tracking (only process new files)
- **Data quality gates**: Great Expectations blocks bad data before Gold load
- **Full backfill support**: Reprocess historical data on demand
- **S3 sensor**: Detects new file uploads automatically

---

## Technology Stack

| Component           | Technology                       | Purpose                                                     |
| ------------------- | -------------------------------- | ----------------------------------------------------------- |
| **Transformation**  | Polars                           | Fast, memory-efficient DataFrame processing (Rust-based)    |
| **Orchestration**   | Dagster                          | Pipeline scheduling, monitoring, lineage, retry             |
| **Data Quality**    | Great Expectations               | Schema validation, anomaly detection, quality gates         |
| **Raw Storage**     | S3 / MinIO                       | Bronze layer — immutable source file archive                |
| **KPI Storage**     | MySQL 8.4 (Percona / AWS Aurora) | Gold layer — database-per-tenant, optimized for Text-to-SQL |
| **App Data**        | PostgreSQL 16                    | Users, chat history, tenant registry, MLOps metadata        |
| **CLI**             | Click                            | Manual ETL trigger (`uv run etl load --tenant abc`)         |
| **Package Manager** | uv                               | Fast Python dependency management                           |

---

## Project Structure

The ETL pipeline lives in a **standalone project**, decoupled from the Mediquery application:

```
data-pipeline/                    ← Independent project (sibling to backend/, frontend/)
├── pyproject.toml                ← Dependencies: polars, boto3, pymysql, dagster
├── README.md                     ← Usage docs, CSV format specs
├── sample-data/
│   ├── patients.csv
│   ├── lab_results.csv
│   └── wait_times.csv
├── src/
│   └── mediquery_etl/
│       ├── __init__.py
│       ├── cli.py                ← Click CLI entrypoint
│       ├── config.py             ← DB URLs, S3 config
│       ├── readers/
│       │   ├── s3_reader.py      ← S3/MinIO file reader
│       │   └── local_reader.py   ← Local filesystem reader (dev)
│       ├── transforms/
│       │   ├── base.py           ← Base transformer class
│       │   ├── patients.py          ← patients transforms
│       │   ├── production.py     ← lab_results transforms
│       │   └── tanks.py          ← wait_times transforms
│       ├── loaders/
│       │   └── mysql_loader.py   ← Tenant-aware MySQL writer
│       ├── quality/              ← Great Expectations suites (Plan 3)
│       └── dagster/              ← Dagster definitions (Plan 3)
│           ├── assets/
│           ├── schedules.py
│           └── sensors.py
└── tests/
    ├── test_transforms.py
    └── test_loader.py
```

---

## CLI Usage

```bash
# Load a single table for a tenant from S3
uv run etl load --tenant abc --table lab_results --source s3://mediquery-raw/

# Load all tables for a tenant
uv run etl load --tenant abc --all --source s3://mediquery-raw/

# Load from local CSV (development)
uv run etl load --tenant demo --table patients --source ./sample-data/

# Dry run — validate only, don't write
uv run etl load --tenant abc --table lab_results --dry-run
```

---

## Data Quality Rules

| Table              | Rule                                        | Severity            |
| ------------------ | ------------------------------------------- | ------------------- |
| `lab_results`      | `oil_vol_bbl >= 0`                          | Error (blocks load) |
| `lab_results`      | `gas_vol_mcf >= 0`                          | Error               |
| `lab_results`      | `production_date` not in future             | Error               |
| `lab_results`      | `patient_id` exists in `patients`         | Error               |
| `patients`    | Latitude: -90 to 90, Longitude: -180 to 180 | Error               |
| `patients`    | `mrn_number` matches format pattern         | Warning             |
| `patients`    | Unique `patient_name` per tenant               | Warning             |
| `wait_times` | `capacity > 0`                              | Error               |
| `wait_times` | Valid status values                         | Warning             |

---

## Environment & Configuration

| Variable                | Description                   | Example                                       |
| ----------------------- | ----------------------------- | --------------------------------------------- |
| `MEDIQUERY_MYSQL_URL`   | MySQL wait_time for KPI data | `mysql+pymysql://user:pass@host:3306`         |
| `AWS_ACCESS_KEY_ID`     | S3 credentials                | (from AWS profile)                            |
| `AWS_SECRET_ACCESS_KEY` | S3 credentials                | (from AWS profile)                            |
| `AWS_ENDPOINT_URL`      | MinIO endpoint (dev only)     | `http://localhost:9000`                       |
| `DAGSTER_POSTGRES_URL`  | Dagster internal metadata     | `postgresql://dagster:pass@host:5432/dagster` |

---

## Implementation Phases

| Phase                            | Scope                                                        | Deliverable                                        | Status     |
| -------------------------------- | ------------------------------------------------------------ | -------------------------------------------------- | ---------- |
| **Phase 1** — Manual ETL Scripts | S3 reader, Polars transformers, MySQL loader, CLI            | `uv run etl load --tenant abc --table lab_results` | 📋 Planned |
| **Phase 2** — Orchestration      | Dagster wrapping, scheduling, Great Expectations, monitoring | Automated daily runs with quality gates            | 📋 Backlog |
| **Phase 3** — MLOps Integration  | Training data export, evaluation suites, schema statistics   | Self-improving agent accuracy                      | 📋 Backlog |

---

## Key Design Decisions

| Decision            | Choice                                     | Rationale                                                                   |
| ------------------- | ------------------------------------------ | --------------------------------------------------------------------------- |
| ETL framework       | Polars (not Pandas)                        | 10-100x faster, lower memory, Rust-based, native lazy evaluation            |
| Orchestration       | Dagster (not Airflow)                      | Better asset model, built-in data lineage, modern API                       |
| Data quality        | Great Expectations                         | Industry standard, integrates with Dagster, declarative rules               |
| Standalone project  | `data-pipeline/` separated from `backend/` | Enables independent deployment, future MLOps pipeline                       |
| KPI database engine | MySQL 8.4 (Percona)                        | Already in production, AWS Aurora-compatible, database-per-tenant isolation |
| Loading strategy    | Upsert (default)                           | Idempotent — safe to re-run without duplicating data                        |

---

## Related Documents

| Document                                                                       | Relationship                                                      |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| [Database-per-Tenant Architecture](schema_per_tenant_rationale.md)             | Why database-per-tenant, the switchboard pattern, schema contract |
| [Plan 1: Schema Foundation](../plans/active/01_schema_foundation.md)           | Tenant registry, database template — prerequisite for ETL         |
| [Plan 2: Manual ETL Scripts](../plans/active/02_etl_scripts.md)                | Detailed implementation tasks for Phase 1                         |
| [Plan 3: Pipeline Orchestration](../plans/active/03_pipeline_orchestration.md) | Dagster wrapping, scheduling, Great Expectations                  |
| [Evaluation & Prompt Optimization](evaluation_and_finetuning.md)               | How ETL-loaded data is used for agent accuracy testing            |
