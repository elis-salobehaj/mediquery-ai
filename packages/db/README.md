# @mediquery/db

Canonical PostgreSQL app-data schema and migration package for Mediquery.

## Commands

```bash
pnpm db:generate   # Generate SQL migration from schema.ts changes
pnpm db:migrate    # Build + apply migrations via compiled runtime
pnpm db:push       # Sync schema directly (local dev only)
pnpm db:pull       # Pull schema from live DB
```

## Docker

Docker migrations are executed by `mediquery-migrator` using `migrator.Dockerfile`:

```bash
docker compose run --rm migrator
```
