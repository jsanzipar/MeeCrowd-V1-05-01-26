// Edge Function: refresh-creator-avatars
//
// Meta-CDN avatars (Facebook + Instagram) come with signed query-string
// parameters that EXPIRE after roughly 24h. Without periodic refresh,
// every creator profile pic on MeeCrowd would go 403 within a day.
//
// This function runs on a schedule (recommended: every 12h) and updates
// `external_channels.avatar_url` for every connected (user_id IS NOT NULL)
// Meta channel with a fresh signed URL.
//
// YouTube + Twitch + Kick avatars use stable URLs — we skip those.
//
// Schedule (Supabase SQL Editor):
//   select cron.schedule(
//     'refresh-creator-avatars',
//     '0 */12 * * *',
//     $$select net.http_post(
//        url := '<project>.supabase.co/functions/v1/refresh-creator-avatars',
//        headers := jsonb_build_object('Content-Type','application/json'),
//        body := '{}'::jsonb
//      );$$
//   );

// deno-lint-ignore-file no-explicit-any

import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const FB_API = 'https://graph.facebook.com/v19.0';
const IG_API = 'https://graph.instagram.com';

async function refreshOne(
  sb: SupabaseClient,
  channelId: string,
  slug: string,
  accessToken: string,
  pageAccessToken: string | null,
  externalId: string,
): Promise<{ updated: boolean; reason?: string }> {
  try {
    let newUrl: string | null = null;
    if (slug === 'facebook') {
      const token = pageAccessToken ?? accessToken;
      const res = await fetch(
        `${FB_API}/${externalId}?fields=picture.type(large){url}&access_token=${token}`,
      );
      if (!res.ok) return { updated: false, reason: `FB ${res.status}` };
      const j = await res.json();
      newUrl = j.picture?.data?.url ?? null;
    } else if (slug === 'instagram') {
      const res = await fetch(
        `${IG_API}/me?fields=profile_picture_url&access_token=${accessToken}`,
      );
      if (!res.ok) return { updated: false, reason: `IG ${res.status}` };
      const j = await res.json();
      newUrl = j.profile_picture_url ?? null;
    } else {
      return { updated: false, reason: 'platform not Meta' };
    }
    if (!newUrl) return { updated: false, reason: 'no url returned' };
    await sb.from('external_channels').update({ avatar_url: newUrl }).eq('id', channelId);
    return { updated: true };
  } catch (e: any) {
    return { updated: false, reason: e?.message ?? String(e) };
  }
}

Deno.serve(async (_req: Request) => {
  const startedAt = Date.now();
  try {
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Pull all connected Meta channels along with their OAuth row.
    const { data, error } = await sb
      .from('external_channels')
      .select(
        `id, platform_external_id, user_id,
         platform:external_platforms!inner(slug),
         oauth:user_oauth_tokens!user_oauth_tokens_channel_id_fkey(access_token, account_meta)`,
      )
      .not('user_id', 'is', null)
      .in('platform.slug', ['facebook', 'instagram']);
    if (error) throw new Error(error.message);

    let updated = 0;
    let skipped = 0;
    const reasons: Record<string, number> = {};
    for (const ch of (data as any[]) ?? []) {
      const slug = ch.platform?.slug;
      // The oauth join returns an array (one row per matching token).
      const oauth = Array.isArray(ch.oauth) ? ch.oauth[0] : ch.oauth;
      // Fall back: look up oauth by user_id + platform if join didn't find it.
      let accessToken = oauth?.access_token;
      let pageToken = oauth?.account_meta?.page_access_token;
      if (!accessToken) {
        const { data: tokenRow } = await sb
          .from('user_oauth_tokens')
          .select('access_token, account_meta, external_platforms!inner(slug)')
          .eq('user_id', ch.user_id)
          .eq('external_platforms.slug', slug)
          .maybeSingle();
        accessToken = (tokenRow as any)?.access_token;
        pageToken = (tokenRow as any)?.account_meta?.page_access_token;
      }
      if (!accessToken) {
        skipped++;
        reasons['no-token'] = (reasons['no-token'] ?? 0) + 1;
        continue;
      }

      const r = await refreshOne(sb, ch.id, slug, accessToken, pageToken, ch.platform_external_id);
      if (r.updated) updated++;
      else {
        skipped++;
        reasons[r.reason ?? 'unknown'] = (reasons[r.reason ?? 'unknown'] ?? 0) + 1;
      }
    }

    return Response.json({
      ok: true,
      updated,
      skipped,
      reasons,
      duration_ms: Date.now() - startedAt,
    });
  } catch (e: any) {
    console.error('refresh-creator-avatars failed:', e);
    return Response.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
});
