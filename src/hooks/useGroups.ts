import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Database } from '@/types/database';

type Group = Database['public']['Tables']['groups']['Row'];

export interface CreateGroupInput {
  name: string;
  description?: string;
  currency?: string;
}

export function useGroups() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['groups', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('groups')
        .select(`
          *,
          group_members!inner(user_id, role_in_group)
        `)
        .eq('group_members.user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Group[];
    },
    enabled: !!user,
  });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ name, description, currency = 'EUR' }: CreateGroupInput) => {
      if (!user) {
        throw new Error('You must be logged in to create a group.');
      }

      const groupId = crypto.randomUUID();

      // 1) Create the group (without .select() because SELECT policy depends on membership)
      const { error: groupInsertError } = await supabase
        .from('groups')
        .insert({
          id: groupId,
          name: name.trim(),
          description: description?.trim() || null,
          currency: currency.trim().toUpperCase(),
          created_by: user.id,
        });

      if (groupInsertError) throw groupInsertError;

      // 2) Add the creator as admin (bootstrap allowed by SQL policy patch)
      const { error: memberInsertError } = await supabase
        .from('group_members')
        .insert({
          group_id: groupId,
          user_id: user.id,
          role_in_group: 'admin',
        });

      if (memberInsertError) throw memberInsertError;

      // 3) Now the user is a member, so SELECT policy allows reading the group
      const { data: group, error: groupFetchError } = await supabase
        .from('groups')
        .select('*')
        .eq('id', groupId)
        .single();

      if (groupFetchError) throw groupFetchError;

      return group as Group;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}