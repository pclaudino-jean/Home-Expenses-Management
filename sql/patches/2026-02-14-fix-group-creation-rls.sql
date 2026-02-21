-- Fix bootstrap group creation:
-- allow the creator of a group to insert the FIRST membership row for themself as admin.

DROP POLICY IF EXISTS "Group admins can add members" ON public.group_members;

CREATE POLICY "Group admins can add members"
  ON public.group_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Normal case: existing group admin can add members
    public.is_group_admin(auth.uid(), group_id)

    OR

    -- Bootstrap case: group creator adds themself as the first admin member
    (
      user_id = auth.uid()
      AND role_in_group = 'admin'
      AND EXISTS (
        SELECT 1
        FROM public.groups g
        WHERE g.id = group_id
          AND g.created_by = auth.uid()
      )
    )
  );