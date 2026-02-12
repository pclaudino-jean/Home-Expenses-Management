export interface Profile {
  id: string;
  username: string;
  email: string | null;
  created_at: string;
  updated_at: string;
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  currency: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_archived: boolean;
  members_can_edit_any_expense: boolean;
  members_can_delete_any_expense: boolean;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  role_in_group: 'admin' | 'member';
  display_name: string | null;
  created_at: string;
  profiles?: Profile;
}

export interface Label {
  id: string;
  group_id: string;
  name: string;
  created_at: string;
}

export interface Expense {
  id: string;
  group_id: string;
  description: string;
  amount_cents: number;
  currency: string;
  date: string;
  paid_by_member_id: string;
  label_id: string | null;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
  deleted_at: string | null;
  expense_splits?: ExpenseSplit[];
  labels?: Label | null;
  paid_by_member?: GroupMember;
}

export interface ExpenseSplit {
  id: string;
  expense_id: string;
  member_id: string;
  percentage: number;
  amount_cents: number;
  group_members?: GroupMember;
}

export interface Payment {
  id: string;
  group_id: string;
  payer_member_id: string;
  payee_member_id: string;
  amount_cents: number;
  currency: string;
  date: string;
  note: string | null;
  created_by: string;
  created_at: string;
  deleted_at: string | null;
  payer?: GroupMember;
  payee?: GroupMember;
}

export interface Invitation {
  id: string;
  group_id: string;
  invited_email: string;
  invited_by: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
}

export interface MemberBalance {
  memberId: string;
  memberName: string;
  totalPaid: number;
  totalShare: number;
  netBalance: number; // positive = owed money, negative = owes money
}

export interface PairwiseDebt {
  fromMemberId: string;
  fromMemberName: string;
  toMemberId: string;
  toMemberName: string;
  amountCents: number;
}

export function formatCents(cents: number, currency: string = 'EUR'): string {
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function parseCentsFromInput(value: string): number {
  const num = parseFloat(value);
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}
