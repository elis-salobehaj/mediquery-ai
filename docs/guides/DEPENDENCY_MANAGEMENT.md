# Dependency Management

## Active Stack (TypeScript / Node.js)

We use **pnpm** for both `frontend` and `backend`. Dependencies for each are defined in their respective `package.json` files and locked via `pnpm-lock.yaml`.

### Commands

```bash
# Install all dependencies (Backend)
cd backend
pnpm install

# Run Dev Server (Backend)
pnpm run start:dev

# Add a package (Backend)
pnpm add <pkg_name>
pnpm add -D <pkg_name> # dev dependency
```

---

## Legacy Python Stack (backend-py-legacy)

We used **uv** for fast, reliable package management for the older Python codebase. Dependencies were defined in `backend-py-legacy/pyproject.toml` and locked in `backend-py-legacy/uv.lock`.

## Structure (`pyproject.toml` - Legacy)

### 1. Core Dependencies

**Section**: `[project.dependencies]`

- Essential runtime libraries (FastAPI, SQLAlchemy, LangChain, etc.).
- Installed in all build modes.

### 2. Development Dependencies

**Section**: `[dependency-groups.dev]`

- Tools for testing and debugging (pytest, ruff, debugpy, mypy).
- Excluded in production builds.

### 3. Local ML Dependencies

**Section**: `[project.optional-dependencies] -> local`

- Heavy ML libraries for local model execution (Ollama, LlamaIndex, Torch).
- Only installed when explicitly requested.

---

## Usage Commands (Legacy UV)

### Install Dependencies

```bash
cd backend-py-legacy

# Standard (Runtime + Dev) - Default for development
uv sync

# Local ML Mode (Runtime + Dev + Local Extras)
uv sync --extra local

# Production (Runtime only, no Dev tools)
uv sync --no-dev
```

### Add Packages

```bash
# Add core dependency
uv add pandas

# Add development dependency
uv add --group dev black

# Add to local ML extra
uv add --extra local torch
```

---

## Docker Build Modes

The legacy `backend-py-legacy/Dockerfile` supports three build modes via the `BUILD_MODE` argument.

| Mode            | Description  | uv Command              | Use Case                   |
| --------------- | ------------ | ----------------------- | -------------------------- |
| **development** | core + dev   | `uv sync`               | Local Dev, CI, E2E Tests   |
| **production**  | core only    | `uv sync --no-dev`      | Cloud Deployment (ECS/K8s) |
| **local**       | core + local | `uv sync --extra local` | Local AI/ML Workflows      |

### Usage in Docker Compose

Set the `DOCKER_BUILD_MODE` environment variable in `.env`:

```bash
# Default (Development)
DOCKER_BUILD_MODE=development

# Production (Lightweight)
DOCKER_BUILD_MODE=production

# Local ML (Heavy)
DOCKER_BUILD_MODE=local
```
