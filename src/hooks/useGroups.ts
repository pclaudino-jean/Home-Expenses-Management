import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Group, GroupMember, Profile } from '@/types/database';

type CreateGroupInput = {
  name: string;
  description?: string | null;
  currency: string;
  members_can_edit_any_expense?: boolean;
  members_can_delete_any_expense?: boolean;
  is_archived?: boolean;
};

type UpdateGroupInput = {
  id: string;
  name?: string;
  description?: string | null;
  currency?: string;
  members_can_edit_any_expense?: boolean;
  members_can_delete_any_expense?: boolean;
  is_archived?: boolean;
};

export const useGroups = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['groups', user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('groups')
        .select(`
          *,
          group_members!inner(user_id)
        `)
        .eq('group_members.user_id', user.id);

      if (error) throw error;
      return (data || []) as Group[];
    },
  });
};

export const useGroup = (groupId?: string) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['group', groupId, user?.id],
    enabled: !!groupId && !!user,
    queryFn: async () => {
      if (!groupId) return null;

      const { data, error } = await supabase
        .from('groups')
        .select('*')
        .eq('id', groupId)
        .single();

      if (error) throw error;
      return data as Group;
    },
  });
};

export const useGroupMembers = (groupId?: string) => {
  return useQuery({
    queryKey: ['group-members', groupId],
    enabled: !!groupId,
    queryFn: async () => {
      if (!groupId) return [];

      const { data, error } = await supabase
        .from('group_members')
        .select('*, profiles(*)')
        .eq('group_id', groupId);

      if (error) throw error;
      return (data || []) as GroupMember[];
    },
  });
};

export const useCreateGroup = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (groupData: CreateGroupInput) => {
      if (!user) throw new Error('User not authenticated');

      // 1) Create group
      const { data: group, error: groupError } = await supabase
        .from('groups')
        .insert({
          name: groupData.name,
          description: groupData.description?.trim() || null,
          currency: groupData.currency,
          created_by: user.id,
          members_can_edit_any_expense:
            groupData.members_can_edit_any_expense ?? false,
          members_can_delete_any_expense:
            groupData.members_can_delete_any_expense ?? false,
          is_archived: groupData.is_archived ?? false,
        })
        .select()
        .single();

      if (groupError) throw groupError;

      // 2) Add creator as admin member
      const { error: memberError } = await supabase.from('group_members').insert({
        group_id: group.id,
        user_id: user.id,
        role_in_group: 'admin',
        display_name: user.email?.split('@')[0] || 'Admin',
      });

      if (memberError) throw memberError;

      return group as Group;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
};

export const useUpdateGroup = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: UpdateGroupInput) => {
      const { id, ...updates } = payload;

      const { data, error } = await supabase
        .from('groups')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Group;
    },
    onSuccess: (updatedGroup) => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['group', updatedGroup.id] });
    },
  });
};

export const useAddMember = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      groupId,
      email,
    }: {
      groupId: string;
      email: string;
    }) => {
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail) {
        throw new Error('Email is required');
      }

      // Find user profile by email
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, email, username')
        .ilike('email', normalizedEmail)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profile) {
        throw new Error('No user found with this email');
      }

      const typedProfile = profile as Pick<Profile, 'id' | 'email' | 'username'>;

      // Prevent duplicate membership
      const { data: existingMember, error: existingError } = await supabase
        .from('group_members')
        .select('id')
        .eq('group_id', groupId)
        .eq('user_id', typedProfile.id)
        .maybeSingle();

      if (existingError) throw existingError;
      if (existingMember) {
        throw new Error('This user is already a member of the group');
      }

      const { data, error } = await supabase
        .from('group_members')
        .insert({
          group_id: groupId,
          user_id: typedProfile.id,
          role_in_group: 'member',
          display_name: typedProfile.username || typedProfile.email || 'Member',
        })
        .select('*, profiles(*)')
        .single();

      if (error) throw error;
      return data as GroupMember;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['group-members', variables.groupId] });
      queryClient.invalidateQueries({ queryKey: ['group', variables.groupId] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
};