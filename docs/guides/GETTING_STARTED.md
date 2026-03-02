# Getting Started

## Prerequisites

### Required Tools

- **Node.js 24.13.1** (JavaScript runtime): Use [nvm](https://github.com/nvm-sh/nvm)
  ```bash
  # Using nvm (recommended)
  nvm install 24.13.1
  nvm use 24.13.1
  ```
- **Docker Desktop** (for PostgreSQL database)
- **pnpm** (Node package manager): `nvm use && corepack enable && corepack use pnpm@latest` (requires Node.js installed first)
- **uv** (Python package manager): `curl -LsSf https://astral.sh/uv/install.sh | sh` (Optional, for legacy python backend only)

### Recommended

- **VS Code** with ESLint, Prettier, and Playwright extensions.
- **Chrome** or **Edge** (for frontend debugging)

---

## First-Time Setup

### 1. Clone & Configure

```bash
git clone <repository-url>
cd mediquery-ai
```

### 2. Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and configure:

- **AI Provider**: Set `GEMINI_API_KEY` OR `USE_BEDROCK=true` with AWS credentials
- **Database**: Set `DB_PASSWORD` (default: `mediquery_secure_2026`)
- **Security**: Change `JWT_SECRET_KEY` for production

> **Note**: Environment variables are automatically loaded by Zod (`backend/src/config/env.config.ts`).

### 3. Initialize Database

```bash
docker compose up -d db postgres
```

This starts the PostgreSQL (App Data & KPIs) container.

### 4. Backend Setup

#### TypeScript (Active backend — port 8001)

```bash
cd backend
pnpm install
```

This installs **all** dependencies: runtime, testing, and development tools.

#### Database Package (Drizzle schema + migrations)

```bash
cd packages/db
pnpm install
```

#### Python (Legacy Fallback)

```bash
cd backend-py-legacy
uv sync
```

### 5. Frontend Setup

```bash
cd frontend
pnpm install
```

---

## Verify Installation

### Check Database is Running

```bash
docker ps
# Should show "mediquery-db" and "mediquery-postgres" with status "healthy"
```

### Test Backend

#### TypeScript (Active)

```bash
cd backend
pnpm run start:dev
# Port 8001
```

#### Python (Legacy Fallback — optional)

```bash
cd backend-py-legacy
uv run uvicorn main:app --reload
# Port 8000
```

### Test Frontend

```bash
cd frontend
pnpm dev
# Should start on http://localhost:5173
```

---

## Next Steps

You're ready to develop! See:

- **[DEVELOPMENT.md](DEVELOPMENT.md)** for running and debugging
- **[../context/ARCHITECTURE.md](../context/ARCHITECTURE.md)** for code conventions
