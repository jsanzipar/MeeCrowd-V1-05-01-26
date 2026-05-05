// Edge Function: oauth-kick-callback
//
// Thin wrapper around the unified handler in _shared. Identical to
// oauth-youtube-callback — the handler dispatches by reading the
// platform from `state`. We need a separate function only because
// Kick's redirect URI is configured to point here.

import { oauthCallbackHandler } from '../_shared/oauth-callback-handler.ts';

Deno.serve(oauthCallbackHandler);
