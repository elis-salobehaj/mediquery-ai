# Mediquery Documentation

Primary documentation hub for both coding agents and human contributors.

---

## Documentation Tracks

### Agent Track (Authoritative + Concise)

Use these docs when implementing code changes with strict policy constraints:

- [Agents Context](agents/context/)
- [Agents Designs](agents/designs/)

Suggested starting points:
- [Architecture Policy](agents/context/ARCHITECTURE.md)
- [Configuration Policy](agents/context/CONFIGURATION.md)
- [Workflow Policy](agents/context/WORKFLOWS.md)

### Human Track (Detailed + Visual)

Use these docs for onboarding, architecture understanding, and design rationale:

- [Humans Context](humans/context/)
- [Humans Designs](humans/designs/)

Suggested starting points:
- [Architecture (Human Guide)](humans/context/ARCHITECTURE.md)
- [Benchmarking (Human Guide)](humans/context/BENCHMARKING.md)
- [Engineering Workflows (Human Guide)](humans/context/WORKFLOWS.md)

---

## Quick Navigation

### Plans

- Active work: [plans/active](plans/active/) — **1 plan in progress**
- Featured active plan: [Automated Benchmarking & Evaluation Pipeline](plans/active/automated_benchmarking_evaluation_pipeline.md)
- Recently completed: [OMOP Vocabulary Automation (Open-License, No Manual Steps)](plans/implemented/omop_vocabulary_automation_open_data.md) — all 6 phases done (2026-03-03)
- Previously completed: [OMOP Golden Dataset Hardening](plans/implemented/omop_golden_dataset_hardening.md) — all 8 phases done (2026-03-03)
- Implemented plans: [plans/implemented](plans/implemented/)
- Backlog: [plans/backlog](plans/backlog/)

### Guides

- [Getting Started](guides/GETTING_STARTED.md)
- [Development](guides/DEVELOPMENT.md)
- [Testing](guides/TESTING_GUIDE.md)
- [Dependency Management](guides/DEPENDENCY_MANAGEMENT.md)

### Reports

- Current reports: [reports/current](reports/current/)
- Latest toolchain report: [reports/current/biome_migration_kickoff_2026-03-24.md](reports/current/biome_migration_kickoff_2026-03-24.md)
- Archive: [reports/archive](reports/archive/)

---

## Documentation Maintenance Rules

1. Keep `docs/agents/*` concise and enforcement-oriented.
2. Keep `docs/humans/*` explanatory, detailed, and easier to digest.
3. Update both tracks when behavior changes affect implementation and understanding.
4. Keep OMOP v5.4 terminology and table references current.
5. Remove legacy backend/schema references when encountered.

---

## Current Stack Baseline

- Backend: NestJS + TypeScript (`backend/`)
- Frontend: React + Vite (`frontend/`)
- App data schema: Drizzle (`packages/db`)
- Linting & formatting: Biome (shared repo-root `biome.json`)
- Clinical standard: OMOP CDM v5.4
- Pipeline: Python + Polars + Alembic (`data-pipeline/`)
