import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Expense, ExpenseSplit } from '@/types/database';
import { computeSplitAmounts } from '@/lib/balances';

export function useExpenses(groupId: string | undefined) {
  return useQuery({
    queryKey: ['expenses', groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('*, expense_splits(*, group_members(*, profiles(*))), labels(*), paid_by_member:group_members!paid_by_member_id(*, profiles(*))')
        .eq('group_id', groupId!)
        .is('deleted_at', null)
        .order('date', { ascending: false });
      if (error) throw error;
      return data as Expense[];
    },
    enabled: !!groupId,
  });
}

export interface CreateExpenseInput {
  groupId: string;
  description: string;
  amountCents: number;
  currency: string;
  date: string;
  paidByMemberId: string;
  labelId: string | null;
  splits: { memberId: string; percentage: number }[];
}

export function useCreateExpense() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: CreateExpenseInput) => {
      const splitAmounts = computeSplitAmounts(input.amountCents, input.splits);

      const { data: expense, error: expenseError } = await supabase
        .from('expenses')
        .insert({
          group_id: input.groupId,
          description: input.description,
          amount_cents: input.amountCents,
          currency: input.currency,
          date: input.date,
          paid_by_member_id: input.paidByMemberId,
          label_id: input.labelId,
          created_by: user!.id,
          updated_by: user!.id,
        })
        .select()
        .single();
      if (expenseError) throw expenseError;

      const splitRows = splitAmounts.map((s) => ({
        expense_id: expense.id,
        member_id: s.memberId,
        percentage: s.percentage,
        amount_cents: s.amountCents,
      }));

      const { error: splitError } = await supabase.from('expense_splits').insert(splitRows);
      if (splitError) throw splitError;

      return expense;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['expenses', vars.groupId] });
      qc.invalidateQueries({ queryKey: ['balances', vars.groupId] });
    },
  });
}

export function useSoftDeleteExpense() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: { expenseId: string; groupId: string }) => {
      const { error } = await supabase
        .from('expenses')
        .update({ deleted_at: new Date().toISOString(), updated_by: user!.id })
        .eq('id', input.expenseId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['expenses', vars.groupId] });
      qc.invalidateQueries({ queryKey: ['balances', vars.groupId] });
    },
  });
}
