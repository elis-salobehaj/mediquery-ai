# System Design (Agent)

## Scope

Single-source design constraints for implementation work.

## Runtime Design

- Frontend: React + Vite + TypeScript
- Backend: NestJS + TypeScript
- App-data DB: PostgreSQL with Drizzle ownership in `packages/db`
- Clinical DB: OMOP v5.4 tenant schemas + `omop_vocab`
- Pipeline: Python + Polars + Alembic under `data-pipeline/`

## AI Design

Node paths:
- **DATA routing**: Router → Policy Gate → Schema Navigator → SQL Writer → Critic → Reflector → END
- **DOMAIN_KNOWLEDGE routing**: Router → Meta-Agent → END

Constraints:
- node implementations under `backend/src/ai/`
- `policy-gate.ts` blocks write operations and unsupported analytics before schema retrieval
- `meta-agent.ts` handles domain knowledge questions without SQL generation
- node filenames must use `*-agent.ts` for LangGraph agent nodes
- reflection/retry loops must be bounded and diagnosable
- routing decision is driven by `state.routing_decision` (`'DATA'` | `'DOMAIN_KNOWLEDGE'`)

## Data Design

App data:
- surrogate PKs + explicit FKs
- schema/migration changes only through Drizzle

Clinical data:
- OMOP native identifiers and join semantics
- label joins through `omop_vocab.concept`

Tenant model:
- schema-per-tenant isolation in PostgreSQL
- runtime and benchmark paths must target explicit tenant schema

## Frontend Contract

- Frontend does not enforce SQL policy.
- Backend is source-of-truth for SQL generation and safety rules.

## Benchmark/Evaluation Design

- Benchmark corpus remains OMOP-only.
- Deterministic mode and live mode are both supported.
- Regressions in affected categories block promotion.
