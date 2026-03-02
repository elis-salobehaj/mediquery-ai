# Configuration Policy (Authoritative)

This document is mandatory guidance for all contributors and agents.

## Non-Negotiable Rules

1. TypeScript backend configuration MUST use Zod + ConfigService only.
2. Python data-pipeline configuration MUST use `data-pipeline/config.py` only.
3. Direct `process.env` access in backend business logic is forbidden.
4. Adding a new env variable requires updates to:
   - `backend/src/config/env.config.ts`
   - `.env.example`
   - `.env`

## Backend Standard

Sources of truth:

- `backend/src/config/env.config.ts`
- `backend/src/config/config.service.ts`

Required pattern:

- Define key and defaults in Zod schema.
- Access values through injected `ConfigService`.
- Do not parse/coerce env values in feature modules.

Allowed boundary:

- `env.config.ts` may read `process.env` for parsing/validation.

Forbidden patterns:

- `process.env.X` in controllers/services/agents/benchmarks logic.
- ad-hoc defaults like `process.env.X || ...` outside Zod schema.
- duplicate config parsing per module.

## Python Standard

- Import settings from `data-pipeline/config.py`.
- Do not read `os.environ` directly in pipeline business logic.

## Benchmark Configuration (Mandatory)

Benchmark keys must be defined in Zod schema and both env files:

- `BENCHMARK_MODE`
- `BENCHMARK_DB_SCHEMA`
- `BENCHMARK_POSTGRES_HOST`
- `BENCHMARK_POSTGRES_PORT`
- `BENCHMARK_POSTGRES_USER`
- `BENCHMARK_POSTGRES_PASSWORD`
- `BENCHMARK_POSTGRES_DB`
- `BENCHMARK_DB_CONNECT_TIMEOUT_MS`
- `BENCHMARK_DB_IDLE_TIMEOUT_MS`
- `BENCHMARK_DB_QUERY_TIMEOUT_MS`

## Security Requirements

- Never commit real production credentials.
- `.env.example` must contain placeholder values only.
- Use least-privilege DB users for runtime and benchmark execution.

## Enforcement Checklist

Before merge:

1. Zod schema updated.
2. `.env.example` updated.
3. `.env` updated locally.
4. No direct env access introduced outside config boundary.
5. Relevant tests/boot paths pass.
