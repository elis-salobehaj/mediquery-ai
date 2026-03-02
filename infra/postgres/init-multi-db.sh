#!/bin/sh
set -eu

TENANTS_DB_NAME="${TENANTS_DB_NAME:-omop_db}"
PIPELINE_DB_USER="${PIPELINE_DB_USER:-omop_user}"
PIPELINE_DB_PASSWORD="${PIPELINE_DB_PASSWORD:-omop_password}"
NEXUS_TENANT_DB_NAME="${NEXUS_TENANT_DB_NAME:-tenant_nexus_health}"

echo "[postgres-init] Ensuring tenant role '${PIPELINE_DB_USER}' exists..."
if ! psql -U "$POSTGRES_USER" -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='${PIPELINE_DB_USER}'" | grep -q 1; then
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "CREATE ROLE \"${PIPELINE_DB_USER}\" LOGIN PASSWORD '${PIPELINE_DB_PASSWORD}';"
fi

echo "[postgres-init] Ensuring tenant database '${TENANTS_DB_NAME}' exists..."
if ! psql -U "$POSTGRES_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${TENANTS_DB_NAME}'" | grep -q 1; then
  createdb -U "$POSTGRES_USER" "$TENANTS_DB_NAME"
fi

echo "[postgres-init] Granting tenant database privileges..."
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE \"${TENANTS_DB_NAME}\" TO \"${PIPELINE_DB_USER}\";"

if [ -f "/seed/gold_omop_tenant.sql" ]; then
  echo "[postgres-init] Loading OMOP seed into '${TENANTS_DB_NAME}'..."
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$TENANTS_DB_NAME" -f /seed/gold_omop_tenant.sql
fi

echo "[postgres-init] Ensuring tenant schema '${NEXUS_TENANT_DB_NAME}' permissions..."
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$TENANTS_DB_NAME" -c "GRANT USAGE ON SCHEMA \"${NEXUS_TENANT_DB_NAME}\" TO \"${PIPELINE_DB_USER}\";" || true
