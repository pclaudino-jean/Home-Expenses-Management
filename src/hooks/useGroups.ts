import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Group, GroupMember } from '@/types/database';

export function useGroups() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['groups', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('groups')
        .select('*, group_members!inner(user_id)')
        .eq('group_members.user_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as (Group & { group_members: { user_id: string }[] })[];
    },
    enabled: !!user,
  });
}

export function useGroup(groupId: string | undefined) {
  return useQuery({
    queryKey: ['group', groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('groups')
        .select('*')
        .eq('id', groupId!)
        .maybeSingle();
      if (error) throw error;
      return data as Group | null;
    },
    enabled: !!groupId,
  });
}

export function useGroupMembers(groupId: string | undefined) {
  return useQuery({
    queryKey: ['group-members', groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('group_members')
        .select('*, profiles(*)')
        .eq('group_id', groupId!)
        .order('created_at');
      if (error) throw error;
      return data as GroupMember[];
    },
    enabled: !!groupId,
  });
}

export function useCreateGroup() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: { name: string; description?: string; currency?: string }) => {
      // Create group
      const { data: group, error: groupError } = await supabase
        .from('groups')
        .insert({
          name: input.name,
          description: input.description || null,
          currency: input.currency || 'EUR',
          created_by: user!.id,
        })
        .select()
        .single();
      if (groupError) throw groupError;

      // Add creator as admin
      const { error: memberError } = await supabase
        .from('group_members')
        .insert({
          group_id: group.id,
          user_id: user!.id,
          role_in_group: 'admin',
          display_name: null,
        });
      if (memberError) throw memberError;

      return group as Group;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups'] }),
  });
}

export function useUpdateGroup() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string } & Partial<Group>) => {
      const { id, ...updates } = input;
      const { data, error } = await supabase
        .from('groups')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as Group;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      qc.invalidateQueries({ queryKey: ['group', data.id] });
    },
  });
}

export function useAddMember() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { groupId: string; email: string }) => {
      // Find user by email
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('email', input.email)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profile) throw new Error('No user found with that email. They need to register first.');

      const { data, error } = await supabase
        .from('group_members')
        .insert({
          group_id: input.groupId,
          user_id: profile.id,
          role_in_group: 'member',
        })
        .select('*, profiles(*)')
        .single();
      if (error) {
        if (error.code === '23505') throw new Error('User is already a member of this group.');
        throw error;
      }
      return data as GroupMember;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['group-members', vars.groupId] }),
  });
}
