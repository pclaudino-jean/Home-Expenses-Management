-- Fix group creation flow with RLS:
-- The creator must be able to SELECT the group they just created
-- before/while owner membership is being inserted.

BEGIN;

-- 1) Fix RLS policy on groups (allow creator to view their own groups)
ALTER POLICY "Members can view their groups"
ON public.groups
USING (
  public.is_group_member(auth.uid(), id)
  OR created_by = auth.uid()
);

-- 2) Backfill missing owner memberships (from previous failed create attempts)
-- This prevents orphan groups (groups created but creator not inserted into group_members).
INSERT INTO public.group_members (group_id, user_id, role_in_group, display_name)
SELECT
  g.id,
  g.created_by,
  'admin',
  COALESCE(p.username, p.email, 'Admin')
FROM public.groups g
LEFT JOIN public.group_members gm
  ON gm.group_id = g.id
 AND gm.user_id = g.created_by
LEFT JOIN public.profiles p
  ON p.id = g.created_by
WHERE gm.id IS NULL;

COMMIT;