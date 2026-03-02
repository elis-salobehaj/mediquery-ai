# Architecture & Conventions

## Stack Overview

Benchmarking references:

- Context workflow: `docs/context/BENCHMARKING.md`
- Design framework: `docs/designs/benchmarking_framework.md`

### Backend (TypeScript)

We have successfully migrated the primary backend from Python to TypeScript (NestJS). The Python backend remains in the repository strictly as a fallback mechanism for reference until final organizational sign-off. See `docs/plans/active/typescript_backend_migration.md`.

**TypeScript (Active — port 8001)**

- **Framework**: NestJS (Express)
- **AI Orchestration**: `@langchain/langgraph` — multi-agent graph (Router → Schema Navigator → SQL Writer → Critic ↔ Reflector, Meta-Agent)
- **Retrieval**: Prompt-guided schema navigation with heuristic candidate pre-ranking and LLM reranking in `schema-navigator.ts`
- **Memory Policy**: Scoped per-thread memory (`memory-context.ts` + `thread-memory.service.ts`) with confidence decay, TTL invalidation, request-time enable/disable (`enable_memory`), and clear-memory endpoint
- **Database**: PostgreSQL 18.1 (App Data & KPIs)
- **ORM Strategy**:
  - **Drizzle ORM**: Used for PostgreSQL (App Data). Schema and migration ownership lives in `packages/db`.
  - **pg (Raw)**: Used for execution of AI-generated queries on PostgreSQL schema-bound tenant data for maximum flexibility.
- **Logging**: Pino (with file rotation to `../logs/backend.log`)
- **Health**: Standardized `/health` endpoint for Docker and DB connectivity checks.
- **Token Usage**: Push-based SSE (`GET /api/v1/token-usage/events`) replaces polling; `TokenUsageEventsService` emits after every token write.

**Python (Legacy Fallback - 3.12+)**

- **Framework**: FastAPI (async-first)
- **AI Orchestration**: LangGraph (multi-agent workflows)
- **Database**: PostgreSQL 18.1 (App Data & KPIs) (Docker)
- **ORM**: SQLAlchemy 2.0 + Alembic migrations
- **Configuration**: Pydantic Settings v2 (strict mode)

**Key Libraries (Python):**

- `langchain-core` - LLM abstractions
- `langchain-aws` - AWS Bedrock integration
- `boto3` - AWS SDK
- `psycopg2-binary` - PostgreSQL driver
- `python-jose` - JWT authentication

### Frontend (React 19)

- **Language**: TypeScript (strict mode)
- **Package Manager**: pnpm
- **Styling**: Tailwind CSS v4 with `@theme` directive
- **Color Space**: OKLCH (perceptually uniform)
- **Testing**: Playwright (E2E)

---

## Code Conventions

### Backend

#### Type Safety

All functions must have type hints for arguments and return values:

```typescript
async getUser(userId: number): Promise<User | null> {
  // Retrieve user by ID
}
```

#### Async Operations

Use async/await for all I/O (database, LLM calls, HTTP):

```typescript
async generateSql(prompt: string): Promise<string> {
  const result = await this.llmService.invoke(prompt);
  return result.content;
}
```

#### Configuration

Never use `process.env` directly outside of `ConfigService`. Always use the injected `ConfigService` object:

```typescript
constructor(private configService: ConfigService) {}

// ✅ Correct
const apiKey = this.configService.getGeminiApiKey();

// ❌ Wrong
const apiKey = process.env.GEMINI_API_KEY;
```

#### Logging

Use the built-in `@nestjs/common` `Logger` instead of `console.log`:

```typescript
import { Logger } from "@nestjs/common";

export class AppService {
  private readonly logger = new Logger(AppService.name);

  processRequest(userId: string) {
    this.logger.log(`Processing request for user ${userId}`);
    this.logger.error("Failed to connect", err.stack);
  }
}
```

---

### Frontend

#### CSS Architecture

**@theme Directive** - Define all design tokens in CSS:

```css
@theme {
  --color-primary: oklch(60% 0.2 250);
  --color-bg: oklch(98% 0.01 250);
  --spacing-md: 1rem;
}
```

**Container Queries** - Components adapt to their container, not viewport:

```css
.card {
  @container (min-width: 400px) {
    grid-template-columns: 1fr 1fr;
  }
}
```

**Zero-JS Theme Switching** - Use data attributes:

```tsx
<html data-theme={theme}>
  {/* CSS handles everything via [data-theme="dark"] */}
</html>
```

#### Performance Targets

- **CSS Bundle**: < 10KB
- **Theme Switch**: < 50ms INP
- **First Contentful Paint**: < 1.5s

---

## Project Structure

### Backend (TypeScript - Active)

```
backend/
├── src/
│   ├── app.module.ts          # Root NestJS module
│   ├── main.ts                # Entrypoint (port 8001)
│   ├── app.controller.ts      # GET /api/v1/health
│   ├── ai/
│   │   ├── ai.module.ts
│   │   ├── graph.ts           # LangGraph StateGraph wiring
│   │   ├── state.ts           # GraphState interface
│   │   ├── router.ts          # Intent routing agent node
│   │   ├── schema-navigator.ts# Table selection agent node
│   │   ├── sql-writer.ts      # SQL generation agent node
│   │   ├── critic.ts          # SQL validation agent node
│   │   ├── reflector.ts       # Reflexion agent node
│   │   ├── meta-agent.ts      # Domain Q&A agent node
│   │   ├── llm.service.ts     # LLM factory (multi-provider)
│   │   ├── insight.service.ts # Post-query insight generation
│   │   ├── visualization.service.ts
│   │   ├── memory-context.ts  # Scoped memory derivation + summary formatting
│   │   ├── prompt.service.ts
│   │   ├── prompts/           # Agent system prompts
│   │   ├── queries.controller.ts  # POST /queries/query + /queries/stream
│   │   └── config.controller.ts   # GET /config/models
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts # POST /auth/token|register|guest|logout, GET /auth/me
│   │   ├── auth.service.ts
│   │   └── jwt-auth.guard.ts  # Accepts Bearer header OR ?token= query param
│   ├── config/
│   │   └── config.service.ts  # Zod-validated env config
│   ├── database/
│   │   ├── database.module.ts # PostgreSQL App & Medical Data
│   │   ├── database.service.ts
│   │   └── schema.ts          # App-facing schema exports (source of truth: packages/db)
│   ├── threads/
│   │   ├── threads.controller.ts  # CRUD /threads
│   │   └── threads.service.ts
│   │   └── thread-memory.service.ts # Thread-scoped memory policy store
│   └── token-usage/
│       ├── token-usage.controller.ts  # /token-usage/* + SSE /events
│       ├── token-usage.service.ts
│       ├── token-usage-events.service.ts  # SSE pub/sub per user
│       └── token-usage.module.ts
├── tsconfig.json
├── vitest.config.ts
└── package.json

packages/
└── db/
  ├── src/
  │   ├── schema.ts         # Canonical Drizzle schema for app data
  │   └── migrate.ts        # Compiled migration runtime entrypoint
  ├── drizzle/              # Canonical SQL migration history
  ├── drizzle.config.ts
  └── package.json

data-pipeline/               # OMOP v5.4 Synthea pipeline
├── alembic/                 # Python SQL migrations for OMOP tenant schemas
├── bronze/                  # Raw Synthea data output (Local CSVs)
├── docker-compose.yml       # Transient PostgreSQL 18.3 ETL DB
├── config.py                # Pydantic Settings
├── load_omop.py             # Polars-driven ETL script
├── gold_omop_tenant.sql     # Processed, deployable SQL dump
└── pyproject.toml           # uv Python dependencies (Polars, SQLAlchemy)

### Data Pipeline & OMOP Migration

The project utilizes a **Medallion Architecture** to handle high-fidelity clinical data benchmarking:

1.  **Bronze (Raw)**: Synthea generated CSV files (Patients, Encounters, etc.) stored in `data-pipeline/bronze/`. These are ignored by Git.
2.  **Silver (Structured)**: A transient PostgreSQL database where raw data is mapped to the **OMOP CDM v5.4** standard using `load_omop.py` and `Polars`. This layer enforces strict relational data models and standard vocabularies.
3.  **Gold (Curated)**: A portable SQL dump (`gold_omop_tenant.sql`) extracted from the Silver layer. This dump is mounted directly to the production database to allow instantaneous provisioning of tenant clinical data.

### Backend (Python - Legacy)

```
backend/
├── api/                 # API layer
│   └── v1/
│       ├── schemas/     # Pydantic request/response schemas
│       │   ├── __init__.py      # Re-exports all schemas
│       │   ├── auth.py          # Auth schemas (Token, User, UserCreate)
│       │   ├── query.py         # Query schemas (QueryRequest, QueryResponse, StreamEvent)
│       │   ├── thread.py        # Thread schemas (ThreadCreate, ThreadResponse, MessageResponse)
│       │   ├── health.py        # Health schemas (HealthResponse, ModelInfo)
│       │   └── token_usage.py   # Token usage schemas
│       ├── endpoints/   # Route handlers (auth, query, threads, token_usage)
│       │   ├── __init__.py
│       │   ├── auth.py           # Authentication endpoints
│       │   ├── queries.py        # Query endpoints
│       │   ├── threads.py        # Chat thread endpoints
│       │   └── token_usage.py    # Token usage API endpoints
│       └── dependencies.py  # Shared dependencies
├── app/                 # Application layer
│   ├── agents/          # LangGraph agent nodes
│   │   ├── router.py    # Intent routing agent
│   │   ├── schema_navigator.py  # Table selection agent
│   │   ├── sql_writer.py        # SQL generation agent
│   │   └── critic.py    # SQL validation agent
│   ├── services/        # Application services
│   ├── utils/           # Utilities
│   │   └── token_tracking.py  # Quota check helpers
│   ├── prompts/         # Agent system prompts
│   └── graph.py         # LangGraph workflow definition
├── services/            # Core business logic
│   ├── database.py      # PostgreSQL Medical Data database
│   ├── chat_history.py  # PostgreSQL chat storage
│   ├── auth_service.py  # JWT authentication
│   └── token_tracker.py # Token usage tracking & enforcement
├── domain/              # Domain models
│   ├── models.py        # SQLAlchemy models (PostgreSQL)
│   └── agent_state.py   # LangGraph state definitions
├── alembic/             # Database migrations (PostgreSQL)
│   └── versions/        # Migration scripts
├── tests/               # Test suite
│   ├── test_quota_enforcement.py
│   ├── test_langgraph_agent.py
│   └── conftest.py      # Pytest fixtures
├── config.py            # Pydantic Settings v2
├── main.py              # FastAPI app entry
└── pyproject.toml       # uv dependencies
```

**Architecture Layers:**

- **api/v1/schemas/** - Pydantic models for API validation & OpenAPI docs (organized by domain)
- **api/v1/endpoints/** - HTTP endpoint handlers for specific features (auth, queries, threads, token_usage)
- **app/agents/** - LangGraph agent nodes (LLM-powered decision points)
- **app/services/** - Agent-specific helpers (prompt building, token checks)
- **services/** - Core business logic (database, auth, tracking)
- **domain/** - Data models (SQLAlchemy ORM, state definitions)

**Schema Organization:**
All API schemas are under `api/v1/schemas/` and split by domain:

- `auth.py` - Authentication (Token, User, UserCreate)
- `query.py` - Queries & streaming (QueryRequest, QueryResponse, StreamEvent)
- `thread.py` - Chat threads (ThreadCreate, ThreadResponse, MessageResponse)
- `health.py` - System health (HealthResponse, ModelInfo)
- `token_usage.py` - Token usage & quotas

Import via: `from api.v1.schemas import Token, QueryRequest, TokenUsageResponse`

### Frontend

```
frontend/
├── src/
│   ├── components/       # React components
│   │   ├── Chat/         # Chat interface components
│   │   ├── Layout/       # Layout components (Sidebar, Header)
│   │   └── Usage/        # Token usage components
│   ├── pages/            # Page-level components
│   │   ├── ChatInterface.tsx
│   │   ├── UsageDashboard.tsx
│   │   └── AdminQuotaManagement.tsx
│   ├── services/         # API client services
│   │   ├── tokenUsageService.ts
│   │   └── api.ts
│   ├── utils/            # Utility functions
│   │   └── auth.ts       # JWT helpers
│   ├── hooks/            # Custom React hooks
│   ├── config/           # Configuration
│   └── App.tsx           # Root component
├── public/               # Static assets
├── package.json          # pnpm dependencies
└── vite.config.ts        # Vite configuration
```

### Documentation

```
docs/
├── README.md             # Main documentation index
├── guides/               # How-to guides
│   ├── GETTING_STARTED.md
│   ├── DEVELOPMENT.md
│   ├── TESTING_GUIDE.md
│   └── ...
├── context/              # Reference documentation
│   ├── ARCHITECTURE.md   # This file
│   ├── CONFIGURATION.md  # Settings & Pydantic
│   ├── SEMANTIC_RETRIEVAL.md # Retrieval architecture and optimization guidance
│   └── WORKFLOWS.md      # Documentation practices
├── designs/              # Architecture designs
│   ├── multi_agent_architecture.md
│   └── frontend_architecture.md
├── plans/                # Project planning
│   ├── active/           # Current work
│   ├── implemented/      # Completed plans
│   └── backlog/          # Future ideas
└── reports/              # Implementation reports
    ├── current/          # Active reports
    └── archive/          # Historical reports
```

---

## Design Patterns

### Backend: Settings Injection

Use dependency injection for configuration:

```typescript
import { Injectable } from "@nestjs/common";
import { ConfigService } from "./config.service";

@Injectable()
export class LLMService {
  constructor(private configService: ConfigService) {}

  getLlm() {
    if (this.configService.getUseBedrock()) {
      return new BedrockLLM({
        model: this.configService.getBedrockBaseModel(),
      });
    } else if (this.configService.getUseGemini()) {
      return new GeminiLLM({ apiKey: this.configService.getGeminiApiKey() });
    }
  }
}
```

### Frontend: Component Composition

Keep components focused and composable:

```tsx
// ✅ Good - Single responsibility
export const Button = ({ children, onClick }: ButtonProps) => (
  <button onClick={onClick}>{children}</button>
);

// ❌ Bad - Too many concerns
export const ButtonWithModalAndForm = () => { ... };
```

---

## Security Practices

### Backend

- **Never expose raw database errors** to API responses
- **Validate all inputs** with Pydantic schemas
- **Use parameterized queries** (SQLAlchemy handles this)
- **Hash passwords** with argon2 (never store plaintext)

### Frontend

- **Sanitize user input** before rendering (React does this automatically)
- **Use environment variables** for API URLs (`VITE_API_URL`)
- **Never commit** API keys to the repository

---

## Database Guidelines

### Migration Workflow (TypeScript)

1. Modify Drizzle schema in `backend/src/database/schema.ts`
2. Generate migration: `pnpm db:generate`
3. Apply migration to production: `pnpm db:migrate`
4. For local dev sync without migration files: `pnpm db:push` (⚠️ choose 'No' when prompted to delete unknown tables or truncate data to preserve cross-backend compatibility).

### Migration Workflow (Python - Legacy)

1. Modify SQLAlchemy models in `backend/domain/models.py`
2. Generate migration: `uv run alembic revision --autogenerate -m "description"`
3. Review generated migration in `backend/alembic/versions/`
4. Apply: `uv run alembic upgrade head`

### Schema Design

- **Read-Only Access**: Application has read-only access to production KPI tables
- **Immutable History**: Never delete historical records; use soft deletes
- **Explicit Indexes**: Add indexes for frequently queried columns

---

## AI Agent Architecture

### LangGraph Multi-Agent Workflow

The system uses a multi-agent workflow orchestrated by LangGraph. The **TypeScript implementation** (`backend/src/ai/`) is the active version.

**Agent Graph (TypeScript — `backend/src/ai/graph.ts`):**

```mermaid
graph TD
    Router -->|DOMAIN_KNOWLEDGE| MetaAgent[Meta-Agent]
    MetaAgent --> End1((END))

    Router -->|OFF_TOPIC| End2((END))

    Router -->|DATA| SchemaNavigator[Schema Navigator]
    SchemaNavigator --> SQLWriter[SQL Writer]
    SQLWriter --> Critic

    Critic -->|Valid| End3((END))
    Critic -->|Invalid < 3| Reflector
    Reflector -.->|Retry| SQLWriter
```

**Execution note:** SQL execution occurs in `queries.controller.ts` after graph completion when `validation_result.valid === true`.

**Mode note:** `fast_mode=true` skips Router LLM classification and caps retries to 1 attempt.

**Agents:**

1. **Router** (`router.ts`): Classifies intent — `DATA`, `DOMAIN_KNOWLEDGE`, or `OFF_TOPIC`
2. **Schema Navigator** (`schema-navigator.ts`): Selects relevant tables from available schema
3. **SQL Writer** (`sql-writer.ts`): Generates SQL from question + selected schema context
4. **Critic** (`critic.ts`): Performs DB syntax validation and semantic critique pass
5. **Reflector** (`reflector.ts`): Adds retry guidance on failures (reflexion loop)
6. **Meta-Agent** (`meta-agent.ts`): Answers domain/schema questions without SQL

**Current limitations (tracked for improvement):**

- Reflector can still encourage forced SQL generation for unsupported intents.
- Human-in-the-loop approval node is not currently implemented in the active graph.

**Shared State** (`state.ts` — `GraphState` interface):

- `original_query`, `messages`, `generated_sql`, `validation_result`
- `selected_provider?`, `selected_model_override?` — threaded from `POST /queries/stream` body through all nodes
- `thoughts[]`, `reflections[]`, `attempt_count`, `max_attempts`, `fast_mode?`

**Model Selection** (`llm.service.ts` + `config.service.ts`):

```typescript
// Priority: Bedrock > OpenAI > Gemini > Anthropic > Local
const provider = providerOverride || configService.getActiveProvider();
const model = configService.getActiveModelForRole(role, provider);
```

See **[CONFIGURATION.md](CONFIGURATION.md)** for provider env vars.

---

## API Endpoint Reference

All 20 endpoints are implemented in NestJS (`backend`). The Vite dev proxy routes all `/api/*` to port 8001.

| Method | Path                                        | Controller             | Auth            |
| ------ | ------------------------------------------- | ---------------------- | --------------- |
| GET    | `/api/v1/health`                            | `AppController`        | Public          |
| POST   | `/api/v1/auth/token`                        | `AuthController`       | Public          |
| POST   | `/api/v1/auth/register`                     | `AuthController`       | Public          |
| POST   | `/api/v1/auth/guest`                        | `AuthController`       | Public          |
| POST   | `/api/v1/auth/logout`                       | `AuthController`       | JWT             |
| GET    | `/api/v1/auth/me`                           | `AuthController`       | JWT             |
| GET    | `/api/v1/threads`                           | `ThreadsController`    | JWT             |
| POST   | `/api/v1/threads`                           | `ThreadsController`    | JWT             |
| GET    | `/api/v1/threads/:id/messages`              | `ThreadsController`    | JWT             |
| DELETE | `/api/v1/threads/:id`                       | `ThreadsController`    | JWT             |
| PATCH  | `/api/v1/threads/:id`                       | `ThreadsController`    | JWT             |
| POST   | `/api/v1/queries/query`                     | `QueriesController`    | JWT             |
| POST   | `/api/v1/queries/stream`                    | `QueriesController`    | JWT             |
| GET    | `/api/v1/config/models`                     | `ConfigController`     | JWT             |
| GET    | `/api/v1/token-usage`                       | `TokenUsageController` | JWT             |
| GET    | `/api/v1/token-usage/monthly`               | `TokenUsageController` | JWT             |
| GET    | `/api/v1/token-usage/monthly/breakdown`     | `TokenUsageController` | JWT             |
| GET    | `/api/v1/token-usage/status`                | `TokenUsageController` | JWT             |
| GET    | `/api/v1/token-usage/events`                | `TokenUsageController` | JWT (`?token=`) |
| GET    | `/api/v1/token-usage/admin/users`           | `TokenUsageController` | JWT + Admin     |
| PUT    | `/api/v1/token-usage/admin/users/:id/quota` | `TokenUsageController` | JWT + Admin     |

> **SSE note**: `GET /token-usage/events` accepts `?token=<jwt>` as a query parameter because browser `EventSource` cannot set request headers.

---

## Token Tracking & Quota System

### Architecture

The token tracking system monitors LLM API usage and enforces monthly quotas in the TypeScript backend:

**Components:**

1. **Token Usage Service** (`backend/src/token-usage/token-usage.service.ts`)
   - Pre-emptive quota checks before LLM calls
   - Post-call token logging with cost calculation
   - Monthly usage aggregation

2. **Database Layer** (`backend/src/database/schema.ts` + Drizzle migrations)
   - `token_usage` table: Records each LLM call
   - `users` table: Stores monthly token limits

3. **API Endpoints** (`backend/src/token-usage/token-usage.controller.ts`)
   - User endpoints: View usage, monthly breakdown
   - Admin endpoints: Manage quotas, view all users

4. **SSE Events Service** (`backend/src/token-usage/token-usage-events.service.ts`)

- Pushes token updates to connected clients
- Powers real-time usage indicators

5. **Frontend Integration** (`frontend/src/components/Usage/`)
   - Usage indicator in header (auto-refresh)
   - Usage dashboard with historical charts
   - Admin quota management interface

### Quota Enforcement Flow

```mermaid
graph TD
    UserReq[User Request] --> AgentNode[Agent Node<br>router/navigator/writer/critic/meta]
    AgentNode --> QuotaCheck{Pre-emptive Quota Check}
    QuotaCheck -->|Over Quota| RaiseEx[Raise QuotaExceededException]
    RaiseEx --> Return429(HTTP 429)
    QuotaCheck -->|Under Quota| LLM[LLM API Call]
    LLM --> LogToken[Log Tokens + Cost]
    LogToken --> ReturnRes(Return Result)
```

**Error Handling:**

- Non-streaming endpoints: HTTP 429 status code
- Streaming endpoints: Yield error event in SSE stream
- Frontend: Display user-friendly error message

See **[designs/frontend_architecture.md](../designs/frontend_architecture.md)** for detailed frontend architecture.
