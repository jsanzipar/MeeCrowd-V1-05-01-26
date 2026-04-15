import { supabase } from '@/lib/supabase';
import type { Post, Comment, FeedTab, SortFilter } from '@/types';

const POST_SELECT = `
  *,
  user:profiles!user_id (*)
`;

const PLATFORM_FILTERS = ['youtube', 'twitch', 'kick', 'instagram', 'tiktok', 'x', 'facebook', 'linkedin'];
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  gaming: ['game', 'gaming', 'fortnite', 'valorant', 'elden', 'nerf', 'pc build'],
  music: ['music', 'song', 'concert', 'album', 'playlist', 'dj'],
  sports: ['sport', 'football', 'basketball', 'soccer', 'nba', 'nfl'],
  education: ['tutorial', 'learn', 'course', 'education', 'science', 'how to', 'setup guide'],
  entertainment: ['vlog', 'challenge', 'react', 'day in my life', 'unboxing', 'review'],
};

/**
 * Enrich an array of posts with the current user's is_liked / is_bookmarked flags.
 * Runs two lightweight queries against post_likes and bookmarks.
 */
async function enrichPosts(posts: Post[]): Promise<Post[]> {
  if (posts.length === 0) return posts;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return posts;

  const postIds = posts.map((p) => p.id);

  // Fetch likes and bookmarks for these posts in parallel
  const [likesRes, bookmarksRes] = await Promise.all([
    supabase
      .from('post_likes')
      .select('post_id')
      .eq('user_id', user.id)
      .in('post_id', postIds),
    supabase
      .from('bookmarks')
      .select('post_id')
      .eq('user_id', user.id)
      .in('post_id', postIds),
  ]);

  const likedIds = new Set(likesRes.data?.map((l) => l.post_id) ?? []);
  const bookmarkedIds = new Set(bookmarksRes.data?.map((b) => b.post_id) ?? []);

  return posts.map((post) => ({
    ...post,
    is_liked: likedIds.has(post.id),
    is_bookmarked: bookmarkedIds.has(post.id),
  }));
}

export const postsService = {
  async getFeed(tab: FeedTab, page = 0, limit = 20, filters: SortFilter[] = []): Promise<Post[]> {
    let query = supabase
      .from('posts')
      .select(POST_SELECT)
      .range(page * limit, (page + 1) * limit - 1);

    // ── Tab logic ──
    if (tab === 'upcoming') {
      query = query.or(
        'content_type.eq.live,is_recurring.eq.true,starts_at.gte.' + new Date().toISOString()
      );
      query = query.order('starts_at', { ascending: true, nullsFirst: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    // ── Multi-filter logic ──
    // Collect platform filters
    const platformFilters = filters.filter(f => PLATFORM_FILTERS.includes(f));
    if (platformFilters.length > 0) {
      query = query.in('platform', platformFilters);
    }

    // Content type filters
    if (filters.includes('streamers')) {
      query = query.in('content_type', ['live', 'clip']);
    }
    if (filters.includes('broadcasters')) {
      query = query.in('content_type', ['post', 'scheduled']);
    }
    if (filters.includes('near-me')) {
      query = query.eq('content_type', 'live');
    }

    // Following filter
    if (filters.includes('following')) {
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

    // Category filters — keyword match on title
    const categoryFilters = filters.filter(f => f in CATEGORY_KEYWORDS);
    if (categoryFilters.length > 0) {
      const allKeywords = categoryFilters.flatMap(f => CATEGORY_KEYWORDS[f]);
      const orClauses = allKeywords.map(k => `title.ilike.%${k}%`).join(',');
      query = query.or(orClauses);
    }

    const { data, error } = await query;
    if (error) throw error;

    let results = data ?? [];

    // Client-side trending score sort
    if (tab === 'trending') {
      const now = Date.now();
      results = results.sort((a, b) => trendingScore(b, now) - trendingScore(a, now));
    }

    return enrichPosts(results);
  },

  async getPost(postId: string): Promise<Post> {
    const { data, error } = await supabase
      .from('posts')
      .select(POST_SELECT)
      .eq('id', postId)
      .single();
    if (error) throw error;

    const enriched = await enrichPosts([data]);
    return enriched[0];
  },

  async getUserPosts(userId: string, page = 0, limit = 20): Promise<Post[]> {
    const { data, error } = await supabase
      .from('posts')
      .select(POST_SELECT)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1);
    if (error) throw error;
    return enrichPosts(data ?? []);
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
    return enrichPosts(data ?? []);
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
    const posts = (data?.map((b: any) => b.post).filter(Boolean) ?? []) as Post[];
    // All bookmarked posts are by definition bookmarked; still enrich for is_liked
    return enrichPosts(posts);
  },
};

/** Compute a trending score — recency-weighted engagement */
function trendingScore(post: Post, now: number): number {
  const age = (now - new Date(post.created_at).getTime()) / 3600000; // hours
  const decay = Math.max(1, age); // min 1 hour
  const engagement =
    (post.view_count ?? 0) * 1 +
    (post.like_count ?? 0) * 2 +
    (post.comment_count ?? 0) * 3;
  // Live events get a 5x boost
  const liveBoost = post.content_type === 'live' ? 5 : 1;
  return (engagement * liveBoost) / Math.sqrt(decay);
}
