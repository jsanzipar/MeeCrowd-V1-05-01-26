// Edge Function: oauth-youtube-callback
//
// Thin wrapper around the unified handler in _shared. The handler reads
// the platform from the `state` parameter (set by oauth-youtube-start),
// so this file only needs to expose the handler at this URL — which is
// the redirect URI configured in Google Cloud Console.

import { oauthCallbackHandler } from '../_shared/oauth-callback-handler.ts';

Deno.serve(oauthCallbackHandler);
