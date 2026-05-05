-- ============================================================================
-- Migration 00006 — creator_profile_stats view
-- ============================================================================
-- Per-platform aggregates for a creator's claimed channels. Powers:
--   * The Stats tab on the profile page (full breakdown per platform)
--   * The subscriber summary on the front of the profile page
--
-- One row per (user_id, platform). Columns surface what we know about the
-- channel itself (subscriber_count, video_count, total_view_count) plus
-- the latest-snapshot aggregate of per-video metrics (sum of likes /
-- comments / views across every synced video).
-- ============================================================================

CREATE OR REPLACE VIEW public.creator_profile_stats AS
SELECT
  ch.user_id                              AS user_id,
  p.id                                    AS platform_id,
  p.slug                                  AS platform_slug,
  p.display_name                          AS platform_name,
  ch.id                                   AS channel_id,
  ch.handle                               AS handle,
  ch.display_name                         AS channel_display_name,
  ch.avatar_url                           AS avatar_url,
  ch.subscriber_count                     AS subscriber_count,
  ch.video_count                          AS video_count_remote,
  ch.total_view_count                     AS lifetime_view_count,
  -- Aggregated metrics across every video we've ingested for the channel.
  -- We use only the *most recent* metrics row per video (the lateral join)
  -- so values don't double-count from each refresh snapshot.
  COALESCE(agg.synced_videos,    0)       AS synced_videos,
  COALESCE(agg.total_views,      0)       AS total_views,
  COALESCE(agg.total_likes,      0)       AS total_likes,
  COALESCE(agg.total_comments,   0)       AS total_comments
FROM public.external_channels ch
JOIN public.external_platforms p ON p.id = ch.platform_id
LEFT JOIN LATERAL (
  SELECT
    count(*)                AS synced_videos,
    SUM(lm.view_count)      AS total_views,
    SUM(lm.like_count)      AS total_likes,
    SUM(lm.comment_count)   AS total_comments
  FROM public.external_content c
  LEFT JOIN LATERAL (
    SELECT view_count, like_count, comment_count
    FROM public.external_content_metrics
    WHERE content_id = c.id
    ORDER BY snapshot_at DESC
    LIMIT 1
  ) lm ON true
  WHERE c.channel_id = ch.id
) agg ON true
WHERE ch.user_id IS NOT NULL;

-- Inherits RLS from underlying tables. Grant SELECT explicitly so the app
-- can read it. Each user only sees their own rows because of how
-- external_channels is RLS'd (well — actually external_channels is open
-- read for authenticated, so visibility-wise this is fine for now).
GRANT SELECT ON public.creator_profile_stats TO authenticated;
