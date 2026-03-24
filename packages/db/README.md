# @mediquery/db

Canonical PostgreSQL app-data schema and migration package for Mediquery.

This package uses Biome via the shared repo-root `biome.json`.

## Commands

```bash
pnpm db:generate   # Generate SQL migration from schema.ts changes
pnpm db:migrate    # Build + apply migrations via compiled runtime
pnpm db:push       # Sync schema directly (local dev only)
pnpm db:pull       # Pull schema from live DB
pnpm check         # Run Biome lint + format + organize imports on src
pnpm check:ci      # CI-safe Biome verification for src
```

## Docker

Docker migrations are executed by `mediquery-migrator` using `migrator.Dockerfile`:

```bash
docker compose run --rm migrator
```
