do $$
begin
  -- ensure auth role can create objects (some versions create schema_migrations in public)
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage, create on schema public to supabase_auth_admin;

    -- ensure auth schema exists and is owned by auth admin
    if not exists (select 1 from pg_namespace where nspname = 'auth') then
      execute 'create schema auth authorization supabase_auth_admin';
    end if;

    grant usage, create on schema auth to supabase_auth_admin;
  end if;
end $$;
