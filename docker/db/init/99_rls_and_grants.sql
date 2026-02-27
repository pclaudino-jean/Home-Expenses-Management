-- db/init/99_rls_and_grants.sql
-- Fix 403 on /rest/v1/* by granting privileges + adding RLS policies
-- Safe to re-run.

-- Ensure core roles exist (usually already exist in Supabase images)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOINHERIT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOINHERIT;
  END IF;
END
$$;

-- Allow calling auth helper functions used in RLS policies
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.role() TO anon, authenticated;

-- Schema usage
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Table privileges (PostgREST needs these in addition to RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.group_members TO authenticated;

-- If you use uuid defaults / sequences etc
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Enable RLS (idempotent)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- =========================
-- PROFILES POLICIES
-- =========================
-- Note: your app searches profiles by email when adding a member,
-- so SELECT must allow reading other profiles (otherwise invitations/add-member breaks).
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;

CREATE POLICY "profiles_select"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "profiles_insert_self"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_self"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- =========================
-- GROUPS POLICIES
-- =========================
DROP POLICY IF EXISTS "groups_select" ON public.groups;
DROP POLICY IF EXISTS "groups_insert" ON public.groups;
DROP POLICY IF EXISTS "groups_update_admin" ON public.groups;
DROP POLICY IF EXISTS "groups_delete_admin" ON public.groups;

-- Allow selecting:
-- - groups you created (needed so INSERT ... returning works before group_members row exists)
-- - or groups where you are a member
CREATE POLICY "groups_select"
  ON public.groups
  FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.group_members gm
      WHERE gm.group_id = groups.id
        AND gm.user_id = auth.uid()
    )
  );

-- Allow creating a group only if created_by is yourself
CREATE POLICY "groups_insert"
  ON public.groups
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Only admins can update/delete groups
CREATE POLICY "groups_update_admin"
  ON public.groups
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.group_members gm
      WHERE gm.group_id = groups.id
        AND gm.user_id = auth.uid()
        AND gm.role_in_group = 'admin'
    )
  )
  WITH CHECK (true);

CREATE POLICY "groups_delete_admin"
  ON public.groups
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.group_members gm
      WHERE gm.group_id = groups.id
        AND gm.user_id = auth.uid()
        AND gm.role_in_group = 'admin'
    )
  );

-- =========================
-- GROUP_MEMBERS POLICIES
-- =========================
DROP POLICY IF EXISTS "group_members_select" ON public.group_members;
DROP POLICY IF EXISTS "group_members_insert" ON public.group_members;
DROP POLICY IF EXISTS "group_members_update_admin" ON public.group_members;
DROP POLICY IF EXISTS "group_members_delete_admin" ON public.group_members;

-- Members can read membership rows for groups they belong to
CREATE POLICY "group_members_select"
  ON public.group_members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.group_members gm
      WHERE gm.group_id = group_members.group_id
        AND gm.user_id = auth.uid()
    )
  );

-- Allow insert:
-- 1) group creator can self-add as first admin (right after creating group)
-- 2) existing admins can add anyone
CREATE POLICY "group_members_insert"
  ON public.group_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      user_id = auth.uid()
      AND EXISTS (
        SELECT 1
        FROM public.groups g
        WHERE g.id = group_members.group_id
          AND g.created_by = auth.uid()
      )
    )
    OR
    EXISTS (
      SELECT 1
      FROM public.group_members gm
      WHERE gm.group_id = group_members.group_id
        AND gm.user_id = auth.uid()
        AND gm.role_in_group = 'admin'
    )
  );

-- Only admins can update/delete membership rows
CREATE POLICY "group_members_update_admin"
  ON public.group_members
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.group_members gm
      WHERE gm.group_id = group_members.group_id
        AND gm.user_id = auth.uid()
        AND gm.role_in_group = 'admin'
    )
  )
  WITH CHECK (true);

CREATE POLICY "group_members_delete_admin"
  ON public.group_members
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.group_members gm
      WHERE gm.group_id = group_members.group_id
        AND gm.user_id = auth.uid()
        AND gm.role_in_group = 'admin'
    )
  );