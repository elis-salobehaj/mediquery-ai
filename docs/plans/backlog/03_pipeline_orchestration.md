---
title: "Plan 3: Pipeline Orchestration & Data Quality"
status: backlog
priority: medium
estimated_hours: 25-35
dependencies:
  - 01_schema_foundation
  - 02_etl_scripts
created: 2026-02-11
related_files:
  - docs/plans/backlog/01_schema_foundation.md
  - docs/plans/backlog/02_etl_scripts.md
tags:
  - data-engineering
  - dagster
  - data-quality
  - orchestration
  - standalone
---

## Alignment Update (2026-02-27)

Plan 3 should operationalize benchmark automation from [docs/plans/active/automated_benchmarking_evaluation_pipeline.md](../active/automated_benchmarking_evaluation_pipeline.md), not create a parallel evaluator.

### Required integration points before implementation sign-off

- Dagster job hook to trigger benchmark after successful Gold load
- Daily benchmark trend snapshots and regression delta reports
- Failure policy: data-quality pass + benchmark regression fail must block promotion
- Partition-aware benchmark execution (tenant/date slices)

## Goal

Wrap the manual ETL scripts (Plan 2) in **Dagster** for orchestration, scheduling, and monitoring. Add **Great Expectations** for data quality validation. This plan still lives entirely outside the Mediquery application.

### What This Plan Adds Over Plan 2
- ✅ Scheduled pipeline runs (daily/hourly)
- ✅ Dagster UI for monitoring, lineage, and retry
- ✅ Data quality checks before loading (Great Expectations)
- ✅ Incremental processing (watermarks, not full reloads)
- ✅ Per-tenant partitions (tenant A fails, tenant B still runs)
- ✅ MinIO Bronze layer for raw file retention

### What This Plan Does NOT Include
- ❌ CDC / real-time streaming (future enhancement)
- ❌ MLOps, vector stores, training data (Plan 4)
- ❌ Any changes to the Mediquery application

---

## Architecture

```
                           Dagster Orchestrator
                          ┌─────────────────────────┐
   S3 / MinIO             │                         │         MySQL 8.4
┌──────────────┐   ingest │  ┌─────────┐  ┌──────┐ │ load   ┌───────────────┐
│ Raw uploads  │──────────┼─▶│ Bronze  │─▶│Silver│─┼────────▶│ tenant_*.tables│
│ (CSV/Parquet)│          │  │ Assets  │  │Assets│ │         └───────────────┘
└──────────────┘          │  └─────────┘  └──┬───┘ │
                          │                  │     │
                          │           ┌──────▼───┐ │
                          │           │  Great   │ │
                          │           │  Expect. │ │
                          │           └──────────┘ │
                          │                        │
                          │  Dagster UI :3000       │
                          └─────────────────────────┘
```

**Medallion Layers**:
- **Bronze** (MinIO/S3): Immutable raw files, partitioned by tenant + date
- **Silver** (in-memory Polars): Cleaned, typed, validated DataFrames
- **Gold** (MySQL 8.4): Tenant database tables, optimized for Text-to-SQL

---

## Prerequisites

- Plan 1 complete (tenant databases exist in MySQL)
- Plan 2 complete (Polars transformers and MySQL loader working via CLI)
- MinIO or S3 bucket provisioned

---

## Implementation Tasks

### 3.1 Dagster Project Setup

- [ ] Extend `data-pipeline/` project with Dagster:
  ```toml
  # Add to pyproject.toml dependencies
  "dagster>=1.9",
  "dagster-webserver>=1.9",
  "dagster-postgres>=0.25",     # Dagster metadata in PostgreSQL
  "pymysql>=1.1",               # KPI data loading into MySQL
  "great-expectations>=1.0",
  ```
- [ ] Create `data-pipeline/src/mediquery_etl/dagster/` package
- [ ] Configure Dagster workspace: `data-pipeline/workspace.yaml`
- [ ] Add Dagster to `docker-compose.yml` (dev profile)

### 3.2 Bronze Assets — Ingestion

- [ ] Create Dagster assets that catalog raw files from S3:
  ```python
  @asset(partitions_def=tenant_daily_partitions)
  def bronze_kpi_general(context) -> pl.DataFrame:
      """Read raw lab_results CSV from S3 Bronze layer."""
      tenant_id, date = context.partition_key.split("|")
      path = f"s3://mediquery-raw/tenant_id={tenant_id}/table=lab_results/{date}.csv"
      return pl.read_csv(path)
  ```
- [ ] S3 path convention: `s3://mediquery-raw/tenant_id={id}/table={table}/{date}.{ext}`
- [ ] Add Dagster sensor to detect new files in S3 bucket
- [ ] Retain raw files indefinitely (immutable Bronze layer)

### 3.3 Silver Assets — Transformation

- [ ] Wrap Plan 2's Polars transformers as Dagster assets:
  ```python
  @asset(deps=[bronze_kpi_general], partitions_def=tenant_daily_partitions)
  def silver_kpi_general(context, bronze_kpi_general) -> pl.DataFrame:
      """Clean and validate lab_results data."""
      transformer = KpiGeneralTransformer()
      return transformer.transform(bronze_kpi_general)
  ```
- [ ] One Silver asset per KPI table type
- [ ] Silver assets are stateless (re-runnable from Bronze)

### 3.4 Data Quality — Great Expectations

- [ ] Create expectation suites per OMOP table:
  - `condition_occurrence`: valid concept_ids, dates not in future, person_id not null
  - `measurement`: value_as_number within plausible ranges, measurement_date not null
  - `visit_occurrence`: visit_end_date >= visit_start_date, valid visit_concept_id
- [ ] Integrate GE into Silver assets (validate before Gold load):
  ```python
  @asset(deps=[silver_kpi_general])
  def validated_kpi_general(context, silver_kpi_general):
      results = ge_context.run_checkpoint("kpi_general_check", batch=silver_kpi_general)
      if not results.success:
          raise Failure(f"Data quality failed: {results.describe()}")
      return silver_kpi_general
  ```
- [ ] Configure Dagster to surface GE results in the UI

### 3.5 Gold Assets — Multi-Tenant Loading

- [ ] Wrap Plan 2's MySQL loader as Dagster assets:
  ```python
  @asset(deps=[validated_kpi_general], partitions_def=tenant_daily_partitions)
  def gold_kpi_general(context, validated_kpi_general):
      """Load validated lab_results data into tenant database."""
      tenant_id = context.partition_key.split("|")[0]
      db_name = get_tenant_database(tenant_id)
      loader = TenantLoader(connection_uri=settings.mysql_url)
      loader.load(validated_kpi_general, "lab_results", db_name, mode="upsert")
  ```
- [ ] Upsert logic: `INSERT ... ON DUPLICATE KEY UPDATE`
- [ ] Log row counts as Dagster metadata

### 3.6 Partitioning & Scheduling

- [ ] Define partitions:
  ```python
  tenant_daily_partitions = MultiPartitionsDefinition({
      "tenant": StaticPartitionsDefinition(get_active_tenant_ids()),
      "date": DailyPartitionsDefinition(start_date="2024-01-01"),
  })
  ```
- [ ] Schedule daily runs: `ScheduleDefinition(cron_schedule="0 6 * * *")`
- [ ] Support backfills: `dagster asset backfill --from 2026-01-01 --to 2026-01-31`
- [ ] Per-tenant failure isolation (one tenant fails, others continue)

### 3.7 Incremental Processing

- [ ] Implement watermark tracking:
  - Record `last_processed_timestamp` per (tenant, table) in Dagster metadata
  - Only process files newer than watermark
- [ ] Skip unchanged data (file hash comparison)
- [ ] Support late-arriving data via manual backfill command

### 3.8 Observability

- [ ] Dagster UI accessible at `http://localhost:3000` (dev)
- [ ] Track per-run metrics: rows processed, duration, failures
- [ ] Alert on pipeline failures (configurable: Slack, email, webhook)
- [ ] Asset lineage graph visible in Dagster UI (Bronze → Silver → Gold)

---

## Deliverables

1. **Dagster project** — Running inside `data-pipeline/` with web UI
2. **Bronze/Silver/Gold assets** — Complete medallion pipeline per KPI table
3. **Great Expectations suites** — Data quality checks per table
4. **Scheduled daily runs** — Automated tenant data loading
5. **Backfill support** — Reload historical data on demand
6. **Observability** — Dagster UI with lineage, metrics, and alerts

---

## Definition of Done

- [ ] Dagster UI shows complete asset graph (Bronze → Silver → Validated → Gold)
- [ ] Daily schedule runs successfully for 2+ tenants for 3 consecutive days
- [ ] Great Expectations blocks a bad data file from reaching Gold
- [ ] Backfill of 30 days completes without manual intervention
- [ ] One tenant's failure doesn't block other tenants' pipelines
- [ ] Pipeline metrics visible in Dagster UI (rows loaded, duration)

---

## Docker Compose Addition

```yaml
# docker-compose.yml (dev profile)
services:
  dagster-webserver:
    build: ./data-pipeline
    ports:
      - "3000:3000"
    environment:
      - DAGSTER_POSTGRES_URL=postgresql://...   # Dagster internal metadata
      - MEDIQUERY_MYSQL_URL=mysql+pymysql://... # KPI data loading
      - AWS_ENDPOINT_URL=http://minio:9000
    depends_on:
      - mediquery-postgres
      - mediquery-mysql
      - minio
    profiles:
      - pipeline

  minio:
    image: minio/minio
    ports:
      - "9000:9000"
      - "9001:9001"  # Console
    command: server /data --console-address ":9001"
    volumes:
      - minio-data:/data
    profiles:
      - pipeline
```

---

## Files to Create / Modify

| File | Action | Purpose |
|------|--------|---------|
| `data-pipeline/pyproject.toml` | Modify | Add Dagster, GE dependencies |
| `data-pipeline/workspace.yaml` | Create | Dagster workspace config |
| `data-pipeline/src/mediquery_etl/dagster/` | Create | Dagster definitions package |
| `data-pipeline/src/mediquery_etl/dagster/assets/bronze.py` | Create | Raw data ingestion assets |
| `data-pipeline/src/mediquery_etl/dagster/assets/silver.py` | Create | Transformation assets |
| `data-pipeline/src/mediquery_etl/dagster/assets/gold.py` | Create | Tenant loading assets |
| `data-pipeline/src/mediquery_etl/dagster/schedules.py` | Create | Daily schedule definitions |
| `data-pipeline/src/mediquery_etl/dagster/sensors.py` | Create | S3 new-file sensor |
| `data-pipeline/src/mediquery_etl/quality/` | Create | Great Expectations suites |
| `docker-compose.yml` | Modify | Add Dagster + MinIO services |
