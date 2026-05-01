-- ============================================================================
-- MeeCrowd Migration 00002 — Launch Compliance + Schema Drift
-- ============================================================================
-- Adds everything needed to pass Apple App Review + fix RLS holes found in
-- the pre-launch audit. Safe to run repeatedly (all IF NOT EXISTS / IF EXISTS).
--
-- What this migration covers:
--   1. Extend platform_type enum to include 'meecrowd', 'x', 'tiktok',
--      'facebook', 'linkedin' (code already writes these; DB previously didn't).
--   2. Add missing columns on posts: media_urls, starts_at, ends_at,
--      is_recurring, recurrence_rule, deleted_at (code writes these today).
--   3. Add indexes for feed + scheduling queries.
--   4. Add profile columns for account deletion + age + terms acceptance.
--   5. New tables: user_blocks, content_reports (Apple 1.2 — UGC requires
--      Block + Report).
--   6. Tighten RLS on platform_metrics (prevent users inflating others' stats).
--   7. Add INSERT + DELETE policies on notifications.
--   8. Add UPDATE policy on comments (edit-your-own).
--   9. Add DELETE policy on profiles (self-delete).
--   10. RPC: request_account_deletion() — Apple 5.1.1(v) hard requirement.
-- ============================================================================

-- ============================================================================
-- 1. Extend platform_type enum
-- ============================================================================
ALTER TYPE public.platform_type ADD VALUE IF NOT EXISTS 'meecrowd';
ALTER TYPE public.platform_type ADD VALUE IF NOT EXISTS 'x';
ALTER TYPE public.platform_type ADD VALUE IF NOT EXISTS 'tiktok';
ALTER TYPE public.platform_type ADD VALUE IF NOT EXISTS 'facebook';
ALTER TYPE public.platform_type ADD VALUE IF NOT EXISTS 'linkedin';

-- ============================================================================
-- 2. Posts — add missing columns the app already writes
-- ============================================================================
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS media_urls       TEXT[],
  ADD COLUMN IF NOT EXISTS starts_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ends_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_recurring     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_rule  TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at       TIMESTAMPTZ;

-- ============================================================================
-- 3. Indexes for feed + scheduling + content_type filtering
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_posts_platform_created
  ON public.posts(platform, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_posts_content_type_created
  ON public.posts(content_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_posts_starts_at
  ON public.posts(starts_at)
  WHERE starts_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_posts_not_deleted
  ON public.posts(created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_comments_user
  ON public.comments(user_id);

-- ============================================================================
-- 4. Profiles — deletion + age + terms fields
-- ============================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deleted_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delete_requested_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS date_of_birth         DATE,
  ADD COLUMN IF NOT EXISTS terms_accepted_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terms_version         TEXT;

-- Allow users to DELETE their own profile row (used by account-deletion RPC).
DROP POLICY IF EXISTS "Users can delete their own profile" ON public.profiles;
CREATE POLICY "Users can delete their own profile"
  ON public.profiles FOR DELETE USING (auth.uid() = id);

-- ============================================================================
-- 5. USER BLOCKS — Apple 1.2 requires Block for any UGC app
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker
  ON public.user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked
  ON public.user_blocks(blocked_id);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own blocks" ON public.user_blocks;
CREATE POLICY "Users can view their own blocks"
  ON public.user_blocks FOR SELECT USING (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "Users can create blocks" ON public.user_blocks;
CREATE POLICY "Users can create blocks"
  ON public.user_blocks FOR INSERT WITH CHECK (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "Users can unblock" ON public.user_blocks;
CREATE POLICY "Users can unblock"
  ON public.user_blocks FOR DELETE USING (auth.uid() = blocker_id);

-- ============================================================================
-- 6. CONTENT REPORTS — Apple 1.2 requires Report for any UGC app
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE public.report_target_type AS ENUM ('post', 'comment', 'profile');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.report_reason AS ENUM (
    'spam',
    'harassment',
    'hate',
    'violence',
    'sexual',
    'csam',
    'ip_infringement',
    'impersonation',
    'self_harm',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.report_status AS ENUM ('pending', 'reviewing', 'resolved', 'dismissed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.content_reports (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_type  public.report_target_type NOT NULL,
  target_id    UUID NOT NULL,
  reason       public.report_reason NOT NULL,
  details      TEXT,
  status       public.report_status NOT NULL DEFAULT 'pending',
  reviewed_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_reports_status
  ON public.content_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_reports_target
  ON public.content_reports(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_content_reports_reporter
  ON public.content_reports(reporter_id);

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Reporters can view their own reports" ON public.content_reports;
CREATE POLICY "Reporters can view their own reports"
  ON public.content_reports FOR SELECT USING (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Authenticated users can create reports" ON public.content_reports;
CREATE POLICY "Authenticated users can create reports"
  ON public.content_reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);

-- ============================================================================
-- 7. Tighten platform_metrics RLS
-- Previously: any user could INSERT metrics with their user_id but ANY
-- platform_account_id, inflating another user's crowd stats.
-- ============================================================================
DROP POLICY IF EXISTS "Only system can insert/update metrics" ON public.platform_metrics;
DROP POLICY IF EXISTS "Only system can update metrics" ON public.platform_metrics;
DROP POLICY IF EXISTS "Owner can insert their metrics" ON public.platform_metrics;
DROP POLICY IF EXISTS "Owner can update their metrics" ON public.platform_metrics;

CREATE POLICY "Owner can insert their metrics"
  ON public.platform_metrics FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.platform_accounts
       WHERE id = platform_account_id
         AND user_id = auth.uid()
    )
  );

CREATE POLICY "Owner can update their metrics"
  ON public.platform_metrics FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.platform_accounts
       WHERE id = platform_account_id
         AND user_id = auth.uid()
    )
  );

-- Same for history table
DROP POLICY IF EXISTS "Owner can insert their metrics history" ON public.platform_metrics_history;
CREATE POLICY "Owner can insert their metrics history"
  ON public.platform_metrics_history FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.platform_accounts
       WHERE id = platform_account_id
         AND user_id = auth.uid()
    )
  );

-- ============================================================================
-- 8. Notifications — add INSERT + DELETE policies
-- ============================================================================
DROP POLICY IF EXISTS "Actors can create notifications" ON public.notifications;
CREATE POLICY "Actors can create notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (
    auth.uid() = actor_id
    AND auth.uid() <> user_id  -- don't notify yourself
  );

DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
CREATE POLICY "Users can delete their own notifications"
  ON public.notifications FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- 9. Comments — allow editing your own comment
-- ============================================================================
DROP POLICY IF EXISTS "Users can update their own comments" ON public.comments;
CREATE POLICY "Users can update their own comments"
  ON public.comments FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 10. Account Deletion RPC — Apple 5.1.1(v) hard requirement since 2022
-- Wipes user PII + owned content. auth.users row is left for a trailing
-- server-side purge (needs service role) — but PII is gone immediately.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.request_account_deletion()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1. Anonymize profile immediately (PII purge for GDPR + Apple)
  UPDATE public.profiles
    SET delete_requested_at = now(),
        deleted_at          = now(),
        username            = 'deleted_' || substring(uid::text FROM 1 FOR 8),
        display_name        = '[Deleted User]',
        avatar_url          = NULL,
        bio                 = NULL,
        website             = NULL,
        date_of_birth       = NULL
    WHERE id = uid;

  -- 2. Delete user-owned content + private rows
  DELETE FROM public.bookmarks        WHERE user_id = uid;
  DELETE FROM public.post_likes       WHERE user_id = uid;
  DELETE FROM public.follows          WHERE follower_id = uid OR following_id = uid;
  DELETE FROM public.comments         WHERE user_id = uid;
  DELETE FROM public.posts            WHERE user_id = uid;
  DELETE FROM public.notifications    WHERE user_id = uid OR actor_id = uid;
  DELETE FROM public.platform_accounts WHERE user_id = uid;
  DELETE FROM public.user_blocks      WHERE blocker_id = uid OR blocked_id = uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_account_deletion() TO authenticated;

-- ============================================================================
-- 11. Helper RPC: check_if_blocked(other_user_id)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_blocked(other_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks
     WHERE (blocker_id = auth.uid() AND blocked_id = other_user_id)
        OR (blocker_id = other_user_id AND blocked_id = auth.uid())
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_blocked(UUID) TO authenticated;

-- ============================================================================
-- 12. Post search — safer FTS index (optional, fixes leading-wildcard scans)
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_posts_title_trgm
  ON public.posts USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_profiles_username_trgm
  ON public.profiles USING gin (username gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_profiles_display_name_trgm
  ON public.profiles USING gin (display_name gin_trgm_ops);

-- ============================================================================
-- Done.
-- Next steps (must run OUTSIDE this migration via service role / dashboard):
--   - Storage bucket policies for 'avatars' + 'post-media':
--     path prefix must start with auth.uid()::text
--     MIME allowlist: avatars = image/*; post-media = image/* + video/*
--     Size limits: avatars 2MB; post-media 50MB
--   - Auth config: email confirmations ON, password min 8, rate limiting
--     on signup/login, JWT expiry 3600s, refresh token rotation ON
--   - Schedule a cron/edge function to purge auth.users rows where the
--     corresponding profile has deleted_at older than 30 days.
-- ============================================================================
