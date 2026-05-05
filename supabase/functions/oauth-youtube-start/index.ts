// Edge Function: oauth-youtube-start
//
// Entry point for the YouTube OAuth flow. The app opens this URL in the
// system browser; we redirect to Google's consent screen with the right
// scopes, redirect_uri, and a state param that links the resulting code
// back to the MeeCrowd user.
//
// Query params:
//   user_id  — the MeeCrowd profile.id to attribute the eventual tokens to
//
// State design:
//   We pass `${platform}|${user_id}|${nonce}` as state and verify it back
//   in oauth-callback. nonce protects against replays / cross-site fixes.
//   For now we use a random hex string; later we can store it server-side
//   for stronger CSRF protection.

// deno-lint-ignore-file no-explicit-any

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
].join(' ');

function makeNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get('user_id');
    if (!userId) {
      return new Response('Missing user_id', { status: 400 });
    }

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: cred, error } = await sb
      .from('external_platform_credentials')
      .select('credential_type, value, external_platforms!inner(slug)')
      .eq('external_platforms.slug', 'youtube')
      .in('credential_type', ['oauth_client_id']);
    if (error || !cred?.length) {
      return new Response('YouTube OAuth not configured', { status: 500 });
    }
    const clientId = (cred as any[]).find((r) => r.credential_type === 'oauth_client_id')?.value;
    if (!clientId) {
      return new Response('Missing oauth_client_id', { status: 500 });
    }

    const supabaseBase = Deno.env.get('SUPABASE_URL')!;
    // Must match the URI registered in Google Cloud Console exactly.
    const redirectUri = `${supabaseBase}/functions/v1/oauth-youtube-callback`;
    const state = `youtube|${userId}|${makeNonce()}`;

    const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    auth.searchParams.set('client_id', clientId);
    auth.searchParams.set('redirect_uri', redirectUri);
    auth.searchParams.set('response_type', 'code');
    auth.searchParams.set('scope', SCOPES);
    auth.searchParams.set('access_type', 'offline');
    auth.searchParams.set('prompt', 'consent'); // ensures we always get a refresh_token
    auth.searchParams.set('state', state);
    auth.searchParams.set('include_granted_scopes', 'true');

    return Response.redirect(auth.toString(), 302);
  } catch (e: any) {
    console.error('oauth-youtube-start failed:', e);
    return new Response('Internal error: ' + (e?.message ?? String(e)), { status: 500 });
  }
});
