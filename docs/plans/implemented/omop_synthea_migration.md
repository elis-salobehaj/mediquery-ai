---
description: Build benchmarking database using Synthea and OMOP CDM v5.4
status: implemented
date_created: 2026-03-01
date_updated: 2026-03-01
date_completed: 2026-03-01
blocks: []
assignee: null
completion:
  - [x] Phase 1: Synthea Automation
  - [x] Phase 2: Pipeline Infrastructure & Schema Setup
  - [x] Phase 3: ETL Execution
  - [x] Phase 4: Agentic Context Prep
  - [x] Phase 5: Documentation & Test Overhaul
---

# OMOP & Synthea Benchmarking Database Migration

## Objective

Design and implement a benchmarking database using Synthea and the OMOP CDM (v5.4) running on PostgreSQL. Support schema-per-tenant multi-tenancy and prepare the LLM agent to accurately navigate the OMOP structure.

## Phase 1: Synthea Automation

**Goal:** Generate synthetic patient data (target: 500-1000 patients) reliably and prepare the raw output for ingestion.

- **Synthea Setup:** Containerize or script the installation of [Synthea](https://github.com/synthetichealth/synthea) to ensure reproducible generation across environments.
- **Generation Script:** Develop a bash/Python wrapper script (e.g., `generate_synthea.sh`) that accepts population parameters (`-p 500`) and random seeds to guarantee repeatable cohorts.
- **Output Validation:** Ensure Synthea is configured to output CSVs. Validate the generated CSVs (`patients.csv`, `encounters.csv`, `conditions.csv`, etc.) for necessary clinical data points.
- **Storage Strategy:** Stage the raw CSV output in a designated pipeline input folder (mimicking our Medallion Bronze layer).

## Phase 2: Pipeline Infrastructure & Schema Setup

**Goal:** Establish a transient data-pipeline PostgreSQL environment and deploy highly detailed, enterprise-class OMOP v5.4 DDLs using a Python-based data engineering toolchain, ensuring no corners are cut on relational complexity.

- **Environment Setup:** Create a robust Python environment in `data-pipeline/` using `uv` and `pyproject.toml` to lock dependencies (Polars, SQLAlchemy, Alembic, Pydantic).
- **Transient Database:** Run a local transient PostgreSQL container exclusively for the data pipeline's processing needs.
- **OMOP DDL Integration:** Download the official OMOP CDM v5.4 PostgreSQL DDLs. We must instantiate the _entire_ schema—including all complex standard concept tables, care sites, providers, and clinical fact tables in the transient database. Use **Alembic** to manage these OMOP schema migrations and seed scripts.
- **Enterprise Class Real-World Complexity:** We will not use a "subset" of OMOP. The benchmark database must imitate reality. This means deploying secondary associative tables like `condition_era`, `drug_era`, `dose_era`, `cost`, `payer_plan_period`, and `death`.
- **Schema-per-Tenant Design:**
  - Create a tenant-isolated schema, e.g., `tenant_nexus_health`.
  - OMOP CDM relies on structured, rigid tables. Instantiating identical OMOP tables _inside_ `tenant_nexus_health` ensures cross-tenant queries are impossible. Use dynamic SQLAlchemy schema bindings to manage `SET search_path = tenant_nexus_health`.
- **OMOP Vocabularies:** Load standard, comprehensive OMOP vocabularies into a shared `omop_vocab` schema. We will not use "dummy" concepts.
- **Initialization & Validation:** Build Python-based initialization scripts utilizing **Pydantic** models to rigorously validate configuration (like DB URIs and tenant IDs) and ensure the PostgreSQL structures spin up flawlessly in the transient DB.

## Phase 3: ETL Execution & Gold Artifact Generation

**Goal:** Map and load raw Synthea CSV outputs (Bronze) into OMOP relational tables (Silver) in the transient database, and export the resulting structures as deployable SQL dumps (Gold) for the application.

- **Tooling Selection:** Utilize a robust pipeline mechanism (Python + Polars/Pandas) to execute complex, multi-stage mappings.
- **Bronze to Silver Mapping (Enterprise Level):**
  - Synthea `patients.csv` -> Map to `person`, handle demographics, map race/ethnicity to OMOP `concept_id`s, and calculate `year_of_birth`/`month_of_birth`.
  - Synthea `encounters.csv` -> Map to `visit_occurrence`, mapping inpatient/outpatient/ER to standard visit concepts.
  - Synthea `conditions.csv` -> Map to `condition_occurrence`, tracking start/end dates.
  - Synthea `medications.csv` -> Map to `drug_exposure`, enforcing standard RxNorm concepts, days supply, and precise dose routing.
  - Synthea `observations.csv` -> Map intelligently across `measurement` (for lab values/vitals) and `observation` (for qualitative social/family history).
  - Synthea `procedures.csv` -> Map to `procedure_occurrence`.
  - Perform Era Generation: Generate `condition_era` and `drug_era` rollout tables natively based on overlapping exposures, imitating true cohort building datasets.
- **ETL Script (Silver Load):** Build an automated load script (`load_omop.py`) that reads the Bronze CSVs, performs the heavy type casting and vocabulary lookups, and bulk inserts into the transient PostgreSQL database using `COPY` commands for high throughput.
- **Gold Artifact Generation:** Once the transient database is fully populated and validated, use a Python script wrapping `pg_dump` to extract the `tenant_nexus_health` and `omop_vocab` schemas into a `gold_omop_tenant.sql` dump file.
- **Application Handoff:** Ensure this Gold SQL dump is structured properly so the downstream Mediquery application can directly mount it as a volume in `/docker-entrypoint-initdb.d/` for instantaneous, reproducible provisioning without requiring Drizzle to navigate complex OMOP DDL generation.

## Phase 4: Agentic Context Prep

**Goal:** Prepare the Text-to-SQL system to navigate the rigid, normalized OMOP schema accurately.

- **Semantic Metadata Update:** Overhaul `backend/src/ai/prompts/semantic_view.yaml` with the OMOP definitions. Map primary/foreign key connections (e.g., `person.person_id` -> `visit_occurrence.person_id`).
- **Concept Navigation Rules:** Train the AI on OMOP's unique query pattern. It must understand how to join fact tables (like `condition_occurrence`) with the `concept` table to resolve human-readable text strings (since OMOP uses integer constraints like `condition_concept_id`).
- **Prompt Engineering:** Refine the `Schema Navigator` and `SQL Writer` system prompts to recognize the OMOP CDM standard, ensuring they handle standard OMOP table names and handle tenant isolation (`search_path`) intrinsically without hallucinatory WHERE clauses (`tenant_id = X`).
- **Golden Query Validation:** Build OMOP-specific "Golden Queries" in the benchmarking suite to test whether the LLM correctly performs cross-tabular joins and vocabulary lookups.

## Phase 5: Documentation & Test Overhaul

**Goal:** Completely synchronize all project documentation, manuals, and testing suites to the new OMOP schema paradigm.

- **Revamp AGENTS.md:** Update the root agent instruction manual (`AGENTS.md`) without blooming/bloating it. Keep the same core structure but explicitly define the handling of OMOP-specific testing and the multi-schema architecture.
- **Documentation Updates:** Audit and update all README files. Sweep carefully through all files inside `docs/context/` and `docs/designs/` to rewrite semantic overviews, architecture diagrams, and testing methodologies reflecting the OMOP CDM standard.
- **Test Suite Overhaul (Frontend & Backend):**
  - Overhaul legacy unit tests bound to old schema objects (`patients`, `visits`).
  - Update `Mocks` and service tests in the backend.
  - Run the full suite (`pnpm test`) to ensure unit-level stability.
- **E2E Test Overhaul:** Rewrite all E2E Playwright functionality and LangGraph regression tests so they validate against the new OMOP structure (`person`, `visit_occurrence`). Run `pnpm test:e2e` to guarantee end-to-end multi-tenant validation.
