// Edge Function: oauth-facebook-start
//
// Facebook OAuth via Meta's standard authorization endpoint. We request
// scopes for reading the user's owned Pages — personal profile content
// is not accessible via the Graph API.
//
// Same Meta App as Instagram (one app_id/app_secret).

// deno-lint-ignore-file no-explicit-any

import { createClient } from 'jsr:@supabase/supabase-js@2';

// `business_management` is needed for the Business Login flow — the granted
// Pages live in the user's Meta Business Portfolio, not on the user record.
// Without it /me/businesses returns empty and we never find the Page.
const SCOPES = ['pages_show_list', 'pages_read_engagement', 'business_management'].join(',');

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
      .eq('external_platforms.slug', 'facebook')
      .eq('credential_type', 'oauth_client_id')
      .single();
    if (error || !cred) return new Response('Facebook OAuth not configured', { status: 500 });
    const clientId = (cred as any).value;

    const supabaseBase = Deno.env.get('SUPABASE_URL')!;
    const redirectUri = `${supabaseBase}/functions/v1/oauth-facebook-callback`;
    const state = `facebook|${userId}|${makeNonce()}`;

    const auth = new URL('https://www.facebook.com/v19.0/dialog/oauth');
    auth.searchParams.set('client_id', clientId);
    auth.searchParams.set('redirect_uri', redirectUri);
    auth.searchParams.set('response_type', 'code');
    auth.searchParams.set('scope', SCOPES);
    auth.searchParams.set('state', state);
    // Force Meta to re-show the page selector even if user previously authorized.
    auth.searchParams.set('auth_type', 'rerequest');

    return Response.redirect(auth.toString(), 302);
  } catch (e: any) {
    console.error('oauth-facebook-start failed:', e);
    return new Response('Internal error: ' + (e?.message ?? String(e)), { status: 500 });
  }
});
