# Mediquery AI — OMOP Healthcare Analytics

An intelligent Text-to-SQL platform for medical KPI analysis using natural language. Built on OMOP CDM v5.4 with a NestJS TypeScript backend, LangGraph multi-agent orchestration, and PostgreSQL.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-24+-green.svg)
![TypeScript](https://img.shields.io/badge/typescript-5.x-blue.svg)
![Docker](https://img.shields.io/badge/docker-ready-blue.svg)

## 🚀 Quick Start (Docker - Recommended)

**The fastest way to get started:**

```bash
# Linux/Mac
chmod +x docker-start.sh
./docker-start.sh

# Windows
.\docker-start.ps1
```

This will:

- ✅ Start Ollama (local LLM - qwen2.5-coder:7b)
- ✅ Start NestJS backend (port 8001)
- ✅ Start React frontend with Nginx (port 3000)
- ✅ Load OMOP v5.4 Golden Dataset
- ✅ Pull the AI model (~2GB)
- ✅ Open at http://localhost:3000

**Requirements:** Docker Desktop ([Download](https://www.docker.com/products/docker-desktop))

**See full Docker guide:** [DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md)

---

## 📋 Table of Contents

- [Features](#features)
- [Visual Insights](#-visual-insights)
- [Tech Stack](#tech-stack)
- [Quick Start (Docker)](#-quick-start-docker---recommended)
- [Manual Installation](#manual-installation)
  - [Ubuntu/Linux](#ubuntulinux)
  - [Windows](#windows)
- [Configuration](#configuration)
- [Usage](#usage)
- [Docker Deployment](#docker-deployment)
- [Local Model Setup](#local-model-setup-ollama)
- [Project Structure](#project-structure)
- [Supported Visualizations](#supported-visualizations)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Security](#security)

---

## Features

### Core Capabilities

- 🤖 **Natural Language Queries**: Ask questions in plain English about healthcare data
- 🎨 **Premium OKLCH Interface**: Cyberpunk-inspired design with hardware-accelerated color spaces and glassmorphism.
- 🌓 **Dynamic Theme Engine**: Support for **Light**, **Dark**, **Clinical Slate**, and **System** themes.
- 📊 **Theme-Aware Visualizations**: 60+ Plotly.js charts that blend seamlessly with the chosen UI theme.
- 🧠 **Explainable AI**: View the agent's step-by-step thinking process and SQL generation logic.
- 🔐 **Authentication & Security**: Sci-Fi themed Login/Register, JWT protection, and GitHub Secrets integration.
- 💬 **Persistent User Preferences**: Chat history, UI toggles (Fast/Multi-Agent), and Theme selection persist across sessions.
- 🎯 **Hybrid LLM Support**: Local models (Ollama) or Cloud (Google Bedrock/Gemini).
- 🐳 **Docker Ready**: One-command deployment with Docker Compose
- 🧩 **Smart Schema Inference**: Auto-detects demographics vs. illness queries to optimize SQL joins (e.g. searching both 'chronic_conditions' and 'diagnosis' for ambiguous medical terms)

### Phase 1 Features (NEW) 🆕

- 📥 **CSV Export**: Download query results with proper formatting, handles special characters (commas, quotes, newlines)
- 🔄 **SQL Reflexion Loop**: Self-correcting SQL generation with up to 3 retry attempts and error analysis
- ⚡ **Fast/Thinking Toggle**: Choose between fast responses (3-5s) or detailed reasoning (8-12s)
- 🏢 **Multi-Tenant Ready**: User isolation infrastructure prepared for organization-level caching
- 🛡️ **Robust Validation**: Handles trailing semicolons, validates row counts, warns on edge cases
- 📈 **Query Planning**: Natural language execution plans generated before SQL (in Thinking Mode)
- 🔍 **Self-Reflection**: AI analyzes failed queries and suggests corrections automatically

### Multi-Agent System (Latest) 🌟

- 🤖 **LangGraph Workflow**: Specialized agents for complex queries (50+ tables)
- 🧭 **Schema Navigator**: Intelligently selects relevant tables using semantic search
- ✍️ **SQL Writer**: Generates optimized SQL with context-aware query planning
- 🔬 **Critic Agent**: Cross-model validation for higher accuracy (different LLM perspective)
- 🔁 **Reflection Loop**: Automatic error analysis and SQL refinement
- 🎛️ **User Toggle**: Switch between single-agent (fast) and multi-agent (thorough) modes
- 🏠 **Local-First**: Defaults to Ollama models (qwen2.5-coder, sqlcoder, llama3.1)

## 🧪 Testing

We provide comprehensive test coverage for all features including Phase 1 functionality:

### Quick Test Commands

```bash
# Run all backend unit tests
cd backend && pnpm test

# Run backend E2E tests
cd backend && pnpm test:e2e

# Run backend tests in watch mode
cd backend && pnpm test:watch

# CI Tests (Fast - Unit & Component)
./run-ci.sh       # Linux/Mac
.\run-ci.ps1      # Windows

# E2E Tests (Full Stack Integration)
./run-e2e.sh      # Linux/Mac
.\run-e2e.ps1     # Windows

# Run OMOP accuracy benchmarks
cd backend && pnpm benchmark:dev
```

### Test Coverage

**Backend Unit Tests** (Vitest):

- ✅ Multi-Agent LangGraph — workflow, state management, agent coordination
- ✅ Authentication — JWT, login, authorization
- ✅ Configuration — Zod-validated config service
- ✅ Benchmark Guardrails — policy gate, SQL safety
- ✅ Memory Context — OMOP-aware clinical intent extraction
- ✅ Database — PostgreSQL connectivity and operations (testcontainers)

**Frontend Component Tests** (10 total):

- ✅ ChatBox, Configuration, Login, PlotlyVisualizer components
- ✅ API integration mocks and rendering tests (Playwright)

**E2E Tests** (2 total):

- ✅ Full stack health and authentication flows
- ✅ Guest login, configuration, chat history (Playwright)

See [TESTING_GUIDE.md](TESTING_GUIDE.md) for detailed scenarios.

## ✨ Visual Insights

### Light Theme

|                               Choropleth Map                               |                           Pie Chart                            |                           Bar Chart                            |
| :------------------------------------------------------------------------: | :------------------------------------------------------------: | :------------------------------------------------------------: |
| ![Choropleth Map - Light](docs/images/visualizations/choropleth_light.png) | ![Pie Chart - Light](docs/images/visualizations/pie_light.png) | ![Bar Chart - Light](docs/images/visualizations/bar_light.png) |
|                           _Average age by state_                           |                     _Gender distribution_                      |                    _Patient count by state_                    |

### Dark Theme

|                              Choropleth Map                              |                          Pie Chart                           |                          Bar Chart                           |
| :----------------------------------------------------------------------: | :----------------------------------------------------------: | :----------------------------------------------------------: |
| ![Choropleth Map - Dark](docs/images/visualizations/choropleth_dark.png) | ![Pie Chart - Dark](docs/images/visualizations/pie_dark.png) | ![Bar Chart - Dark](docs/images/visualizations/bar_dark.png) |
|                          _Average age by state_                          |                    _Gender distribution_                     |                   _Patient count by state_                   |

### Clinical Slate Theme

|                                        Choropleth Map                                        |                                    Pie Chart                                     |                                    Bar Chart                                     |
| :------------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------: | :------------------------------------------------------------------------------: |
| ![Choropleth Map - Clinical Slate](docs/images/visualizations/choropleth_clinical_slate.png) | ![Pie Chart - Clinical Slate](docs/images/visualizations/pie_clinical_slate.png) | ![Bar Chart - Clinical Slate](docs/images/visualizations/bar_clinical_slate.png) |
|                                    _Average age by state_                                    |                              _Gender distribution_                               |                             _Patient count by state_                             |

## Tech Stack

### Frontend

- **React 19** with TypeScript
- **Vite** for blazing-fast development
- **OKLCH Design System** for vibrant, hardware-accelerated colors and gradients
- **Plotly.js** with **useChartColors** hook for dynamic, theme-aware visualizations
- **Tailwind CSS** with CSS Variables for semantic theming
- **Nginx** for production serving

### Backend

- **NestJS** (TypeScript) for REST API + SSE streaming
- **PostgreSQL 18.1** — App data (Drizzle ORM) + OMOP CDM v5.4 tenant clinical data
- **LangGraph** multi-agent orchestration (Router → Navigator → SQL Writer → Critic → Reflector)
- **Google Gemini AI** or **Ollama** (local) for natural language processing
- **Zod** for config validation

### Infrastructure

- **Docker & Docker Compose** for containerization
- **Ollama** for local LLM inference (qwen2.5-coder:7b)

---

## Docker Deployment

### Quick Start

```bash
# Copy environment file
cp .env.example .env

# Start all services
docker compose up -d

# Access the application
# Frontend: http://localhost:3000
# Backend:  http://localhost:8001
# API Docs: http://localhost:8001/api
```

### Services

| Service          | Port  | Description                     |
| ---------------- | ----- | ------------------------------- |
| **Frontend**     | 3000  | React 19 + Vite + Nginx         |
| **Backend**      | 8001  | NestJS TypeScript API           |
| **PostgreSQL**   | 5432  | App data + OMOP v5.4 tenant     |
| **Ollama**       | 11434 | Local LLM (qwen2.5-coder:7b)   |

**Full Docker guide:** [DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md)

---

## Configuration

### Environment Variables

Edit root `.env` (shared by all services):

```bash
# Google Gemini API Key (optional if using local model)
GEMINI_API_KEY=your_api_key_here

# Anthropic API Key (optional if using local model)
ANTHROPIC_API_KEY=your_api_key_here

# Local Model Configuration (Ollama)
USE_LOCAL_MODEL=true              # true = local, false = cloud
LOCAL_MODEL_NAME=qwen2.5-coder:7b       # Ollama model
OLLAMA_HOST=http://localhost:11434

# Database
DATABASE_URL=postgresql://mediquery:mediquery@localhost:5432/mediquery
```

### Available Models

**Local (Ollama) - Default:**

- `qwen2.5-coder:7b` (Schema Navigator - SOTA for SQL/Code)
- `sqlcoder:7b` (SQL Writer - Specialized for SQL generation)
- `llama3.1` (Critic Agent - General purpose reasoning)
- `qwen3:latest` (Alternative - Balanced performance)

**Cloud Models (Fallback):**

- `gemini-1.5-flash` (Fast / Efficient - Google)
- `claude-3-5-sonnet` (Anthropic - requires `ANTHROPIC_API_KEY`)
- `gemma-3-27b-it` (High Quota)

**Multi-Agent Configuration:**

```bash
# Configure agents individually (optional)
SCHEMA_NAVIGATOR_MODEL=qwen2.5-coder:7b
SQL_WRITER_MODEL=sqlcoder:7b
CRITIC_MODEL=llama3.1
```

---

## Usage

### Example Queries

**Demographics:**

- "Show the distribution of patients by gender"
- "What is the age distribution of our patient population?"
- "Break down patients by ethnicity"

**Conditions & Diagnoses:**

- "What are the top 5 most common diagnoses?"
- "Which conditions are most prevalent in patients over 60?"
- "How many patients have both diabetes and hypertension?"

**Medications:**

- "What are the most frequently prescribed medications?"
- "Show drug exposure duration by medication class"

**Visits & Procedures:**

- "What is the average duration of inpatient visits?"
- "Distribution of visit types (inpatient vs outpatient vs ER)"
- "List all procedures performed during emergency visits"

**Measurements & Labs:**

- "Show the latest blood pressure for each patient" → uses window functions
- "What percentage of patients have abnormal BMI values?"

### Phase 1 Features Usage 🆕

**Fast/Thinking Toggle:**

- Located bottom-right above the input box
- **⚡ FAST**: Skip query planning for faster responses (~3-5s)
- **🧠 THINKING**: Generate detailed query plans for transparency (~8-12s)
- Persists across page refreshes via localStorage

**Multi-Agent Toggle:**

- Located next to Fast/Thinking toggle
- **🤖 SINGLE_AGENT**: Fast single-LLM approach for simple queries
- **🤖 MULTI_AGENT**: Specialized agents for complex schemas (50+ tables)
- Uses Schema Navigator → SQL Writer → Critic workflow
- Automatic error reflection and retry logic

**CSV Export:**

- Appears above visualizations when data is returned
- Click **EXPORT CSV** button to download results
- Filename format: `mediquery-export-YYYY-MM-DD-HHmmss.csv`
- Properly handles special characters (commas, quotes, newlines)

**Query Reflection (Automatic):**

- Failed SQL queries automatically trigger retry mechanism
- Up to 3 attempts with AI-powered error analysis
- View reflections and attempts in response metadata
- Check "thoughts" section for detailed debugging info

**Example Session:**

```
1. Toggle Fast ON (⚡) and Single-Agent
2. Ask: "What are the top 5 most common diagnoses?"
3. Wait ~3s for fast response
4. Click "EXPORT CSV" to download
5. Toggle to Thinking (🧠) and Multi-Agent (🤖)
6. Ask: "Show patients with both diabetes and hypertension on medications"
7. See detailed agent thoughts: Schema Navigator → SQL Writer → Critic
8. Wait ~15s for thorough multi-agent response with validation
```

### Interactive Features

- **Chart Type Switching**: Click any compatible visualization type above the chart
- **Zoom & Pan**: Use Plotly's built-in controls
- **Download**: Export charts as PNG images or CSV data
- **Chat History**: Conversations persist across sessions (24-hour default)
- **Fast/Thorough Toggle**: Control query generation speed vs detail

---

## Local Model Setup (Ollama)

### Option 1: Docker (Included)

Ollama is automatically included in the Docker setup - no separate installation needed!

### Option 2: System Installation

**Windows:**

```powershell
winget install Ollama.Ollama
ollama pull qwen2.5-coder:7b
```

**Ubuntu/Linux:**

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5-coder:7b
```

**Configure:**

```bash
# In root .env
USE_LOCAL_MODEL=true
LOCAL_MODEL_NAME=qwen2.5-coder:7b
```

**Full guide:** [backend/docs/LOCAL_MODEL_SETUP.md](backend/docs/LOCAL_MODEL_SETUP.md)

---

## Project Structure

```
mediquery-ai/
├── backend/                     # NestJS TypeScript Backend (Active — port 8001)
│   ├── src/
│   │   ├── ai/
│   │   │   ├── agents/          # LangGraph Agent Nodes
│   │   │   │   ├── router-agent.ts
│   │   │   │   ├── schema-navigator-agent.ts
│   │   │   │   ├── sql-writer-agent.ts
│   │   │   │   ├── critic-agent.ts
│   │   │   │   ├── reflector-agent.ts
│   │   │   │   └── meta-agent.ts
│   │   │   ├── benchmarks/      # Golden query corpus & dev harness
│   │   │   ├── prompts/         # System prompts & semantic view
│   │   │   ├── graph.ts         # LangGraph StateGraph wiring
│   │   │   └── ...              # Services (LLM, Insight, Visualization)
│   │   ├── auth/                # JWT Authentication
│   │   ├── config/              # Zod-validated ConfigService
│   │   ├── database/            # PostgreSQL (App Data + OMOP Tenant)
│   │   ├── threads/             # Chat thread & memory management
│   │   └── token-usage/         # LLM quota tracking & SSE
│   ├── test/                    # Vitest unit + E2E tests
│   └── package.json
│
├── data-pipeline/               # OMOP v5.4 Synthea ETL (Python + Polars)
│   ├── bronze/                  # Raw Synthea CSVs (gitignored)
│   ├── alembic/                 # OMOP schema migrations
│   ├── load_omop.py             # Polars-driven ETL: Bronze → Silver → Gold
│   ├── gold_omop_tenant.sql     # Deployable Gold SQL dump (~64 MB)
│   └── docker-compose.yml       # Transient PostgreSQL for ETL processing
│
├── frontend/                    # React 19 + Vite + Tailwind CSS v4
│   ├── src/
│   │   ├── components/          # Chat, Layout, Usage, Settings
│   │   ├── pages/               # ChatInterface, UsageDashboard
│   │   └── App.tsx
│   └── tests/                   # Playwright E2E tests
│
├── packages/db/                 # Drizzle ORM (App Data schema + migrations)
├── docker-compose.yml           # Production stack (PostgreSQL, Ollama, Backend, Frontend)
├── .env                         # Centralized environment configuration
├── AGENTS.md                    # Agent operating manual
└── docs/                        # Architecture, designs, plans, guides, reports
```

---

## Supported Visualizations

The system intelligently selects from **60+ Plotly.js chart types**:

| Category         | Chart Types                              |
| ---------------- | ---------------------------------------- |
| **Basic**        | Bar, Pie, Donut, Line, Scatter, Area     |
| **Statistical**  | Box, Violin, Histogram, Heatmap, Contour |
| **Financial**    | Waterfall, Funnel, Candlestick, OHLC     |
| **3D**           | Scatter3D, Surface, Mesh3D               |
| **Maps**         | Choropleth, ScatterGeo, Mapbox           |
| **Hierarchical** | Sunburst, Treemap, Icicle, Sankey        |
| **Specialized**  | Indicator, Gauge, Parcoords, SPLOM       |

**Interactive chart switching** - Click any compatible type to switch views!

---

## Troubleshooting

### Docker Issues

**Ollama model not found:**

```bash
docker exec -it mediquery-ai-ollama ollama pull qwen2.5-coder:7b
```

**Backend can't connect to Ollama:**

```bash
docker compose restart ollama
docker compose restart backend
```

**Port already in use:**
Edit `docker-compose.yml` and change ports (then run `docker compose up -d`):

```yaml
ports:
  - "3001:80" # Frontend
  - "8001:8000" # Backend
```

### Manual Installation Issues

**Vite Cache Issues:**

```bash
cd frontend
rm -rf node_modules/.vite
pnpm run dev
```

**API Key Not Working:**

1. Verify key at https://makersuite.google.com/app/apikey
2. Ensure `.env` is in `backend/` directory
3. Restart backend server

**Chat Thread Not Persisting:**
Ensure PostgreSQL is running and the app-data migrations have been applied (`cd packages/db && pnpm migrate`).

---

## Development

### Adding New Datasets

1. Run Synthea to generate new cohort CSV files in `data-pipeline/bronze/`
2. Execute the OMOP mapping script (`data-pipeline/load_omop.py`)
3. Restart database container to load the new `gold_omop_tenant.sql` volume

### Customizing Visualizations

Edit `frontend/src/components/PlotlyVisualizer.tsx`:

- Add new chart types
- Modify color schemes
- Adjust layout configurations

### Hot Reload

- **Backend**: Auto-reloads on code changes (`pnpm run start:dev` uses NestJS watch mode)
- **Frontend**: Auto-reloads on code changes (Vite HMR)
- **Docker**: Backend volume-mounted for hot reload

---

## 📈 Performance

| Metric                   | Target  | Actual    |
| ------------------------ | ------- | --------- |
| **Query Response Time**  | < 3s    | ✅ 1-3s   |
| **Backend Health Check** | < 100ms | ✅ ~50ms  |
| **Frontend Load Time**   | < 2s    | ✅ ~1s    |
| **Chart Render Time**    | < 500ms | ✅ ~300ms |
| **Concurrent Users**     | 10+     | ✅ Tested |

---

## Security Notes

⚠️ **This is a Demo Application**

For production use:

- Implement proper authentication
- Use environment-specific CORS settings
- Add rate limiting
- Sanitize all SQL inputs (currently using parameterized queries)
- Use a production database (PostgreSQL)
- Implement HTTPS
- Secure Ollama endpoint
- Use Docker secrets for sensitive data
- **JWT_SECRET_KEY**: Ensure this is set to a strong random string in production (used for signing tokens)

---

## License

MIT License - See LICENSE file for details

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## Acknowledgments

- **Google Gemini AI** for natural language processing
- **Ollama** for local LLM inference
- **Plotly.js** for interactive visualizations
- **NestJS** for the excellent TypeScript backend framework
- **LangGraph** for multi-agent orchestration
- **OMOP CDM v5.4** (OHDSI) for standardized clinical data modeling
- **React** and **Vite** for the frontend stack

---

## Support

For issues and questions:

- Open an issue on GitHub
- Check [DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md) for Docker help
- Check [LOCAL_MODEL_SETUP.md](backend/docs/LOCAL_MODEL_SETUP.md) for Ollama help

---

**Built with ❤️ using AI-assisted development**
