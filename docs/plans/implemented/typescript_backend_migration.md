---
status: active
priority: high
date_created: 2026-02-21
date_updated: 2026-02-22
related_files:
  - backend/
  - docker-compose.yml
depends_on: []
blocks: []
assignee: null
completion:
  - [x] Phase 1: Foundation Setup (`backend` scaffolding, Docker, Config)
  - [x] Phase 2: Database & ORM Integration (Schema bridging)
  - [x] Phase 2.5: Integration Testing & Verification
  - [x] Phase 2.6: Vitest Foundation
  - [x] Phase 3: Core Services & Auth (JWT, Settings, Token Tracking)
  - [x] Phase 4: Standard API Migration (Health, Auth, Quotas)
  - [x] Phase 5: AI Orchestration Migration (LangGraph.js, Streaming) [COMPLETE]
  - [x] Phase 6: Testing Architecture Overhaul
  - [x] Phase 7: Linter & Clean-Up Best Practices
  - [ ] Phase 8: Final Cutover & Cleanup
---

# TypeScript Backend Migration Plan

## Overview

This plan outlines the strategy for porting the Mediquery AI backend from Python (FastAPI + LangGraph) to TypeScript. We will use the **Strangler Fig (Side-by-Side) pattern** rather than a Big Bang rewrite. This allows us to incrementally port modules, test them in parallel using real database state, and ensure zero downtime or feature freezes during the transition.

## Strategy: Side-by-Side (Strangler Fig Pattern)

**Why not a Big Bang Rewrite?**

- **Risk Mitigation**: A single massive rewrite introduces high risk for regressions, especially in complex LangGraph workflows.
- **Incremental Value**: We can port simpler endpoints first (e.g., Auth, Health) to validate our TS foundation before tackling the complex AI orchestrations.
- **Testing**: We can use shadow testing or parallel testing against both backends to ensure the TS output strictly matches the Python output, sharing the exact same PostgreSQL and MySQL instances.

### How it works:

1. We will create a new directory `backend/` next to `backend/`.
2. Both backends will run simultaneously in local development and Docker Compose.
3. We will introduce a lightweight reverse proxy (e.g., Nginx, or handle routing in the Frontend's Vite proxy/API client) that forwards requests to either the Python service (port 8000) or TS service (port 8001).
4. As we rewrite an endpoint in TS, we update the proxy routing rules.
5. Once all routes are migrated, the Python backend is removed.

---

## Technical Mapping

| Framework: `FastAPI` | `NestJS` |
| Types/Validation: `Pydantic` | `Zod` (or `class-validator`) |
| ORM: `SQLAlchemy` | `Drizzle ORM` |
| AI Graphs: `LangGraph` | `@langchain/langgraph` |
| Package Manager: `uv` | `pnpm` |
| Async/Streams: `asyncio` | Native JS Promises + async generators |

---

## Phase 1: Foundation Setup

- [x] Initialize `backend` package using `pnpm` and configure NestJS.
- [x] Set up linting rules and code formatting (ESLint, Prettier).
- [x] Implement central error handling and logging (e.g. Pino).
- [x] Setup `backend.Dockerfile` and register the new service in `docker-compose.yml` (e.g., running on port 8001).
- [x] Update Frontend Vite config to proxy specific API paths to the new NestJS backend while leaving others to FastAPI.

## Phase 2: Database & ORM Integration (Drizzle vs Raw SQL)

- [x] Define wait_times to both Percona MySQL (KPIs) and PostgreSQL (App Data).
- [x] Determine pattern for agentic queries vs standard application queries.
  - **Drizzle ORM** is excellent for standard application logic (Auth, Users, Tokens) because it is type-safe, preventing SQL injection, and very close to raw SQL. It allows you to model your schema explicitly in TypeScript, making migrations and standard CRUD highly predictable.
  - **Raw SQL (or thin wrappers like `mysql2` / `pg`)**: For the _Agentic_ portion (the AI generating SQL to analyze KPI data), pure Raw SQL is often better. Agents are generating strings of SQL based on user intent. Feeding an agent's string output back through an ORM query builder adds an unnecessary layer of complexity and potential failure points.
  - **Recommendation**: Use **Drizzle** for the PostgreSQL operational database (Users, Chat History, Quotas) to maintain strong types and security. Use **Raw SQL driver (`mysql2`)** directly for executing the AI-generated queries on the Percona MySQL database. This gives the agents unconstrained freedom to use complex window functions or specific table joins without fighting an ORM abstraction.
- [x] Configure Pino to write logs to `../logs/backend.log` at the project base directory.
- [x] Bridge the PostgreSQL models over to Drizzle definitions to match existing SQLAlchemy schema.
- [x] Validate database connectivity.
- [x] Update docs (e.g. `ARCHITECTURE.md`, `DEVELOPMENT.md`) to reflect Phase 2 progress.

## Phase 2.5: Integration Testing & Verification

- [x] Set up isolated E2E testing profile in `docker-compose.test.yml`.
- [x] Orchestrate Playwright (Frontend) and NestJS (Backend-TS) integration tests via `run-e2e.sh`.
- [x] Resolve database authentication and connectivity issues in test containers.
- [x] Configure environment-aware logging (JSON to stdout in test/prod).
- [x] Containerize integration tests to run hermetically against ephemeral service containers.
- [x] Ensure all component/unit and E2E tests pass. (Unit tests for TS backend migrated)

## Phase 2.6: Vitest Foundation

- [x] Uninstall `jest`, `ts-jest`, `@types/jest` from `backend`.
- [x] Install `vitest`, `@vitest/coverage-v8`, and `unplugin-swc`.
- [x] Create `vitest.config.ts` and `vitest.config.e2e.ts`.
- [x] Replace global jest assertions and setup lines with explicit `vitest` imports for type safety.
- [x] Ensure `pnpm test` and `pnpm test:e2e` scripts execute flawlessly using `.test.yml` services.

## Phase 3: Core Services & Auth

- [x] Port Pydantic Settings logic to a Zod-validated `dotenv` loader for configuration.
- [x] Implement Token Verification Middleware (JWT validation reproducing the `python-jose` logic).
- [x] Duplicate the Token Tracking Service behavior logic for quotas.
- [x] Set up tests for the migrated endpoints. (Vitest unit tests added)
- [x] Update docs to reflect Phase 3 progress.

## Phase 4: Standard API Migration

- [x] Migrate `Health` Endpoints (`api/v1/endpoints/health.py`).
- [x] Migrate `Auth` Endpoints (`api/v1/endpoints/auth.py`).
- [x] Migrate `Token Usage` Endpoints (`api/v1/endpoints/token_usage.py`).
- [x] Update frontend routing or proxy to direct traffic for these URLs to `backend`.
- [x] Set up tests for the migrated endpoints. (Vitest unit tests added)
- [x] Update docs to reflect Phase 4 progress. (Hybrid validation complete)

## Phase 5: AI Orchestration & Streaming (The Heavy Lift)

- [x] Introduce `@langchain/langgraph` and `@langchain/aws` dependencies to `backend`.
- [x] Rebuild LangGraph Agent states and nodes (Router, Schema Navigator, SQL Writer, Critic, Meta-Agent, Reflector).
- [x] Port prompt templates from `app/prompts/` into `backend/src/ai/prompts/`.
- [x] Implement Server-Sent Events (SSE) streaming logic to replicate FastAPI's streaming response for the UI (`POST /api/v1/queries/stream`).
- [x] Route all query/thread endpoints to TypeScript — `POST /api/v1/queries/query`, `POST /api/v1/queries/stream`, all threads endpoints.
- [x] Add `GET /api/v1/config/models` endpoint to NestJS (`ConfigController` in `AIModule`, `LLMService.getAvailableModels()`).
- [x] Add push-based token-usage updates via SSE: `TokenUsageEventsService`, `GET /api/v1/token-usage/events`, emits on every `logTokenUsage` write; `UsageNotifications` and `UsageIndicator` replaced polling with `EventSource`.
- [x] Extend `JwtAuthGuard` to accept `?token=` query param (required for browser `EventSource` which cannot set request headers).
- [x] Thread `model_id` + `model_provider` from request through `GraphState` → all 5 agent nodes; `ConfigService.getActiveModelForRole()` replaces hardcoded `BEDROCK_*_MODEL` fallbacks.
- [x] Update `QueryRequest` contract to explicit `model_id` / `model_provider` fields (removed `provider/model` string splitting).
- [x] CRITICAL: Endpoint audit complete — all 20 Python endpoints verified as present in NestJS (see audit table in `docs/context/ARCHITECTURE.md`).
- [x] Set up Vitest unit tests for: `ConfigController`, `LLMService.getAvailableModels()`, `TokenUsageEventsService`, `QueriesController` (model contract), `TokenUsageController` (SSE + status).
- [x] Update docs to reflect Phase 5 progress.

## Phase 6: Testing Architecture Overhaul

This phase implements the 2026 standard for testing, emphasizing type-safe isolation, ephemeral environments, and contract-driven development.

- [x] Implement **Unit Tests (Vitest)**: Shift to `vitest` for native TS/Vite support and speed. Focus on pure functions, achieving >80% logic coverage.
- [x] Implement **Integration Tests (Supertest + Testcontainers)**: Replace shared test databases with `Testcontainers` to spin up real, ephemeral PostgreSQL/MySQL instances for every run, ensuring zero data pollution.
- [x] Implement **Contract Testing (MSW)**: Setup Mock Service Worker (`msw`) v2.0+ to share API mock definitions between frontend tests and backend schemas.
- [x] Fortify **E2E Tests (Playwright)**: Ensure critical user journeys use Sharding and Trace Viewer. Implement Visual Regression testing and Accessibility Automations (`@axe-core/playwright`).
- [x] Ensure **Schema Validation Testing**: Verify that Zod strictly rejects invalid payloads with `422 Unprocessable Entity`.
- [x] Update docs to reflect Phase 6 progress.
- [x] Update GitHub Actions CI workflows to use new testing architecture.

## Phase 7: Linter & Clean-Up Best Practices

This phase addresses technical debt accrued during the migration by prioritizing execution speed.

- [x] Strict TypeScript Checks: Re-enable `@typescript-eslint/no-unsafe-*` flags that were temporarily disabled.
- [x] Implement path aliases (e.g. `@src/`, `@auth/`) versus relative imports `../../` to prevent brittle and messy imports.
- [x] Optimize Node.js App Modules and resolve specific strict type issues across database and auth modules.
- [x] Update docs to reflect Phase 7 progress.

## Phase 8: Cutover & Cleanup

- [ ] Fully verify E2E tests, UI behaviors, and Playwright workflows pass against TS backend alone.
- [x] Rename `backend/` folder (Python) to `backend-py-legacy/`.
- [x] Rename `backend/` folder (TypeScript) to `backend/`.
- [ ] Update `docker-compose` files to remove the Python backend service.
- [ ] Update `.github/workflows/` CI scripts, dropping Python/uv steps in favor of caching `pnpm`. Implement ephemeral preview environments leveraging the new testing architecture.
- [ ] Finalize the Docker image strategy (single container serving Frontend + TS Backend, or keep split).
- [ ] Finalize all master documentation to remove "legacy" labels.
- [ ] Ensure all component/unit and E2E tests strictly pass.
- [ ] Update docs to reflect Phase 8 progress.
