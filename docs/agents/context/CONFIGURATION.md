# Configuration Policy (Agent)

## Backend Rules

- Use Zod + ConfigService only.
- Direct `process.env` access in backend business logic is forbidden.
- New env keys must update:
  1. `backend/src/config/env.config.ts`
  2. `.env.example`
  3. `.env`

## Pipeline Rules

- Use `data-pipeline/config.py` abstraction.
- Avoid direct `os.environ` reads in pipeline business logic.

## Benchmark Config Rules

Benchmark mode/DB/timeouts must be schema-defined and synchronized across env templates.

## Security Rules

- Never commit real credentials.
- Use least-privilege DB users.
