# Mediquery AI — OMOP Healthcare Analytics

> Text-to-SQL platform for medical data analysis using natural language, built on OMOP CDM v5.4.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-24.13.1-green.svg)
![TypeScript](https://img.shields.io/badge/typescript-5.x-blue.svg)
![Docker](https://img.shields.io/badge/docker-ready-blue.svg)

---

## Quick Start

```bash
# Copy and configure the environment file
cp .env.example .env   # then edit — set AWS/Gemini credentials and DB passwords

# Start everything (PostgreSQL + Backend + Frontend)
docker compose up -d
```

App available at **http://localhost:3000** · API at **http://localhost:8001**

For first-time local (hybrid) setup see [docs/guides/GETTING_STARTED.md](docs/guides/GETTING_STARTED.md).

---

## Features

- 🤖 **Natural language → SQL** over OMOP CDM v5.4 clinical data
- 🧠 **Multi-agent query pipeline** — Router → Navigator → SQL Writer → Critic with automatic reflection and retry
- ⚡ **Fast / Multi-agent toggle** — single fast response or thorough multi-step reasoning
- 💬 **Persistent threads** — chat history and memory across sessions
- 📊 **60+ chart types** — Plotly.js visualizations, theme-aware (Light / Dark / Clinical Slate)
- 📥 **CSV export** — download any query result
- 🔐 **JWT auth** — login, registration, per-user isolation
- 🎯 **Multi-provider LLM** — AWS Bedrock, Gemini, Anthropic, OpenAI, Ollama (local)
- 🐳 **Docker-first** — one-command deployment, Gold OMOP dataset loaded automatically

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19 + Vite + TypeScript + Tailwind CSS v4 + Plotly.js |
| **Backend** | NestJS (TypeScript) + LangGraph multi-agent + SSE streaming |
| **Database** | PostgreSQL 18.3 — app data (Drizzle ORM) + OMOP CDM v5.4 tenant |
| **AI** | AWS Bedrock / Google Gemini / OpenAI / Anthropic / Ollama |
| **Data Pipeline** | Python + Polars + Alembic — Synthea → OMOP Bronze→Silver→Gold ETL |
| **Infrastructure** | Docker Compose, Nginx |

---

## Configuration

All configuration lives in the root `.env` file. See [docs/humans/context/CONFIGURATION.md](docs/humans/context/CONFIGURATION.md) for the full reference.

### LLM Provider

Select one provider via environment flags (Bedrock recommended for production):

```bash
# AWS Bedrock — Claude Sonnet 4.6 (recommended)
USE_BEDROCK=true
AWS_BEARER_TOKEN_BEDROCK=your_token
AWS_BEDROCK_REGION=us-west-2

# — OR — Google Gemini
USE_GEMINI=true
GEMINI_API_KEY=your_key

# — OR — Anthropic (direct)
USE_ANTHROPIC=true
ANTHROPIC_API_KEY=your_key

# — OR — Ollama (local, no API key needed)
USE_LOCAL_MODEL=true
OLLAMA_HOST=http://localhost:11434
```

> If no provider flag is set, the backend defaults to Gemini.

### Multi-Agent Defaults

```bash
MULTI_AGENT=true     # enable multi-agent pipeline by default
FAST_MODE=false      # false = standard mode; true = skip navigator for speed
```

---

## Example Queries

```
"What are the top 10 most common diagnoses?"
"Show patient count by visit type over the last 12 months"
"What percentage of patients are female vs male?"
"Which medications are most frequently prescribed?"
"Average age of patients with diabetes by race"
"Distribution of emergency vs outpatient vs inpatient visits"
```

---

## Testing

```bash
# Data pipeline unit tests (no DB required, ~0.3s)
cd data-pipeline && uv sync --extra dev && uv run pytest tests/ -v

# Backend unit tests (Vitest)
cd backend && pnpm install && pnpm test

# CI smoke tests (Docker)
./run-ci.sh          # Linux/Mac
.\run-ci.ps1         # Windows
```

### Local Docker Parity Gate

Run all major Docker parity flows sequentially (pipeline full run + pipeline unit tests, frontend component tests, E2E, backend unit tests):

```bash
./run-docker-parity-gate.sh
```

The script reads configuration from the root `.env` file and uses fallback defaults only when variables are missing.

Full test guide: [docs/guides/TESTING_GUIDE.md](docs/guides/TESTING_GUIDE.md)

---

## Project Structure

```
mediquery-ai/
├── backend/          # NestJS API — agents, auth, config, DB, threads
├── frontend/         # React 19 + Vite — chat UI, visualizations
├── data-pipeline/    # Python ETL — Synthea → OMOP Bronze→Silver→Gold
├── packages/db/      # Drizzle ORM — app schema + migrations
├── docs/             # Architecture, guides, plans, designs
└── infra/            # PostgreSQL init scripts
```

Full architecture: [docs/humans/context/ARCHITECTURE.md](docs/humans/context/ARCHITECTURE.md)
Development workflow: [docs/guides/DEVELOPMENT.md](docs/guides/DEVELOPMENT.md)

---

## Data Pipeline

The OMOP data pipeline is fully automated — one command generates synthetic clinical data and exports a Gold SQL dump:

```bash
cd data-pipeline
uv sync
uv run pipeline-full   # Bronze → Silver → QA gates → Gold; auto-starts and stops DB
```

The pipeline starts and stops the transient PostgreSQL container automatically. The Gold artifact (`gold_omop_tenant.sql.gz`) is loaded into the app DB on Docker Compose startup.

See [data-pipeline/README.md](data-pipeline/README.md) for the full data pipeline guide.

---

## Docker Services

| Service | Port | Description |
|---|---|---|
| **frontend** | 3000 | React + Nginx production build |
| **backend** | 8001 | NestJS API + LangGraph agents |
| **postgres** | 5432 | App data + OMOP CDM v5.4 tenant |

```bash
# Start all services
docker compose up -d

# Rebuild after code changes
docker compose up -d --build

# View logs
docker compose logs -f backend
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Tables missing after startup | `cd packages/db && pnpm db:migrate` |
| Backend can't connect to DB | Verify `POSTGRES_HOST=localhost` in `.env` for hybrid mode |
| No AI responses | Check `USE_BEDROCK` / `USE_GEMINI` flag and corresponding credentials in `.env` |
| Frontend API errors | Ensure backend is running on port 8001 |
| OMOP data missing | Re-run `cd data-pipeline && uv run pipeline-full`, then restart postgres volume |

Full troubleshooting: [docs/guides/DEVELOPMENT.md](docs/guides/DEVELOPMENT.md#troubleshooting)

---

## License

MIT — see [LICENSE](LICENSE)


