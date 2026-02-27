#!/usr/bin/env bash
set -euo pipefail

DB_HOST="db"
DB_PORT="5432"
DB_NAME="postgres"
DB_USER="postgres"

export PGPASSWORD="${POSTGRES_PASSWORD:-your-super-secret-password}"

psql_cmd() {
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" "$@"
}

echo "[app-schema-init] Waiting for PostgreSQL..."
until psql_cmd -tAc "SELECT 1" >/dev/null 2>&1; do
  sleep 2
done

echo "[app-schema-init] PostgreSQL is up."

echo "[app-schema-init] Waiting for GoTrue auth migrations (auth.users table)..."
until [ "$(psql_cmd -tAc "SELECT CASE WHEN to_regclass('auth.users') IS NOT NULL THEN 'yes' ELSE 'no' END" | tr -d '[:space:]')" = "yes" ]; do
  sleep 2
done

echo "[app-schema-init] auth.users exists."

GROUPS_EXISTS="$(psql_cmd -tAc "SELECT CASE WHEN to_regclass('public.groups') IS NOT NULL THEN 'yes' ELSE 'no' END" | tr -d '[:space:]')"

if [ "$GROUPS_EXISTS" = "yes" ]; then
  echo "[app-schema-init] public.groups already exists. Skipping schema.sql"
else
  echo "[app-schema-init] Applying /sql/schema.sql ..."
  psql_cmd -v ON_ERROR_STOP=1 -f /sql/schema.sql
  echo "[app-schema-init] schema.sql applied successfully."
fi

# Optional compatibility patch for older DBs (safe to keep)
if [ -f /sql/patch_fix_group_creation_rls.sql ]; then
  echo "[app-schema-init] Applying compatibility patch (patch_fix_group_creation_rls.sql) ..."
  psql_cmd -v ON_ERROR_STOP=1 -f /sql/patch_fix_group_creation_rls.sql
  echo "[app-schema-init] Compatibility patch applied."
fi

# If PostgREST is already running for any reason, ask it to reload schema cache.
# (Harmless if not needed.)
psql_cmd -v ON_ERROR_STOP=1 -c "NOTIFY pgrst, 'reload schema';" || true

echo "[app-schema-init] Done."