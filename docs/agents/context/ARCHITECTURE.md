# Architecture (Current State)

## Mission

Mediquery is a Text-to-SQL platform for clinical analytics on OMOP CDM v5.4.

## Runtime Components

1. Backend: NestJS (TypeScript) on port 8001
2. Frontend: React + Vite on port 3000
3. App Data DB: PostgreSQL (users, auth, threads, token usage)
4. Clinical DB: OMOP tenant schema + `omop_vocab` in PostgreSQL
5. Data Pipeline: Python + Polars + Alembic (Bronze → Silver → Gold)
6. LLM Providers: Bedrock/OpenAI/Gemini/Anthropic/Ollama via config

## Backend AI Flow

- Router
- Policy Gate
- Schema Navigator
- SQL Writer
- Critic
- Reflector

Primary path: `/api/v1/queries/stream`

## Architectural Rules

- Clinical SQL must be read-only.
- Human-readable clinical labels require `omop_vocab.concept` joins.
- Backend config uses Zod + ConfigService only.
- Pipeline config uses `data-pipeline/config.py` only.
- App-data schema ownership is in `packages/db` (Drizzle).
- OMOP schema evolution uses Alembic/pipeline artifacts.

## Out of Scope

- Any non-current backend runtime.
- Any non-current database source-of-truth model.
- Non-OMOP clinical table conventions.
