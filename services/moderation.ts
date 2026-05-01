import { supabase } from '@/lib/supabase';
import type { User } from '@/types';

// Matches the `report_target_type` enum in 00002_launch_compliance.sql
export type ReportTargetType = 'post' | 'comment' | 'profile';

// Matches the `report_reason` enum in 00002_launch_compliance.sql
export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'hate_speech'
  | 'violence'
  | 'self_harm'
  | 'sexual_content'
  | 'minor_safety'
  | 'intellectual_property'
  | 'illegal_activity'
  | 'other';

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: 'Spam or misleading',
  harassment: 'Harassment or bullying',
  hate_speech: 'Hate speech',
  violence: 'Violence or threats',
  self_harm: 'Self-harm',
  sexual_content: 'Sexual content',
  minor_safety: 'Endangers a minor',
  intellectual_property: 'Copyright or trademark',
  illegal_activity: 'Illegal activity',
  other: 'Something else',
};

export interface BlockedUser {
  blocked_id: string;
  created_at: string;
  user: User;
}

export const moderationService = {
  /**
   * Block another user. Reciprocal visibility rules are enforced by the
   * `user_blocks` table's RLS and downstream query filters.
   */
  async blockUser(targetUserId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    if (user.id === targetUserId) throw new Error('You cannot block yourself.');

    // Upsert so repeated taps are idempotent
    const { error } = await supabase
      .from('user_blocks')
      .upsert(
        { blocker_id: user.id, blocked_id: targetUserId },
        { onConflict: 'blocker_id,blocked_id' }
      );
    if (error) throw error;

    // Also unfollow both directions so neither side sees the other's updates
    await Promise.all([
      supabase
        .from('follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('following_id', targetUserId),
      supabase
        .from('follows')
        .delete()
        .eq('follower_id', targetUserId)
        .eq('following_id', user.id),
    ]);
  },

  async unblockUser(targetUserId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('user_blocks')
      .delete()
      .eq('blocker_id', user.id)
      .eq('blocked_id', targetUserId);
    if (error) throw error;
  },

  /**
   * Check whether the current user has blocked (or been blocked by) another user.
   * Returns `true` if either direction of block exists — used for UI gating.
   */
  async isBlocked(targetUserId: string): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data, error } = await supabase
      .from('user_blocks')
      .select('blocker_id')
      .or(
        `and(blocker_id.eq.${user.id},blocked_id.eq.${targetUserId}),` +
          `and(blocker_id.eq.${targetUserId},blocked_id.eq.${user.id})`
      )
      .limit(1)
      .maybeSingle();
    if (error) return false;
    return !!data;
  },

  async listBlockedUsers(): Promise<BlockedUser[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('user_blocks')
      .select('blocked_id, created_at, user:profiles!blocked_id (*)')
      .eq('blocker_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data as unknown as BlockedUser[]) ?? [];
  },

  /**
   * Report a post, comment, or profile. Apple Guideline 1.2 requires UGC apps
   * to provide an in-app reporting mechanism with a 24-hour SLA on abusive
   * content. Moderators act on `content_reports` via a separate admin surface.
   */
  async reportContent(input: {
    target_type: ReportTargetType;
    target_id: string;
    reason: ReportReason;
    details?: string;
  }) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase.from('content_reports').insert({
      reporter_id: user.id,
      target_type: input.target_type,
      target_id: input.target_id,
      reason: input.reason,
      details: input.details?.slice(0, 500) ?? null,
      status: 'pending',
    });
    if (error) throw error;
  },
};
