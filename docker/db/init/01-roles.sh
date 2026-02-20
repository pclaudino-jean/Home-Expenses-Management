#!/usr/bin/env sh
set -e

# Create required Supabase-ish roles if missing
psql -v ON_ERROR_STOP=1 --username "postgres" --dbname "postgres" <<EOSQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;

  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;

  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;

  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticator') THEN
    CREATE ROLE authenticator LOGIN PASSWORD '${POSTGRES_PASSWORD}';
  ELSE
    ALTER ROLE authenticator WITH PASSWORD '${POSTGRES_PASSWORD}';
  END IF;

  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='supabase_auth_admin') THEN
    CREATE ROLE supabase_auth_admin LOGIN PASSWORD '${POSTGRES_PASSWORD}';
  ELSE
    ALTER ROLE supabase_auth_admin WITH PASSWORD '${POSTGRES_PASSWORD}';
  END IF;

  GRANT anon, authenticated, service_role TO authenticator;
  GRANT USAGE, CREATE ON SCHEMA public TO supabase_auth_admin;
  GRANT CREATE ON DATABASE postgres TO supabase_auth_admin;
END
\$\$;
EOSQL
