#!/bin/sh
set -eu

OMOP_DB_NAME="${OMOP_DB_NAME:-omop_db}"
APP_DB_NAME="${APP_DB_NAME:-${POSTGRES_DB:-mediquery_db}}"
APP_DB_SCHEMA="${APP_DB_SCHEMA:-mediquery_app}"

# ── App database ──────────────────────────────────────────────────────────────
echo "[postgres-init] Ensuring app database '${APP_DB_NAME}'..."
if ! psql -U "$POSTGRES_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${APP_DB_NAME}'" | grep -q 1; then
  createdb -U "$POSTGRES_USER" "$APP_DB_NAME"
fi
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$APP_DB_NAME" \
  -c "CREATE SCHEMA IF NOT EXISTS \"${APP_DB_SCHEMA}\" AUTHORIZATION \"${POSTGRES_USER}\";"

# ── OMOP database ─────────────────────────────────────────────────────────────
echo "[postgres-init] Ensuring OMOP database '${OMOP_DB_NAME}'..."
if ! psql -U "$POSTGRES_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${OMOP_DB_NAME}'" | grep -q 1; then
  createdb -U "$POSTGRES_USER" "$OMOP_DB_NAME"
fi

# ── Gold dump seed ─────────────────────────────────────────────────────────────
if [ -f "/seed/gold_omop_tenant.sql.gz" ]; then
  echo "[postgres-init] Loading OMOP gold dump into '${OMOP_DB_NAME}'..."
  gzip -dc /seed/gold_omop_tenant.sql.gz | psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$OMOP_DB_NAME"
elif [ -f "/seed/gold_omop_tenant.sql" ]; then
  echo "[postgres-init] Loading OMOP gold dump into '${OMOP_DB_NAME}'..."
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$OMOP_DB_NAME" -f /seed/gold_omop_tenant.sql
fi

echo "[postgres-init] Init complete."
