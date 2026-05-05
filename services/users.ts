import { supabase } from '@/lib/supabase';
import { platformsService } from '@/services/platforms';
import type { User, CrowdStats } from '@/types';

/**
 * Sanitize a user-supplied search term before embedding into a PostgREST
 * `.or()` / `.ilike` filter. Strips wildcards, filter separators, and
 * quoting characters that could otherwise break the filter grammar or
 * enable injection. Caps length to a reasonable ceiling.
 */
function sanitizeSearchTerm(q: string): string {
  return q.replace(/[%_,()"'`\\*]/g, '').trim().slice(0, 80);
}

export const usersService = {
  async getProfile(userId: string): Promise<User> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) throw error;
    return data;
  },

  async getProfileByUsername(username: string): Promise<User> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', username)
      .single();
    if (error) throw error;
    return data;
  },

  async updateProfile(userId: string, updates: Partial<User>) {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getCrowdStats(userId: string): Promise<CrowdStats> {
    return platformsService.getCrowdStats(userId);
  },

  /**
   * Native MeeCrowd follower count (people who follow this user inside
   * MeeCrowd). Distinct from external-platform subscriber counts.
   */
  async getMeecrowdFollowerCount(userId: string): Promise<number> {
    const { count, error } = await supabase
      .from('follows')
      .select('id', { count: 'exact', head: true })
      .eq('following_id', userId);
    if (error) throw error;
    return count ?? 0;
  },

  async followUser(targetUserId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('follows')
      .insert({ follower_id: user.id, following_id: targetUserId });
    if (error) throw error;
  },

  async unfollowUser(targetUserId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', user.id)
      .eq('following_id', targetUserId);
    if (error) throw error;
  },

  async isFollowing(targetUserId: string): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', user.id)
      .eq('following_id', targetUserId)
      .maybeSingle();
    return !!data;
  },

  async searchUsers(query: string): Promise<User[]> {
    const q = sanitizeSearchTerm(query);
    if (!q) return [];
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
      .is('deleted_at', null)
      .limit(20);
    if (error) throw error;
    return data ?? [];
  },
};
