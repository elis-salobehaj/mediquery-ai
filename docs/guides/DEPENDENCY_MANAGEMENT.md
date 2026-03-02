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

## Data Pipeline (Python / uv)

The `data-pipeline/` OMOP ETL project uses **uv** for Python dependency management. Dependencies are defined in `data-pipeline/pyproject.toml`.

### Commands

```bash
# Install all dependencies
cd data-pipeline
uv sync

# Add a runtime dependency
uv add polars

# Add a development dependency
uv add --group dev pytest

# Update lockfile
uv lock --upgrade && uv sync
```
