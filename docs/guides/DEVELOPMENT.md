# Development Guide

## Prerequisites

- **Node.js**: `24.13.1` (managed via `nvm`). Run `nvm use` in the project root.
- **Package Manager**: `pnpm` (version 10+ recommended). Run `corepack enable && corepack use pnpm@latest`.
- **Python Agent**: `uv` (for legacy backend).

## Running the Stack

### ⚡ Hybrid Mode (Recommended)

Runs code locally for fast iteration, using Docker exclusively for the databases.

> All API routes are now served by the TypeScript backend. The Python backend is legacy-only and no longer required for normal development.

**Terminal 1: Start Databases**

```bash
docker compose up -d postgres
```

Wait for PostgreSQL to be ready (~5 seconds), then ensure migrations have run (first time only):

```bash
cd packages/db
pnpm install
pnpm db:migrate
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

#### Legacy Python Backend (Optional)

Only needed if testing Python-specific behaviour or running Python tests:

```bash
cd backend-py-legacy
uv run uvicorn main:app --reload  # port 8000
```

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

### Backend (Python)

#### VS Code Debugger (Preferred)

1. **Start DB**: `docker compose up -d db postgres`
2. **Set Breakpoints**: Click left gutter in any `.py` file
3. **Start Debugger**: Press **F5** → Select **"🐍 Backend: Local (FastAPI + uv)"**
4. **Trigger Code**: Use the frontend or API client

The debugger:

- Uses the `uv`-managed `.venv/bin/python`
- Auto-loads `.env` variables via Pydantic (config.py)
- Connects to Docker DB at `localhost:5432`

> **Note**: Environment variables are automatically loaded by Pydantic Settings (`backend-py-legacy/config.py`). No manual `source .env` needed!

#### Terminal Debugging (Local)

```bash
cd backend-py-legacy
uv run uvicorn main:app --reload
# Add breakpoints via `import pdb; pdb.set_trace()`
```

#### Docker Debugging

```bash
docker compose -f docker-compose.yml -f docker-compose.debug.yml up
```

Then: **F5** → **"🐍 Backend: Attach to Docker"**

#### Terminal Debugging (Without VS Code)

For debugging via terminal only (e.g., SSH sessions):

```bash
cd backend-py-legacy
# Run with debugger listening on port 5678
uv run python -m debugpy --listen 0.0.0.0:5678 --wait-for-client -m uvicorn main:app --reload
```

Then attach from any IDE/editor:

- **VS Code**: "Attach to localhost:5678"
- **PyCharm**: "Python Remote Debug" → Host: `localhost`, Port: `5678`
- **Terminal**: Use `pdb` commands after attaching

---

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
# Backend
cd backend-py-legacy
uv run ruff check .
uv run ruff format .

# Frontend
cd frontend
pnpm lint
pnpm format
```

### Dependency Management (uv)

```bash
# Install standard dependencies (runtime + test + dev)
cd backend-py-legacy
uv sync

# Install with local ML support (Ollama, LlamaIndex)
uv sync --extra local

# Update dependencies
uv lock --upgrade
uv sync
```

**Note**: All dependencies (runtime, test, dev) are now installed by default to simplify the workflow.

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
| **Backend API (Python)** | Local  | 8000 | http://127.0.0.1:8000                   |
| **Backend API (Python)** | Docker | 8000 | http://localhost:8000                   |
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

**Cause**: `DB_HOST` is using the Docker network name instead of `localhost`

**Solution**:

```bash
# In .env file, ensure:
DB_HOST=localhost  # For local development
DB_PORT=5432

# Then restart the debugger (F5)
```

**Why**: When running backend locally (not in Docker), it needs to connect via `localhost:5432`. Docker Compose automatically overrides this to `mediquery-postgres` when running in containers.

### AWS IMDS timeout errors (bloated logs)

**Error**: `Connect timeout on endpoint URL: "http://169.254.169.254/latest/api/token"`

**Solution**: Already handled! Pydantic Settings (`backend-py-legacy/config.py`) automatically syncs `AWS_EC2_METADATA_DISABLED=true` from `.env` to `os.environ` during startup.

**If still seeing errors**:

1. Verify `.env` has `AWS_EC2_METADATA_DISABLED=true`
2. Restart the backend
3. Check `backend-py-legacy/config.py` has `model_post_init()` method

### Frontend build errors

- **Clear cache**: `rm -rf frontend/node_modules/.vite`
- **Reinstall**: `cd frontend && pnpm install`

### Database connection refused

- **Check host**: In Hybrid Mode, use `DB_HOST=localhost` in `.env`
- **Check port**: Ensure `5432` is not in use: `lsof -i :5432`
