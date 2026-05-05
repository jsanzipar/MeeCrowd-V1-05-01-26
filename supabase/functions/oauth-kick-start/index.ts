// Edge Function: oauth-kick-start
//
// Entry point for the Kick OAuth (authorization_code) flow. Mirrors
// oauth-youtube-start exactly, with Kick's authorize URL and scopes.

// deno-lint-ignore-file no-explicit-any

import { createClient } from 'jsr:@supabase/supabase-js@2';

// Kick scopes for read-only creator sync. `user:read` gets us the
// authenticated user's profile, `channel:read` for channel info.
// Refer to https://docs.kick.com/getting-started/scopes for the full list.
const SCOPES = ['user:read', 'channel:read'].join(' ');

function makeNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Base64url(SHA-256(verifier)) — required by Kick's PKCE.
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
      .eq('external_platforms.slug', 'kick')
      .eq('credential_type', 'client_id')
      .single();
    if (error || !cred) {
      return new Response('Kick OAuth not configured', { status: 500 });
    }
    const clientId = (cred as any).value;

    // PKCE: generate verifier, derive challenge, stash verifier for callback.
    const verifier = makeNonce() + makeNonce(); // 64 hex chars = high-entropy
    const challenge = await pkceChallenge(verifier);

    // Persist verifier keyed by state so the callback can retrieve it.
    // We use a transient row in user_oauth_tokens with a sentinel scope
    // value so it's distinguishable from a completed OAuth row. The
    // verifier lives in account_meta until the callback consumes it.
    const supabaseBase = Deno.env.get('SUPABASE_URL')!;
    // Must match the URI registered in the Kick developer dashboard exactly.
    const redirectUri = `${supabaseBase}/functions/v1/oauth-kick-callback`;
    const state = `kick|${userId}|${makeNonce()}`;

    // Store the PKCE verifier indexed by state. Use a short-lived helper
    // table or just stash it in the user's row's account_meta. Simplest:
    // use a dedicated row in a `oauth_pkce` table — but we don't have one.
    // For MVP: write to `user_oauth_tokens` with placeholder access_token
    // and the verifier in account_meta. The callback overwrites it with
    // real tokens after the exchange. This is upsert-safe via UNIQUE
    // (user_id, platform_id).
    const { data: platform } = await sb
      .from('external_platforms')
      .select('id')
      .eq('slug', 'kick')
      .single();
    if (!platform) {
      return new Response('Kick platform not seeded', { status: 500 });
    }

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

    const auth = new URL('https://id.kick.com/oauth/authorize');
    auth.searchParams.set('client_id', clientId);
    auth.searchParams.set('redirect_uri', redirectUri);
    auth.searchParams.set('response_type', 'code');
    auth.searchParams.set('scope', SCOPES);
    auth.searchParams.set('state', state);
    auth.searchParams.set('code_challenge', challenge);
    auth.searchParams.set('code_challenge_method', 'S256');

    return Response.redirect(auth.toString(), 302);
  } catch (e: any) {
    console.error('oauth-kick-start failed:', e);
    return new Response('Internal error: ' + (e?.message ?? String(e)), { status: 500 });
  }
});
