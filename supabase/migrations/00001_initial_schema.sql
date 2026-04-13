-- ============================================================================
-- MeeCrowd V1 — Full Database Schema
-- ============================================================================
-- Run this against your Supabase project via SQL Editor or CLI.
-- Covers: profiles, platform accounts + OAuth, platform metrics (current +
-- historical), posts, comments, likes, bookmarks, follows, notifications.
-- All tables have Row Level Security enabled.
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. PROFILES — extends auth.users
-- ============================================================================
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url  TEXT,
  bio         TEXT,
  website     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data ->> 'display_name',
             NEW.raw_user_meta_data ->> 'username',
             split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 2. PLATFORM ACCOUNTS — OAuth connections to YouTube, Twitch, Kick, Instagram
-- ============================================================================
-- Each user can link one account per platform.
-- Stores OAuth tokens so we can fetch their metrics from each platform API.
DO $$ BEGIN
  CREATE TYPE public.platform_type AS ENUM ('youtube', 'twitch', 'kick', 'instagram');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE public.platform_accounts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform          public.platform_type NOT NULL,
  platform_user_id  TEXT NOT NULL,           -- their ID on that platform
  platform_username TEXT NOT NULL,           -- their display handle
  platform_avatar   TEXT,                    -- avatar from that platform
  access_token      TEXT,                    -- OAuth access token (encrypted at rest by Supabase)
  refresh_token     TEXT,                    -- OAuth refresh token
  token_expires_at  TIMESTAMPTZ,            -- when access_token expires
  scopes            TEXT[],                  -- granted OAuth scopes
  is_verified       BOOLEAN NOT NULL DEFAULT false,
  connected_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, platform),               -- one account per platform per user
  UNIQUE (platform, platform_user_id)       -- one MeeCrowd link per platform account
);

CREATE TRIGGER platform_accounts_updated_at
  BEFORE UPDATE ON public.platform_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Index for quick lookups
CREATE INDEX idx_platform_accounts_user ON public.platform_accounts(user_id);

-- ============================================================================
-- 3. PLATFORM METRICS — current snapshot per connected account
-- ============================================================================
-- Stores the latest metrics fetched from each platform API.
-- Common fields cover cross-platform stats; extra_data has platform-specific ones.
CREATE TABLE public.platform_metrics (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform_account_id  UUID NOT NULL UNIQUE REFERENCES public.platform_accounts(id) ON DELETE CASCADE,
  user_id              UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform             public.platform_type NOT NULL,

  -- Universal metrics (all platforms report some form of these)
  follower_count       BIGINT NOT NULL DEFAULT 0,   -- subscribers (YT), followers (Twitch/Kick/IG)
  following_count      BIGINT NOT NULL DEFAULT 0,   -- accounts they follow
  total_view_count     BIGINT NOT NULL DEFAULT 0,   -- lifetime views
  total_like_count     BIGINT NOT NULL DEFAULT 0,   -- lifetime likes received
  total_comment_count  BIGINT NOT NULL DEFAULT 0,   -- lifetime comments received
  media_count          INT NOT NULL DEFAULT 0,       -- videos (YT), clips (Twitch), posts (IG)
  paid_subscriber_count INT NOT NULL DEFAULT 0,      -- paid subs (Twitch), members (YT)

  -- Platform-specific data (varies per platform)
  extra_data           JSONB NOT NULL DEFAULT '{}',
  -- YouTube: { "channel_id", "playlist_id", "avg_view_duration", "estimated_revenue" }
  -- Twitch:  { "broadcaster_type", "stream_language", "avg_viewers", "peak_viewers" }
  -- Kick:    { "channel_slug", "chatroom_id", "avg_viewers" }
  -- IG:      { "account_type", "engagement_rate", "reach", "impressions" }

  fetched_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_platform_metrics_user ON public.platform_metrics(user_id);

-- ============================================================================
-- 4. PLATFORM METRICS HISTORY — daily snapshots for growth tracking
-- ============================================================================
-- Stored once per day per account to build growth charts and crowd trends.
CREATE TABLE public.platform_metrics_history (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform_account_id  UUID NOT NULL REFERENCES public.platform_accounts(id) ON DELETE CASCADE,
  user_id              UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform             public.platform_type NOT NULL,
  snapshot_date        DATE NOT NULL DEFAULT CURRENT_DATE,

  follower_count       BIGINT NOT NULL DEFAULT 0,
  following_count      BIGINT NOT NULL DEFAULT 0,
  total_view_count     BIGINT NOT NULL DEFAULT 0,
  total_like_count     BIGINT NOT NULL DEFAULT 0,
  total_comment_count  BIGINT NOT NULL DEFAULT 0,
  media_count          INT NOT NULL DEFAULT 0,
  paid_subscriber_count INT NOT NULL DEFAULT 0,
  extra_data           JSONB NOT NULL DEFAULT '{}',

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (platform_account_id, snapshot_date)  -- one snapshot per account per day
);

CREATE INDEX idx_metrics_history_user_date ON public.platform_metrics_history(user_id, snapshot_date DESC);

-- ============================================================================
-- 5. POSTS
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE public.content_type AS ENUM ('post', 'live', 'scheduled', 'clip');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE public.posts (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform       public.platform_type NOT NULL,
  content_type   public.content_type NOT NULL DEFAULT 'post',
  title          TEXT NOT NULL,
  body           TEXT,
  thumbnail_url  TEXT,
  external_url   TEXT,                     -- link to original content on platform
  like_count     INT NOT NULL DEFAULT 0,
  comment_count  INT NOT NULL DEFAULT 0,
  view_count     INT NOT NULL DEFAULT 0,
  is_featured    BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER posts_updated_at
  BEFORE UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_posts_user ON public.posts(user_id);
CREATE INDEX idx_posts_feed ON public.posts(created_at DESC);
CREATE INDEX idx_posts_featured ON public.posts(is_featured, created_at DESC) WHERE is_featured = true;

-- ============================================================================
-- 6. COMMENTS
-- ============================================================================
CREATE TABLE public.comments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id     UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  like_count  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_comments_post ON public.comments(post_id, created_at);

-- Trigger: increment post comment_count
CREATE OR REPLACE FUNCTION public.handle_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_comment_change
  AFTER INSERT OR DELETE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_comment_count();

-- ============================================================================
-- 7. POST LIKES
-- ============================================================================
CREATE TABLE public.post_likes (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id    UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (post_id, user_id)
);

-- Trigger: increment/decrement post like_count
CREATE OR REPLACE FUNCTION public.handle_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_like_change
  AFTER INSERT OR DELETE ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.handle_like_count();

-- ============================================================================
-- 8. BOOKMARKS
-- ============================================================================
CREATE TABLE public.bookmarks (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id    UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (post_id, user_id)
);

CREATE INDEX idx_bookmarks_user ON public.bookmarks(user_id, created_at DESC);

-- ============================================================================
-- 9. FOLLOWS
-- ============================================================================
CREATE TABLE public.follows (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  follower_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (follower_id, following_id),
  CHECK (follower_id <> following_id)  -- can't follow yourself
);

CREATE INDEX idx_follows_follower ON public.follows(follower_id);
CREATE INDEX idx_follows_following ON public.follows(following_id);

-- ============================================================================
-- 10. NOTIFICATIONS
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE public.notification_type AS ENUM ('like', 'comment', 'follow', 'mention', 'featured', 'platform_sync');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE public.notifications (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  type       public.notification_type NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  data       JSONB,                        -- { post_id, comment_id, etc. }
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON public.notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON public.notifications(user_id) WHERE read_at IS NULL;

-- ============================================================================
-- 11. CROWD STATS VIEW — aggregated follower counts across platforms
-- ============================================================================
-- Materialized for performance; refresh after each metrics sync.
CREATE MATERIALIZED VIEW public.crowd_stats AS
SELECT
  pm.user_id,
  COALESCE(SUM(pm.follower_count) FILTER (WHERE pm.platform = 'youtube'), 0) AS youtube,
  COALESCE(SUM(pm.follower_count) FILTER (WHERE pm.platform = 'twitch'), 0)  AS twitch,
  COALESCE(SUM(pm.follower_count) FILTER (WHERE pm.platform = 'kick'), 0)    AS kick,
  COALESCE(SUM(pm.follower_count) FILTER (WHERE pm.platform = 'instagram'), 0) AS instagram,
  COALESCE(SUM(pm.follower_count), 0) AS total
FROM public.platform_metrics pm
GROUP BY pm.user_id;

CREATE UNIQUE INDEX idx_crowd_stats_user ON public.crowd_stats(user_id);

-- Helper function to refresh the materialized view
CREATE OR REPLACE FUNCTION public.refresh_crowd_stats()
RETURNS VOID AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.crowd_stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 12. ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by everyone"
  ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Platform Accounts (sensitive — only owner sees tokens)
ALTER TABLE public.platform_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own platform accounts"
  ON public.platform_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own platform accounts"
  ON public.platform_accounts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Platform Metrics (public read — this is the "crowd" data)
ALTER TABLE public.platform_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform metrics are viewable by everyone"
  ON public.platform_metrics FOR SELECT USING (true);

CREATE POLICY "Only system can insert/update metrics"
  ON public.platform_metrics FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Only system can update metrics"
  ON public.platform_metrics FOR UPDATE
  USING (auth.uid() = user_id);

-- Platform Metrics History (public read)
ALTER TABLE public.platform_metrics_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Metrics history viewable by everyone"
  ON public.platform_metrics_history FOR SELECT USING (true);

-- Posts
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Posts are viewable by everyone"
  ON public.posts FOR SELECT USING (true);

CREATE POLICY "Users can create their own posts"
  ON public.posts FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own posts"
  ON public.posts FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own posts"
  ON public.posts FOR DELETE USING (auth.uid() = user_id);

-- Comments
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comments are viewable by everyone"
  ON public.comments FOR SELECT USING (true);

CREATE POLICY "Authenticated users can comment"
  ON public.comments FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comments"
  ON public.comments FOR DELETE USING (auth.uid() = user_id);

-- Post Likes
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Likes are viewable by everyone"
  ON public.post_likes FOR SELECT USING (true);

CREATE POLICY "Authenticated users can like"
  ON public.post_likes FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike their own likes"
  ON public.post_likes FOR DELETE USING (auth.uid() = user_id);

-- Bookmarks (private to user)
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own bookmarks"
  ON public.bookmarks FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own bookmarks"
  ON public.bookmarks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Follows
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Follows are viewable by everyone"
  ON public.follows FOR SELECT USING (true);

CREATE POLICY "Users can follow"
  ON public.follows FOR INSERT WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can unfollow"
  ON public.follows FOR DELETE USING (auth.uid() = follower_id);

-- Notifications (private to user)
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own notifications"
  ON public.notifications FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
