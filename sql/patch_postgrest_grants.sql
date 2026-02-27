-- sql/patch_postgrest_grants.sql
-- Ensure PostgREST roles can access your public tables (RLS still applies)

BEGIN;

-- Create expected roles if missing (harmless if they already exist)
DO $$
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

  -- PostgREST connects as authenticator and SET ROLEs into anon/authenticated
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    GRANT anon, authenticated, service_role TO authenticator;
  END IF;
END $$;

-- Allow API roles to use schema
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Allow API roles to call functions (RLS helpers, RPCs)
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- Allow API roles to access tables (RLS policies still enforce row access)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
TO anon, authenticated, service_role;

-- Allow API roles to use sequences (future-proof)
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public
TO anon, authenticated, service_role;

-- Ensure future objects also get privileges (created by postgres in schema public)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

COMMIT;