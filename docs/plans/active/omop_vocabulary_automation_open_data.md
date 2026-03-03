---
description: End-to-end automated OMOP vocabulary + synthetic clinical data pipeline with open-license defaults and zero manual intervention
status: active
priority: high
date_created: 2026-03-02
date_updated: 2026-03-02
date_completed:
related_files:
  - AGENTS.md
  - data-pipeline/load_omop.py
  - data-pipeline/config.py
  - data-pipeline/main.py
  - data-pipeline/README.md
  - data-pipeline/pyproject.toml
  - data-pipeline/generate_synthea.sh
  - data-pipeline/alembic/versions/85ed5f4bc36d_init_omop_schemas.py
  - data-pipeline/gold_omop_tenant.sql
  - docker-compose.yml
  - backend/src/database/database.service.ts
  - backend/src/ai/prompts/semantic_view.yaml
  - docs/guides/DEVELOPMENT.md
  - docs/plans/active/omop_golden_dataset_hardening.md
depends_on:
  - docs/plans/implemented/omop_synthea_migration.md
blocks: []
assignee: null
completion:
  - [x] Phase 0 — Policy, scope, and dataset profiles
  - [x] Phase 1 — Vocabulary ingestion architecture (open-license first)
  - [x] Phase 2 — ETL mapping hardening and concept integrity
  - [x] Phase 3 — Gold dump production and idempotent orchestration
  - [x] Phase 4 — Automated QA gates (pipeline fail-fast)
  - [x] Phase 5 — Backend integration checks and benchmark readiness
  - [ ] Phase 6 — CI automation, docs, and runbooks
---

# OMOP Vocabulary Automation Plan (Open-License, No Manual Steps)

## Objective

Build a fully automated Medallion data-pipeline flow (Bronze → Silver → Gold) that:

1. Generates synthetic clinical facts (Synthea) at configurable scale.
2. Produces OMOP-compatible, joinable vocabulary coverage without manual SQL patching.
3. Enforces open-license defaults (no paid/manual proprietary vocab requirements by default).
4. Ships a production-ready `gold_omop_tenant.sql` artifact with deterministic QA gates.

This plan explicitly removes hand-fixes (no manual DB updates, no manual concept inserts) and makes pipeline correctness machine-verifiable.

---

## Problem Statement (Current Gaps)

### Observed in current dataset

- `visit_occurrence.visit_concept_id` contains standard OMOP IDs (`9201`, `9202`, `9203`) but these IDs are absent from `omop_vocab.concept`.
- Vocabulary backbone tables are present structurally but mostly empty (`concept_relationship`, `concept_synonym`, `vocabulary`, `domain`, `relationship` = 0 rows).
- Join-heavy analytical SQL using `omop_vocab.concept` can return 0 rows despite fact table data being present.

### Root cause

Current ETL builds synthetic `concept` rows from Synthea source codes only, then truncates and repopulates `omop_vocab.concept` with that reduced set. This provides partial concept names for source events but does not provide OMOP standardized vocabulary backbone.

---

## Design Principles

1. **No manual operations**: entire lifecycle executable from scripts.
2. **License-aware by default**:
   - Primary and default profile = open/synthetic-only mode.
   - Athena-import remains a documented placeholder path, not required for this plan.
3. **Deterministic artifacts**: same inputs/profile ⇒ stable output schema and QA results.
4. **Fail fast**: pipeline must stop on vocabulary integrity violations.
5. **Minimal schema changes**: reuse existing OMOP tables and add metadata/control tables only when required.

---

## Target Architecture

## Bronze

- Synthea CSV generation via `generate_synthea.sh`.
- Optional vocabulary bundle input directory (if `athena` profile enabled).

## Silver

- Alembic-managed OMOP schemas (`tenant_nexus_health`, `omop_vocab`).
- ETL loads tenant fact tables and vocabulary tables with profile-aware behavior.

## Gold

- Single command creates `gold_omop_tenant.sql` containing:
  - tenant fact tables populated,
  - vocabulary tables populated according to profile,
   - JSON run artifacts (`pipeline_run_metadata.json`, `pipeline_qa_results.json`) recording profile, timing, and QA outcomes.

---

## Data Profiles (License-Aware)

## Profile A — `synthetic_open` (default)

For organizations requiring only open/synthetic generation with no external licensed downloads.

- Generate synthetic vocabulary rows from Synthea data.
- Seed a mandatory OMOP baseline concept set required by ETL constants and analytic joins (for example: visit type concepts, demographic/type concepts used by mappings).
- Populate minimal supporting vocabulary metadata tables (`vocabulary`, `domain`, `relationship`) with synthetic/open-safe rows required for consistent joins and explainability.

Tradeoff:
- Not full OMOP vocabulary semantics,
- But deterministic and fully open, with reliable joins for benchmark and product workflows.

## Profile B — `athena_permitted` (future placeholder, out of default scope)

This remains a documented extension path only.

- Not required to make Mediquery production-usable in this plan.
- Not part of the mandatory implementation slice.
- Only considered later if governance explicitly approves licensing and artifact controls.

Rationale:
- Current objective is full automation with open/synthetic data only.
- We avoid introducing licensing dependency into baseline pipeline reliability.

---

## Minimal Schema Changes

Keep OMOP table DDL intact. **No pipeline control tables are added to the DB.**
Pipeline run metadata and QA gate results are persisted as JSON artifacts
(`pipeline_run_metadata.json`, `pipeline_qa_results.json`) in the
`data-pipeline/` directory instead.

**Rationale:** Pipeline operations metadata belongs in the main app DB (managed
by Drizzle/NestJS), not in `omop_vocab` which is OMOP vocabulary data. Adding
it to `omop_vocab` would mix concerns. Using JSON files keeps the pipeline fully
self-contained with no DB schema dependency for its own audit trail, while CI
can archive the artifacts for history.

---

## File-Level Implementation Plan

## Phase 0 — Policy, Scope, Profiles

### Files
- `data-pipeline/config.py`
- `data-pipeline/README.md`
- `docs/guides/DEVELOPMENT.md`

### Changes
- Add settings:
   - `pipeline_profile: Literal["synthetic_open", "athena_permitted"]` (default = `synthetic_open`)
  - `synthea_population_size`, `synthea_seed`
  - `vocab_bundle_path` (optional)
   - `athena_profile_enabled` (default false; guardrail switch for placeholder profile)
  - `fail_on_vocab_gap` (default true)
- Document profile behavior and licensing expectations.
- Define policy: default CI and local docs use `synthetic_open` only.

---

## Phase 1 — Vocabulary Ingestion Architecture

### Files
- `data-pipeline/load_omop.py`
- `data-pipeline/main.py`
- `data-pipeline/pyproject.toml`
- (new) `data-pipeline/vocabulary/required_concepts.py`
- (new) `data-pipeline/vocabulary/load_profile.py`
- (new) `data-pipeline/vocabulary/validators.py`

### Changes

1. Split vocabulary logic from `load_omop.py` into dedicated module:
   - `build_synthetic_vocab_from_sources(...)`
   - `load_required_baseline_concepts(...)`
   - `load_athena_bundle(...)` (placeholder only, gated and disabled by default)

2. In `synthetic_open` profile:
   - Merge synthetic concepts + required baseline set.
   - Ensure mandatory IDs used by ETL constants are present in `omop_vocab.concept`.
   - Populate currently missing vocabulary support tables so they are no longer empty:
     - `omop_vocab.vocabulary`
     - `omop_vocab.domain`
     - `omop_vocab.relationship`
     - `omop_vocab.concept_relationship` (at least minimal deterministic mappings for required baseline concepts)
     - `omop_vocab.concept_synonym` (at least synthetic synonym rows for required baseline concepts)
   - Populate `tenant_nexus_health.concept` with a controlled subset synchronized from `omop_vocab.concept` (for compatibility with tools that inspect tenant-local concept table).

3. In `athena_permitted` profile:
   - Ingest accepted Athena CSV extracts (if provided) into corresponding tables.
   - Keep fallback to baseline required concepts if specific IDs still missing.

4. Add strict checks before commit:
   - No duplicate concept_id.
   - All required IDs present.
   - Required tables non-empty per profile.
   - Previously observed missing-data tables are explicitly asserted as populated in `synthetic_open`.

---

## Phase 2 — ETL Mapping Hardening

### Files
- `data-pipeline/load_omop.py`
- (new) `data-pipeline/vocabulary/mapping.py`

### Changes

1. Replace hardcoded concept assumptions with centralized mapping helpers:
   - `resolve_visit_concept_id(encounter_class)`
   - `resolve_gender_concept_id(...)`, etc.

2. Add mapping integrity checks:
   - Any fact concept_id > 0 must resolve in `omop_vocab.concept`.
   - Track and log `concept_id = 0` rates by fact table.

3. For source-code mapped domains (conditions/drugs/procedures/observations):
   - Keep source concept representation,
   - Add explicit `source_to_concept_map` population strategy for deterministic traceability.

---

## Phase 3 — Gold Dump Orchestration

### Files
- `data-pipeline/main.py`
- (new) `data-pipeline/scripts/run_full_pipeline.py`
- (new) `data-pipeline/scripts/export_gold.py`
- `data-pipeline/README.md`

### Changes

Single orchestrator command:

1. Generate Synthea Bronze (`population`, `seed`).
2. Recreate/prepare Silver schemas (Alembic).
3. Load vocabulary by profile.
4. Load fact tables.
5. Run QA gates (blocking).
6. Export Gold SQL.
7. Record metadata/check results.

All steps idempotent with deterministic logs.

---

## Phase 4 — Automated QA Gates (Blocking)

### Files
- (new) `data-pipeline/vocabulary/qa_checks.py`
- `data-pipeline/load_omop.py`
- `data-pipeline/main.py`

### Gate categories

1. **Schema integrity**
   - Required schemas/tables exist.
   - Required OMOP fact tables non-empty (`person`, `visit_occurrence`, core clinical tables).

2. **Vocabulary integrity**
   - `omop_vocab.concept` non-empty.
   - Required concept IDs present.
   - In `synthetic_open`: `vocabulary`, `domain`, `relationship`, `concept_relationship`, and `concept_synonym` must all be non-empty above configured minimum thresholds.
   - `tenant_nexus_health.concept` must be non-empty above configured minimum threshold.
   - In `athena_permitted` (placeholder): relationship/synonym/domain/vocabulary tables must satisfy stricter thresholds.

3. **Fact-vocab joinability**
   - Join coverage checks for key facts:
     - `visit_occurrence.visit_concept_id` → `omop_vocab.concept`
     - `condition_occurrence.condition_concept_id` → `omop_vocab.concept`
     - `drug_exposure.drug_concept_id` → `omop_vocab.concept`
   - Thresholds:
     - `synthetic_open`: configurable minimum coverage (for example >= 95% non-zero concepts joinable for mapped domains; required IDs 100% present).
     - `athena_permitted`: stricter thresholds (near 100%).

4. **Temporal/data sanity**
   - Min/max visit dates present and plausible.
   - Null-rate checks for key date columns under limits.

5. **SQL smoke tests**
   - Run canonical benchmark SQL snippets (including concept join queries) and require non-error execution.

Gate failure stops export.

---

## Phase 5 — Backend + Benchmark Integration

### Files
- `backend/src/database/database.service.ts`
- `backend/src/ai/prompts/semantic_view.yaml`
- `backend/src/ai/benchmarks/corpus/omop_golden_queries.jsonl`
- `docs/plans/active/omop_golden_dataset_hardening.md`

### Changes

1. Align search path + schema assumptions with profile outputs.
2. Add benchmark fixture queries that explicitly verify concept-name joins on visit data.
3. Add regression tests proving trend queries work after pipeline run.

---

## Phase 6 — CI + Runbooks

### Files
- (new) `.github/workflows/data-pipeline-gold.yml` (or existing CI script integration)
- `docs/guides/DEVELOPMENT.md`
- `data-pipeline/README.md`
- `docs/README.md`

### Changes

1. Add CI job (nightly/manual trigger) for pipeline run + QA + artifact generation.
2. Publish QA summary artifact and gate status.
3. Document one-command developer workflow and troubleshooting matrix.

---

## Deterministic Load Order (Authoritative)

1. Validate config/profile/license mode.
2. Generate Bronze synthetic source files.
3. Apply Silver schema migrations.
4. Truncate target tables in dependency-safe order.
5. Load vocabulary layer (profile-specific).
6. Load tenant dimensions/facts:
   - person
   - visit_occurrence
   - condition_occurrence
   - drug_exposure
   - procedure_occurrence
   - measurement
   - observation
   - eras
7. Execute QA gates.
8. Export Gold dump.
9. Write run metadata + checks summary.

No manual SQL patching allowed between steps.

---

## Acceptance Criteria

1. Running pipeline with `synthetic_open` and 500 patients produces a valid Gold dump with passing QA checks.
2. Visit trend query with concept join executes without relation/concept-missing failures.
3. `omop_vocab.concept` contains all required concept IDs used by ETL constants.
4. `omop_vocab.vocabulary`, `omop_vocab.domain`, `omop_vocab.relationship`, `omop_vocab.concept_relationship`, `omop_vocab.concept_synonym`, and `tenant_nexus_health.concept` are populated (not empty) in `synthetic_open` mode.
5. Pipeline fails automatically if required concept coverage drops below threshold.
6. Full process is documented and executable by command/script only.

---

## Risks and Mitigations

1. **Risk**: synthetic_open cannot represent full OMOP semantics.
   - **Mitigation**: enforce explicit scope in docs; keep `athena_permitted` as future optional upgrade path.

2. **Risk**: accidental use of restricted vocab artifacts.
   - **Mitigation**: profile gate + allowlist + CI checks for disallowed vocab sources.

3. **Risk**: larger populations increase runtime.
   - **Mitigation**: profile-specific performance settings, chunked COPY loads, and benchmarked defaults.

---

## Immediate Next Execution Slice (MVP)

1. Implement Phase 0 + Phase 1 (`synthetic_open` only).
2. Add required baseline concepts table/module and wire into ETL.
3. Add QA gates for concept joinability and required IDs.
4. Regenerate Gold with 500 patients and verify benchmark query success.

---

## Notes on “Open Source Only” Clarification

This plan defaults to `synthetic_open` and does not require paid/proprietary datasets. `athena_permitted` stays as a future placeholder and is disabled by default. The product must remain fully operable in synthetic-open mode, including automatic population of all currently missing vocabulary-support data needed by joins and QA.
