#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIPELINE_DIR="$ROOT_DIR/data-pipeline"

log() {
  printf '\n[%s] %s\n' "$(date +'%H:%M:%S')" "$*"
}

cleanup() {
  log "Cleaning up Docker stacks..."
  (cd "$ROOT_DIR" && docker compose -f docker-compose.test.yml --profile ci --profile e2e down -v --remove-orphans >/dev/null 2>&1 || true)
  (cd "$PIPELINE_DIR" && docker compose -f docker-compose.yml down -v --remove-orphans >/dev/null 2>&1 || true)
  docker rm -f mediquery-test-frontend mediquery-test-backend mediquery-ai-test-postgres-1 >/dev/null 2>&1 || true
}

trap cleanup EXIT

if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

# E2E/app DB defaults (overridable via environment)
: "${POSTGRES_USER:=mediquery}"
: "${POSTGRES_PASSWORD:=mediquery}"
: "${APP_DB_NAME:=mediquery_db}"
: "${APP_DB_SCHEMA:=mediquery_app}"
: "${OMOP_DB_NAME:=omop_db}"
: "${OMOP_TENANT_SCHEMA:=tenant_nexus_health}"
: "${OMOP_VOCAB_SCHEMA:=omop_vocab}"
: "${JWT_SECRET_KEY:=test_jwt_secret_key_for_local_gate}"

# Pipeline defaults (matching workflow shape)
: "${PIPELINE_DB_HOST:=localhost}"
: "${PIPELINE_DB_PORT:=5433}"
: "${OMOP_ETL_USER:=omop_user}"
: "${OMOP_ETL_PASSWORD:=omop_password}"
: "${PIPELINE_PROFILE:=synthetic_open}"
: "${ATHENA_PROFILE_ENABLED:=false}"
: "${FAIL_ON_VOCAB_GAP:=true}"
: "${SYNTHEA_SEED:=42}"

# Docker parity is intentionally fixed to workflow-equivalent population.
SYNTHEA_POPULATION_SIZE=50

log "1/4 Pipeline full-run parity (Docker, population=${SYNTHEA_POPULATION_SIZE})"
(
  cd "$PIPELINE_DIR"
  export PIPELINE_DB_HOST PIPELINE_DB_PORT OMOP_DB_NAME OMOP_ETL_USER OMOP_ETL_PASSWORD
  export OMOP_TENANT_SCHEMA OMOP_VOCAB_SCHEMA PIPELINE_PROFILE ATHENA_PROFILE_ENABLED
  export FAIL_ON_VOCAB_GAP SYNTHEA_POPULATION_SIZE SYNTHEA_SEED
  docker compose -f docker-compose.yml up -d --wait transient-db
  uv sync --extra dev
  uv run pipeline-full --population "${SYNTHEA_POPULATION_SIZE}" --seed "${SYNTHEA_SEED}"
  uv run pytest tests/ -v --tb=short --cov=vocabulary --cov-report=term-missing
)

log "2/4 Frontend CI parity (Docker component tests)"
(
  cd "$ROOT_DIR"
  docker compose -f docker-compose.test.yml --profile ci build frontend-component
  docker compose -f docker-compose.test.yml --profile ci run --rm -T frontend-component | cat
)

log "3/4 E2E workflow parity (Docker stack + Playwright runner)"
(
  cd "$ROOT_DIR"
  export POSTGRES_USER POSTGRES_PASSWORD APP_DB_NAME APP_DB_SCHEMA
  export OMOP_DB_NAME OMOP_TENANT_SCHEMA OMOP_VOCAB_SCHEMA JWT_SECRET_KEY
  docker compose -f docker-compose.test.yml --profile e2e build backend frontend
  docker compose -f docker-compose.test.yml --profile e2e up -d --wait backend frontend
  PLAYWRIGHT_SHARD=1/1 docker compose -f docker-compose.test.yml --profile e2e run --rm -T e2e-runner | cat
)

log "4/4 Backend CI parity (Docker unit tests)"
(
  cd "$ROOT_DIR"
  docker compose -f docker-compose.test.yml --profile ci build backend-unit
  docker compose -f docker-compose.test.yml --profile ci run --rm -e JWT_SECRET_KEY backend-unit
)

log "✅ All Docker parity flows passed"