#!/usr/bin/env bash
set -euo pipefail

DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-postgres}"

if [[ -z "${POSTGRES_PASSWORD:-}" ]]; then
  echo "ERROR: POSTGRES_PASSWORD is not set for schema init container."
  exit 1
fi
export PGPASSWORD="${POSTGRES_PASSWORD}"

echo "[app-schema-init] Waiting for Postgres at ${DB_HOST}:${DB_PORT}..."
for i in $(seq 1 60); do
  if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "select 1" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "[app-schema-init] Connected."

HAS_GROUPS_TABLE="$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "select to_regclass('public.groups') is not null;")"

if [[ "$HAS_GROUPS_TABLE" != "t" ]]; then
  echo "[app-schema-init] Applying base schema.sql..."
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f /sql/schema.sql
else
  echo "[app-schema-init] Base schema already present (public.groups exists). Skipping schema.sql."
fi

# Always apply idempotent patches (safe to run on every boot)
for patch in \
  /sql/patch_fix_group_creation_rls.sql \
  /sql/patch_postgrest_grants.sql
do
  if [[ -f "$patch" ]]; then
    echo "[app-schema-init] Applying $(basename "$patch")..."
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$patch"
  fi
done

echo "[app-schema-init] Done ✅"