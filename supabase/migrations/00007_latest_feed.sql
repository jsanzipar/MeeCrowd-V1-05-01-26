-- ============================================================================
-- Migration 00007 — latest_feed view
-- ============================================================================
-- The Latest tab on the feed home: a cross-user merged stream of recent
-- native MeeCrowd posts and non-live external content. Sorted client-side
-- by created_at desc.
--
-- One row per item, with a `source` discriminator the app uses to render
-- via the right card type. Mirrors the per-user `profile_feed` view in
-- shape but isn't user-scoped.
--
-- Inclusion rules:
--   * Native posts:    everything that isn't a live broadcast (we keep the
--                      live ones in the Trending tab).
--   * External content: must be NOT currently live AND publicly visible.
--                      We deliberately keep ALL non-live public external
--                      rows — both creator-synced VODs and manual ingests
--                      like Lofi Girl. Auto-discovered live_trending
--                      content that ended without being claimed has
--                      already been deleted by refresh-live-metrics, so
--                      this view doesn't see it.
-- ============================================================================

CREATE OR REPLACE VIEW public.latest_feed AS
SELECT
  'post'::text                     AS source,
  p.id                             AS id,
  p.user_id                        AS owner_user_id,
  p.title                          AS title,
  p.body                           AS description,
  p.created_at                     AS created_at,
  p.starts_at                      AS starts_at,
  p.thumbnail_url                  AS thumbnail_url,
  p.platform::text                 AS platform_slug,
  p.content_type::text             AS kind,
  p.is_recurring                   AS is_recurring,
  NULL::text                       AS embed_url,
  NULL::uuid                       AS channel_id,
  NULL::text                       AS channel_handle,
  NULL::text                       AS channel_avatar
FROM public.posts p
WHERE p.content_type IN ('post', 'scheduled')   -- exclude 'live' which is handled by Trending

UNION ALL

SELECT
  'external'::text                 AS source,
  c.id                             AS id,
  ch.user_id                       AS owner_user_id,
  c.title                          AS title,
  c.description                    AS description,
  COALESCE(c.published_at, c.created_at) AS created_at,
  c.scheduled_start_at             AS starts_at,
  c.thumbnail_url                  AS thumbnail_url,
  pl.slug                          AS platform_slug,
  c.kind                           AS kind,
  false                            AS is_recurring,
  c.embed_url                      AS embed_url,
  ch.id                            AS channel_id,
  ch.handle                        AS channel_handle,
  ch.avatar_url                    AS channel_avatar
FROM public.external_content c
JOIN public.external_channels   ch ON ch.id = c.channel_id
JOIN public.external_platforms  pl ON pl.id = c.platform_id
WHERE c.is_live = false
  AND c.visibility = 'public';

GRANT SELECT ON public.latest_feed TO authenticated;
