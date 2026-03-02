# Testing Guide

## Automated Testing (Docker - Recommended)

We provide two dedicated test suites that run in isolated Docker containers:

### Backend Unit Tests (Fast)

```bash
# Run backend tests
cd backend
pnpm test
```

**What it runs:**

1. **Backend Unit Tests** — Vitest suite (`backend/src/**/*.spec.ts`), covering controllers, services, and core logic.
2. **Frontend Component Tests** — Playwright component testing (`frontend/tests/components/`)

**Use case:** Test driven development, quick sanity checks.

**Spec files:**

| File                                             | What it covers                                                                                                                                                                 | Stmt %   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| `app.controller.spec.ts`                         | Health endpoint                                                                                                                                                                | 57%      |
| `auth/auth.controller.spec.ts`                   | Login, register, guest, logout, me — full path coverage                                                                                                                        | **100%** |
| `auth/auth.service.spec.ts`                      | validateUser, login, getUserById, createUser, seedAdmin, blacklistToken, isTokenBlacklisted                                                                                    | **82%**  |
| `threads/threads.controller.spec.ts`             | GET/POST/DELETE/PATCH thread endpoints                                                                                                                                         | **100%** |
| `threads/threads.service.spec.ts`                | createThread, getUserThreads, deleteThread, updateThread, getThreadMessages, addMessage                                                                                        | **100%** |
| `token-usage/token-usage.controller.spec.ts`     | Usage, status, monthly, breakdown, SSE, admin quota endpoints                                                                                                                  | **100%** |
| `token-usage/token-usage.service.spec.ts`        | calculateCost (all providers), checkMonthlyLimit, getUsageStatus (all warning levels), getMonthlyUsage, getProviderBreakdown, getAllUsersUsage, updateUserQuota, logTokenUsage | **84%**  |
| `token-usage/token-usage-events.service.spec.ts` | SSE subscribe/emit/cleanup                                                                                                                                                     | **100%** |
| `ai/config.controller.spec.ts`                   | `/config/models` response shape                                                                                                                                                | **100%** |
| `ai/llm.service.spec.ts`                         | `getAvailableModels()` per provider                                                                                                                                            | 36%      |
| `ai/queries.controller.spec.ts`                  | `model_id`/`model_provider` contract                                                                                                                                           | 34%      |
| `config/config.service.spec.ts`                  | Env config loading                                                                                                                                                             | 21%      |

> Coverage last measured: 2026-02-22 · **113 tests, 12 files** · Overall: ~26% stmts (auth: 66%, threads: 100%, token-usage: 91%)

### Integration Tests (Manual Only)

These tests require live API keys (e.g., Bedrock/Gemini) and are **excluded** from standard CI runs to avoid costs and flakiness.

```bash
# Run from backend-py-legacy directory
cd backend-py-legacy
uv run pytest -m "integration"
```

**What it runs:**

- Real LLM connectivity checks
- Complex multi-agent flows
- Database query execution

### E2E Tests (Full Stack Integration)

Our CI pipeline (`.github/workflows/e2e.yml`) and local setups now run natively instead of using heavy docker-in-docker wrapper scripts.

```bash
# Terminal 1: Background DBs
docker compose up -d db postgres

# Terminal 2: Backend API
cd packages/db
pnpm db:migrate

cd ../../backend
pnpm start:prod

# Terminal 3: Frontend local preview
cd frontend
pnpm build
pnpm preview

# Terminal 4: Run Playwright against local preview (port 4173)
cd frontend
PLAYWRIGHT_TEST_BASE_URL=http://localhost:4173 pnpm test-e2e
```

**What it runs (~1-2 minutes):**

1. Verifies the actual built outputs of both TS Backend and Frontend Vite servers.
2. Runs Playwright E2E testing against the running stack across `chromium`.
3. Validates full system interactions (authentication, queries, visualizations, mapping).

**Use case:** Run before merging PRs, deployment validation. This exactly mimics the GitHub Actions pipeline.

## Backend TypeScript (NestJS) Specifics

In 2026, the TypeScript backend uses **Vitest** for all testing layers (Unit, Integration, and Contract) ensuring native ESM support and blazing-fast execution speeds compared to legacy Jest.

### Unit Tests (Vitest)

Unit tests focus on pure functions, logic, and strictly mocked database dependencies.

```bash
cd backend
pnpm test

```

`pnpm test:e2e` relies on `Testcontainers`. Testcontainers automatically pulls and spins up a dedicated, isolated PostgreSQL database container strictly for testing and destroys it upon exit.

```bash
cd backend
pnpm test:e2e
```

_Note: This process does not conflict with `docker-compose.yml` DBs running on default ports as Testcontainers binds randomized ephemeral ports._

## Frontend Specifics (Vite / React)

For 2026 frontend testing, we have transitioned toward:

1. **Component Behavior Tests**: Validating interactions rather than implementation details (via React Testing Library + Vitest).
2. **Visual Regression & Sharding**: E2E Workflows run on Playwright. We use sharding across CI workers to massively reduce build times on large browser matrixes.
