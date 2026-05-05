-- ============================================================================
-- Migration 00005 — Creator Sync (OAuth + visibility + comment paging)
-- ============================================================================
-- Adds the schema needed to let MeeCrowd users link their YouTube / Kick
-- accounts via OAuth, ingest their full back-catalog as content rows on
-- their profile, route private/unlisted videos to a Personal tab, and
-- support paginated comment fetching from the platform APIs.
--
-- New objects:
--   * external_content.visibility column        — 'public' | 'unlisted' | 'private'
--   * external_comments.next_page_token column — cached cursor for "load more"
--   * user_oauth_tokens table                  — per-user OAuth tokens (service_role only)
-- ============================================================================

-- ── 1) Visibility on external content ───────────────────────────────────────
-- Drives which profile tab a video appears in:
--   public   → main profile feed (visible to everyone)
--   unlisted → Personal tab only (visible only to channel owner)
--   private  → Personal tab only (visible only to channel owner)
-- Backfilled from existing extra_data->>'privacyStatus' where present.
ALTER TABLE public.external_content
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'unlisted', 'private'));

-- One-time migration of any existing privacyStatus we'd already captured.
UPDATE public.external_content
   SET visibility = extra_data->>'privacyStatus'
 WHERE visibility = 'public'
   AND extra_data ? 'privacyStatus'
   AND extra_data->>'privacyStatus' IN ('unlisted', 'private');

CREATE INDEX IF NOT EXISTS idx_external_content_visibility
  ON public.external_content (visibility) WHERE visibility != 'public';

-- ── 2) Comment paging cursor ────────────────────────────────────────────────
-- YouTube's commentThreads.list returns a nextPageToken on every call.
-- Storing the token on each comment lets the "Load more" UX continue from
-- the last fetched page without recalling the entire thread.
ALTER TABLE public.external_comments
  ADD COLUMN IF NOT EXISTS next_page_token TEXT;

-- ── 3) User OAuth tokens table ──────────────────────────────────────────────
-- Per-user, per-platform OAuth credentials. Distinct from
-- external_platform_credentials (which holds APP-level creds like the
-- YouTube API key or Kick OAuth client secret).
--
-- Tokens are sensitive — RLS denies all access. Only service_role (used
-- by Edge Functions) can read/write.
CREATE TABLE IF NOT EXISTS public.user_oauth_tokens (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform_id     INT NOT NULL REFERENCES public.external_platforms(id) ON DELETE CASCADE,

  -- Optional reverse-link to the channel this token authenticates for.
  -- Set after we've identified which channel(s) the user owns. NULL while
  -- the OAuth handshake is in progress but the channel hasn't been
  -- looked up yet.
  channel_id      UUID REFERENCES public.external_channels(id) ON DELETE SET NULL,

  access_token    TEXT NOT NULL,
  refresh_token   TEXT,
  token_type      TEXT NOT NULL DEFAULT 'Bearer',
  scope           TEXT,                                -- granted scopes (space-separated)
  expires_at      TIMESTAMPTZ,                         -- nullable if non-expiring

  -- Metadata returned by the provider during OAuth, useful for debugging
  -- and showing in the "Connected accounts" UI without re-fetching.
  account_meta    JSONB NOT NULL DEFAULT '{}',         -- { id, handle, display_name, avatar_url }

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, platform_id)
);

DROP TRIGGER IF EXISTS user_oauth_tokens_updated_at ON public.user_oauth_tokens;
CREATE TRIGGER user_oauth_tokens_updated_at
  BEFORE UPDATE ON public.user_oauth_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_user_oauth_tokens_user
  ON public.user_oauth_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_user_oauth_tokens_channel
  ON public.user_oauth_tokens (channel_id) WHERE channel_id IS NOT NULL;

ALTER TABLE public.user_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Authenticated users can SEE the existence + non-secret metadata of THEIR
-- own connections (so the UI can show "Connected as @handle"). They cannot
-- read access_token or refresh_token (we'll expose only safe columns via
-- a view below).
DROP POLICY IF EXISTS "user_oauth_tokens_owner_read_metadata" ON public.user_oauth_tokens;
CREATE POLICY "user_oauth_tokens_owner_read_metadata" ON public.user_oauth_tokens
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- service_role bypasses RLS and is the only path that can read/write
-- the actual token values via the Supabase client in Edge Functions.

-- Safe view for the app: exposes connection state + handle but NOT tokens.
CREATE OR REPLACE VIEW public.my_creator_connections AS
SELECT
  t.id,
  t.user_id,
  p.slug                                AS platform_slug,
  p.display_name                        AS platform_name,
  t.account_meta->>'handle'             AS handle,
  t.account_meta->>'display_name'       AS display_name,
  t.account_meta->>'avatar_url'         AS avatar_url,
  t.account_meta->>'channel_id'         AS channel_external_id,
  t.channel_id                          AS internal_channel_id,
  t.scope,
  (t.expires_at IS NULL OR t.expires_at > now()) AS is_active,
  t.created_at,
  t.updated_at
FROM public.user_oauth_tokens t
JOIN public.external_platforms p ON p.id = t.platform_id;

GRANT SELECT ON public.my_creator_connections TO authenticated;

-- ── 4) Helper: query the merged feed for a profile ─────────────────────────
-- Combines (a) MeeCrowd-native posts authored by the user with
-- (b) external_content from channels that user has claimed. Returns enough
-- columns for the profile feed to render either type. The app distinguishes
-- by `source = 'post' | 'external'`.
CREATE OR REPLACE VIEW public.profile_feed AS
  SELECT
    'post'::text             AS source,
    p.id                     AS id,
    p.user_id                AS owner_user_id,
    p.title                  AS title,
    p.body                   AS description,
    p.created_at             AS created_at,
    p.starts_at              AS starts_at,
    NULL::text               AS visibility,
    NULL::text               AS platform_slug,
    NULL::int                AS platform_id,
    NULL::uuid               AS channel_id,
    NULL::text               AS embed_url,
    NULL::text               AS thumbnail_url,
    p.is_recurring           AS is_recurring,
    p.content_type::text     AS content_type
  FROM public.posts p
UNION ALL
  SELECT
    'external'::text         AS source,
    c.id                     AS id,
    ch.user_id               AS owner_user_id,
    c.title                  AS title,
    c.description            AS description,
    COALESCE(c.published_at, c.created_at) AS created_at,
    c.scheduled_start_at     AS starts_at,
    c.visibility             AS visibility,
    pl.slug                  AS platform_slug,
    c.platform_id            AS platform_id,
    c.channel_id             AS channel_id,
    c.embed_url              AS embed_url,
    c.thumbnail_url          AS thumbnail_url,
    false                    AS is_recurring,
    c.kind                   AS content_type
  FROM public.external_content c
  JOIN public.external_channels   ch ON ch.id = c.channel_id
  JOIN public.external_platforms  pl ON pl.id = c.platform_id
  WHERE ch.user_id IS NOT NULL;

GRANT SELECT ON public.profile_feed TO authenticated;
