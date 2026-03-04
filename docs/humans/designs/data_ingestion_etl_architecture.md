# Mediquery: Data Ingestion & ETL Architecture

> **Status**: Active | OMOP CDM v5.4 | **Last Updated**: February 2026 | **Owner**: Platform Engineering

---

## Executive Summary

Mediquery ingests clinical data from Synthea-generated CSV files, transforms it through the **OMOP CDM v5.4** standard using a Medallion Architecture, and loads it into tenant-isolated PostgreSQL schemas. The LangGraph AI agent then queries these schemas using natural language → SQL.

PostgreSQL application-data schema migrations are managed separately through the dedicated `packages/db` package (Drizzle schema + migration runtime) and are executed by the Docker `migrator` service.

This document covers the **clinical data ingestion and ETL pipeline** — the system that turns raw Synthea CSV exports into queryable, validated, OMOP-compliant, tenant-isolated clinical data.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DATA INGESTION & ETL PIPELINE                        │
│                                                                             │
│   ┌───────────────┐    ┌─────────────────┐    ┌─────────────────────────┐  │
│   │  DATA SOURCES │    │  BRONZE LAYER   │    │    SILVER LAYER         │  │
│   │               │    │  (Local CSVs)   │    │    (Polars in-memory)   │  │
│   │  Synthea CSVs │───▶│                 │───▶│                         │  │
│   │  (generated)  │    │  Immutable raw  │    │  ✓ OMOP mapping         │  │
│   │               │    │  files in       │    │  ✓ Type casting         │  │
│   │               │    │  bronze/synthea/ │    │  ✓ Vocabulary alignment │  │
│   └───────────────┘    └─────────────────┘    │  ✓ Null handling        │  │
│                                                └──────────┬──────────────┘  │
│                                                           │                 │
│                                                           ▼                 │
│                         ┌─────────────────────────────────────────────┐     │
│                         │         OMOP VALIDATION                     │     │
│                         │         (Polars + SQLAlchemy)               │     │
│                         │                                             │     │
│                         │  ✓ person_id exists in person               │     │
│                         │  ✓ concept_ids resolve in omop_vocab        │     │
│                         │  ✓ dates not in future                      │     │
│                         │  ✓ required OMOP fields populated           │     │
│                         │                                             │     │
│                         │  PASS → load to tenant schema               │     │
│                         └──────────────────────┬──────────────────────┘     │
│                                                │                            │
│                                                ▼                            │
│                         ┌──────────────────────────────────────────┐        │
│                         │          GOLD LAYER                      │        │
│                         │   PostgreSQL 18.3 (schema-per-tenant)    │        │
│                         │                                          │        │
│                         │  ┌────────────────┐  ┌────────────────┐  │        │
│                         │  │  tenant_abc    │  │  tenant_xyz    │  │        │
│                         │  │  person        │  │  person        │  │        │
│                         │  │  condition_occ │  │  condition_occ │  │        │
│                         │  │  measurement   │  │  measurement   │  │        │
│                         │  └────────────────┘  └────────────────┘  │        │
│                         └──────────────────────────────────────────┘        │
│                                                │                            │
└────────────────────────────────────────────────┼────────────────────────────┘
                                                 │
                                SET search_path TO tenant_abc
                                                 │
                                    ┌────────────▼────────────┐
                                    │   LangGraph AI Agent    │
                                    │   (Text-to-SQL)         │
                                    │                         │
                                    │   "Top 5 diagnoses?"    │
                                    │         ↓               │
                                    │   SELECT c.concept_name │
                                    │   FROM condition_occ co │
                                    │   JOIN omop_vocab.concept│
                                    └─────────────────────────┘
```

---

## Data Flow: Step by Step

| Step             | What Happens                                                         | Where                   | Tooling                                |
| ---------------- | -------------------------------------------------------------------- | ----------------------- | -------------------------------------- |
| **1. Generate**  | Synthea generates synthetic patient CSV files                        | Synthea Docker container| `generate_synthea.sh`                  |
| **2. Stage**     | Raw CSV files land in `data-pipeline/bronze/synthea/`                | Local filesystem        | Manual or CI-triggered                 |
| **3. Extract**   | Raw files are read into memory                                       | Bronze → Memory         | Polars `read_csv()`                    |
| **4. Transform** | Column mapping, type casting, OMOP vocabulary alignment              | In-memory               | Polars DataFrames + `load_omop.py`     |
| **5. Validate**  | OMOP FK integrity, concept ID references, date sanity checks         | In-memory               | SQLAlchemy + custom validation         |
| **6. Load**      | Validated data written to transient OMOP PostgreSQL tenant schema    | Memory → Gold           | SQLAlchemy + Alembic                   |
| **7. Export**    | Dump tenant schema to portable SQL file                              | PostgreSQL → SQL file   | `pg_dump` → `gold_omop_tenant.sql.gz`  |
| **8. Query**     | AI agent generates SQL against tenant OMOP schema                   | PostgreSQL              | LangGraph + LLM                        |

---

## The Medallion Architecture

### Bronze Layer — Raw Data Archive

**Storage**: Local filesystem (`data-pipeline/bronze/synthea/`)
**Format**: CSV (Synthea-generated synthetic patient data)
**Retention**: Indefinite (enables full reprocessing); gitignored from the repository

**Path convention**:

```
data-pipeline/bronze/synthea/
├── patients.csv
├── encounters.csv
├── conditions.csv
├── medications.csv
├── observations.csv
├── procedures.csv
└── ...  (all Synthea-generated clinical domain files)
```

**Key principles**:

- Files are **immutable** — never modified after generation
- Synthea generates all files in a single run via `generate_synthea.sh`
- Original format preserved for **full reprocessing** capability

### Silver Layer — Cleaned Data

**Storage**: In-memory (Polars DataFrames)
**Format**: Typed, OMOP-aligned DataFrames
**Retention**: Ephemeral (recreated from Bronze on each run via `load_omop.py`)

Each Synthea source file has a dedicated **OMOP mapper** that enforces the OMOP CDM v5.4 schema contract:

| Synthea Source      | OMOP Target Table      | Key Mappings                                                             |
| ------------------- | ---------------------- | ------------------------------------------------------------------------ |
| `patients.csv`      | `person`               | `Id` → `person_id`, gender → `gender_concept_id` via vocab lookup        |
| `conditions.csv`    | `condition_occurrence` | `SNOMED` codes → `condition_concept_id` via `omop_vocab.concept`         |
| `medications.csv`   | `drug_exposure`        | `RxNorm` codes → `drug_concept_id` via `omop_vocab.concept`              |
| `observations.csv`  | `measurement`          | `LOINC` codes → `measurement_concept_id` via `omop_vocab.concept`        |
| `encounters.csv`    | `visit_occurrence`     | encounter type → `visit_concept_id` via `omop_vocab.concept`             |
| `procedures.csv`    | `procedure_occurrence` | `SNOMED` procedure codes → `procedure_concept_id`                        |

**Transformation operations**:

- **OMOP concept mapping**: Source codes (SNOMED, RxNorm, LOINC) → standard `concept_id` integers via vocabulary lookup
- **Type casting**: date strings → `Date`, float strings → `Float64`
- **Null handling**: Replace missing values with OMOP-appropriate defaults or nulls
- **Deduplication**: Remove exact duplicate rows within each domain table

### Gold Layer — Queryable Tenant Data

**Storage**: PostgreSQL 18.3 (schema-per-tenant)  
**Format**: OMOP CDM v5.4 relational tables with indexes  
**Isolation**: Schema-per-tenant (`SET search_path TO tenant_abc`)

Each tenant gets an **identical OMOP CDM v5.4 schema** (the Schema Contract). The full DDL lives in `data-pipeline/omop_ddl/`; below is an illustrative excerpt:

```sql
-- Example: tenant_abc schema (PostgreSQL)
SET search_path TO tenant_abc;

CREATE TABLE person (
    person_id                BIGINT        NOT NULL,
    gender_concept_id        INTEGER       NOT NULL,
    year_of_birth            INTEGER       NOT NULL,
    month_of_birth           INTEGER,
    day_of_birth             INTEGER,
    race_concept_id          INTEGER       NOT NULL,
    ethnicity_concept_id     INTEGER       NOT NULL,
    CONSTRAINT person_pk PRIMARY KEY (person_id)
);

CREATE TABLE condition_occurrence (
    condition_occurrence_id  BIGINT        NOT NULL,
    person_id                BIGINT        NOT NULL,
    condition_concept_id     INTEGER       NOT NULL,
    condition_start_date     DATE          NOT NULL,
    condition_end_date       DATE,
    visit_occurrence_id      BIGINT,
    CONSTRAINT condition_occ_pk PRIMARY KEY (condition_occurrence_id),
    CONSTRAINT fk_co_person FOREIGN KEY (person_id) REFERENCES person(person_id)
);

CREATE TABLE measurement (
    measurement_id           BIGINT        NOT NULL,
    person_id                BIGINT        NOT NULL,
    measurement_concept_id   INTEGER       NOT NULL,
    measurement_date         DATE          NOT NULL,
    value_as_number          NUMERIC,
    unit_concept_id          INTEGER,
    CONSTRAINT measurement_pk PRIMARY KEY (measurement_id),
    CONSTRAINT fk_m_person FOREIGN KEY (person_id) REFERENCES person(person_id)
);
```

The complete OMOP v5.4 DDL (all 37 tables) is applied via `data-pipeline/omop_ddl/OMOPCDM_postgresql_5.4_ddl.sql`.

**Loading strategy**:

- **`load_omop.py`**: Reads Synthea CSVs with Polars, maps to OMOP tables via concept lookups, bulk-inserts
- **Idempotency**: Truncate + reload per tenant (safe to re-run; no duplicate rows)
- **Migrations**: Alembic in `data-pipeline/alembic/` manages schema evolution
- **Portable dump**: Final tenant data is exported as `data-pipeline/gold_omop_tenant.sql.gz` for deployment

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
                    ┌──────────────────────┐
                    │  PostgreSQL 18.3     │  ← OMOP clinical data (schema-per-tenant)
                    │  (Clinical Data)     │
                    │                      │
                    │  SET search_path TO  │
                    │    tenant_abc ────────────▶ Agent sees ONLY abc's OMOP tables
                    │    tenant_xyz ────────────▶ Agent sees ONLY xyz's OMOP tables
                    │                      │
                    └──────────────────────┘
```

**Why schema-per-tenant?**

The AI agent **generates SQL dynamically**. Row-Level Security (RLS) relies on `WHERE tenant_id = ?` being present in every query — a single AI mistake could leak cross-tenant data. With schema-per-tenant (`SET search_path TO tenant_abc`), `SELECT * FROM condition_occurrence` is safe by definition because the schema itself contains only that tenant's OMOP data.

---

## Pipeline Orchestration

**Current state (Phase 1)**: The pipeline runs as a manual Python script. There is no scheduler in production yet.

```
┌──────────────────────────────────────────────────────────────────┐
│                  Current Pipeline (Manual)                       │
│                                                                  │
│  data-pipeline/bronze/synthea/  ─▶  load_omop.py  ─▶  PostgreSQL│
│       (Synthea CSV files)             (Polars ETL)    schema-per │
│                                                         -tenant  │
│                                                                  │
│  Trigger: uv run python load_omop.py                             │
│  Output:  gold_omop_tenant.sql.gz (portable dump for deployment) │
└──────────────────────────────────────────────────────────────────┘
```

**Planned state (Phase 2)**: Wrap in Dagster for scheduling, monitoring, and per-tenant partitioning.

**Key steps run by `load_omop.py`**:

- Read Synthea Bronze CSVs with Polars
- Map source fields to OMOP CDM v5.4 columns (concept lookups)
- Truncate + reload target OMOP tables in the tenant schema
- Export portable `gold_omop_tenant.sql.gz` dump for downstream deployment

---

## Technology Stack

| Component           | Technology                       | Purpose                                                     |
| ------------------- | -------------------------------- | ----------------------------------------------------------- |
| **Transformation**  | Polars                           | Fast, memory-efficient DataFrame processing (Rust-based)     |
| **Orchestration**   | Planned — Dagster (Phase 2)      | Pipeline scheduling, monitoring, lineage, retry              |
| **Data Quality**    | Planned — Great Expectations (Phase 2) | Schema validation, anomaly detection, quality gates    |
| **Raw Storage**     | Local filesystem (`data-pipeline/bronze/synthea/`) | Bronze layer — Synthea-generated CSVs       |
| **Clinical Storage**| PostgreSQL 18.3 (schema-per-tenant) | Gold layer — OMOP CDM v5.4, one schema per tenant        |
| **App Data**        | PostgreSQL 18.3                  | Users, chat history, tenant registry, thread metadata        |
| **CLI**             | Python (`uv run python load_omop.py`) | Manual ETL trigger and gold SQL dump generation         |
| **Package Manager** | uv                               | Fast Python dependency management for `data-pipeline/`       |

---

## Project Structure

The ETL pipeline lives in a **standalone project**, decoupled from the Mediquery application:

```
data-pipeline/                    ← Standalone OMOP ETL project (sibling to backend/, frontend/)
├── pyproject.toml                ← uv dependencies: polars, sqlalchemy, alembic
├── config.py                     ← Settings (POSTGRES_*, OMOP_SCHEMA, etc.)
├── load_omop.py                  ← Main ETL script (Polars Synthea → OMOP transform)
├── main.py                       ← CLI entrypoint
├── docker-compose.yml            ← Transient PostgreSQL 18.3 ETL database
├── generate_synthea.sh           ← Synthea data generation script
├── gold_omop_tenant.sql.gz       ← Deployable OMOP tenant SQL dump
├── alembic/                      ← Alembic migrations for OMOP tenant schemas
│   └── versions/
├── bronze/synthea/               ← Raw Synthea CSV files (gitignored)
└── omop_ddl/                     ← OMOP CDM v5.4 DDL artifacts
    ├── OMOPCDM_postgresql_5.4_ddl.sql
    ├── OMOPCDM_postgresql_5.4_primary_keys.sql
    ├── OMOPCDM_postgresql_5.4_indices.sql
    └── OMOPCDM_postgresql_5.4_constraints.sql
```

---

## CLI Usage

```bash
# Run the full OMOP ETL pipeline (Bronze CSVs → PostgreSQL tenant schema)
cd data-pipeline
uv run python load_omop.py

# Generate a portable SQL dump of the loaded tenant data
uv run python main.py

# Regenerate Synthea Bronze CSVs (requires Synthea installed)
bash generate_synthea.sh

# Start the transient ETL PostgreSQL database
docker compose up -d
```

---

## Data Quality Rules

| Table                    | Rule                                                     | Severity            |
| ------------------------ | -------------------------------------------------------- | ------------------- |
| `person`                 | `person_id IS NOT NULL`                                  | Error (blocks load) |
| `person`                 | `year_of_birth BETWEEN 1900 AND EXTRACT(YEAR FROM NOW())`| Error               |
| `person`                 | `gender_concept_id IS NOT NULL`                          | Error               |
| `condition_occurrence`   | `condition_concept_id IS NOT NULL`                       | Error (blocks load) |
| `condition_occurrence`   | `condition_start_date IS NOT NULL`                       | Error               |
| `condition_occurrence`   | `person_id` exists in `person`                           | Error               |
| `measurement`            | `measurement_concept_id IS NOT NULL`                     | Error (blocks load) |
| `measurement`            | `measurement_date IS NOT NULL`                           | Error               |
| `measurement`            | `value_as_number` is numeric or NULL (no string values)  | Warning             |
| `visit_occurrence`       | `visit_start_date <= visit_end_date`                     | Error               |
| All concept ID columns   | Resolve in `omop_vocab.concept`                          | Warning             |

---

## Environment & Configuration

| Variable              | Description                          | Example                          |
| --------------------- | ------------------------------------ | -------------------------------- |
| `POSTGRES_HOST`       | PostgreSQL host for ETL database     | `localhost`                      |
| `POSTGRES_PORT`       | PostgreSQL port                      | `5432`                           |
| `POSTGRES_USER`       | PostgreSQL user                      | `omop`                           |
| `POSTGRES_PASSWORD`   | PostgreSQL password                  | (from `.env`)                    |
| `POSTGRES_DB`         | PostgreSQL database name             | `omop`                           |
| `OMOP_SCHEMA`         | Target tenant schema name            | `tenant_abc`                     |

All settings are imported from `data-pipeline/config.py`. Never use `os.environ` directly in ETL scripts.

---

## Implementation Phases

| Phase                            | Scope                                                            | Deliverable                                         | Status         |
| -------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------- | -------------- |
| **Phase 1** — OMOP ETL Scripts   | Synthea CSV reader, Polars OMOP mappers, PostgreSQL loader, dump | `uv run python load_omop.py` + `gold_omop_tenant.sql.gz` | ✅ Complete   |
| **Phase 2** — Orchestration      | Dagster wrapping, scheduling, Great Expectations, monitoring     | Automated daily runs with quality gates             | 📋 Backlog     |
| **Phase 3** — MLOps Integration  | Training data export, evaluation suites, schema statistics       | Self-improving agent accuracy                       | 📋 Backlog     |

---

## Key Design Decisions

| Decision              | Choice                                       | Rationale                                                                     |
| --------------------- | -------------------------------------------- | ----------------------------------------------------------------------------- |
| ETL framework         | Polars (not Pandas)                          | 10–100× faster, lower memory, Rust-based, native lazy evaluation              |
| Orchestration         | Dagster planned (Phase 2)                    | Better asset model, built-in data lineage, modern API                         |
| Data quality          | Great Expectations planned (Phase 2)         | Industry standard, integrates with Dagster, declarative rules                 |
| Standalone project    | `data-pipeline/` separated from `backend/`  | Enables independent deployment, future MLOps pipeline                         |
| Clinical data engine  | PostgreSQL 18.3 (schema-per-tenant)          | Unified database, OMOP-native, safe tenant isolation via `search_path`        |
| Loading strategy      | Truncate + reload (idempotent)               | Safe to re-run; no partial/duplicate state; OMOP concept IDs are stable       |
| Medical data standard | OMOP CDM v5.4                                | Vendor-neutral, globally adopted, enables cross-institution query portability |

---

## Related Documents

| Document                                                                           | Relationship                                                           |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [Schema-per-Tenant Rationale](schema_per_tenant_rationale.md)                      | Why schema-per-tenant, the switchboard pattern, schema contract        |
| [Schema Conventions & FK Patterns](schema_conventions_surrogate_fk.md)             | OMOP table conventions, surrogate keys, FK policies                    |
| [Evaluation & Prompt Optimization](evaluation_and_finetuning.md)                   | How ETL-loaded OMOP data is used for agent accuracy benchmarking       |
| [Multi-Agent Architecture](multi_agent_architecture.md)                             | How the AI graph queries the OMOP tenant schemas                       |
| [OMOP CDM v5.4 DDL](../../data-pipeline/omop_ddl/OMOPCDM_postgresql_5.4_ddl.sql)  | Authoritative OMOP table definitions                                   |
