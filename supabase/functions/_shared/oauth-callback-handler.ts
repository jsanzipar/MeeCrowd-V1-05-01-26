// Edge Function: oauth-callback (unified for youtube + kick)
//
// Receives the OAuth provider's redirect after the user grants consent.
// State format: `${platform}|${user_id}|${nonce}` — which we generated
// in oauth-{platform}-start.
//
// Steps:
//   1. Parse state → derive platform + MeeCrowd user_id.
//   2. Exchange `code` for access_token (+ refresh_token if granted).
//   3. Hit the provider's "who am I" endpoint to identify the channel.
//   4. Upsert the channel row + claim it (user_id = MeeCrowd user).
//   5. Persist tokens in user_oauth_tokens.
//   6. Render a tiny HTML success page so the user knows to return to the app.
//      (We don't deep-link back; the app polls connection state instead.)

// deno-lint-ignore-file no-explicit-any

import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2';

interface ProviderConfig {
  tokenUrl: string;
  clientIdField: 'oauth_client_id' | 'client_id';
  clientSecretField: 'oauth_client_secret' | 'client_secret';
  needsPkce: boolean;
}

const CONFIG: Record<
  'youtube' | 'kick' | 'twitch' | 'instagram' | 'facebook' | 'tiktok',
  ProviderConfig
> = {
  youtube: {
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientIdField: 'oauth_client_id',
    clientSecretField: 'oauth_client_secret',
    needsPkce: false,
  },
  kick: {
    tokenUrl: 'https://id.kick.com/oauth/token',
    clientIdField: 'client_id',
    clientSecretField: 'client_secret',
    needsPkce: true,
  },
  twitch: {
    tokenUrl: 'https://id.twitch.tv/oauth2/token',
    clientIdField: 'client_id',
    clientSecretField: 'client_secret',
    needsPkce: false,
  },
  instagram: {
    // Instagram-native OAuth uses api.instagram.com, not graph.facebook.com.
    tokenUrl: 'https://api.instagram.com/oauth/access_token',
    clientIdField: 'oauth_client_id',
    clientSecretField: 'oauth_client_secret',
    needsPkce: false,
  },
  facebook: {
    tokenUrl: 'https://graph.facebook.com/v19.0/oauth/access_token',
    clientIdField: 'oauth_client_id',
    clientSecretField: 'oauth_client_secret',
    needsPkce: false,
  },
  tiktok: {
    // TikTok's token endpoint expects `client_key` (not `client_id`) in the
    // body — we patch that into the request below in the dispatch logic.
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    clientIdField: 'client_id',
    clientSecretField: 'client_secret',
    needsPkce: true,
  },
};

async function getCreds(
  sb: SupabaseClient,
  platformSlug: string,
  cfg: ProviderConfig,
): Promise<{ clientId: string; clientSecret: string; platformId: number }> {
  const { data, error } = await sb
    .from('external_platform_credentials')
    .select('credential_type, value, external_platforms!inner(id, slug)')
    .eq('external_platforms.slug', platformSlug)
    .in('credential_type', [cfg.clientIdField, cfg.clientSecretField]);
  if (error || !data?.length) throw new Error(`OAuth creds missing for ${platformSlug}`);
  const map: Record<string, string> = {};
  let platformId = 0;
  for (const row of data as any[]) {
    map[row.credential_type] = row.value;
    platformId = row.external_platforms?.id ?? platformId;
  }
  return {
    clientId: map[cfg.clientIdField],
    clientSecret: map[cfg.clientSecretField],
    platformId,
  };
}

async function fetchYoutubeChannel(accessToken: string) {
  const url = new URL('https://www.googleapis.com/youtube/v3/channels');
  url.searchParams.set('part', 'snippet,statistics,contentDetails,brandingSettings');
  url.searchParams.set('mine', 'true');
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`YouTube channel ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j.items?.[0] ?? null;
}

async function fetchKickChannel(accessToken: string) {
  // /public/v1/channels?broadcaster_user_id=... requires us to know our own
  // id first. Use /public/v1/users to learn it from the access token.
  const userRes = await fetch('https://api.kick.com/public/v1/users', {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!userRes.ok) throw new Error(`Kick /users ${userRes.status}: ${await userRes.text()}`);
  const userJson = await userRes.json();
  const me = userJson.data?.[0];
  if (!me) return null;

  // Now hit /channels?broadcaster_user_id=me.user_id for the channel record.
  const chRes = await fetch(
    `https://api.kick.com/public/v1/channels?broadcaster_user_id=${me.user_id}`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } },
  );
  if (!chRes.ok) throw new Error(`Kick /channels ${chRes.status}: ${await chRes.text()}`);
  const chJson = await chRes.json();
  const ch = chJson.data?.[0];
  if (!ch) return null;
  return { ...ch, user: me };
}

/**
 * Instagram-native flow (Instagram API with Instagram Login).
 *
 * The short-lived access_token from /oauth/access_token expires in 1h.
 * We immediately exchange it for a long-lived (~60 day) token via
 * graph.instagram.com, then read /me to identify the account.
 *
 * Returns: id, username, display_name, avatar (note: avatar is not
 * provided by the IG Login API — we leave it null and let the app
 * render the fallback initial), and the long-lived token.
 */
async function fetchInstagramAccountNative(
  shortLivedToken: string,
  clientSecret: string,
): Promise<{
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  media_count: number;
  long_lived_token: string;
  long_lived_expires_in: number;
} | null> {
  // 1) Exchange short-lived → long-lived token (60 days)
  const exchangeUrl = new URL('https://graph.instagram.com/access_token');
  exchangeUrl.searchParams.set('grant_type', 'ig_exchange_token');
  exchangeUrl.searchParams.set('client_secret', clientSecret);
  exchangeUrl.searchParams.set('access_token', shortLivedToken);
  const xRes = await fetch(exchangeUrl);
  if (!xRes.ok) throw new Error(`IG exchange ${xRes.status}: ${await xRes.text()}`);
  const xJson = await xRes.json();
  const longToken: string = xJson.access_token;
  const expiresIn: number = Number(xJson.expires_in ?? 0);

  // 2) Identify the IG account — request all the fields we can render
  //    on the profile: full name, avatar, follower count, post count.
  const meRes = await fetch(
    `https://graph.instagram.com/me?fields=id,username,account_type,media_count,followers_count,follows_count,name,profile_picture_url,biography&access_token=${longToken}`,
  );
  if (!meRes.ok) throw new Error(`IG /me ${meRes.status}: ${await meRes.text()}`);
  const me = await meRes.json();

  return {
    id: String(me.id),
    username: me.username,
    display_name: me.name ?? me.username,
    avatar_url: me.profile_picture_url ?? null,
    followers_count: Number(me.followers_count ?? 0),
    media_count: Number(me.media_count ?? 0),
    biography: me.biography ?? null,
    long_lived_token: longToken,
    long_lived_expires_in: expiresIn,
  };
}

/**
 * Legacy Instagram-via-Meta-Graph (kept for reference; not used in the
 * Instagram-native flow above).
 */
async function _fetchInstagramAccount_legacy(accessToken: string) {
  // Identify the user first — used in error messages if we can't find a Page.
  const meRes = await fetch(
    `https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${accessToken}`,
  );
  const me = meRes.ok ? await meRes.json() : null;

  // 1) Pages the user admins via legacy endpoint.
  let pages: any[] = [];
  const pagesRes = await fetch(
    `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name,profile_picture_url,followers_count,media_count}&access_token=${accessToken}`,
  );
  if (pagesRes.ok) {
    const pj = await pagesRes.json();
    pages = (pj.data as any[]) ?? [];
  }

  // Business Login fallback #1: granular_scopes.
  if (!pages.length) {
    const scopesRes = await fetch(
      `https://graph.facebook.com/v19.0/me?fields=granular_scopes&access_token=${accessToken}`,
    );
    const scopesJson = scopesRes.ok ? await scopesRes.json() : null;
    const grants = (scopesJson?.granular_scopes as any[]) ?? [];
    const grantedPageIds = new Set<string>();
    for (const g of grants) {
      if (g.scope === 'pages_show_list' || g.scope === 'instagram_basic') {
        for (const id of g.target_ids ?? []) grantedPageIds.add(String(id));
      }
    }
    for (const pageId of grantedPageIds) {
      const pRes = await fetch(
        `https://graph.facebook.com/v19.0/${pageId}?fields=id,name,access_token,instagram_business_account{id,username,name,profile_picture_url,followers_count,media_count}&access_token=${accessToken}`,
      );
      if (pRes.ok) pages.push(await pRes.json());
    }
  }

  // Business Login fallback #2: Business Portfolios.
  if (!pages.length) {
    const bizRes = await fetch(
      `https://graph.facebook.com/v19.0/me/businesses?fields=id,name&access_token=${accessToken}`,
    );
    if (bizRes.ok) {
      const bj = await bizRes.json();
      for (const biz of (bj.data as any[]) ?? []) {
        for (const path of ['owned_pages', 'client_pages']) {
          const owRes = await fetch(
            `https://graph.facebook.com/v19.0/${biz.id}/${path}?fields=id,name,access_token,instagram_business_account{id,username,name,profile_picture_url,followers_count,media_count}&access_token=${accessToken}`,
          );
          if (!owRes.ok) continue;
          const oj = await owRes.json();
          for (const p of (oj.data as any[]) ?? []) pages.push(p);
          if (pages.length) break;
        }
        if (pages.length) break;
      }
    }
  }

  if (!pages.length) {
    const who = me?.name ? ` (signed in as ${me.name})` : '';
    throw new Error(
      `No Pages accessible${who}. Instagram Business accounts must be linked ` +
        `to a Facebook Page, so we need access to at least one Page. Revoke this ` +
        `app at facebook.com/settings → Business Tools, then re-run Connect and ` +
        `pick a Page when prompted.`,
    );
  }
  // Find the first page that has a linked IG Business/Creator account.
  const linked = pages.find((p) => p.instagram_business_account);
  if (!linked) {
    throw new Error(
      'No Instagram Business/Creator account linked to any of your Facebook Pages. ' +
        'Convert your IG to a Professional account and link it to a FB Page.',
    );
  }
  const ig = linked.instagram_business_account;
  return {
    id: ig.id,
    username: ig.username,
    display_name: ig.name ?? ig.username,
    avatar_url: ig.profile_picture_url ?? null,
    followers_count: Number(ig.followers_count ?? 0),
    media_count: Number(ig.media_count ?? 0),
    page_id: linked.id,
    page_name: linked.name,
    page_access_token: linked.access_token, // long-lived per page
  };
}

/**
 * Facebook via Meta: returns the Page the user wants to claim. For now
 * we pick the first owned Page; later we can let the user choose.
 */
async function fetchFacebookPage(accessToken: string) {
  // First call /me to confirm what user we authenticated as.
  const meRes = await fetch(
    `https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${accessToken}`,
  );
  const me = meRes.ok ? await meRes.json() : null;

  // Try /me/accounts first (works for legacy Facebook Login).
  let pages: any[] = [];
  const pagesRes = await fetch(
    `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,fan_count,picture{data{url}},category,link&access_token=${accessToken}`,
  );
  if (pagesRes.ok) {
    const pj = await pagesRes.json();
    pages = (pj.data as any[]) ?? [];
  }

  // Business Login fallback #1: granular_scopes (legacy granular grants).
  if (!pages.length) {
    const scopesRes = await fetch(
      `https://graph.facebook.com/v19.0/me?fields=granular_scopes&access_token=${accessToken}`,
    );
    const scopesJson = scopesRes.ok ? await scopesRes.json() : null;
    const grants = (scopesJson?.granular_scopes as any[]) ?? [];
    const grantedPageIds = new Set<string>();
    for (const g of grants) {
      if (g.scope === 'pages_show_list' || g.scope === 'pages_read_engagement') {
        for (const id of g.target_ids ?? []) grantedPageIds.add(String(id));
      }
    }
    for (const pageId of grantedPageIds) {
      const pRes = await fetch(
        `https://graph.facebook.com/v19.0/${pageId}?fields=id,name,access_token,fan_count,picture{data{url}},category,link&access_token=${accessToken}`,
      );
      if (pRes.ok) {
        pages.push(await pRes.json());
        break;
      }
    }
  }

  // Business Login fallback #2: walk the user's Business Portfolios.
  // When an app is configured as Business Login, the Page grant is stored
  // at the Business Portfolio level, not on the user — so we hit
  // /me/businesses → /{biz_id}/owned_pages and /{biz_id}/client_pages.
  let businessesDebug: any[] = [];
  if (!pages.length) {
    const bizRes = await fetch(
      `https://graph.facebook.com/v19.0/me/businesses?fields=id,name&access_token=${accessToken}`,
    );
    if (bizRes.ok) {
      const bj = await bizRes.json();
      businessesDebug = (bj.data as any[]) ?? [];
      for (const biz of businessesDebug) {
        for (const path of ['owned_pages', 'client_pages']) {
          const owRes = await fetch(
            `https://graph.facebook.com/v19.0/${biz.id}/${path}?fields=id,name,access_token,fan_count,picture{data{url}},category,link&access_token=${accessToken}`,
          );
          if (!owRes.ok) continue;
          const oj = await owRes.json();
          for (const p of (oj.data as any[]) ?? []) pages.push(p);
          if (pages.length) break;
        }
        if (pages.length) break;
      }
    }
  }

  if (!pages.length) {
    const who = me?.name ? ` (signed in as ${me.name})` : '';
    const bizInfo = businessesDebug.length
      ? ` Business Portfolios visible: ${businessesDebug.map((b) => b.name).join(', ')}.`
      : ' No Business Portfolios visible (likely missing business_management scope).';
    throw new Error(
      `No Facebook Pages accessible${who}.${bizInfo} Make sure the Page is ` +
        `inside one of those portfolios, and that you enabled ` +
        `business_management as Standard Access in your Meta app.`,
    );
  }
  const page = pages[0];
  return {
    id: page.id,
    name: page.name,
    handle: page.name?.toLowerCase().replace(/\s+/g, ''),
    avatar_url: page.picture?.data?.url ?? null,
    followers_count: Number(page.fan_count ?? 0),
    category: page.category ?? null,
    link: page.link ?? `https://www.facebook.com/${page.id}`,
    page_access_token: page.access_token,
  };
}

/**
 * TikTok user info via /v2/user/info/. Returns the authenticated TikTok
 * account's profile + follower/video counts.
 */
async function fetchTikTokUser(accessToken: string) {
  const fields = [
    'open_id',
    'union_id',
    'avatar_url',
    'avatar_url_100',
    'avatar_large_url',
    'display_name',
    'bio_description',
    'profile_deep_link',
    'is_verified',
    'username',
    'follower_count',
    'following_count',
    'likes_count',
    'video_count',
  ].join(',');
  const res = await fetch(
    `https://open.tiktokapis.com/v2/user/info/?fields=${fields}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`TikTok /user/info ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const u = json?.data?.user;
  if (!u) {
    throw new Error(`TikTok /user/info returned no user — body: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return {
    id: u.open_id,
    union_id: u.union_id ?? null,
    username: u.username ?? null,
    display_name: u.display_name ?? u.username ?? 'TikTok user',
    avatar_url: u.avatar_large_url ?? u.avatar_url_100 ?? u.avatar_url ?? null,
    bio: u.bio_description ?? null,
    profile_url: u.profile_deep_link ?? null,
    follower_count: Number(u.follower_count ?? 0),
    video_count: Number(u.video_count ?? 0),
    likes_count: Number(u.likes_count ?? 0),
    is_verified: !!u.is_verified,
  };
}

async function fetchTwitchChannel(accessToken: string, clientId: string) {
  // /helix/users with no params returns the authenticated user. Twitch
  // doesn't separate "user" and "channel" — login + display_name + id come
  // from this single endpoint.
  const res = await fetch('https://api.twitch.tv/helix/users', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Client-Id': clientId,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Twitch /users ${res.status}: ${await res.text()}`);
  const j = await res.json();
  const user = j.data?.[0];
  if (!user) return null;

  // Best-effort follower count (requires a scope we may not have; tolerate 401/403).
  let follower_count = 0;
  try {
    const f = await fetch(
      `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${user.id}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Client-Id': clientId,
          Accept: 'application/json',
        },
      },
    );
    if (f.ok) {
      const fj = await f.json();
      follower_count = Number(fj.total ?? 0);
    }
  } catch { /* ignore */ }

  return { ...user, follower_count };
}

function html(body: string, opts: { ok?: boolean } = {}): Response {
  const accent = opts.ok ? '#22c55e' : '#ef4444';
  const heading = opts.ok ? 'Connected!' : 'Connection failed';
  return new Response(
    `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>MeeCrowd OAuth</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         background: #0c0c0f; color: #e8e8ec; padding: 32px; line-height: 1.5;
         display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  .card { max-width: 420px; text-align: center; }
  h1 { color: ${accent}; font-size: 28px; margin-bottom: 16px; }
  p { color: #b8b8c0; }
  .icon { font-size: 48px; margin-bottom: 16px; }
</style></head>
<body><div class="card">
  <div class="icon">${opts.ok ? '✓' : '✗'}</div>
  <h1>${heading}</h1>
  ${body}
  <p style="margin-top:24px;color:#666">You can close this tab and return to the MeeCrowd app.</p>
</div></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

export async function oauthCallbackHandler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  if (errorParam) {
    return html(`<p>Provider returned: ${errorParam}</p>`, { ok: false });
  }
  if (!code || !state) {
    return html('<p>Missing code or state.</p>', { ok: false });
  }

  const [platformSlug, userId] = state.split('|');
  if (!platformSlug || !userId || !(platformSlug in CONFIG)) {
    return html('<p>Invalid state.</p>', { ok: false });
  }
  const cfg = CONFIG[platformSlug as 'youtube' | 'kick'];

  try {
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { clientId, clientSecret, platformId } = await getCreds(sb, platformSlug, cfg);

    // ── 1) Exchange code for tokens ────────────────────────────────────
    // Must match the redirect_uri sent during the authorize step exactly,
    // which is the platform-specific path (registered in each provider's
    // developer console).
    const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/oauth-${platformSlug}-callback`;
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      // TikTok's endpoint uses `client_key`; everyone else uses `client_id`.
      ...(platformSlug === 'tiktok'
        ? { client_key: clientId }
        : { client_id: clientId }),
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    });

    if (cfg.needsPkce) {
      // Retrieve the PKCE verifier we stashed during oauth-{platform}-start.
      const { data: pending } = await sb
        .from('user_oauth_tokens')
        .select('account_meta')
        .eq('user_id', userId)
        .eq('platform_id', platformId)
        .single();
      const verifier = (pending as any)?.account_meta?.pkce_verifier;
      if (!verifier) throw new Error('PKCE verifier missing — start handshake again');
      body.set('code_verifier', verifier);
    }

    const tokenRes = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!tokenRes.ok) {
      const t = await tokenRes.text().catch(() => '');
      throw new Error(`Token exchange ${tokenRes.status}: ${t.slice(0, 300)}`);
    }
    const token = await tokenRes.json();

    // ── 2) Identify the channel ────────────────────────────────────────
    const channel =
      platformSlug === 'youtube'
        ? await fetchYoutubeChannel(token.access_token)
        : platformSlug === 'twitch'
        ? await fetchTwitchChannel(token.access_token, clientId)
        : platformSlug === 'instagram'
        ? await fetchInstagramAccountNative(token.access_token, clientSecret)
        : platformSlug === 'facebook'
        ? await fetchFacebookPage(token.access_token)
        : platformSlug === 'tiktok'
        ? await fetchTikTokUser(token.access_token)
        : await fetchKickChannel(token.access_token);
    if (!channel) throw new Error('Could not load channel info from provider');

    // ── 3) Upsert channel row, mark as claimed ─────────────────────────
    let channelRowId: string | null = null;
    let channelMeta: Record<string, any> = {};

    if (platformSlug === 'youtube') {
      const snippet = channel.snippet ?? {};
      const stats = channel.statistics ?? {};
      const branding = channel.brandingSettings?.channel ?? {};
      const handle = snippet.customUrl ?? null;
      channelMeta = {
        channel_id: channel.id,
        handle,
        display_name: snippet.title,
        avatar_url: snippet.thumbnails?.default?.url ?? null,
      };

      // Look up existing channel row (might exist from a discovery run).
      const { data: existing } = await sb
        .from('external_channels')
        .select('id')
        .eq('platform_id', platformId)
        .eq('platform_external_id', channel.id)
        .maybeSingle();

      const fields = {
        platform_id: platformId,
        platform_external_id: channel.id,
        handle,
        display_name: snippet.title ?? null,
        avatar_url: snippet.thumbnails?.default?.url ?? null,
        banner_url: branding.bannerExternalUrl ?? null,
        description: snippet.description ?? null,
        channel_url: `https://www.youtube.com/channel/${channel.id}`,
        country: snippet.country ?? null,
        subscriber_count: Number(stats.subscriberCount ?? 0),
        total_view_count: stats.viewCount ?? '0',
        video_count: Number(stats.videoCount ?? 0),
        user_id: userId,
        claimed_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
        extra_data: { uploadsPlaylistId: channel.contentDetails?.relatedPlaylists?.uploads ?? null },
      };

      if (existing) {
        const { error } = await sb
          .from('external_channels')
          .update(fields)
          .eq('id', (existing as any).id);
        if (error) throw error;
        channelRowId = (existing as any).id;
      } else {
        const { data: inserted, error } = await sb
          .from('external_channels')
          .insert({ ...fields, discovery_source: 'manual' }) // claimed = manual
          .select('id')
          .single();
        if (error) throw error;
        channelRowId = (inserted as any).id;
      }
    } else if (platformSlug === 'instagram') {
      // Instagram-native flow — `channel` shape comes from
      // fetchInstagramAccountNative. There's no FB Page in this path;
      // the long_lived_token replaces what we used to call page_access_token.
      channelMeta = {
        channel_id: channel.id,
        handle: channel.username,
        display_name: channel.display_name,
        avatar_url: channel.avatar_url,
        long_lived_token: channel.long_lived_token, // used for all subsequent media reads
      };

      const fields = {
        platform_id: platformId,
        platform_external_id: channel.id,
        handle: channel.username,
        display_name: channel.display_name,
        avatar_url: channel.avatar_url,
        banner_url: null,
        description: channel.biography ?? null,
        channel_url: `https://www.instagram.com/${channel.username}`,
        country: null,
        subscriber_count: channel.followers_count ?? 0,
        total_view_count: '0',
        video_count: channel.media_count ?? 0,
        user_id: userId,
        claimed_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
        extra_data: { flow: 'instagram_native' },
      };

      const { data: existing } = await sb
        .from('external_channels')
        .select('id')
        .eq('platform_id', platformId)
        .eq('platform_external_id', channel.id)
        .maybeSingle();
      if (existing) {
        const { error } = await sb
          .from('external_channels')
          .update(fields)
          .eq('id', (existing as any).id);
        if (error) throw error;
        channelRowId = (existing as any).id;
      } else {
        const { data: inserted, error } = await sb
          .from('external_channels')
          .insert({ ...fields, discovery_source: 'manual' })
          .select('id')
          .single();
        if (error) throw error;
        channelRowId = (inserted as any).id;
      }

      // For Instagram, replace the short-lived token with the long-lived one
      // so when we persist below, the stored access_token is the 60-day one.
      token.access_token = channel.long_lived_token;
      token.expires_in = channel.long_lived_expires_in;
    } else if (platformSlug === 'facebook') {
      channelMeta = {
        channel_id: channel.id,
        handle: channel.handle ?? channel.name,
        display_name: channel.name,
        avatar_url: channel.avatar_url,
        page_access_token: channel.page_access_token,
      };

      const fields = {
        platform_id: platformId,
        platform_external_id: channel.id,
        handle: channel.handle ?? null,
        display_name: channel.name,
        avatar_url: channel.avatar_url,
        banner_url: null,
        description: null,
        channel_url: channel.link,
        country: null,
        subscriber_count: channel.followers_count ?? 0,
        total_view_count: '0',
        video_count: 0,
        user_id: userId,
        claimed_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
        extra_data: { category: channel.category },
      };

      const { data: existing } = await sb
        .from('external_channels')
        .select('id')
        .eq('platform_id', platformId)
        .eq('platform_external_id', channel.id)
        .maybeSingle();
      if (existing) {
        const { error } = await sb
          .from('external_channels')
          .update(fields)
          .eq('id', (existing as any).id);
        if (error) throw error;
        channelRowId = (existing as any).id;
      } else {
        const { data: inserted, error } = await sb
          .from('external_channels')
          .insert({ ...fields, discovery_source: 'manual' })
          .select('id')
          .single();
        if (error) throw error;
        channelRowId = (inserted as any).id;
      }
    } else if (platformSlug === 'tiktok') {
      channelMeta = {
        channel_id: channel.id,            // open_id
        handle: channel.username,
        display_name: channel.display_name,
        avatar_url: channel.avatar_url,
        union_id: channel.union_id,
      };

      const fields = {
        platform_id: platformId,
        platform_external_id: channel.id,
        handle: channel.username,
        display_name: channel.display_name,
        avatar_url: channel.avatar_url,
        banner_url: null,
        description: channel.bio,
        channel_url: channel.profile_url ?? `https://www.tiktok.com/@${channel.username}`,
        country: null,
        subscriber_count: channel.follower_count ?? 0,
        total_view_count: '0',
        video_count: channel.video_count ?? 0,
        user_id: userId,
        claimed_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
        verified: channel.is_verified,
        extra_data: {
          union_id: channel.union_id,
          likes_count: channel.likes_count,
        },
      };

      const { data: existing } = await sb
        .from('external_channels')
        .select('id')
        .eq('platform_id', platformId)
        .eq('platform_external_id', channel.id)
        .maybeSingle();
      if (existing) {
        const { error } = await sb.from('external_channels').update(fields).eq('id', (existing as any).id);
        if (error) throw error;
        channelRowId = (existing as any).id;
      } else {
        const { data: inserted, error } = await sb
          .from('external_channels')
          .insert({ ...fields, discovery_source: 'manual' })
          .select('id')
          .single();
        if (error) throw error;
        channelRowId = (inserted as any).id;
      }
    } else if (platformSlug === 'twitch') {
      // Twitch — single /helix/users call returned everything we need.
      channelMeta = {
        channel_id: channel.id,
        handle: channel.login,
        display_name: channel.display_name,
        avatar_url: channel.profile_image_url ?? null,
      };

      const { data: existing } = await sb
        .from('external_channels')
        .select('id')
        .eq('platform_id', platformId)
        .eq('platform_external_id', channel.id)
        .maybeSingle();

      const fields = {
        platform_id: platformId,
        platform_external_id: channel.id,
        handle: channel.login,
        display_name: channel.display_name,
        avatar_url: channel.profile_image_url ?? null,
        banner_url: channel.offline_image_url ?? null,
        description: channel.description ?? null,
        channel_url: `https://www.twitch.tv/${channel.login}`,
        country: null,
        subscriber_count: channel.follower_count ?? 0,
        total_view_count: channel.view_count != null ? String(channel.view_count) : '0',
        video_count: 0,
        user_id: userId,
        claimed_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
        extra_data: { broadcaster_type: channel.broadcaster_type ?? null },
      };

      if (existing) {
        const { error } = await sb
          .from('external_channels')
          .update(fields)
          .eq('id', (existing as any).id);
        if (error) throw error;
        channelRowId = (existing as any).id;
      } else {
        const { data: inserted, error } = await sb
          .from('external_channels')
          .insert({ ...fields, discovery_source: 'manual' })
          .select('id')
          .single();
        if (error) throw error;
        channelRowId = (inserted as any).id;
      }
    } else {
      // Kick
      const me = channel.user ?? {};
      channelMeta = {
        channel_id: String(channel.broadcaster_user_id),
        handle: channel.slug,
        display_name: me.name ?? channel.slug,
        avatar_url: me.profile_picture ?? null,
      };

      const { data: existing } = await sb
        .from('external_channels')
        .select('id')
        .eq('platform_id', platformId)
        .eq('platform_external_id', String(channel.broadcaster_user_id))
        .maybeSingle();

      const fields = {
        platform_id: platformId,
        platform_external_id: String(channel.broadcaster_user_id),
        handle: channel.slug,
        display_name: me.name ?? channel.slug,
        avatar_url: me.profile_picture ?? null,
        banner_url: channel.banner_picture ?? null,
        description: channel.channel_description ?? null,
        channel_url: `https://kick.com/${channel.slug}`,
        country: null,
        subscriber_count: channel.active_subscribers_count ?? 0,
        total_view_count: '0',
        video_count: 0,
        user_id: userId,
        claimed_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
        extra_data: { source: 'oauth_kick_callback' },
      };

      if (existing) {
        const { error } = await sb
          .from('external_channels')
          .update(fields)
          .eq('id', (existing as any).id);
        if (error) throw error;
        channelRowId = (existing as any).id;
      } else {
        const { data: inserted, error } = await sb
          .from('external_channels')
          .insert({ ...fields, discovery_source: 'manual' })
          .select('id')
          .single();
        if (error) throw error;
        channelRowId = (inserted as any).id;
      }
    }

    // ── 4) Persist tokens (overwrite the pending row from -start) ──────
    const expiresAt = token.expires_in
      ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString()
      : null;

    const { error: tokErr } = await sb
      .from('user_oauth_tokens')
      .upsert(
        {
          user_id: userId,
          platform_id: platformId,
          channel_id: channelRowId,
          access_token: token.access_token,
          refresh_token: token.refresh_token ?? null,
          token_type: token.token_type ?? 'Bearer',
          scope: token.scope ?? null,
          expires_at: expiresAt,
          account_meta: channelMeta,
        },
        { onConflict: 'user_id,platform_id' },
      );
    if (tokErr) throw tokErr;

    // ── 5) Kick off the backfill (fire and forget) ─────────────────────
    fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/sync-creator-content`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({ user_id: userId, platform: platformSlug }),
    }).catch((e) => console.error('sync trigger failed (non-fatal):', e));

    // Display handle: YouTube returns customUrl already prefixed with `@`,
    // Kick returns a bare slug. Avoid doubling the `@`.
    const display = (channelMeta.handle ?? channelMeta.display_name ?? '').toString();
    const labeled = display.startsWith('@') ? display : `@${display}`;
    return html(
      `<p>Connected ${
        platformSlug === 'youtube' ? 'YouTube' :
        platformSlug === 'twitch'  ? 'Twitch'  :
        platformSlug === 'instagram' ? 'Instagram' :
        platformSlug === 'facebook'  ? 'Facebook'  :
        platformSlug === 'tiktok' ? 'TikTok' :
        'Kick'
      } as <b>${labeled}</b>.</p>
       <p>We're syncing your back-catalog now — give it a minute and refresh your profile.</p>`,
      { ok: true },
    );
  } catch (e: any) {
    console.error('oauth-callback failed:', e);
    return html(`<p>${e?.message ?? String(e)}</p>`, { ok: false });
  }
}
