-- LocalSplit Database Schema
-- Run this migration on your local Supabase instance

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated USING (id = auth.uid());

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated WITH CHECK (id = auth.uid());

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- GROUPS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  currency TEXT DEFAULT 'EUR',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  is_archived BOOLEAN DEFAULT false,
  members_can_edit_any_expense BOOLEAN DEFAULT false,
  members_can_delete_any_expense BOOLEAN DEFAULT false
);
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- GROUP MEMBERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role_in_group TEXT CHECK (role_in_group IN ('admin', 'member')) DEFAULT 'member',
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(group_id, user_id)
);
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- Helper: check if user is member of group
CREATE OR REPLACE FUNCTION public.is_group_member(_user_id UUID, _group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE user_id = _user_id AND group_id = _group_id
  )
$$;

-- Helper: check if user is admin of group
CREATE OR REPLACE FUNCTION public.is_group_admin(_user_id UUID, _group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE user_id = _user_id AND group_id = _group_id AND role_in_group = 'admin'
  )
$$;

CREATE OR REPLACE FUNCTION public.group_allows_member_edit(_group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(members_can_edit_any_expense, false) FROM public.groups WHERE id = _group_id
$$;

CREATE OR REPLACE FUNCTION public.group_allows_member_delete(_group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(members_can_delete_any_expense, false) FROM public.groups WHERE id = _group_id
$$;

-- Groups policies
CREATE POLICY "Members can view their groups"
  ON public.groups FOR SELECT TO authenticated
  USING (public.is_group_member(auth.uid(), id));

CREATE POLICY "Authenticated users can create groups"
  ON public.groups FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Group admins can update groups"
  ON public.groups FOR UPDATE TO authenticated
  USING (public.is_group_admin(auth.uid(), id));

-- Group members policies
CREATE POLICY "Members can view group members"
  ON public.group_members FOR SELECT TO authenticated
  USING (public.is_group_member(auth.uid(), group_id));

CREATE POLICY "Group admins can add members"
  ON public.group_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_group_admin(auth.uid(), group_id)
    OR (
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

CREATE POLICY "Group admins can update members"
  ON public.group_members FOR UPDATE TO authenticated
  USING (public.is_group_admin(auth.uid(), group_id));

CREATE POLICY "Group admins can remove members"
  ON public.group_members FOR DELETE TO authenticated
  USING (public.is_group_admin(auth.uid(), group_id));

-- ============================================================
-- LABELS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(group_id, name)
);
ALTER TABLE public.labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view labels" ON public.labels FOR SELECT TO authenticated
  USING (public.is_group_member(auth.uid(), group_id));
CREATE POLICY "Members can create labels" ON public.labels FOR INSERT TO authenticated
  WITH CHECK (public.is_group_member(auth.uid(), group_id));
CREATE POLICY "Admins can update labels" ON public.labels FOR UPDATE TO authenticated
  USING (public.is_group_admin(auth.uid(), group_id));
CREATE POLICY "Admins can delete labels" ON public.labels FOR DELETE TO authenticated
  USING (public.is_group_admin(auth.uid(), group_id));

-- ============================================================
-- EXPENSES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE NOT NULL,
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  paid_by_member_id UUID REFERENCES public.group_members(id) NOT NULL,
  label_id UUID REFERENCES public.labels(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_expenses_group ON public.expenses(group_id);
CREATE INDEX idx_expenses_date ON public.expenses(date);
CREATE INDEX idx_expenses_deleted ON public.expenses(deleted_at);

CREATE POLICY "Members can view group expenses" ON public.expenses FOR SELECT TO authenticated
  USING (public.is_group_member(auth.uid(), group_id));
CREATE POLICY "Members can create expenses" ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (public.is_group_member(auth.uid(), group_id) AND created_by = auth.uid());
CREATE POLICY "Members can update expenses per rules" ON public.expenses FOR UPDATE TO authenticated
  USING (public.is_group_member(auth.uid(), group_id) AND (
    public.is_group_admin(auth.uid(), group_id) OR created_by = auth.uid() OR public.group_allows_member_edit(group_id)
  ));
CREATE POLICY "Members can delete expenses per rules" ON public.expenses FOR DELETE TO authenticated
  USING (public.is_group_member(auth.uid(), group_id) AND (
    public.is_group_admin(auth.uid(), group_id) OR created_by = auth.uid() OR public.group_allows_member_delete(group_id)
  ));

-- ============================================================
-- EXPENSE SPLITS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.expense_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID REFERENCES public.expenses(id) ON DELETE CASCADE NOT NULL,
  member_id UUID REFERENCES public.group_members(id) NOT NULL,
  percentage NUMERIC(6,3) NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0)
);
ALTER TABLE public.expense_splits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view splits" ON public.expense_splits FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = expense_id AND public.is_group_member(auth.uid(), e.group_id)));
CREATE POLICY "Members can create splits" ON public.expense_splits FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = expense_id AND public.is_group_member(auth.uid(), e.group_id)));
CREATE POLICY "Members can update splits" ON public.expense_splits FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = expense_id AND public.is_group_member(auth.uid(), e.group_id)
    AND (public.is_group_admin(auth.uid(), e.group_id) OR e.created_by = auth.uid() OR public.group_allows_member_edit(e.group_id))));
CREATE POLICY "Members can delete splits" ON public.expense_splits FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = expense_id AND public.is_group_member(auth.uid(), e.group_id)));

-- ============================================================
-- PAYMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE NOT NULL,
  payer_member_id UUID REFERENCES public.group_members(id) NOT NULL,
  payee_member_id UUID REFERENCES public.group_members(id) NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_payments_group ON public.payments(group_id);
CREATE INDEX idx_payments_deleted ON public.payments(deleted_at);

CREATE POLICY "Members can view group payments" ON public.payments FOR SELECT TO authenticated
  USING (public.is_group_member(auth.uid(), group_id));
CREATE POLICY "Members can create payments" ON public.payments FOR INSERT TO authenticated
  WITH CHECK (public.is_group_member(auth.uid(), group_id) AND created_by = auth.uid());
CREATE POLICY "Members can update payments" ON public.payments FOR UPDATE TO authenticated
  USING (public.is_group_member(auth.uid(), group_id) AND (
    public.is_group_admin(auth.uid(), group_id) OR created_by = auth.uid()
  ));

-- ============================================================
-- INVITATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE NOT NULL,
  invited_email TEXT NOT NULL,
  invited_by UUID REFERENCES auth.users(id),
  status TEXT CHECK (status IN ('pending', 'accepted', 'declined')) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group admins can create invitations" ON public.invitations FOR INSERT TO authenticated
  WITH CHECK (public.is_group_admin(auth.uid(), group_id));
CREATE POLICY "Members and invitees can view invitations" ON public.invitations FOR SELECT TO authenticated
  USING (public.is_group_member(auth.uid(), group_id)
    OR invited_email = (SELECT email FROM auth.users WHERE id = auth.uid()));
CREATE POLICY "Invited user can update invitation" ON public.invitations FOR UPDATE TO authenticated
  USING (invited_email = (SELECT email FROM auth.users WHERE id = auth.uid()));
