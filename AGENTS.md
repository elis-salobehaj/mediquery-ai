# Mediquery: Agent Operating Manual

## 🎯 Mission

Text-to-SQL platform for medical KPI analysis using natural language.

## ⚙️ Stack Essentials

- **Node Engine**: 24.13.1 (managed via `nvm` / `.nvmrc`)
- **Package Managers**: `pnpm` (Frontend + TS Backend), `uv` (Data Pipeline)
- **Database**: PostgreSQL 18.1 (App Data via Drizzle + OMOP v5.4 Tenant Clinical Data) (Docker)
- **Data Standard**: OMOP CDM v5.4 (Standardized Medical Domain Model)

## 🚨 Critical Rules

1. **Backend & Pipeline setup**:
   - **TypeScript Backend**: Run `cd backend && pnpm install` to install dependencies.
   - **Database Package (Drizzle)**: Run `cd packages/db && pnpm install` for schema + migration tooling.
   - **Python (Data Pipeline)**: Run `cd data-pipeline && uv sync` to use the Polars + Alembic OMOP ETL pipeline. The transient DB for this is managed via `docker compose up -d` in `data-pipeline/`. This pipeline transforms Medallion Bronze (Synthea CSVs) -> Silver (OMOP PostgreSQL) -> Gold (SQL Dumps).
   - **Clinical Standard**: All clinical analysis must adhere to OMOP CDM v5.4. Agents must join fact tables (e.g., `condition_occurrence`) with `omop_vocab.concept` to resolve human-readable names.
2. **Node Version & Package Manager**:
   - Always check `.nvmrc` and run `nvm use` before starting work.
   - Run `corepack enable && corepack use pnpm@latest` to ensure the correct package manager version is active.
   - ALWAYS use `pnpm` for Node.js scripts and package executions. Never use `npm` or `npx`.
   - Use `pnpm <script>` for package.json scripts.
   - Use `pnpm exec <bin>` to run binaries from local node_modules.
   - Use `pnpm dlx <package>` for one-off remote executions (equivalent to npx).
3. **Always use configuration abstractions**: Use the centralized `ConfigService` in NestJS (backed by Zod validation). Never use `process.env` directly in business logic. For the data-pipeline, import from `data-pipeline/config.py`.
4. **Never edit DB schema manually**: Use Drizzle ORM (TS) or SQLAlchemy + Alembic (Python). For TypeScript, treat `packages/db` as the source of truth for app-data schema and migrations.
5. **Never commit real data**: Sanitize `init.sql` dumps.
6. **Agent file naming convention**: All LangGraph agent node files must live under `backend/src/ai/agents/` and use the `*-agent.ts` suffix (e.g., `router-agent.ts`, `sql-writer-agent.ts`).
7. **Benchmark queries must target OMOP Golden Dataset**: All entries in `backend/src/ai/benchmarks/corpus/omop_golden_queries.jsonl` must reference OMOP v5.4 tables (`person`, `condition_occurrence`, `drug_exposure`, `measurement`, `visit_occurrence`, `omop_vocab.concept`, etc.).
8. **Update Plans**: Check off tasks in `docs/plans/active/*.md` as you complete them.
9. **Update Index**: Update `docs/README.md` when plans change status.

## 📖 Guides

- **Getting Started**: [`docs/guides/GETTING_STARTED.md`](docs/guides/GETTING_STARTED.md) ← Setup for new developers
- **Development**: [`docs/guides/DEVELOPMENT.md`](docs/guides/DEVELOPMENT.md) ← Running, debugging, commands
- **Architecture**: [`docs/agents/context/ARCHITECTURE.md`](docs/agents/context/ARCHITECTURE.md) ← Stack, patterns, conventions (agent track)
- **Configuration**: [`docs/agents/context/CONFIGURATION.md`](docs/agents/context/CONFIGURATION.md) ← Settings & Zod (READ THIS!)
- **Testing**: [`docs/guides/TESTING_GUIDE.md`](docs/guides/TESTING_GUIDE.md)
- **Workflows**: [`docs/agents/context/WORKFLOWS.md`](docs/agents/context/WORKFLOWS.md) ← Documentation practices

## 🧭 Documentation Sub-Structure

- **Agent docs (authoritative, concise)**:
  - `docs/agents/README.md`
   - `docs/agents/context/*`
   - `docs/agents/designs/*`
- **Human docs (expanded onboarding and rationale)**:
  - `docs/humans/README.md`
   - `docs/humans/context/*`
   - `docs/humans/designs/*`

Agents should default to `docs/agents/*` to avoid context bloat. Human contributors should use `docs/humans/*` for full narrative guidance.

## 🗺️ Active Work

Always check [`docs/README.md`](docs/README.md) for current plans and priorities.
