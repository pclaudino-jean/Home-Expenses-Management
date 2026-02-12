import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Payment } from '@/types/database';

export function usePayments(groupId: string | undefined) {
  return useQuery({
    queryKey: ['payments', groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('*, payer:group_members!payer_member_id(*, profiles(*)), payee:group_members!payee_member_id(*, profiles(*))')
        .eq('group_id', groupId!)
        .is('deleted_at', null)
        .order('date', { ascending: false });
      if (error) throw error;
      return data as Payment[];
    },
    enabled: !!groupId,
  });
}

export function useCreatePayment() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: {
      groupId: string;
      payerMemberId: string;
      payeeMemberId: string;
      amountCents: number;
      currency: string;
      date: string;
      note?: string;
    }) => {
      const { data, error } = await supabase
        .from('payments')
        .insert({
          group_id: input.groupId,
          payer_member_id: input.payerMemberId,
          payee_member_id: input.payeeMemberId,
          amount_cents: input.amountCents,
          currency: input.currency,
          date: input.date,
          note: input.note || null,
          created_by: user!.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['payments', vars.groupId] });
      qc.invalidateQueries({ queryKey: ['balances', vars.groupId] });
    },
  });
}

export function useSoftDeletePayment() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { paymentId: string; groupId: string }) => {
      const { error } = await supabase
        .from('payments')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', input.paymentId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['payments', vars.groupId] });
      qc.invalidateQueries({ queryKey: ['balances', vars.groupId] });
    },
  });
}
