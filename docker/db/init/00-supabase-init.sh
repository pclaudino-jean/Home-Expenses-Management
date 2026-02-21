#!/usr/bin/env bash
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator LOGIN PASSWORD '${POSTGRES_PASSWORD}';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    CREATE ROLE supabase_auth_admin LOGIN PASSWORD '${POSTGRES_PASSWORD}';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    CREATE ROLE supabase_admin LOGIN PASSWORD '${POSTGRES_PASSWORD}' CREATEROLE CREATEDB;
  END IF;
END
\$\$;

-- Schemas
CREATE SCHEMA IF NOT EXISTS auth;

-- Ownership + privileges
ALTER SCHEMA auth OWNER TO supabase_auth_admin;
GRANT USAGE, CREATE ON SCHEMA auth TO supabase_auth_admin;

GRANT USAGE ON SCHEMA public TO authenticator;
GRANT USAGE ON SCHEMA auth TO authenticator;

-- PostgREST typical role chaining
GRANT anon, authenticated, service_role TO authenticator;

-- Make sure unqualified queries resolve properly
ALTER ROLE supabase_auth_admin SET search_path = auth, public;
ALTER ROLE authenticator SET search_path = public, auth;

EOSQL

run_sql_dir () {
  local dir="$1"
  if [ -d "$dir" ]; then
    echo "==> Running extra SQL from $dir"
    find "$dir" -maxdepth 1 -type f -name '*.sql' | sort | while read -r f; do
      echo "----> $f"
      psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$f"
    done
  fi
}

# Optional: run any project SQL migrations you had in those folders
run_sql_dir /supabase-migrations
run_sql_dir /app-init