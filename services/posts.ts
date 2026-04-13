import { supabase } from '@/lib/supabase';
import type { Post, Comment, FeedTab } from '@/types';

const POST_SELECT = `
  *,
  user:profiles!user_id (*)
`;

export const postsService = {
  async getFeed(tab: FeedTab, page = 0, limit = 20): Promise<Post[]> {
    let query = supabase
      .from('posts')
      .select(POST_SELECT)
      .order('created_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1);

    if (tab === 'featured') {
      query = query.eq('is_featured', true);
    } else if (tab === 'following') {
      // Server-side RPC or filter by followed users
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: follows } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.id);
        const followedIds = follows?.map(f => f.following_id) ?? [];
        if (followedIds.length > 0) {
          query = query.in('user_id', followedIds);
        } else {
          return [];
        }
      }
    }

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },

  async getPost(postId: string): Promise<Post> {
    const { data, error } = await supabase
      .from('posts')
      .select(POST_SELECT)
      .eq('id', postId)
      .single();
    if (error) throw error;
    return data;
  },

  async getUserPosts(userId: string, page = 0, limit = 20): Promise<Post[]> {
    const { data, error } = await supabase
      .from('posts')
      .select(POST_SELECT)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1);
    if (error) throw error;
    return data ?? [];
  },

  async likePost(postId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('post_likes')
      .insert({ post_id: postId, user_id: user.id });
    if (error) throw error;
  },

  async unlikePost(postId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('post_likes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', user.id);
    if (error) throw error;
  },

  async bookmarkPost(postId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('bookmarks')
      .insert({ post_id: postId, user_id: user.id });
    if (error) throw error;
  },

  async unbookmarkPost(postId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('bookmarks')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', user.id);
    if (error) throw error;
  },

  async getComments(postId: string): Promise<Comment[]> {
    const { data, error } = await supabase
      .from('comments')
      .select(`*, user:profiles!user_id (*)`)
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async addComment(postId: string, body: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('comments')
      .insert({ post_id: postId, user_id: user.id, body })
      .select(`*, user:profiles!user_id (*)`)
      .single();
    if (error) throw error;
    return data;
  },

  async searchPosts(query: string): Promise<Post[]> {
    const { data, error } = await supabase
      .from('posts')
      .select(POST_SELECT)
      .or(`title.ilike.%${query}%,body.ilike.%${query}%`)
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw error;
    return data ?? [];
  },

  async getBookmarkedPosts(): Promise<Post[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('bookmarks')
      .select(`post:posts!post_id (${POST_SELECT.trim()})`)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data?.map((b: any) => b.post).filter(Boolean) ?? []) as Post[];
  },
};
