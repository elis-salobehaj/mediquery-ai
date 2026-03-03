# Benchmarking Context

This document defines how benchmarking is performed in the active TypeScript backend during development.

## Scope

Benchmarking currently targets **agent guardrail correctness** and **query-path reliability** in development mode.

Primary focus areas:

- Routing and policy behavior for supported vs unsupported requests
- SQL safety controls (read-only enforcement, complexity controls)
- Basic latency/cost quality signals via existing observability hooks

This is intentionally development-oriented and does **not** include production rollout governance yet.

## Active Benchmark Components

### 1) Dev benchmark harness

- Script: `backend/src/ai/benchmarks/dev-benchmark.ts`
- Test: `backend/test/ai/dev-benchmark.spec.ts`
- Command: `cd backend && pnpm benchmark:dev`
- Output artifact: `docs/reports/guardrail_benchmark_dev.json`

The harness executes in two stages:

**Stage A — Policy gate regression (5 OMOP-aligned deterministic cases):**

- `policy_gate` accuracy
- `sql_policy` accuracy
- per-case issues for blocked queries

**Stage B — OMOP golden corpus static analysis (25+ queries from `omop_golden_queries.jsonl`):**

- `table_selection_accuracy` — are all expected OMOP tables present in golden SQL?
- `concept_join_accuracy` — does SQL use `omop_vocab.concept` when needed?
- `by_category` accuracy breakdown (demographics, conditions, medications, measurements, visits, cross_domain, edge_cases)

### 2) OMOP Golden Query Corpus

Location: `backend/src/ai/benchmarks/corpus/omop_golden_queries.jsonl`

Contains 25+ OMOP v5.4 clinical queries with golden SQL, expected tables, and validation hints.

**Adding new entries:**

```json
{
  "id": "omop_new_query",
  "category": "conditions",
  "tier": "medium",
  "question": "Your clinical NL question here",
  "expected_outcome": "sql",
  "golden_sql": "SELECT ... FROM condition_occurrence co JOIN omop_vocab.concept c ...",
  "expected_tables": ["condition_occurrence", "concept"],
  "expected_joins": ["co.condition_concept_id = c.concept_id"],
  "validation_hints": "Should return N rows with condition names and counts"
}
```

Rules for corpus entries:

- All table references must be OMOP v5.4 tables (`person`, `condition_occurrence`, `drug_exposure`, `measurement`, `visit_occurrence`, `condition_era`, `drug_era`, `procedure_occurrence`, `observation`)
- Vocabulary lookups must use `omop_vocab.concept` (not bare `concept`)
- Common visit concept IDs: Inpatient = 9201, Outpatient = 9202, ER = 9203

### 3) Automated test suite baseline

Run full backend tests after benchmark-related changes:

```bash
cd backend
pnpm test
```

Run deterministic benchmark (Mode A):

```bash
cd backend
pnpm benchmark:dev
```

Run live SQL execution benchmark (Mode B):

```bash
cd backend
pnpm exec tsx src/ai/benchmarks/dev-benchmark.ts --mode=live
```

If migrations/schema are involved:

```bash
cd backend
pnpm run db:migrate
```

### 4) E2E stream validation (curl)

Use `POST /api/v1/queries/stream` with a valid token and verify at least:

1. **DATA query (OMOP condition)** returns streamed thoughts + `result` with SQL joining `condition_occurrence` and `omop_vocab.concept`
2. **DOMAIN_KNOWLEDGE query** returns text insight without SQL execution
3. **Unsafe/destructive intent** is declined by policy/routing behavior

Example pattern:

```bash
curl -sS -N -X POST 'http://localhost:8001/api/v1/queries/stream' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  --data '{"question":"What are the top 5 most common diagnoses?","thread_id":"<THREAD_ID>"}'
```

## Benchmark Metrics

### Guardrail Correctness

- `policy_gate_correct / cases`
- `sql_policy_correct / sql_policy_cases`

### OMOP Accuracy (Golden Corpus)

- `table_selection_correct / golden_queries` — target ≥ 90%
- `concept_join_correct / golden_queries` — target = 100% (all concept joins must use `omop_vocab.concept`)
- Per-category accuracy via `by_category` map in report

## Query Quality (existing runtime telemetry)

- first-pass SQL validity rate
- average attempts per successful query
- unsupported-intent precision

## Efficiency (existing runtime telemetry)

- p50/p95 end-to-end latency
- token/query split by node where available

## Baseline Workflow (Development)

1. Apply code changes
2. Run `pnpm test`
3. Run `pnpm benchmark:dev`
4. Execute 3-5 representative curl stream checks
5. Store/update report artifacts under `docs/reports/`
6. Update active plan notes in `docs/plans/active/`

## Troubleshooting

### 500 on `/queries/stream` with missing table

Symptom:

- `relation "tenant_nexus_health.person" does not exist`
- `relation "omop_vocab.concept" does not exist`

Fix:

```bash
# Ensure OMOP tenant data is loaded
docker compose up -d mediquery-postgres
# Check the tenant schema was initialized from gold_omop_tenant.sql
docker exec mediquery-ai-postgres psql -U mediquery -c "\dn"
```

```bash
cd backend
pnpm run db:migrate
```

### Port conflicts on `8001`

Symptom:

- `EADDRINUSE: address already in use 0.0.0.0:8001`

Fix approach:

- Identify process on port 8001 and stop the conflicting service
- Start TypeScript backend and rerun curl checks

## Related Docs

- `docs/humans/designs/benchmarking_framework.md`
- `docs/humans/context/SEMANTIC_RETRIEVAL.md`
- `docs/plans/implemented/llm_routing_agentic_optimization.md`
