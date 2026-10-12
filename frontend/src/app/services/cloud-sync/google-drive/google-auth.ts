/**
 * Google sign-in helpers for Cloud Sync, free of Angular so `main.ts` can use
 * them before the app boots.
 *
 * Google issues refresh tokens to "Web application" clients only in exchange
 * for the client secret, and Cloud Sync has no server to keep one. So Inkweld
 * uses the browser token flow (`response_type=token`): access tokens last an
 * hour and are renewed with `prompt=none`, first in a hidden iframe (works
 * when the browser sends Google's cookies to it), else in a popup opened on
 * the user's next click.
 *
 * Renewals redirect to the same callback URL as the first sign-in, with a
 * `state` starting with RENEWAL_STATE_PREFIX. `main.ts` spots those and,
 * instead of booting the app inside the iframe or popup, relays the response
 * to the Inkweld tab over a BroadcastChannel.
 */

import { GOOGLE_DRIVE_APPDATA_SCOPE } from './google-drive-api';

export const GOOGLE_AUTHORIZE_URL =
  'https://accounts.google.com/o/oauth2/v2/auth';

/** Callback path; the redirect URI is the page origin plus this */
export const GOOGLE_CALLBACK_PATH = '/cloud-sync/callback/google-drive';

/** `state` prefix that marks a silent or popup token renewal */
export const RENEWAL_STATE_PREFIX = 'renew.';

/** BroadcastChannel the relay posts renewal responses on */
export const GOOGLE_AUTH_CHANNEL = 'inkweld-google-auth';

export interface GoogleAuthRelayMessage {
  type: 'google-auth-response';
  /** The callback URL fragment, without the leading "#" */
  fragment: string;
}

export function buildGoogleAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  /** "none" for silent renewal; omit to let Google decide */
  prompt?: 'none' | 'consent' | 'select_account';
  /** Account email, so renewal never switches to another signed-in account */
  loginHint?: string;
}): string {
  const url = new URL(GOOGLE_AUTHORIZE_URL);
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'token');
  url.searchParams.set('scope', GOOGLE_DRIVE_APPDATA_SCOPE);
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', params.state);
  if (params.prompt) url.searchParams.set('prompt', params.prompt);
  if (params.loginHint) url.searchParams.set('login_hint', params.loginHint);
  return url.toString();
}

export type GoogleAuthResponse =
  | {
      kind: 'token';
      state: string;
      accessToken: string;
      /** Seconds until the access token expires */
      expiresIn: number;
      scope: string;
    }
  | {
      kind: 'error';
      state: string;
      error: string;
      description?: string;
    };

/** Parse the fragment Google redirects back with; null when it isn't one */
export function parseGoogleAuthResponse(
  fragment: string
): GoogleAuthResponse | null {
  const params = new URLSearchParams(fragment.replace(/^#/, ''));
  const state = params.get('state');
  if (!state) return null;
  const error = params.get('error');
  if (error) {
    return {
      kind: 'error',
      state,
      error,
      description: params.get('error_description') ?? undefined,
    };
  }
  const accessToken = params.get('access_token');
  const expiresIn = Number(params.get('expires_in'));
  if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    return null;
  }
  return {
    kind: 'token',
    state,
    accessToken,
    expiresIn,
    scope: params.get('scope') ?? '',
  };
}

/** Whether the granted scopes include app data access */
export function grantsAppData(scope: string): boolean {
  return scope.split(/\s+/).includes(GOOGLE_DRIVE_APPDATA_SCOPE);
}

/**
 * Called by `main.ts` first thing. When this page is a renewal landing
 * (inside the hidden iframe or the popup), hand the response to the Inkweld
 * tab, scrub the token from the address bar, close a popup, and return true
 * so the app does not boot here.
 */
export function relayGoogleAuthResponse(
  location: Pick<Location, 'pathname' | 'hash'> = globalThis.location,
  win: Pick<Window, 'top' | 'close' | 'history'> & {
    self: unknown;
  } = globalThis.window
): boolean {
  if (!location.pathname.endsWith(GOOGLE_CALLBACK_PATH)) return false;
  const fragment = location.hash.replace(/^#/, '');
  const state = new URLSearchParams(fragment).get('state');
  if (!state?.startsWith(RENEWAL_STATE_PREFIX)) return false;

  win.history.replaceState(null, '', location.pathname);
  const channel = new BroadcastChannel(GOOGLE_AUTH_CHANNEL);
  const message: GoogleAuthRelayMessage = {
    type: 'google-auth-response',
    fragment,
  };
  channel.postMessage(message);
  channel.close();
  // A popup closes itself; the iframe is removed by the tab that made it
  if (win.top === win.self) win.close();
  return true;
}
