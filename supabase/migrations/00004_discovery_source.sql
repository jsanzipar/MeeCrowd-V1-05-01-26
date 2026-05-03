-- ============================================================================
-- Migration 00004 — discovery_source column for auto-discovered content
-- ============================================================================
-- Adds a column tracking how each channel/content row first entered the DB.
-- This drives the cleanup behavior in the live-metrics refresh worker:
--
--   * 'manual'        — added via supabase/ingest_channels.json (manual config)
--   * 'live_trending' — auto-discovered from YouTube top-live API
--   * (future)        — additional sources can be added without migration
--
-- Cleanup rule (enforced by refresh_live_metrics):
--   When a stream ends, if BOTH conditions hold the row is DELETED:
--     content.discovery_source = 'live_trending'
--     channel.user_id IS NULL  (creator hasn't claimed the channel)
--   Otherwise the row stays and is_live is flipped to false (becomes "past").
-- ============================================================================

ALTER TABLE public.external_channels
  ADD COLUMN IF NOT EXISTS discovery_source TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE public.external_content
  ADD COLUMN IF NOT EXISTS discovery_source TEXT NOT NULL DEFAULT 'manual';

-- Partial indexes on the non-default value so cleanup queries are O(log n)
-- on the small "trending" subset, not the whole table.
CREATE INDEX IF NOT EXISTS idx_external_channels_discovery
  ON public.external_channels (discovery_source) WHERE discovery_source != 'manual';

CREATE INDEX IF NOT EXISTS idx_external_content_discovery
  ON public.external_content (discovery_source) WHERE discovery_source != 'manual';
