// Edge Function: oauth-twitch-callback
//
// Thin wrapper around the unified handler. Twitch's redirect URI is
// configured to point here (one-to-one mapping per provider keeps things
// auditable in each provider's developer console).

import { oauthCallbackHandler } from '../_shared/oauth-callback-handler.ts';

Deno.serve(oauthCallbackHandler);
