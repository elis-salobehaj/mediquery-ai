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
pnpm lint

# Frontend
cd frontend
pnpm lint
pnpm format
```

### Dependency Management (data-pipeline)

```bash
# Install data-pipeline Python dependencies
cd data-pipeline
uv sync

# Update lockfile
uv lock --upgrade
uv sync
```

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

**Cause**: `DB_HOST` is using the Docker network name instead of `localhost`

**Solution**:

```bash
# In .env file, ensure:
DB_HOST=localhost  # For local development
DB_PORT=5432

# Then restart the debugger (F5)
```

**Why**: When running backend locally (not in Docker), it needs to connect via `localhost:5432`. Docker Compose automatically overrides this to `mediquery-postgres` when running in containers.

### Frontend build errors

- **Clear cache**: `rm -rf frontend/node_modules/.vite`
- **Reinstall**: `cd frontend && pnpm install`

### Database connection refused

- **Check host**: In Hybrid Mode, use `DB_HOST=localhost` in `.env`
- **Check port**: Ensure `5432` is not in use: `lsof -i :5432`
