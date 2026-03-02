# Data Ingestion & ETL Architecture (OMOP)

## Scope

Active architecture for OMOP pipeline only.

## Stages

1. Bronze: raw Synthea data
2. Silver: standardized transformed layer
3. Gold: deployable OMOP SQL dump

## Tooling

- Python + `uv`
- Polars transformations
- Alembic migrations
- transient PostgreSQL processing DB

## Rules

- output must align with OMOP CDM v5.4
- migration/state changes go through Alembic
- pipeline config from `data-pipeline/config.py`
