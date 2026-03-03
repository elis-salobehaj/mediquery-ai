# Architecture Policy (Agent)

## Scope

Authoritative architecture constraints for implementation decisions.

## Runtime

1. Frontend: React + Vite
2. Backend: NestJS TypeScript
3. App Data: PostgreSQL + Drizzle (`packages/db`)
4. Clinical Data: OMOP v5.4 tenant schemas + `omop_vocab`
5. Pipeline: Python + Polars + Alembic (`data-pipeline/`)

## AI Query Path

**DATA routing** (SQL queries):
Router → Policy Gate → Schema Navigator → SQL Writer → Critic → Reflector

**DOMAIN_KNOWLEDGE routing** (terminology, concept explanation):
Router → Meta-Agent

Node files live in `backend/src/ai/agents/` using the `*-agent.ts` suffix (e.g., `policy-gate.ts`, `meta-agent.ts`, `router-agent.ts`).

## Hard Rules

- Clinical SQL is read-only.
- Clinical label output requires concept joins via `omop_vocab.concept`.
- App-data schema changes only via Drizzle migrations.
- Pipeline schema evolution only via Alembic artifacts.
- Do not introduce non-OMOP clinical table conventions.

## Retrieval Policy (Merged)

- Retrieval context must be OMOP-only.
- Coverage baseline includes `person`, `visit_occurrence`, `condition_occurrence`, `drug_exposure`, `measurement`, `procedure_occurrence`, `observation`, `condition_era`, `drug_era`, and `omop_vocab.concept`.
- For label-oriented outputs, retrieval context must include concept join paths (`*_concept_id -> omop_vocab.concept.concept_id`).
- Prefer canonical joins via `person_id` and `visit_occurrence_id`.

## Benchmark Policy (Merged)

Required benchmark assets:
- `backend/src/ai/benchmarks/dev-benchmark.ts`
- `backend/src/ai/benchmarks/corpus/omop_golden_queries.jsonl`
- `backend/test/ai/dev-benchmark.spec.ts`

Corpus contract (mandatory per row):
- `id`, `category`, `tier`
- `question`, `expected_outcome`
- `golden_sql`
- `expected_tables`
- `expected_joins`
- `validation_hints`

Execution modes:
- Mode A: deterministic checks
- Mode B: live SQL execution validation against benchmark DB

Enforcement:
- SQL generation behavior changes require benchmark corpus/test updates in the same change set.
