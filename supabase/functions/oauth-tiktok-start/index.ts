// Edge Function: oauth-tiktok-start
//
// TikTok OAuth uses PKCE (mandatory) and calls the credential field
// `client_key` instead of `client_id`. Otherwise the flow shape is
// identical to Kick.
//
// Required scopes for creator sync:
//   user.info.basic    — open_id, display_name, avatar
//   user.info.profile  — username, profile_deep_link
//   user.info.stats    — follower_count, following_count, likes_count, video_count
//   video.list         — list user's own videos via /v2/video/list

// deno-lint-ignore-file no-explicit-any

import { createClient } from 'jsr:@supabase/supabase-js@2';

// TikTok wants scopes comma-separated, no spaces.
const SCOPES = [
  'user.info.basic',
  'user.info.profile',
  'user.info.stats',
  'video.list',
].join(',');

function makeNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function pkceChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get('user_id');
    if (!userId) return new Response('Missing user_id', { status: 400 });

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: cred, error } = await sb
      .from('external_platform_credentials')
      .select('value, external_platforms!inner(slug)')
      .eq('external_platforms.slug', 'tiktok')
      .eq('credential_type', 'client_id')
      .single();
    if (error || !cred) return new Response('TikTok OAuth not configured', { status: 500 });
    const clientKey = (cred as any).value;

    const verifier = makeNonce() + makeNonce(); // 64 hex chars
    const challenge = await pkceChallenge(verifier);

    const supabaseBase = Deno.env.get('SUPABASE_URL')!;
    const redirectUri = `${supabaseBase}/functions/v1/oauth-tiktok-callback`;
    const state = `tiktok|${userId}|${makeNonce()}`;

    // Stash the PKCE verifier for the callback (same pattern as Kick).
    const { data: platform } = await sb
      .from('external_platforms')
      .select('id')
      .eq('slug', 'tiktok')
      .single();
    if (!platform) return new Response('TikTok platform not seeded', { status: 500 });

    await sb.from('user_oauth_tokens').upsert(
      {
        user_id: userId,
        platform_id: (platform as any).id,
        access_token: '__pending__',
        scope: SCOPES,
        account_meta: { pkce_verifier: verifier, state, status: 'pending' },
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      },
      { onConflict: 'user_id,platform_id' },
    );

    const auth = new URL('https://www.tiktok.com/v2/auth/authorize/');
    auth.searchParams.set('client_key', clientKey);
    auth.searchParams.set('scope', SCOPES);
    auth.searchParams.set('response_type', 'code');
    auth.searchParams.set('redirect_uri', redirectUri);
    auth.searchParams.set('state', state);
    auth.searchParams.set('code_challenge', challenge);
    auth.searchParams.set('code_challenge_method', 'S256');

    return Response.redirect(auth.toString(), 302);
  } catch (e: any) {
    console.error('oauth-tiktok-start failed:', e);
    return new Response('Internal error: ' + (e?.message ?? String(e)), { status: 500 });
  }
});
