-- ============================================================================
-- MeeCrowd Migration 00003 — External Content Aggregation (READ-ONLY)
-- ============================================================================
-- Purpose: ingest public videos, livestreams, channel stats, and a small
-- comment sample from external platforms (YouTube, Twitch, Kick to start;
-- Instagram/TikTok/X/Facebook/LinkedIn ready to add by row insert later).
--
-- Design principle — EXPANSIBLE BY ROW, NOT BY MIGRATION:
-- New platform = INSERT INTO external_platforms (slug, display_name).
-- No ALTER TABLE. No new enum values. The schema doesn't care which
-- platforms exist; only the ingest workers do.
--
-- Tables (all `external_` prefixed so they don't collide with user-authored
-- `posts`/`comments`):
--   1. external_platforms             — registry of supported platforms
--   2. external_platform_credentials  — server-only API keys (service_role)
--   3. external_channels              — a channel/account on a platform
--   4. external_channel_metrics       — daily snapshot of channel stats
--   5. external_content               — videos / livestreams / clips / VODs
--   6. external_content_metrics       — time-series view/like/viewer counts
--   7. external_comments              — bounded top-comment sample
--
-- Safe to run repeatedly (every CREATE uses IF NOT EXISTS).
-- ============================================================================

-- Required extensions (already enabled in 00001 but safe to re-declare)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. external_platforms — the registry. Adding a platform = inserting a row.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.external_platforms (
  id              SERIAL PRIMARY KEY,
  slug            TEXT UNIQUE NOT NULL,        -- 'youtube', 'twitch', 'kick', ...
  display_name    TEXT NOT NULL,                -- 'YouTube', 'Twitch', 'Kick'
  logo_url        TEXT,                          -- optional CDN URL
  channel_url_template TEXT,                    -- e.g. 'https://www.youtube.com/{handle}'
  embed_url_template   TEXT,                    -- e.g. 'https://www.youtube.com/embed/{id}'
  enabled         BOOLEAN NOT NULL DEFAULT true,
  notes           TEXT,                          -- internal: API quotas, scraping caveats
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS external_platforms_updated_at ON public.external_platforms;
CREATE TRIGGER external_platforms_updated_at
  BEFORE UPDATE ON public.external_platforms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed the three Phase-1 platforms
INSERT INTO public.external_platforms (slug, display_name, channel_url_template, embed_url_template, notes)
VALUES
  ('youtube', 'YouTube',
   'https://www.youtube.com/{handle}',
   'https://www.youtube.com/embed/{id}',
   'Data API v3, 10k unit/day quota free tier. Use videos.list, channels.list, commentThreads.list.'),
  ('twitch', 'Twitch',
   'https://www.twitch.tv/{handle}',
   'https://player.twitch.tv/?channel={handle}&parent=meecrowd.com',
   'Helix API. App access token (client_credentials). GET /helix/streams for live state, /helix/users for channel, /helix/videos for VODs.'),
  ('kick', 'Kick',
   'https://kick.com/{handle}',
   'https://player.kick.com/{handle}',
   'Public endpoint kick.com/api/v2/channels/{slug}. Unstable — may need HTML scrape fallback.')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- 2. external_platform_credentials — server-side API keys (NEVER user-facing)
-- ============================================================================
-- App-level credentials (YouTube API key, Twitch client_id/secret).
-- NOT user OAuth tokens — those go in `platform_accounts` from migration 00001.
-- RLS denies all access; only service_role (used by ingest workers) reads/writes.
CREATE TABLE IF NOT EXISTS public.external_platform_credentials (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform_id     INT NOT NULL REFERENCES public.external_platforms(id) ON DELETE CASCADE,
  credential_type TEXT NOT NULL,                -- 'api_key' | 'client_id' | 'client_secret' | 'bearer_token'
  value           TEXT NOT NULL,                -- store as-is; Supabase encrypts at rest
  expires_at      TIMESTAMPTZ,                  -- nullable (for short-lived bearer tokens)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (platform_id, credential_type)
);

DROP TRIGGER IF EXISTS external_platform_credentials_updated_at ON public.external_platform_credentials;
CREATE TRIGGER external_platform_credentials_updated_at
  BEFORE UPDATE ON public.external_platform_credentials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 3. external_channels — a channel on a specific platform
-- ============================================================================
-- Channels can exist BEFORE any MeeCrowd user claims them — we ingest public
-- data first, then optionally link `user_id` when the creator signs up &
-- proves ownership.
CREATE TABLE IF NOT EXISTS public.external_channels (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform_id         INT NOT NULL REFERENCES public.external_platforms(id) ON DELETE CASCADE,
  platform_external_id TEXT NOT NULL,           -- YT: "UCxxxx", Twitch: broadcaster_id, Kick: slug
  handle              TEXT,                      -- public @username
  display_name        TEXT,
  avatar_url          TEXT,
  banner_url          TEXT,
  description         TEXT,
  channel_url         TEXT,                      -- canonical link to channel page
  country             TEXT,                      -- ISO-2 if known
  language            TEXT,
  verified            BOOLEAN NOT NULL DEFAULT false,

  -- Latest-known stats (denormalized for fast list rendering; full history
  -- lives in external_channel_metrics).
  subscriber_count    BIGINT NOT NULL DEFAULT 0, -- subs (YT) / followers (Twitch/Kick)
  total_view_count    BIGINT NOT NULL DEFAULT 0,
  video_count         INT NOT NULL DEFAULT 0,

  -- Optional MeeCrowd-user link: NULL until the creator claims this channel.
  user_id             UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  claimed_at          TIMESTAMPTZ,

  -- Platform-specific data (broadcaster_type, partner status, custom URL, ...)
  extra_data          JSONB NOT NULL DEFAULT '{}',

  last_synced_at      TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (platform_id, platform_external_id)
);

DROP TRIGGER IF EXISTS external_channels_updated_at ON public.external_channels;
CREATE TRIGGER external_channels_updated_at
  BEFORE UPDATE ON public.external_channels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_external_channels_user
  ON public.external_channels (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_external_channels_platform_handle
  ON public.external_channels (platform_id, lower(handle));
CREATE INDEX IF NOT EXISTS idx_external_channels_last_synced
  ON public.external_channels (last_synced_at NULLS FIRST);

-- ============================================================================
-- 4. external_channel_metrics — daily snapshots for growth charts
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.external_channel_metrics (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id        UUID NOT NULL REFERENCES public.external_channels(id) ON DELETE CASCADE,
  snapshot_date     DATE NOT NULL DEFAULT CURRENT_DATE,

  subscriber_count  BIGINT NOT NULL DEFAULT 0,
  total_view_count  BIGINT NOT NULL DEFAULT 0,
  video_count       INT NOT NULL DEFAULT 0,

  extra_data        JSONB NOT NULL DEFAULT '{}', -- avg_viewers (Twitch), etc.
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (channel_id, snapshot_date)             -- one row per channel per day
);

CREATE INDEX IF NOT EXISTS idx_external_channel_metrics_channel_date
  ON public.external_channel_metrics (channel_id, snapshot_date DESC);

-- ============================================================================
-- 5. external_content — videos, livestreams, clips, VODs, premieres
-- ============================================================================
-- `kind` is text (not enum) so new content types can be added without
-- migration. Code-side type union enforces the canonical set.
CREATE TABLE IF NOT EXISTS public.external_content (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id          UUID NOT NULL REFERENCES public.external_channels(id) ON DELETE CASCADE,
  platform_id         INT NOT NULL REFERENCES public.external_platforms(id) ON DELETE CASCADE,
  external_id         TEXT NOT NULL,             -- video ID / stream ID / clip slug

  kind                TEXT NOT NULL DEFAULT 'video',
                                                 -- 'video' | 'live' | 'short' | 'clip' | 'vod' | 'premiere'

  title               TEXT,
  description         TEXT,
  url                 TEXT,                       -- canonical share URL
  embed_url           TEXT,                       -- iframe-able URL for in-app player
  thumbnail_url       TEXT,
  duration_seconds    INT,                        -- NULL while live
  is_live             BOOLEAN NOT NULL DEFAULT false,
  language            TEXT,
  category            TEXT,                       -- YT category / Twitch game name

  published_at        TIMESTAMPTZ,                -- VOD publish time, or stream-start for live
  scheduled_start_at  TIMESTAMPTZ,                -- premieres / scheduled streams

  extra_data          JSONB NOT NULL DEFAULT '{}',-- tags, captions, definition, ...

  last_synced_at      TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (platform_id, external_id)
);

DROP TRIGGER IF EXISTS external_content_updated_at ON public.external_content;
CREATE TRIGGER external_content_updated_at
  BEFORE UPDATE ON public.external_content
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_external_content_channel_published
  ON public.external_content (channel_id, published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_external_content_live
  ON public.external_content (is_live, published_at DESC) WHERE is_live = true;
CREATE INDEX IF NOT EXISTS idx_external_content_platform_published
  ON public.external_content (platform_id, published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_external_content_scheduled
  ON public.external_content (scheduled_start_at) WHERE scheduled_start_at IS NOT NULL;

-- ============================================================================
-- 6. external_content_metrics — time-series view/like/viewer counts
-- ============================================================================
-- Keep these unbounded but expect a retention policy (e.g. keep last 90 days
-- at full resolution; older snapshots can be downsampled by a cron job).
CREATE TABLE IF NOT EXISTS public.external_content_metrics (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_id            UUID NOT NULL REFERENCES public.external_content(id) ON DELETE CASCADE,
  snapshot_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  view_count            BIGINT,
  like_count            BIGINT,
  dislike_count         BIGINT,                    -- nullable (most platforms hide)
  comment_count         BIGINT,
  share_count           BIGINT,                    -- rarely available; nullable
  current_viewer_count  INT,                       -- live only

  extra_data            JSONB NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_external_content_metrics_content_time
  ON public.external_content_metrics (content_id, snapshot_at DESC);

-- ============================================================================
-- 7. external_comments — bounded sample of top comments per content
-- ============================================================================
-- Intent: surface ~10–20 comments per video for in-app reading. We do NOT
-- mirror full comment threads. "View all comments" deep-links to the platform.
CREATE TABLE IF NOT EXISTS public.external_comments (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_id            UUID NOT NULL REFERENCES public.external_content(id) ON DELETE CASCADE,
  external_id           TEXT NOT NULL,            -- platform's comment ID

  author_external_id    TEXT,
  author_handle         TEXT,
  author_display_name   TEXT,
  author_avatar_url     TEXT,

  body                  TEXT NOT NULL,
  like_count            INT NOT NULL DEFAULT 0,
  reply_count           INT NOT NULL DEFAULT 0,

  posted_at             TIMESTAMPTZ,
  fetched_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (content_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_external_comments_content_top
  ON public.external_comments (content_id, like_count DESC, posted_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
-- Public-facing tables (platforms, channels, content, metrics, comments):
--   Anyone authenticated can SELECT — this is public third-party content.
--   Only service_role can INSERT/UPDATE/DELETE — only ingest workers write.
--
-- Credentials table:
--   No public access whatsoever — service_role only.
--
-- Note: "service_role" bypasses RLS in Supabase, so we do NOT need policies
-- for INSERT/UPDATE/DELETE on the public tables. Absence of a policy = denial.

ALTER TABLE public.external_platforms             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_platform_credentials  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_channels              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_channel_metrics       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_content               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_content_metrics       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_comments              ENABLE ROW LEVEL SECURITY;

-- Public read policies
DROP POLICY IF EXISTS "external_platforms_select_all" ON public.external_platforms;
CREATE POLICY "external_platforms_select_all" ON public.external_platforms
  FOR SELECT TO authenticated USING (enabled = true);

DROP POLICY IF EXISTS "external_channels_select_all" ON public.external_channels;
CREATE POLICY "external_channels_select_all" ON public.external_channels
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "external_channel_metrics_select_all" ON public.external_channel_metrics;
CREATE POLICY "external_channel_metrics_select_all" ON public.external_channel_metrics
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "external_content_select_all" ON public.external_content;
CREATE POLICY "external_content_select_all" ON public.external_content
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "external_content_metrics_select_all" ON public.external_content_metrics;
CREATE POLICY "external_content_metrics_select_all" ON public.external_content_metrics
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "external_comments_select_all" ON public.external_comments;
CREATE POLICY "external_comments_select_all" ON public.external_comments
  FOR SELECT TO authenticated USING (true);

-- Channel claim: a creator can claim an UNCLAIMED channel by setting user_id
-- to themselves (proof-of-ownership flow happens in app code BEFORE the row
-- is updated; the policy is the last line of defense).
DROP POLICY IF EXISTS "external_channels_claim_own" ON public.external_channels;
CREATE POLICY "external_channels_claim_own" ON public.external_channels
  FOR UPDATE TO authenticated
  USING (user_id IS NULL OR user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Credentials: no policies = no access for authenticated. service_role bypasses.
-- (Defensive: explicitly deny SELECT for authenticated.)
DROP POLICY IF EXISTS "external_platform_credentials_deny_all" ON public.external_platform_credentials;
CREATE POLICY "external_platform_credentials_deny_all" ON public.external_platform_credentials
  FOR SELECT TO authenticated USING (false);

-- ============================================================================
-- HELPER VIEW — `live_now` for app feed
-- ============================================================================
-- Convenience view: every currently-live stream with channel info joined.
-- Materialize later if it becomes a hotspot; for now a regular view is fine.
CREATE OR REPLACE VIEW public.external_live_now AS
SELECT
  c.id              AS content_id,
  c.title,
  c.url,
  c.embed_url,
  c.thumbnail_url,
  c.published_at    AS started_at,
  c.category,
  ch.id             AS channel_id,
  ch.handle,
  ch.display_name   AS channel_name,
  ch.avatar_url     AS channel_avatar,
  ch.subscriber_count,
  p.slug            AS platform_slug,
  p.display_name    AS platform_name,
  -- latest viewer count from metrics (subquery, lateral join)
  m.current_viewer_count
FROM public.external_content c
JOIN public.external_channels ch ON ch.id = c.channel_id
JOIN public.external_platforms p ON p.id = c.platform_id
LEFT JOIN LATERAL (
  SELECT current_viewer_count
  FROM public.external_content_metrics
  WHERE content_id = c.id
  ORDER BY snapshot_at DESC
  LIMIT 1
) m ON true
WHERE c.is_live = true
ORDER BY m.current_viewer_count DESC NULLS LAST;

-- View inherits RLS from underlying tables. Grant SELECT explicitly.
GRANT SELECT ON public.external_live_now TO authenticated;

-- ============================================================================
-- Done. Next steps (NOT in this migration):
--   - Build YouTube/Twitch/Kick ingest workers (Edge Functions)
--   - Schedule them via pg_cron or Supabase Scheduled Functions
--   - INSERT API keys into external_platform_credentials via service_role
--   - Add app UI: profile aggregation, embed player, comment reader
-- ============================================================================
