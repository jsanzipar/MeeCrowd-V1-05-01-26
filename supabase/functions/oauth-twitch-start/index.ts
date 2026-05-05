// Edge Function: oauth-twitch-start
//
// Initiates Twitch's authorization_code OAuth flow. Mirrors
// oauth-youtube-start / oauth-kick-start.
//
// Twitch scopes for read-only creator sync:
//   user:read:email          — get the authenticated user
//   user:read:follows        — (optional) for follower-graph features later
// (videos.list works without special scopes for public videos.)

// deno-lint-ignore-file no-explicit-any

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SCOPES = ['user:read:email'].join(' ');

function makeNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
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
      .eq('external_platforms.slug', 'twitch')
      .eq('credential_type', 'client_id')
      .single();
    if (error || !cred) return new Response('Twitch OAuth not configured', { status: 500 });
    const clientId = (cred as any).value;

    const supabaseBase = Deno.env.get('SUPABASE_URL')!;
    // Must match the URI registered in the Twitch developer dashboard.
    const redirectUri = `${supabaseBase}/functions/v1/oauth-twitch-callback`;
    const state = `twitch|${userId}|${makeNonce()}`;

    const auth = new URL('https://id.twitch.tv/oauth2/authorize');
    auth.searchParams.set('client_id', clientId);
    auth.searchParams.set('redirect_uri', redirectUri);
    auth.searchParams.set('response_type', 'code');
    auth.searchParams.set('scope', SCOPES);
    auth.searchParams.set('state', state);
    auth.searchParams.set('force_verify', 'true'); // re-prompt user (helpful in testing)

    return Response.redirect(auth.toString(), 302);
  } catch (e: any) {
    console.error('oauth-twitch-start failed:', e);
    return new Response('Internal error: ' + (e?.message ?? String(e)), { status: 500 });
  }
});
