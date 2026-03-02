# Mediquery Documentation

**For AI Agents & Developers**: This is your primary documentation reference.

---

## 🚀 Quick Start

### For AI Agents

1. **Check current work** → [`plans/active/`](plans/active/)
2. **Understand the stack** → [`agents/context/ARCHITECTURE.md`](agents/context/ARCHITECTURE.md)
3. **See coding standards** → [`agents/context/CONFIGURATION.md`](agents/context/CONFIGURATION.md)
4. **Follow workflows** → [`agents/context/WORKFLOWS.md`](agents/context/WORKFLOWS.md)

### For Developers

- **New to the project?** → [`guides/GETTING_STARTED.md`](guides/GETTING_STARTED.md)
- **Daily development?** → [`guides/DEVELOPMENT.md`](guides/DEVELOPMENT.md)
- **Running tests?** → [`guides/TESTING_GUIDE.md`](guides/TESTING_GUIDE.md)
- **Architecture reference** → [`humans/context/ARCHITECTURE.md`](humans/context/ARCHITECTURE.md)

---

## 🧭 Documentation Audience Split

- **`docs/agents/*`** → authoritative, concise docs for coding agents and automation context limits.
  - [`agents/context/`](agents/context/)
  - [`agents/designs/`](agents/designs/)
- **`docs/humans/*`** → expanded explanatory docs for onboarding, rationale, and project understanding.
  - [`humans/context/`](humans/context/)
  - [`humans/designs/`](humans/designs/)

Use `agents/*` for strict implementation policy and `humans/*` for full narrative context.

---

## 🔥 Active Plans

| #   | Plan                                                                                                                  | Status         | Est. Hours |
| --- | --------------------------------------------------------------------------------------------------------------------- | -------------- | ---------- |
| 1   | **OMOP Golden Dataset Hardening** ([plan](plans/active/omop_golden_dataset_hardening.md))                              | 🔄 In Progress | 27-41h     |
| 2   | **Automated Benchmarking & Evaluation Pipeline** ([plan](plans/active/automated_benchmarking_evaluation_pipeline.md)) | 🔄 In Progress | 25-40h     |
| 3   | **Migrate Tenant DB from Percona to Postgres** ([plan](plans/active/migrate_tenant_db_to_postgres.md))                | ✅ Completed   | 15h        |

**Latest Milestone (2026-03-01):**

- ✅ **OMOP & Synthea Phase 3 Complete**: Successfully mapped and loaded 500 patients into OMOP v5.4. Generated 64MB Gold SQL dump for tenant provisioning.
- ✅ **Agent Context Overhaul**: Updated `semantic_view.yaml` and `system_prompts.yaml` to fully support OMOP CDM navigation and vocabulary joins.
- ✅ New active plan created for comprehensive automated benchmarking/evaluation pipeline (dataset matrix + judge architecture + CI integration roadmap)
- ✅ Shadcn v4 UI Overhaul moved to implemented
- ✅ LLM Routing & Agentic Optimization moved to implemented
- ✅ Legacy backlog plans cleaned up: LangGraph Workflow Refactor (partially implemented), Multi-Agent Reflexion, and Token Tracking Phase 2 moved to implemented

## ✅ Recently Completed

### TypeScript Backend Migration (Complete)

Completed the full port of the backend from Python (FastAPI + LangGraph) to TypeScript/NestJS.

| # | Plan | Status |
| --- | ---------------------------------------------------------------------------------------------- | ================ |
| 1 | **TypeScript Backend Migration** ([plan](plans/implemented/typescript_backend_migration.md)) | ✅ Complete |
| 2 | **OMOP & Synthea Migration** ([plan](plans/active/omop_synthea_migration.md)) | ✅ Complete |
| 3 | **Shadcn v4 UI Overhaul** ([plan](plans/implemented/shadcn_v4_ui_overhaul.md)) | ✅ Complete |
| 4 | **LLM Routing & Agentic Optimization** ([plan](plans/implemented/llm_routing_agentic_optimization.md)) | ✅ Complete |
| 5 | **LangGraph Workflow Refactor** ([plan](plans/implemented/langgraph_workflow_refactor.md)) | ✅ Partially Implemented (project evolved) |
| 6 | **Multi-Agent Reflexion Deep Dive** ([plan](plans/implemented/multi-agent-reflexion.md)) | ✅ Implemented (historical) |
| 7 | **Token Consumption Tracking - Phase 2** ([plan](plans/implemented/token_tracking_phase2.md)) | ✅ Implemented (historical) |

---

## 📋 Backlog Plans

### Multi-Tenant Data Pipeline — Plan Series

Future plans for schema-per-tenant PostgreSQL (KPI data & app data), with standalone data pipeline (decoupled from application for future MLOps).

| #   | Plan                                                                            | Status             | Est. Hours |
| --- | ------------------------------------------------------------------------------- | ------------------ | ---------- |
| 1   | **Schema Foundation** ([plan](plans/backlog/01_schema_foundation.md))           | 📋 Backlog (Ready) | 20-30h     |
| 2   | **Manual ETL Scripts** ([plan](plans/backlog/02_etl_scripts.md))                | 📋 Backlog         | 15-20h     |
| 3   | **Pipeline Orchestration** ([plan](plans/backlog/03_pipeline_orchestration.md)) | 📋 Backlog         | 25-35h     |
| 4   | **MLOps Foundation** ([plan](plans/backlog/04_mlops_foundation.md))             | 📋 Backlog         | 40-60h     |

> **Design rationale**: [Schema-per-Tenant Architecture](designs/schema_per_tenant_rationale.md)

**Last Status Update**: 2026-02-27

**Recently Completed**:

- ✅ **Linter & Clean-Up Best Practices** (2026-02-22)
  - Removed all `@ts-nocheck` directives from production source files
  - Created `src/common/types/index.ts` with shared domain types (`JwtPayload`, `ValidatedUser`, `LangChainLLMResponse`, `KpiQueryResult`, `SemanticView`, `PromptCategory`, etc.)
  - Added `src/common/types/express.d.ts` — global Express.Request augmentation for typed `req.user`
  - Eliminated all `any` casts across auth, controllers, services, and AI agent nodes
  - Replaced `{ role, content }` plain objects with typed `AIMessage` in all LangGraph agent nodes
  - Re-enabled ESLint strict rules: `no-unsafe-argument`, `no-unsafe-assignment`, `no-unsafe-member-access`, `no-unsafe-call`, `no-unsafe-return` set to `error`; `no-explicit-any` set to `warn`
  - `pnpm exec tsc --noEmit` and `pnpm lint` both pass with zero errors
  - **Coverage uplift** (follow-up, 2026-02-22): Expanded all high/medium-priority spec files; 113 tests now passing
    - `auth.controller.ts`: 15% → **100%** · `auth.service.ts`: 18% → **82%**
    - `threads.controller.ts`: 45% → **100%** · `threads.service.ts`: 38% → **100%**
    - `token-usage.controller.ts`: 58% → **100%** · `token-usage.service.ts`: 17% → **85%**
    - Frontend `pnpm lint` also cleaned to zero errors/warnings

- ✅ **Testing Architecture Overhaul** (2026-02-21)
  - Implemented fast unit testing architecture with `vitest` replacing `jest`
  - Integrated `Testcontainers` (PostgreSQL 18.1) for ephemeral, hermetic Database Integration testing
  - Installed Mock Service Worker (MSW) enabling type-safe contract testing between Frontend and Backend
  - Deprecated legacy `run-ci.sh` bash scripts in favor of native `vitest` and GitHub Actions integrations
  - Re-mapped GitHub workflows to execute native `pnpm` test runners instead of isolated Docker Compose builds
- ✅ **AI Orchestration & Streaming** (2026-02-21)
  - Rebuilt full LangGraph.js multi-agent graph (Router → Schema Navigator → SQL Writer → Critic ↔ Reflector, Meta-Agent)
  - Implemented `POST /api/v1/queries/stream` NDJSON streaming and `POST /api/v1/queries/query` non-streaming
  - Added `GET /api/v1/config/models` via `ConfigController` + `LLMService.getAvailableModels()`
  - Replaced client polling with SSE push: `TokenUsageEventsService`, `GET /api/v1/token-usage/events`; `UsageIndicator` and `UsageNotifications` now use `EventSource`
  - Threaded `model_id` / `model_provider` through `GraphState` → all 5 agent nodes use `ConfigService.getActiveModelForRole()` instead of hardcoded Bedrock fallbacks
  - Updated `QueryRequest` contract: explicit `model_provider` field replaces `provider/model` string splitting
  - Completed full endpoint audit — all 20 Python routes verified present in NestJS
  - Added Vitest unit tests for `ConfigController`, `LLMService`, `TokenUsageEventsService`, `QueriesController`, `TokenUsageController` (SSE + status)
- ✅ **Standard API Migration** (2026-02-21)
  - Migrated `/api/v1/health`, `/api/v1/auth`, `/api/v1/token-usage`, and `/api/v1/threads` to TypeScript
  - Implemented hybrid authentication bypass in Python backend for legacy `/stream` compatibility
  - Verified cross-backend consistency for user profiles and quotas
- ✅ **Core Services & Auth** (2026-02-21)
  - Ported Pydantic configuration to Zod-validated `ConfigModule` in NestJS
  - Implemented JWT verification logic matching legacy backend
  - Ported Token Tracking and Quota Enforcement logic
- ✅ **Auth Session Timeout & 401 Redirect** (2026-02-10)
  - Increased JWT session timeout from 30 min to 1 hour (configurable via settings)
  - Added global 401 interceptor for automatic logout + redirect to login
  - Added token expiry check on app mount to clear stale sessions
  - Centralized all auth timeout configuration to `settings.access_token_expire_minutes`
- ✅ **Consolidate Multi-Provider Token Usage** (2026-02-10)
  - Global quota enforcement across all 5 LLM providers (Bedrock, OpenAI, Gemini, Anthropic, Local)
  - Unified dashboard with single monthly bar, optional per-provider breakdown toggle
  - API schema refactor: Split into domain modules (auth, query, thread, health, token_usage)
  - Bug fix: sql_generator.py check_quota() calls updated to 2-param signature
- ✅ **OpenAI LLM Provider Integration** (2026-02-09)
  - OpenAI as fifth LLM provider (gpt-5.2), dynamic model dropdown, prefix convention
  - Model override threaded through all 5 agents, token tracking, `get_available_providers()` respects USE\_\* flags
- ✅ **React Router Navigation + Role-Based Auth** (2026-02-02)
  - Proper URLs, browser navigation, deep linking
  - Role-based authorization system (JWT claims, centralized auth utility)
  - Legacy cleanup (removed services/legacy/, fixed localStorage inconsistencies)
- ✅ **Modular Backend Refactor** (Complete modular architecture with API restructuring)
- ✅ **Token Tracking Foundation** (Complete token tracking system with quota enforcement)
- ✅ PostgreSQL Foundation (Users/Chat tables migrated)
- ✅ Secure Logout (Token blacklisting & Frontend UI)
- ✅ Pydantic Settings v2 configuration
- ✅ Documentation reorganization (Progressive disclosure principles)

---

## 📚 Essential Guides

### Development Workflow

- [Getting Started](guides/GETTING_STARTED.md) - First-time setup, prerequisites
- [Development Guide](guides/DEVELOPMENT.md) - Running locally, debugging, commands
- [Testing Guide](guides/TESTING_GUIDE.md) - Unit, integration, E2E patterns

> **Database migrations (TypeScript)**: Canonical Drizzle schema and SQL migrations now live in `packages/db` and are applied in Docker by the `migrator` service.

### Architecture & Patterns

- [Architecture](humans/context/ARCHITECTURE.md) - Stack overview, code conventions, design patterns
- [Configuration](humans/context/CONFIGURATION.md) - Settings management, security practices
- [Benchmarking](humans/context/BENCHMARKING.md) - Development benchmark workflow, metrics, and troubleshooting
- [Workflows](humans/context/WORKFLOWS.md) - Documentation practices, plan lifecycle

### Specialized Topics

- [Docker Deployment](guides/DOCKER_DEPLOYMENT.md) - Advanced containerization scenarios
- [Dependency Management](guides/DEPENDENCY_MANAGEMENT.md) - uv, build modes, lock management
- [Chat History Auto-Deletion](guides/CHAT_HISTORY_AUTO_DELETION.md) - Retention policy
- [Local Model Setup](guides/LOCAL_MODEL_SETUP.md) - ⚠️ LEGACY: Ollama configuration (not maintained)

### Design Documents

- [Schema-per-Tenant Architecture](humans/designs/schema_per_tenant_rationale.md) - Postgres schema-per-tenant multi-tenancy, medallion layers, switchboard pattern
- [Data Ingestion & ETL Architecture](humans/designs/data_ingestion_etl_architecture.md) - End-to-end ETL pipeline, data flow, technology stack (Confluence-ready)
- [Evaluation & Prompt Optimization](humans/designs/evaluation_and_finetuning.md) - Golden query suites, provider comparison, test-driven prompt development (API models)
- [Benchmarking Framework](humans/designs/benchmarking_framework.md) - Guardrail benchmark design, corpus strategy, and execution modes
- [Self-Hosted Model Training](humans/designs/self_hosted_model_training.md) - Fine-tuning pipeline, model registry, self-hosted inference (future path)
- [Multi-Agent Architecture](humans/designs/multi_agent_architecture.md) - Detailed LangGraph workflow designs
- [Frontend Architecture](humans/designs/frontend_architecture.md) - React component hierarchy, data flow, state management

---

## ✅ Recently Completed Work

| Plan                                       | Completed  | Summary                                                                                                                                  |
| ------------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Standard API Migration**                 | 2026-02-21 | Migrated Health, Auth, Token Usage, and Threads to TypeScript backend. Implemented JWT hybrid bypass for Python `/stream` compatibility. |
| **Core Services & Auth**                   | 2026-02-21 | Ported Pydantic config to NestJS, implemented JWT verification and Token Tracking logic in TypeScript.                                   |
| **Auth Session Timeout & 401 Redirect**    | 2026-02-10 | Increased JWT timeout to 1hr (configurable), global 401 interceptor, automatic logout/redirect, token expiry check on mount              |
| **Consolidate Multi-Provider Token Usage** | 2026-02-10 | Global quota enforcement (1M tokens/month), unified dashboard, per-provider breakdown toggle, API schema refactor                        |
| **React Router Navigation**                | 2026-02-02 | Proper URLs, browser navigation, deep linking, protected routes with admin support                                                       |
| **Modular Backend Refactor**               | 2026-02-01 | Complete modular architecture (28 files), API restructuring, config fixes, deprecation resolution                                        |
| Token Tracking Foundation                  | 2026-02-01 | Complete token tracking: backend service, quota enforcement, API endpoints, frontend UI                                                  |
| Quota Enforcement                          | 2026-02-01 | Pre-emptive quota checks, all agent modes, streaming error handling                                                                      |
| Test Suite Verification                    | 2026-01-26 | Comprehensive test baseline (Backend, Frontend, E2E)                                                                                     |
| LangGraph Refactor                         | 2026-01-24 | Multi-agent workflow with AWS Bedrock                                                                                                    |
| Frontend UI Overhaul                       | 2026-01-24 | OKLCH colors, dynamic themes, theme-aware Plotly                                                                                         |
| Agent Mode UI Refactor                     | 2026-01-28 | 3-way segmented control (Fast/Thinking/Multi-Agent)                                                                                      |
| Documentation Refactor                     | 2026-02-01 | Progressive disclosure, merged guides, streamlined structure                                                                             |

See all completed plans: [`plans/implemented/`](plans/implemented/)

---

## 🗺️ Documentation Map

### Directory Structure

```
docs/
├── README.md              ← You are here
├── guides/                ← How-to guides for daily work
│   ├── GETTING_STARTED.md
│   ├── DEVELOPMENT.md
│   ├── TESTING_GUIDE.md
│   ├── DEPENDENCY_MANAGEMENT.md
│   ├── DOCKER_DEPLOYMENT.md
│   ├── CHAT_HISTORY_AUTO_DELETION.md
│   └── LOCAL_MODEL_SETUP.md (⚠️ Legacy)
├── agents/                ← Concise authoritative docs for coding agents
│   ├── context/
│   └── designs/
├── humans/                ← Expanded docs for developer onboarding/rationale
│   ├── context/
│   └── designs/
├── plans/                 ← Task & project planning
│   ├── active/            ← Current work (agents prioritize this)
│   ├── implemented/       ← Completed plans
│   └── backlog/           ← Future ideas
└── reports/               ← Implementation reports
    ├── current/           ← Active work reports
    └── archive/           ← Historical reference
```

---

## 🤖 Agent Workflow Instructions

### When Implementing a Feature

**Step-by-Step**:


# 2. Update plan frontmatter
status: implemented
date_completed: YYYY-MM-DD

# 3. Update this README
# Add row to "Recently Completed Work" table

# 4. Archive related reports (if any)
mv docs/reports/current/report.md docs/reports/archive/2026/
```

---

## 📋 Plan Frontmatter Template

All plan files should have YAML frontmatter:

```yaml
---
status: active | implemented | backlog
priority: high | medium | low
date_created: YYYY-MM-DD
date_updated: YYYY-MM-DD
date_completed: YYYY-MM-DD  # only for implemented
related_files:
  - backend/path/to/file.py
  - frontend/path/to/component.tsx
depends_on:
  - docs/plans/active/other-plan.md
blocks: []
assignee: null
completion:  # only for active plans
  - [x] Step 1 - Description ✅
  - [ ] Step 2 - Description
  - [ ] Step 3 - Description
---
```

---

## 🔍 Quick Commands

```bash
# Find active work
ls docs/plans/active/*.md

# See completed plans
ls docs/plans/implemented/*.md

# Find future ideas
ls docs/plans/backlog/*.md

# Check progress of active plan
grep -A 5 "completion:" docs/plans/active/*.md

# Search all documentation
grep -r "search term" docs/
```

---

## 💡 Best Practices

### For AI Agents

- ✅ **DO** read `active/` plans first
- ✅ **DO** update progress after each task
- ✅ **DO** reference guides for coding standards
- ❌ **DON'T** read backlog unless explicitly asked
- ❌ **DON'T** create duplicate documentation

### For Developers

- ✅ Use README.md as your navigation hub
- ✅ Keep plans synchronized with code
- ✅ Archive completed work promptly
- ✅ Link plans ↔ code ↔ reports bidirectionally

---

## 🗂️ Archive Reference

<details>
<summary>Future Plans (Backlog) - Expand if needed</summary>

- [Multi-Agent Reflexion Deep Dive](plans/backlog/multi-agent-reflexion.md) - Advanced multi-agent architecture
- [Frontend Test Infrastructure](plans/backlog/frontend_test_infrastructure.md) - Playwright system dependencies fix
- [Modular Backend Refactor](plans/backlog/modular_backend_refactor.md) - Refactor monolithic agent files

</details>

<details>
<summary>Historical Reports (2026) - Expand if needed</summary>

- [Dependency Analysis Report](reports/archive/2026/DEPENDENCY_ANALYSIS_REPORT.md)
- [Multi-Agent Fix Summary](reports/archive/2026/MULTI_AGENT_FIX_SUMMARY.md)
- [Token Tracking Implementation Summary](reports/archive/2026/PHASE1_IMPLEMENTATION_SUMMARY.md)
- [SQL Cleaning Fix Report](reports/archive/2026/SQL_CLEANING_FIX_REPORT.md)
- [Reorganization Summary](reports/archive/2026/REORGANIZATION_SUMMARY.md)

</details>

---

## 📞 Need Help?

- **Lost?** → You're reading it! Start with [Getting Started](guides/GETTING_STARTED.md)
- **Implementing?** → Check [`plans/active/`](plans/active/)
- **Researching history?** → Browse [`reports/archive/`](reports/archive/)
- **Setup questions?** → See [`guides/`](guides/)
- **Architecture questions?** → Read [`context/ARCHITECTURE.md`](context/ARCHITECTURE.md)
