import { oauthCallbackHandler } from '../_shared/oauth-callback-handler.ts';
Deno.serve(oauthCallbackHandler);
