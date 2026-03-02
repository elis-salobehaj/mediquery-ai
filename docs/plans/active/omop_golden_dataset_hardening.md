---
description: Harden the full Mediquery stack against the OMOP Golden Dataset — benchmarking, agent quality, memory, testing, documentation
status: active
priority: high
date_created: 2026-03-01
date_updated: 2026-03-01
date_completed:
related_files:
  - README.md
  - AGENTS.md
  - backend/src/ai/
  - backend/src/ai/benchmarks/
  - backend/src/ai/prompts/semantic_view.yaml
  - backend/src/ai/prompts/system_prompts.yaml
  - backend/src/ai/memory-context.ts
  - backend/src/threads/memory.controller.ts
  - data-pipeline/load_omop.py
  - docs/
  - frontend/tests/
  - docker-compose.yml
depends_on:
  - docs/plans/implemented/omop_synthea_migration.md
blocks: []
assignee: null
completion:
  - [x] Phase 1 — Root README.md & AGENTS.md Overhaul
  - [x] Phase 2 — Benchmarking Framework (Golden Dataset)
  - [x] Phase 3 — Prompt & Semantic View Alignment
  - [x] Phase 4 — Agent Layer Refactor (LangGraph)
  - [ ] Phase 5 — Memory System Tailoring
  - [ ] Phase 6 — Test Suite Overhaul
  - [ ] Phase 7 — Live Stack Verification & Agent Iteration
  - [ ] Phase 8 — Full Documentation Purge
---

# OMOP Golden Dataset Hardening

## Objective

Harden the entire Mediquery stack — agents, benchmarks, memory, prompts, tests, and documentation — against the OMOP v5.4 Golden Dataset (`gold_omop_tenant.sql`). Eliminate every legacy reference (`patients`, `lab_results`, `wait_times`, `billing`, `backend-py-legacy`, MySQL, SQLite), reorganize the agent codebase for clarity, expand benchmarking with meaningful clinical queries, and verify end-to-end functionality through live curl validation.

---

## Phase 1: Root README.md & AGENTS.md Overhaul

**Goal:** Make `README.md` and `AGENTS.md` accurately reflect the current state of the application — NestJS backend, OMOP CDM v5.4, Polars data pipeline, PostgreSQL-only.

### 1.1 — Fix `README.md` Project Structure (Lines 382-405)

The current project structure block is completely outdated. Replace it with:

```
mediquery-ai/
├── backend/                     # NestJS TypeScript Backend (Active — port 8001)
│   ├── src/
│   │   ├── ai/
│   │   │   ├── agents/          # LangGraph Agent Nodes (NEW directory)
│   │   │   │   ├── router-agent.ts
│   │   │   │   ├── schema-navigator-agent.ts
│   │   │   │   ├── sql-writer-agent.ts
│   │   │   │   ├── critic-agent.ts
│   │   │   │   ├── reflector-agent.ts
│   │   │   │   └── meta-agent.ts
│   │   │   ├── benchmarks/      # Golden query corpus & dev harness
│   │   │   ├── prompts/         # System prompts & semantic view
│   │   │   ├── graph.ts         # LangGraph StateGraph wiring
│   │   │   └── ...              # Services (LLM, Insight, Visualization)
│   │   ├── auth/                # JWT Authentication
│   │   ├── config/              # Zod-validated ConfigService
│   │   ├── database/            # PostgreSQL (App Data + OMOP Tenant)
│   │   ├── threads/             # Chat thread & memory management
│   │   └── token-usage/         # LLM quota tracking & SSE
│   ├── test/                    # Vitest unit + E2E tests
│   └── package.json
│
├── data-pipeline/               # OMOP v5.4 Synthea ETL (Python + Polars)
│   ├── bronze/                  # Raw Synthea CSVs (gitignored)
│   ├── alembic/                 # OMOP schema migrations
│   ├── load_omop.py             # Polars-driven ETL: Bronze → Silver → Gold
│   ├── gold_omop_tenant.sql     # Deployable Gold SQL dump (~64 MB)
│   └── docker-compose.yml       # Transient PostgreSQL for ETL processing
│
├── frontend/                    # React 19 + Vite + Tailwind CSS v4
│   ├── src/
│   │   ├── components/          # Chat, Layout, Usage, Settings
│   │   ├── pages/               # ChatInterface, UsageDashboard
│   │   └── App.tsx
│   └── tests/                   # Playwright E2E tests
│
├── packages/db/                 # Drizzle ORM (App Data schema + migrations)
├── docker-compose.yml           # Production stack (PostgreSQL, Ollama, Backend, Frontend)
├── .env                         # Centralized environment configuration
├── AGENTS.md                    # Agent operating manual
└── docs/                        # Architecture, designs, plans, guides, reports
```

### 1.2 — Rewrite README.md sections

- **Tech Stack → Backend**: Change from "FastAPI (Python)" / "SQLite" to "NestJS (TypeScript)" / "PostgreSQL 18.1 + OMOP CDM v5.4"
- **Example Queries**: Replace `"list patients by state"` with OMOP queries like `"top 5 most common diagnoses"`, `"average inpatient visit duration"`, `"medications for patient X"`
- **Docker Deployment services table**: Update ports and descriptions to match current stack (Backend on 8001, not 8000)
- **Configuration**: Reference root `.env` instead of `backend/.env`
- **Testing section**: Replace legacy Python pytest commands with `pnpm test` / `pnpm test:e2e`
- **Remove**: All references to `backend-py-legacy`, `chat_history.db`, `SQLite`, `FastAPI`, direct `main.py` references
- **Development section**: Replace "Add CSV file to backend/data/" with the data-pipeline OMOP workflow

### 1.3 — Update AGENTS.md

- Remove `backend-py-legacy` references from Critical Rules
- Add explicit rules about the agent file naming convention (`*-agent.ts`)
- Add rule: "All benchmark queries must target the OMOP Golden Dataset"
- Update Database line: "PostgreSQL 18.1 (App Data via Drizzle + OMOP v5.4 Tenant Clinical Data)"

---

## Phase 2: Benchmarking Framework (Golden Dataset)

**Goal:** Transform the benchmarking system from a toy guardrail checker into a production-ready OMOP query accuracy evaluator.

### 2.1 — Expand Golden Query Corpus

Current state: `backend/src/ai/benchmarks/corpus/omop_golden_queries.jsonl` has only 5 entries. Expand to **25+ golden queries** covering:

| Category | Count | Examples |
|---|---|---|
| **Demographics** | 4 | Gender distribution, age histogram, ethnicity breakdown, race by state |
| **Conditions** | 5 | Top N diagnoses, condition prevalence by age, comorbidities, condition era duration, chronic vs acute |
| **Medications** | 4 | Top prescribed drugs, polypharmacy detection, drug exposure duration, medications by visit type |
| **Measurements** | 4 | Latest vitals per patient, abnormal lab values, BMI distribution, measurement trends over time |
| **Visits** | 3 | Visit type distribution, average inpatient stay, ER visit frequency |
| **Cross-domain** | 3 | Patients with diabetes AND hypertension medications, conditions by visit type, drug-condition co-occurrence |
| **Edge cases** | 3+ | Ambiguous queries, follow-up queries, queries requiring `concept` joins |

Each entry in the JSONL must include:
```json
{
  "id": "unique_id",
  "category": "demographics|conditions|medications|measurements|visits|cross_domain|edge_case",
  "tier": "easy|medium|hard",
  "question": "Natural language question",
  "expected_outcome": "sql|domain_knowledge|off_topic",
  "golden_sql": "SELECT ... (reference SQL)",
  "expected_tables": ["person", "concept"],
  "expected_joins": ["person.person_id = visit_occurrence.person_id"],
  "validation_hints": "What the result should look like"
}
```

### 2.2 — Overhaul `dev-benchmark.ts`

The current benchmark cases inside `dev-benchmark.ts` are **completely stale** — they reference `patients`, `visits`, `avg_rop`. Replace them:

- Replace embedded `devCases` array with golden queries loaded from `corpus/omop_golden_queries.jsonl`
- Add a new accuracy metric: **Table Selection Accuracy** — does the navigator select the right tables?
- Add a new accuracy metric: **Concept Join Detection** — does the SQL join with `omop_vocab.concept` when needed?
- Add **SQL Execution Validation** (Mode B): Actually run the generated SQL against the live database and check for zero errors
- Generate structured report including per-category accuracy breakdowns

### 2.3 — Update `docs/designs/benchmarking_framework.md`

- Replace all references to "patients", "duration", "wells"
- Add the OMOP golden query corpus strategy
- Document the new Table Selection Accuracy and Concept Join Detection metrics
- Add Mode B documentation for live SQL execution

### 2.4 — Update `docs/context/BENCHMARKING.md`

- Replace curl examples with OMOP queries
- Update troubleshooting for OMOP schema (e.g., `relation "tenant_nexus_health.person" does not exist`)
- Document the golden query corpus location and how to add new entries

---

## Phase 3: Prompt & Semantic View Alignment

**Goal:** Ensure `semantic_view.yaml` and `system_prompts.yaml` are production-quality and fully aligned with the golden dataset.

### 3.1 — Expand `semantic_view.yaml`

Current state covers 8 tables but is missing:
- `observation` table (exists in data but missing column definitions beyond basic)
- `procedure_occurrence` column definitions
- `condition_era` table (newly added to golden dataset)
- `drug_era` table (newly added to golden dataset)
- `visit_occurrence` → `drug_exposure` join path
- `visit_occurrence` → `procedure_occurrence` join path
- `visit_occurrence` → `measurement` join path

Add:
- Full column definitions for `observation` and `procedure_occurrence`
- New table entries for `condition_era` and `drug_era`
- Additional join graph edges for visit-level fact table connections
- Additional query pattern examples covering eras, procedures, and observations
- Update `supported_table_count` from 8 to include era tables (10+)

### 3.2 — Enhance `system_prompts.yaml`

- **Schema Navigator**: Add rules for era tables, observation table, procedure table
- **SQL Writer**: Add explicit instructions for:
  - Using `omop_vocab.concept` prefix consistently (not bare `concept`)
  - Handling date arithmetic (`visit_end_date - visit_start_date`)
  - Using `person_source_value` for patient lookups by external ID
  - Avoiding `SELECT *` — always specify columns
  - Wrapping subqueries for window functions (ROW_NUMBER, RANK)
- **Critic**: Add validation rules for:
  - Verifying `omop_vocab.` prefix on concept joins
  - Flagging queries that return raw concept_ids without joining to concept_name
  - Checking for missing LIMIT on large aggregations
- **Response Formatter**: Tailor to OMOP clinical context (mention OMOP CDM, cohort size, data limitations)

### 3.3 — Remove all unsupported intent references to legacy tables

- Remove `Financial/Billing data (not currently mapped in current Phase)` from unsupported_intents if we plan to add `cost` table
- OR update to accurately reflect what IS and ISN'T in the golden dataset
- IMPORTANT: check thoroughly to remove any lingering piece of code or documentation that might still refer to any table/schema/column names that are not part of the golden dataset

---

## Phase 4: Agent Layer Refactor (LangGraph)

**Goal:** Reorganize agent files for clarity, rename for consistency, and ensure all agents are properly tuned for OMOP.

### 4.1 — Rename Agent Files

Move all agent node files into a dedicated `backend/src/ai/agents/` directory:

| Current File | New File |
|---|---|
| `backend/src/ai/router.ts` | `backend/src/ai/agents/router-agent.ts` |
| `backend/src/ai/schema-navigator.ts` | `backend/src/ai/agents/schema-navigator-agent.ts` |
| `backend/src/ai/sql-writer.ts` | `backend/src/ai/agents/sql-writer-agent.ts` |
| `backend/src/ai/critic.ts` | `backend/src/ai/agents/critic-agent.ts` |
| `backend/src/ai/reflector.ts` | `backend/src/ai/agents/reflector-agent.ts` |
| `backend/src/ai/meta-agent.ts` | `backend/src/ai/agents/meta-agent.ts` |
| `backend/src/ai/policy-gate.ts` | `backend/src/ai/agents/policy-gate.ts` |

### 4.2 — Update All Imports

After moving files, update all import paths in:
- `backend/src/ai/graph.ts` (primary orchestrator)
- `backend/src/ai/ai.module.ts`
- `backend/src/ai/queries.controller.ts`
- `backend/test/ai/*.spec.ts` (all test files)
- `backend/src/ai/benchmarks/dev-benchmark.ts`

### 4.3 — Audit Each Agent for OMOP Compliance

- **Router Agent**: Verify intent classification handles OMOP-specific phrasings ("diagnoses", "medications", "lab values")
- **Schema Navigator Agent**: 
  - Verify fallback logic uses `person`, `visit_occurrence` (not legacy tables)
  - Ensure `concept` table is always included when fact tables are selected
  - Verify LLM JSON contract examples use OMOP tables
- **SQL Writer Agent**:
  - Verify generated SQL uses `omop_vocab.concept` prefix
  - Check that `SET search_path` is not injected into the SQL (handled at connection level)
- **Critic Agent**: 
  - Verify the DB validation step connects to the right schema
  - Check that concept join validation is present
- **Reflector Agent**: Verify reflection prompts reference OMOP table names
- **Policy Gate**: Audit keyword patterns for OMOP compatibility

### 4.4 — Verify `common.ts` and shared utilities

- Audit `backend/src/ai/common.ts` for any legacy references
- Update any hardcoded table lists or schema assumptions

---

## Phase 5: Memory System Tailoring

**Goal:** Tailor the memory context system to be meaningful for the OMOP clinical domain instead of generic KPI tracking.

### 5.1 — Overhaul `memory-context.ts`

Current issues:
- `KPI_KEYWORDS` references irrelevant terms: `duration`, `wait_time`, `pill`, `clinic state`, `medical state`
- `UNIT_PATTERN` matches industrial units: `bbl`, `psi`, `ppg`, `ft/hr`, `m/hr`
- `extractPatientMentions` looks for "patient" but OMOP uses "person"
- `active_patients` should become `active_persons` in the OMOP context

Changes:
- Replace `KPI_KEYWORDS` with OMOP-relevant intents:
  ```typescript
  const CLINICAL_KEYWORDS = [
    { keyword: 'diagnosis', intent: 'Condition analysis' },
    { keyword: 'condition', intent: 'Condition analysis' },
    { keyword: 'medication', intent: 'Drug exposure analysis' },
    { keyword: 'drug', intent: 'Drug exposure analysis' },
    { keyword: 'visit', intent: 'Visit occurrence analysis' },
    { keyword: 'lab', intent: 'Measurement analysis' },
    { keyword: 'vital', intent: 'Measurement analysis' },
    { keyword: 'procedure', intent: 'Procedure analysis' },
    { keyword: 'observation', intent: 'Observation analysis' },
    { keyword: 'era', intent: 'Temporal era analysis' },
  ];
  ```
- Replace `UNIT_PATTERN` with clinical units: `mg/dL`, `mmHg`, `kg`, `cm`, `bpm`, `%`, `mmol/L`
- Update `extractPatientMentions` to also match "person" and "person_id"
- Rename `active_patients` → `active_persons` in `ScopedConversationMemory` interface and all references
- Update `ScopedConversationMemory` interface:
  - `active_kpi_intent` → `active_clinical_intent`
  - `preferred_units` → `preferred_clinical_units`

### 5.2 — Update `state.ts` Interface

- Update `ScopedConversationMemory` interface to match the new field names
- Ensure `createInitialState` reflects the new defaults

### 5.3 — Update `memory.controller.ts` and `user-memory-preferences.service.ts`

- `preferred_units` in the API (currently exposed as "metric/imperial" style) → change to clinical unit system preferences (e.g., `"SI"` / `"conventional"`)
- Ensure the preferences schema validation reflects clinically meaningful values
- Update any frontend components that consume memory preferences

### 5.4 — Update `thread-memory.service.ts`

- Audit for any legacy KPI references
- Ensure memory decay and TTL logic still applies to clinical domain

### 5.5 — Frontend Memory Settings

- Audit the frontend settings/preferences panel
- Remove or replace "metric/imperial" unit toggles with clinically meaningful controls (or remove entirely if not applicable)

---

## Phase 6: Test Suite Overhaul

**Goal:** Ensure all backend unit tests, frontend Playwright tests, and E2E tests pass with the new OMOP-aligned codebase.

### 6.1 — Backend Unit Tests

After the Phase 4 file renames, fix all broken imports in `backend/test/ai/`:
- `schema-navigator.spec.ts`
- `sql-writer.spec.ts`
- `router.spec.ts`
- `critic.spec.ts`
- `reflector.spec.ts`
- `meta-agent.spec.ts`
- `policy-gate.spec.ts`
- `dev-benchmark.spec.ts`
- `common.spec.ts`
- `memory-context.spec.ts`

For each test file:
- Update import paths to `@/ai/agents/*-agent`
- Replace any legacy table references in test assertions
- Add new test cases for OMOP-specific behaviors (concept joins, era tables)

### 6.2 — Run Full Backend Test Suite

```bash
cd backend && pnpm test
```

Fix all failures before proceeding.

### 6.3 — Frontend E2E Tests

- Verify `frontend/tests/e2e.spec.ts` passes with "list people in Texas" queries
- Verify `frontend/tests/threads.spec.ts` passes
- Verify `frontend/tests/smoke.spec.ts` and `frontend/tests/accessibility.spec.ts`

### 6.4 — Database E2E Tests

- Verify `backend/test/database.e2e-spec.ts` passes with testcontainers
- Verify `backend/test/app.e2e-spec.ts` passes

---

## Phase 7: Live Stack Verification & Agent Iteration

**Goal:** Start the full stack, send meaningful clinical queries, identify and fix agent misbehavior, and add working queries to the benchmark corpus.

### 7.1 — Start Full Stack

```bash
# Option A: Full Docker
docker compose down -v && docker compose up -d

# Option B: Hybrid (faster iteration)
docker compose up -d mediquery-postgres ollama
cd backend && pnpm run start:dev
```

### 7.2 — Authentication Setup

```bash
# Create guest token
TOKEN=$(curl -sS -X POST http://localhost:8001/api/v1/auth/guest \
  -H 'Content-Type: application/json' | jq -r '.access_token')
```

### 7.3 — Meaningful Query Battery

Execute each query via curl and verify correct behavior. Fix agents as issues arise:

| # | Query | Expected Behavior |
|---|-------|-------------------|
| 1 | "What are the top 5 most common diagnoses?" | SQL joins `condition_occurrence` + `omop_vocab.concept`, returns condition names with counts |
| 2 | "Show patient distribution by gender" | SQL joins `person` + `omop_vocab.concept` on `gender_concept_id` |
| 3 | "What medications is the most prescribed?" | SQL joins `drug_exposure` + `omop_vocab.concept`, GROUP BY, ORDER BY, LIMIT |
| 4 | "Average duration of inpatient visits" | SQL uses `visit_occurrence`, date arithmetic, `WHERE visit_concept_id = 9201` |
| 5 | "Show latest blood pressure for each patient" | SQL uses `measurement` with window function, joins `concept` for measurement name |
| 6 | "How many patients have both diabetes and hypertension?" | Cross-condition query, subquery or INTERSECT |
| 7 | "List all procedures performed during emergency visits" | Joins `procedure_occurrence` → `visit_occurrence` → `concept` |
| 8 | "What is the average number of conditions per patient?" | Aggregation on `condition_occurrence`, GROUP BY `person_id` |
| 9 | "Show drug exposure duration by medication class" | Uses `drug_era` or `drug_exposure` date arithmetic |
| 10 | "Distribution of visit types (inpatient vs outpatient vs ER)" | `visit_occurrence` → `concept` join on `visit_concept_id` |

Curl pattern:
```bash
curl -sS -N -X POST 'http://localhost:8001/api/v1/queries/stream' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"question":"<QUERY>","thread_id":"<THREAD_ID>"}'
```

### 7.4 — Agent Fix Iteration Loop

For each failing query:
1. Identify which agent caused the failure (Router? Navigator? Writer? Critic?)
2. Fix the agent's prompt, logic, or fallback behavior
3. Re-run the query to confirm the fix
4. Add the fixed query to `omop_golden_queries.jsonl` as a regression test

### 7.5 — Re-run Benchmarks

After all fixes:
```bash
cd backend && pnpm benchmark:dev
```

Verify accuracy metrics improved.

---

## Phase 8: Full Documentation Purge

**Goal:** Audit and update **every** `.md` file in the repository. Remove all legacy references.

### 8.1 — Files to Audit

| File | Key Changes |
|------|-------------|
| `README.md` | Full rewrite (Phase 1) |
| `AGENTS.md` | Remove `backend-py-legacy`, add OMOP rules |
| `docs/README.md` | Update active plans, remove legacy completed items |
| `docs/context/ARCHITECTURE.md` | Remove Python Legacy section, update project structure, update agent file paths |
| `docs/context/BENCHMARKING.md` | Phase 2 updates |
| `docs/context/CONFIGURATION.md` | Remove Python/Pydantic references, focus on NestJS ConfigService |
| `docs/context/SEMANTIC_RETRIEVAL.md` | Replace legacy table names |
| `docs/context/WORKFLOWS.md` | Review for accuracy |
| `docs/designs/benchmarking_framework.md` | Phase 2 updates |
| `docs/designs/data_ingestion_etl_architecture.md` | Major overhaul — currently says "Legacy (Superseded by OMOP CDM)". Rewrite entirely for OMOP pipeline |
| `docs/designs/evaluation_and_finetuning.md` | Replace legacy table/query references |
| `docs/designs/frontend_architecture.md` | Review for accuracy |
| `docs/designs/multi_agent_architecture.md` | Update agent file paths after rename |
| `docs/designs/schema_conventions_surrogate_fk.md` | Review for OMOP compliance |
| `docs/designs/schema_per_tenant_rationale.md` | Already partially updated — verify completion |
| `docs/designs/self_hosted_model_training.md` | Review for legacy references |
| `docs/guides/GETTING_STARTED.md` | Remove Python backend setup, focus on NestJS + data-pipeline |
| `docs/guides/DEVELOPMENT.md` | Remove Python commands, add data-pipeline workflow |
| `docs/guides/TESTING_GUIDE.md` | Update with new test patterns |
| `docs/guides/DOCKER_DEPLOYMENT.md` | Update for gold schema volume mount |
| `docs/guides/MODULAR_BACKEND_REFERENCE.md` | Remove or update if legacy |
| `docs/guides/MODULAR_BACKEND_REFERENCE_LEGACY.md` | Archive or delete |
| `data-pipeline/README.md` | Already updated — verify |
| `backend/README.md` | Update for OMOP |
| `frontend/README.md` | Review |
| `packages/db/README.md` | Review |

### 8.2 — Purge Rules

1. **Remove ALL** references to `backend-py-legacy` as a living codebase
2. **Remove ALL** references to `MySQL`, `SQLite`, `Percona`, `Aurora` as current tech
3. **Replace ALL** legacy table names: `patients` → `person`, `lab_results` → `measurement`, `wait_times` → `visit_occurrence`, `billing` → removed
4. **Replace ALL** legacy tool references: `FastAPI` → `NestJS`, `Pydantic` → `Zod` (for backend config), `pytest` → `Vitest`
5. **Remove ALL** references to `oil_vol`, `gas_vol`, `well`, `rig`, `ROP`, `spud_date`, `county` — these are from a different industry domain
6. Mark historical files clearly with `> ⚠️ ARCHIVED` warnings if they must be kept

### 8.3 — Verify No Lingering References

```bash
# Run these greps to verify completeness
grep -rn "backend-py-legacy" --include="*.md" .
grep -rn "lab_results" --include="*.md" docs/
grep -rn "wait_times" --include="*.md" docs/
grep -rn "patients\b" --include="*.md" docs/ | grep -v "OMOP\|ARCHIVED\|Synthea"
grep -rn "oil_vol\|gas_vol\|well_name\|rop\|spud_date" --include="*.md" .
grep -rn "FastAPI\|SQLite\|MySQL\|Percona" --include="*.md" docs/ | grep -v "Legacy\|ARCHIVED\|historical"
```

---

## Success Criteria

- [ ] `README.md` accurately describes the current stack (no legacy references)
- [ ] `AGENTS.md` rules align with OMOP CDM v5.4 and current tooling
- [ ] Golden query corpus contains 25+ OMOP queries across all categories
- [ ] `pnpm benchmark:dev` reports ≥80% accuracy on golden queries
- [ ] All agent files live under `backend/src/ai/agents/` with `-agent.ts` suffix
- [ ] `pnpm test` passes with zero failures in backend
- [ ] Frontend Playwright tests pass
- [ ] 10 meaningful clinical queries succeed end-to-end via curl
- [ ] Memory system uses OMOP clinical terminology (not industrial KPIs)
- [ ] `grep -rn "backend-py-legacy" --include="*.md" .` returns zero results
- [ ] `grep -rn "oil_vol\|gas_vol\|well_name\|rop" --include="*.md" .` returns zero results
- [ ] Every `.md` file in `docs/` has been reviewed and updated

---

## Estimated Effort

| Phase | Est. Hours | Complexity |
|-------|-----------|------------|
| Phase 1: README/AGENTS | 2-3h | Medium |
| Phase 2: Benchmarking | 4-6h | High |
| Phase 3: Prompts | 2-3h | Medium |
| Phase 4: Agent Refactor | 4-6h | High |
| Phase 5: Memory System | 2-3h | Medium |
| Phase 6: Test Suite | 3-4h | Medium |
| Phase 7: Live Verification | 6-10h | High (iterative) |
| Phase 8: Documentation | 4-6h | Medium (tedious) |
| **Total** | **27-41h** | |
