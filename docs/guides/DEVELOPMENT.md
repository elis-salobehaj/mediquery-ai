# Development Guide

## Prerequisites

- **Node.js**: `24.13.1` (managed via `nvm`). Run `nvm use` in the project root.
- **Package Manager**: `pnpm` (version 10+ recommended). Run `corepack enable && corepack use pnpm@latest`.
- **uv** (Python package manager): needed only for `data-pipeline/` ETL scripts.

## Running the Stack

### ⚡ Hybrid Mode (Recommended)

Runs code locally for fast iteration, using Docker exclusively for the databases.

**Terminal 1: Start Databases**

```bash
docker compose up -d postgres
```

Wait for PostgreSQL to be ready (~5 seconds), then ensure migrations have run:

```bash
cd packages/db
pnpm install
pnpm db:migrate
```

**First-time only bootstrap notes**

- On a fresh Docker volume, PostgreSQL runs `infra/postgres/init-multi-db.sh` automatically.
- That script creates/ensures:
  - app database: `${APP_DB_NAME}`
  - app schema: `${APP_DB_SCHEMA}`
  - OMOP database: `${OMOP_DB_NAME}`
  - OMOP ETL role: `${OMOP_ETL_USER}`
  - OMOP tenant schema: `${OMOP_TENANT_SCHEMA}` (loaded from `data-pipeline/gold_omop_tenant.sql.gz`)
  - OMOP vocab schema: `${OMOP_VOCAB_SCHEMA}`
- If you need to re-run bootstrap from scratch, clear the Postgres volume and restart:

```bash
docker compose down -v
docker compose up -d postgres
```

Optional verification (recommended for first setup):

```bash
# list databases
docker exec -i mediquery-postgres psql -U "$POSTGRES_USER" -d postgres -c "\l"

# list tables in app DB
docker exec -i mediquery-postgres psql -U "$POSTGRES_USER" -d "$APP_DB_NAME" -c "\dt ${APP_DB_SCHEMA}.*"

# list tables in tenant DB + schema-qualified OMOP tables
docker exec -i mediquery-postgres psql -U "$POSTGRES_USER" -d "$OMOP_DB_NAME" -c "\dt"
docker exec -i mediquery-postgres psql -U "$POSTGRES_USER" -d "$OMOP_DB_NAME" -c "\dt ${OMOP_TENANT_SCHEMA}.*"
```

**Terminal 2: Backend (TypeScript — port 8001)**

```bash
cd backend
pnpm start:dev
```

**Terminal 3: Frontend (Vite Proxy — port 5173)**

```bash
cd frontend
pnpm dev
```

> **💡 How routing is centralized by mode**:
>
> - **Hybrid/Local (`pnpm dev`)**: `frontend/vite.config.ts` proxies **all** `/api/*` requests to `http://localhost:8001`.
> - **Docker**: `frontend/nginx.conf` proxies **all** `/api/v1/*` requests to `http://backend:8001`.
> - **Traefik**: handles ingress on `elis-cerebro` for both `/mediquery` and `/api`, forwarding both to the frontend service; backend routing still stays inside Nginx.

| Mode                     | Frontend server process | Browser entry URL               | API request path from browser | API proxy owner                  | Backend target          |
| ------------------------ | ----------------------- | ------------------------------- | ----------------------------- | -------------------------------- | ----------------------- |
| Hybrid (local)           | Vite dev server         | `http://localhost:5173`         | `/api/*`                      | Vite (`frontend/vite.config.ts`) | `http://localhost:8001` |
| Docker (localhost)       | Nginx container         | `http://localhost:3000`         | `/api/v1/*`                   | Nginx (`frontend/nginx.conf`)    | `http://backend:8001`   |
| Docker (network ingress) | Traefik → Nginx         | `http://elis-cerebro/mediquery` | `/api/v1/*`                   | Nginx (`frontend/nginx.conf`)    | `http://backend:8001`   |

> **🧠 Scoped Memory**: Thread memory is enabled by default and can be toggled from Frontend Settings. Backend query payload supports `enable_memory` and memory can be cleared with `DELETE /api/v1/memory`.

Access the app at **http://localhost:5173**

---

### 🐳 Full Docker Mode

Use for deployment validation or when local setup has issues.

```bash
docker compose up --build -d
```

Migrations run via the dedicated `migrator` service (`migrator.Dockerfile`) before backend startup.

Run migrations manually in Docker when needed:

```bash
docker compose run --rm migrator
```

Access the app at **http://localhost:3000** (Nginx-served production build)

---

## Debugging

### Frontend (React + TypeScript)

#### Browser DevTools (Primary)

1. Open Chrome/Edge and navigate to **http://localhost:5173**
2. Press **F12** to open DevTools
3. Go to **Sources** tab
4. Press **Ctrl+P** and search for your file (e.g., `Login.tsx`)
5. Set breakpoints in the TypeScript source (source maps enabled)

#### VS Code Browser Debugging

**F5** → **"⚛️ Frontend: Chrome"**

VS Code launches a browser instance attached to the debugger.

---

## Common Commands

### Database Migrations (TypeScript)

Use Drizzle as the only migration system for TypeScript backend development. The source of truth now lives in `packages/db`:

```bash
# Hybrid/local setup (recommended for day-to-day dev)
cd packages/db
pnpm db:migrate
```

```bash
# Generate a new SQL migration file from schema changes
pnpm db:generate

# Apply committed SQL migrations (fresh envs / CI / deployment)
pnpm db:migrate

# Sync schema directly in local dev (no migration file required)
pnpm db:push

# Pull schema from database into drizzle schema definitions
pnpm db:pull
```

- **`pnpm db:migrate`**: Builds `packages/db` and applies SQL files in `packages/db/drizzle/`.
- **`docker compose run --rm migrator`**: Runs compiled migration script from `packages/db` in Docker.
- **`pnpm db:generate`**: Creates a new versioned SQL migration in `packages/db/drizzle/`.
- **`pnpm db:push`**: Fast schema sync for local development.
- **`pnpm db:pull`**: Regenerates Drizzle schema from the running PostgreSQL database.

If Drizzle prompts for destructive actions during local sync (drop/truncate), review carefully and choose the safe non-destructive option unless you intentionally reset local data.

### Linting & Formatting

```bash
# Backend (TypeScript)
cd backend
pnpm check
pnpm check:ci
pnpm typecheck

# Frontend
cd frontend
pnpm check
pnpm check:ci
pnpm typecheck

# Drizzle package
cd packages/db
pnpm check
pnpm check:ci
```

Biome handles linting, formatting, and import sorting for all TypeScript/JavaScript packages.
The shared configuration lives in the repo-root `biome.json`.

### Dependency Management (data-pipeline)

```bash
# Install data-pipeline Python dependencies
cd data-pipeline
uv sync

# Update lockfile
uv lock --upgrade
uv sync
```

### Data Pipeline (First-Time Setup, Single Command)

After `.env` is configured, run the full OMOP data pipeline from `data-pipeline/` using one command:

```bash
cd data-pipeline
uv sync
uv run pipeline-full
```

`uv run pipeline-full` uses `.env` values directly (no inline env overrides needed) and performs:

- DB bootstrap (when `PIPELINE_DB_HOST=localhost`)
- Synthea Bronze generation
- Alembic migrations
- Profile-aware ETL + vocabulary load
- Post-load QA gates (blocking — stops export on failure)
- Gold export to `data-pipeline/gold_omop_tenant.sql.gz`
- JSON run artifacts: `pipeline_run_metadata.json`, `pipeline_qa_results.json`

#### Partial pipeline re-run commands

| Command | What it does |
|---|---|
| `uv run pipeline-full` | Full Bronze → Silver → Gold run |
| `uv run pipeline-etl` | Re-runs ETL + QA only (skips Synthea/migrations/export) |
| `uv run pipeline-export-gold` | Re-exports dump from loaded DB, no ETL rerun |

#### Pipeline run artifacts

Every run writes two JSON artifacts to `data-pipeline/`:

- `pipeline_run_metadata.json` — timing, profile, population, status, dump size, QA summary counters
- `pipeline_qa_results.json` — per-check pass/fail details with observed values and thresholds

Inspect results quickly:

```bash
cat data-pipeline/pipeline_run_metadata.json | python3 -m json.tool
cat data-pipeline/pipeline_qa_results.json | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(f\"Total: {d['total']}, Passed: {d['passed']}, Failed: {d['failed']}, All passed: {d['all_passed']}\")
for r in d['results']:
    if not r['passed']:
        print(f\"  FAIL: {r['check_name']}  observed={r.get('observed_value')}  threshold={r.get('threshold')}\")
"
```

### Data Pipeline Unit Tests

The data pipeline has a full unit test suite covering pure vocabulary and mapping logic (no database required):

```bash
cd data-pipeline
uv sync --extra dev
uv run pytest tests/ -v
```

To include coverage:

```bash
uv run pytest tests/ -v --cov=vocabulary --cov-report=term-missing
```

Tests live under `data-pipeline/tests/` and cover:

| File | What is tested |
|---|---|
| `test_validators.py` | Vocabulary package validator functions |
| `test_mapping.py` | OMOP concept mapping expressions and utilities |
| `test_required_concepts.py` | Required baseline concept builders and merge logic |
| `test_load_profile.py` | `synthetic_open` package builder and profile gate |
| `test_qa_data_structures.py` | QA check result / summary / failure data structures |

### Data Pipeline CI

The `.github/workflows/data-pipeline-gold.yml` workflow provides two levels of pipeline CI:

**Unit tests (runs on every push / PR to `data-pipeline/**`):**

- No Docker, no database required
- `uv run pytest tests/` with vocabulary coverage
- Triggered automatically when data-pipeline code changes

**Full Gold pipeline (nightly 02:30 UTC + manual dispatch):**

- Builds Synthea Docker image (cached between runs)
- Spins up transient PostgreSQL container
- Runs `uv run pipeline-full` (Bronze → Silver → QA gates → Gold)
- Uploads artifacts: `pipeline-run-metadata`, `pipeline-qa-results`, `gold-omop-tenant-sql`
- Pipeline fails automatically if any QA gate fails

Trigger a manual full-pipeline run from the **Actions → Data Pipeline — Unit Tests & Gold Production → Run workflow** panel. You can control population size, seed, and `FAIL_ON_VOCAB_GAP` from the dispatch inputs.

### Data Pipeline Profile Defaults

For local and CI runs, keep the pipeline in open/synthetic mode:

```bash
PIPELINE_PROFILE=synthetic_open
ATHENA_PROFILE_ENABLED=false
FAIL_ON_VOCAB_GAP=true
```

This ensures vocabulary support tables are auto-populated and the pipeline fails fast when required OMOP concept coverage is missing.

### Testing

See **[TESTING_GUIDE.md](TESTING_GUIDE.md)** for comprehensive testing instructions.

### Query Payload (Current)

`POST /api/v1/queries/query` and `POST /api/v1/queries/stream` accept:

- `question`
- `thread_id`
- `model_id`
- `model_provider`
- `fast_mode`
- `multi_agent`
- `enable_memory` (optional)

---

## Port Reference

| Service                  | Mode   | Port | URL                                     |
| ------------------------ | ------ | ---- | --------------------------------------- |
| **Backend API (TS)**     | Local  | 8001 | http://127.0.0.1:8001                   |
| **Backend API (TS)**     | Docker | 8001 | http://localhost:8001                   |
| **Frontend Dev**         | Local  | 5173 | http://localhost:5173 (Proxies to 8001) |
| **Frontend Prod**        | Docker | 3000 | http://localhost:3000                   |
| **PostgreSQL**           | Docker | 5432 | localhost:5432                          |
| **Backend Debug**        | Docker | 5678 | (debugpy attach port)                   |

---

## Troubleshooting

### PostgreSQL Tables Don't Exist (relation "users" does not exist)

**Error**: `relation "users" does not exist`

**Cause**: Database migrations weren't applied after starting PostgreSQL.

**Solution** (Hybrid Mode):

```bash
# After starting the database, run:
cd packages/db
pnpm db:migrate

# Then start the backend normally:
pnpm run start:dev
```

**For Full Docker Mode**: Migrations are executed by the `migrator` service before backend startup. If you see this error, check migrator/backend logs with:

```bash
docker compose logs migrator backend
```

### Backend won't start

- **Check migrations** (Hybrid Mode): Did you run `cd packages/db && pnpm db:migrate`? ← Most common cause
- **Check DB**: `docker ps` - ensure `mediquery-postgres` is healthy
- **Check .env**:
  - Verify `DB_PASSWORD` matches `docker-compose.yml`
  - Verify `DB_HOST=localhost` for Hybrid Mode (not `db` or `mediquery-db`)
- **Sync dependencies**: `cd backend && pnpm install`

### Database connection refused (Hybrid Mode)

**Error**: `cannot connect to PostgreSQL server on 'mediquery-postgres'`

**Cause**: `POSTGRES_HOST` is using the Docker network name instead of `localhost`

**Solution**:

```bash
# In .env file, ensure:
POSTGRES_HOST=localhost  # For local development
POSTGRES_PORT=5432

# Then restart the debugger (F5)
```

**Why**: When running backend locally (not in Docker), it needs to connect via `localhost:5432`. Docker Compose automatically overrides this to `mediquery-postgres` when running in containers.

### Frontend build errors

- **Clear cache**: `rm -rf frontend/node_modules/.vite`
- **Reinstall**: `cd frontend && pnpm install`

### Database connection refused

- **Check host**: In Hybrid Mode, use `POSTGRES_HOST=localhost` in `.env`
- **Check port**: Ensure `5432` is not in use: `lsof -i :5432`

---

## Data Pipeline Troubleshooting

### Quick Diagnostic

```bash
# 1. Check last pipeline run status
cat data-pipeline/pipeline_run_metadata.json | python3 -c \
  "import json,sys; d=json.load(sys.stdin); print(d['status'], d['elapsed_seconds'], 's')"

# 2. Check which QA gates failed
cat data-pipeline/pipeline_qa_results.json | python3 -c "
import json, sys
d = json.load(sys.stdin)
[print('FAIL:', r['check_name'], '|', r.get('observed_value'), 'vs', r.get('threshold'))
 for r in d['results'] if not r['passed']]
" 2>/dev/null || echo "(no QA results found)"
```

### Data Pipeline Troubleshooting Matrix

| Symptom | Likely cause | Fix |
|---|---|---|
| `QA gate(s) failed — pipeline halted before Gold export` | Vocabulary coverage below threshold | Check `pipeline_qa_results.json`; re-run with `FAIL_ON_VOCAB_GAP=false` to inspect partial output, then investigate coverage gaps |
| `Database did not become ready in time` | Transient DB container never started or wrong port | `docker compose -f data-pipeline/docker-compose.yml up -d transient-db` and verify `PIPELINE_DB_PORT` in `.env` |
| `Missing required concept IDs: [9201, 9202, 9203]` | Vocabulary build broken or `required_concepts.py` out of sync | Run `uv run pytest tests/test_required_concepts.py -v`; verify `REQUIRED_CONCEPTS` tuple contains the visit IDs |
| `Alembic failed due to migration metadata/schema permissions` | DB user lacks `CREATE SCHEMA` or `alembic_version` write rights | Pipeline auto-recovers if OMOP schemas already exist; otherwise grant privileges or reset with `docker compose -f data-pipeline/docker-compose.yml down -v` |
| `pg_dump is not available on host and no postgres container is mapped to port …` | `pg_dump` not installed locally | Install `postgresql-client` (`sudo apt install postgresql-client`) or ensure the transient DB container is running |
| `Unable to build Synthea image / docker build failed` | Docker not running or Dockerfile fetch issue | `docker info` to verify Docker daemon; check network access to `github.com/synthetichealth/synthea` |
| `gold_omop_tenant.sql.gz` is 0 bytes or missing | Pipeline crashed before export or QA gates failed | Check `pipeline_run_metadata.json` `status` field; re-run after fixing the reported issue |
| `join_coverage:visit_occurrence.visit_concept_id` QA gate fails | Visit concept IDs (9201/9202/9203) absent from `omop_vocab.concept` | Required concepts must be in `REQUIRED_CONCEPTS`; run `uv run pytest tests/test_load_profile.py` to confirm they're merged |
| `concept_id=0 rate` warning printed during ETL | Source code not mapped to a known concept | Review `vocabulary/mapping.py` for the failing encounter class / gender / race; 0-rate > 5% triggers `⚠️` in logs |
| `smoke:visit_type_distribution` QA gate fails | Concept join returns 0 rows despite visit data | Gold dataset loaded without required concepts; re-run full pipeline after verifying `required_concept_ids()` contains 9201, 9202, 9203 |
| `uv run pipeline-full` immediately exits with import error | Python path issue or missing env var | `cd data-pipeline && uv sync && uv run python -c "from config import settings; print(settings)"` to test settings loading |
| `Permission denied for schema alembic_version` | DB user is read-only | Pipeline auto-detects existing schemas and continues; ensure OMOP tables exist or use a privileged DB user for initial setup |

### Resetting the Transient Database

To start fresh (wipe the transient pipeline DB):

```bash
cd data-pipeline
docker compose down -v   # removes container + pgdata_transient volume
docker compose up -d transient-db
# Re-run pipeline
uv run pipeline-full
```

### Checking QA Gate Details

```bash
# Full QA results with all check details
python3 -c "
import json
results = json.load(open('data-pipeline/pipeline_qa_results.json'))
for r in results['results']:
    status = '✓' if r['passed'] else '✗'
    print(f\"{status} [{r['category']}] {r['check_name']}\")
    if not r['passed']:
        print(f\"    observed={r.get('observed_value')}  threshold={r.get('threshold')}\")
        if r.get('details'):
            print(f\"    {r['details']}\")
"
```

### Skipping QA Gates (Debug Only)

To run the pipeline and export Gold even when QA gates fail (useful for debugging):

```bash
cd data-pipeline
FAIL_ON_VOCAB_GAP=false uv run pipeline-full
```

> **Warning**: `FAIL_ON_VOCAB_GAP=false` should never be used for production Gold dumps. It exists only for debugging partial loads.
