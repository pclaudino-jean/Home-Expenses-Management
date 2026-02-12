import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Label } from '@/types/database';

export function useLabels(groupId: string | undefined) {
  return useQuery({
    queryKey: ['labels', groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('labels')
        .select('*')
        .eq('group_id', groupId!)
        .order('name');
      if (error) throw error;
      return data as Label[];
    },
    enabled: !!groupId,
  });
}

export function useCreateLabel() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { groupId: string; name: string }) => {
      const { data, error } = await supabase
        .from('labels')
        .insert({ group_id: input.groupId, name: input.name })
        .select()
        .single();
      if (error) throw error;
      return data as Label;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['labels', vars.groupId] }),
  });
}

export function useDeleteLabel() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { labelId: string; groupId: string }) => {
      const { error } = await supabase.from('labels').delete().eq('id', input.labelId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['labels', vars.groupId] }),
  });
}
