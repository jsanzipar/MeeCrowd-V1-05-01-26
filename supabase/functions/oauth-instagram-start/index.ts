// Edge Function: oauth-instagram-start
//
// NEW Instagram-native OAuth flow (Instagram API with Instagram Login).
// This is distinct from the older Facebook-Graph-based Instagram flow:
//
//   * Authorization URL is on instagram.com, not facebook.com
//   * Scope is `instagram_business_basic` (not `instagram_basic`)
//   * Token exchange goes to api.instagram.com, not graph.facebook.com
//   * API reads use graph.instagram.com (different host)
//
// The user doesn't need a linked Facebook Page — they connect their
// IG Business/Creator account directly. Cleaner for our use case.

// deno-lint-ignore-file no-explicit-any

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SCOPES = ['instagram_business_basic'].join(',');

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
      .eq('external_platforms.slug', 'instagram')
      .eq('credential_type', 'oauth_client_id')
      .single();
    if (error || !cred) return new Response('Instagram OAuth not configured', { status: 500 });
    const clientId = (cred as any).value;

    const supabaseBase = Deno.env.get('SUPABASE_URL')!;
    const redirectUri = `${supabaseBase}/functions/v1/oauth-instagram-callback`;
    const state = `instagram|${userId}|${makeNonce()}`;

    const auth = new URL('https://www.instagram.com/oauth/authorize');
    auth.searchParams.set('client_id', clientId);
    auth.searchParams.set('redirect_uri', redirectUri);
    auth.searchParams.set('response_type', 'code');
    auth.searchParams.set('scope', SCOPES);
    auth.searchParams.set('state', state);

    return Response.redirect(auth.toString(), 302);
  } catch (e: any) {
    console.error('oauth-instagram-start failed:', e);
    return new Response('Internal error: ' + (e?.message ?? String(e)), { status: 500 });
  }
});
