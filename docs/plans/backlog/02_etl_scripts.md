---
title: "Plan 2: Manual ETL & Data Loading Scripts"
status: backlog
priority: medium
estimated_hours: 15-20
dependencies:
  - 01_schema_foundation
created: 2026-02-11
related_files:
  - docs/plans/backlog/01_schema_foundation.md
tags:
  - data-engineering
  - etl
  - polars
  - standalone
---

> **⚠️ LEGACY PLAN**: This plan describes a MySQL-based ETL pipeline loading `lab_results`, `patients`, `wait_times`.
> The active stack uses the Synthea → OMOP CDM v5.4 ETL pipeline in `data-pipeline/` (Python + Polars).
> See `data-pipeline/README.md` for the current OMOP ETL workflow.

## Alignment Update (2026-02-27)

Plan 2 should reuse the active benchmark contract in [docs/plans/active/automated_benchmarking_evaluation_pipeline.md](../active/automated_benchmarking_evaluation_pipeline.md) as the acceptance gate for ETL correctness.

### Required integration points before implementation sign-off

- Post-load benchmark run for impacted tenant(s)
- Data freshness and ingestion-lag tags in corpus cases
- Validation that ETL transformations do not regress SQL result equivalence
- Benchmark artifact linking to ETL batch/run identifiers

## Goal

Create standalone ETL scripts that read raw data from S3, transform it with Polars, and load it into tenant databases. These scripts run **outside** the Mediquery application — they are the seed of a future MLOps pipeline.

### Key Constraint
> "Data ingestion and Refinery might need to be added to an MLOps pipeline very likely, so don't plan integrating them in our application."

This plan builds a **standalone `data-pipeline/` project** with its own `pyproject.toml`. The Mediquery app never imports from it.

### What This Plan Does NOT Include
- ❌ Dagster orchestration (Plan 3)
- ❌ Scheduling or automation (manual CLI trigger only)
- ❌ Data quality frameworks (Plan 3)
- ❌ CDC or real-time ingestion (Plan 3)
- ❌ MLOps, vector stores (Plan 4)

---

## Architecture

```
S3 / MinIO (Bronze)                   MySQL 8.4 (Gold)
┌──────────────────────┐              ┌──────────────────────┐
│ s3://mediquery-raw/  │              │ tenant_abc.patients    │
│   tenant_id=abc/      │──── ETL ────▶│ tenant_abc.lab_results     │
│     lab_results/      │   (Polars)   │ tenant_xyz.patients   │
│       2026-02-11.csv  │              │ tenant_xyz.lab_results     │
└──────────────────────┘              └──────────────────────┘
        ▲                                       │
        │                                       │
   Manual upload                     LangGraph Agent queries
   (client data)                     (USE tenant_abc)
```

**Flow**: Client uploads CSV to S3 bucket → Operator runs ETL script → Data lands in tenant schema → Agent can query immediately.

---

## Prerequisites

- Plan 1 complete (tenants table exists, database template works, `create_tenant_database()` available)
- S3-compatible storage accessible (MinIO local dev, AWS S3 production)
- Raw data files in agreed CSV format

---

## Implementation Tasks

### 2.1 Project Scaffold

- [ ] Create `data-pipeline/` directory at project root (sibling to `backend/`, `frontend/`)
- [ ] Create `data-pipeline/pyproject.toml`:
  ```toml
  [project]
  name = "mediquery-data-pipeline"
  version = "0.1.0"
  requires-python = ">=3.12"
  dependencies = [
      "polars>=1.0",
      "boto3>=1.34",
      "pymysql>=1.1",
      "sqlalchemy>=2.0",
      "pyyaml>=6.0",
      "click>=8.0",        # CLI framework
  ]
  
  [tool.uv]
  dev-dependencies = ["pytest>=8.0", "moto>=5.0"]
  ```
- [ ] Create `data-pipeline/README.md` with usage instructions
- [ ] Create `data-pipeline/src/mediquery_etl/` package structure

### 2.2 S3 Reader (Bronze Layer)

- [ ] Create `data-pipeline/src/mediquery_etl/readers/s3_reader.py`:
  - List files in `s3://mediquery-raw/tenant_id=<id>/table=<table>/`
  - Download CSV to local temp or stream directly
  - Support path convention: `s3://mediquery-raw/tenant_id={tenant}/table={table}/{filename}.csv`
- [ ] Create `data-pipeline/src/mediquery_etl/readers/local_reader.py`:
  - Same interface but reads from local filesystem (for dev without S3)
- [ ] Support both CSV and Parquet input formats

### 2.3 Transformation Layer (Silver)

- [ ] Create `data-pipeline/src/mediquery_etl/transforms/` package
- [ ] Create base transformer:
  ```python
  # transforms/base.py
  import polars as pl
  
  class TableTransformer:
      """Base class for table-specific transformations."""
      table_name: str
      required_columns: list[str]
      
      def validate_schema(self, df: pl.DataFrame) -> pl.DataFrame:
          """Ensure required columns exist and types match."""
          ...
      
      def transform(self, df: pl.DataFrame) -> pl.DataFrame:
          """Apply table-specific transformations."""
          raise NotImplementedError
  ```
- [ ] Create table-specific transformers:
  - `transforms/patients.py` — Patient master data cleanup (`patients` table)
  - `transforms/production.py` — Unit conversions, date parsing, null handling (`lab_results` table)
  - `transforms/tanks.py` — Capacity validation (`wait_times` table)
  - (One per KPI table in the schema template)
- [ ] Each transformer handles:
  - Column renaming (source → canonical names)
  - Type casting (string dates → Date, string numbers → Float64)
  - Unit standardization (if needed)
  - Null/missing value handling
  - Basic validation (non-negative volumes, valid date ranges)

### 2.4 MySQL Loader (Gold Layer)

- [ ] Create `data-pipeline/src/mediquery_etl/loaders/mysql_loader.py`:
  ```python
  import polars as pl
  from sqlalchemy import create_engine, text
  
  class TenantLoader:
      def __init__(self, connection_uri: str):
          self.engine = create_engine(connection_uri)
      
      def load(self, df: pl.DataFrame, table_name: str, db_name: str, mode: str = "append"):
          """Load DataFrame into tenant database.
          
          Args:
              mode: 'append' (add rows) or 'replace' (truncate + insert)
          """
          with self.engine.connect() as conn:
              conn.execute(text(f"USE {db_name}"))
              df.write_database(
                  table_name=table_name,
                  wait_time=conn,
                  if_table_exists=mode,
              )
              conn.commit()
  ```
- [ ] Support upsert mode (INSERT ... ON DUPLICATE KEY UPDATE for idempotent reloads)
- [ ] Log row counts: loaded, skipped, failed

### 2.5 CLI Interface

- [ ] Create `data-pipeline/src/mediquery_etl/cli.py` using Click:
  ```bash
  # Load a single table for a tenant from S3
  uv run etl load --tenant abc --table lab_results --source s3://mediquery-raw/
  
  # Load all tables for a tenant
  uv run etl load --tenant abc --all --source s3://mediquery-raw/
  
  # Load from local CSV (dev mode)
  uv run etl load --tenant demo --table patients --source ./sample-data/
  
  # Dry run (validate only, don't write)
  uv run etl load --tenant abc --table lab_results --dry-run
  ```
- [ ] Accept DB wait_time string from env var `MEDIQUERY_MYSQL_URL`
- [ ] Accept S3 credentials from env vars or AWS profile

### 2.6 Sample Data & Testing

- [ ] Create `data-pipeline/sample-data/` with small CSV files matching expected schema
- [ ] Write tests:
  - Unit: Transformer correctly renames columns, casts types
  - Unit: Validator rejects bad data (negative volumes, future dates)
  - Integration: Full pipeline from local CSV → test MySQL database (use testcontainers or Docker MySQL)
- [ ] Document the expected CSV format for each table in `data-pipeline/README.md`

---

## Deliverables

1. **`data-pipeline/` project** — Standalone Python package with its own dependencies
2. **CLI tool** — `uv run etl load --tenant <name> --table <table> --source <path>`
3. **Polars transformers** — One per KPI table, handling type casting and validation
4. **S3 + local readers** — Read raw CSV/Parquet from S3 or filesystem
5. **MySQL loader** — Writes into tenant database with `USE <db_name>`
6. **Sample data** — Small test CSVs for each table type

---

## Definition of Done

- [ ] `uv run etl load --tenant demo --all --source ./sample-data/` loads all tables into `tenant_demo` schema
- [ ] `uv run etl load --tenant demo --table production --dry-run` validates without writing
- [ ] Loaded data is queryable by the LangGraph agent via `USE tenant_demo`
- [ ] Unit tests pass for all transformers
- [ ] README documents CSV format requirements and CLI usage

---

## Project Structure

```
data-pipeline/
├── pyproject.toml
├── README.md
├── sample-data/
│   ├── patients.csv
│   ├── lab_results.csv
│   └── wait_times.csv
├── src/
│   └── mediquery_etl/
│       ├── __init__.py
│       ├── cli.py
│       ├── config.py           # DB URLs, S3 config
│       ├── readers/
│       │   ├── __init__.py
│       │   ├── s3_reader.py
│       │   └── local_reader.py
│       ├── transforms/
│       │   ├── __init__.py
│       │   ├── base.py
│       │   ├── patients.py
│       │   ├── production.py
│       │   └── tanks.py
│       └── loaders/
│           ├── __init__.py
│           └── mysql_loader.py
└── tests/
    ├── test_transforms.py
    └── test_loader.py
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `data-pipeline/pyproject.toml` | Package definition, dependencies |
| `data-pipeline/README.md` | Usage docs, CSV format specs |
| `data-pipeline/src/mediquery_etl/cli.py` | Click CLI entrypoint |
| `data-pipeline/src/mediquery_etl/readers/s3_reader.py` | S3/MinIO file reader |
| `data-pipeline/src/mediquery_etl/readers/local_reader.py` | Local filesystem reader |
| `data-pipeline/src/mediquery_etl/transforms/base.py` | Base transformer class |
| `data-pipeline/src/mediquery_etl/transforms/production.py` | Production table transforms |
| `data-pipeline/src/mediquery_etl/loaders/mysql_loader.py` | Tenant-aware MySQL writer |
| `data-pipeline/sample-data/*.csv` | Test data files |
