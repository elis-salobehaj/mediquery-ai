# Mediquery AI - TypeScript Backend (NestJS)

Integration of the foundational data layer and token tracking services using NestJS and PostgreSQL/MySQL.

> Drizzle schema + migration ownership now lives in `packages/db` and is executed in Docker by the `migrator` service.

## Features

- **NestJS Framework**: Modular, scalable architecture.
- **Drizzle ORM**: Type-safe app-data schema and migrations via `packages/db`.
- **Multi-Database**:
  - PostgreSQL for token tracking and user metadata.
  - MySQL for KPI data and analytics.
- **Pino Logging**: Environment-aware logging (JSON in prod/test, Pretty in dev).
- **Dockerized**: Fully containerized environment for dev and E2E testing.

## Getting Started

### Prerequisites

- Node.js 22
- pnpm 10+
- Docker & Docker Compose

### Fast Track (Recommended)

Use the root-level scripts to run the whole stack or specific tests:

```bash
# Run full E2E suite (Playwright + NestJS Integration)
./run-e2e.sh
```

### Manual Development

```bash
# Install dependencies
pnpm install

# Start development mode
pnpm run start:dev
```

## Testing

### Unit & Component Tests

```bash
# Unit tests
pnpm test

# Coverage
pnpm run test:cov
```

### E2E / Integration Tests

Integration tests run against a real database environment. It is recommended to use the Dockerized environment for isolation:

```bash
# From project root
./run-e2e.sh
```

To run manually inside `backend` (Requires local DBs):

```bash
$ pnpm run test:e2e
```

## Infrastructure

- `backend.Dockerfile`: Multi-stage build (builder, test, runner).
- `docker-compose.test.yml`: Defines the isolated testing stack (`test-backend`, `test-db`, `test-postgres`).

## License

MIT
