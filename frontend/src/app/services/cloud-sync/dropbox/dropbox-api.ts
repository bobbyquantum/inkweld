/**
 * Thin, dependency-free wrappers around the Dropbox HTTP API v2 endpoints
 * Cloud Sync needs. Kept free of Angular so they can be unit tested with a
 * mocked `fetch`.
 *
 * The app is registered with "App folder" access, so every path here is
 * relative to `Apps/<app name>/` in the user's Dropbox.
 */

export const DROPBOX_AUTHORIZE_URL = 'https://www.dropbox.com/oauth2/authorize';
export const DROPBOX_TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';
const API_BASE = 'https://api.dropboxapi.com/2';
const CONTENT_BASE = 'https://content.dropboxapi.com/2';

export interface DropboxTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  account_id?: string;
  scope?: string;
}

export interface DropboxAccount {
  account_id: string;
  email: string;
  name: {
    given_name: string;
    surname: string;
    display_name: string;
  };
}

export interface DropboxFileMetadata {
  '.tag': 'file' | 'folder' | 'deleted';
  name: string;
  path_lower?: string;
  path_display?: string;
  id?: string;
  rev?: string;
  size?: number;
  server_modified?: string;
}

export class DropboxApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly summary: string,
    public readonly body: unknown,
    public readonly endpoint = ''
  ) {
    super(
      endpoint
        ? `Dropbox ${endpoint} failed (${status}): ${summary}`
        : `Dropbox API error ${status}: ${summary}`
    );
    this.name = 'DropboxApiError';
  }

  /** True for the "path/not_found" family of errors */
  get isNotFound(): boolean {
    return this.summary.includes('not_found');
  }

  /** True when the access token is invalid or expired */
  get isAuthError(): boolean {
    return this.status === 401 || this.summary.includes('invalid_access_token');
  }

  /** True for a rev mismatch on an "update" write mode */
  get isConflict(): boolean {
    return this.summary.includes('conflict');
  }
}

/** Build the authorization URL for the PKCE flow */
export function buildDropboxAuthorizeUrl(params: {
  appKey: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
}): string {
  const url = new URL(DROPBOX_AUTHORIZE_URL);
  url.searchParams.set('client_id', params.appKey);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  // offline => Dropbox issues a refresh token so the user is not re-prompted
  url.searchParams.set('token_access_type', 'offline');
  url.searchParams.set('state', params.state);
  return url.toString();
}

async function throwForResponse(
  response: Response,
  endpoint: string
): Promise<never> {
  let body: unknown = null;
  let summary = response.statusText;
  const text = await response.text();
  try {
    body = JSON.parse(text);
    const errorSummary = (body as { error_summary?: string }).error_summary;
    const errorDescription = (body as { error_description?: string })
      .error_description;
    const error = (body as { error?: string }).error;
    summary =
      errorSummary ??
      errorDescription ??
      (typeof error === 'string' ? error : summary);
  } catch {
    summary = text || summary;
  }
  throw new DropboxApiError(response.status, summary, body ?? text, endpoint);
}

/** Exchange an authorization code for tokens (PKCE, no client secret) */
export async function exchangeDropboxCode(params: {
  appKey: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  fetchFn?: typeof fetch;
}): Promise<DropboxTokenResponse> {
  const fetchFn = params.fetchFn ?? fetch;
  const body = new URLSearchParams({
    code: params.code,
    grant_type: 'authorization_code',
    client_id: params.appKey,
    code_verifier: params.codeVerifier,
    redirect_uri: params.redirectUri,
  });
  const response = await fetchFn(DROPBOX_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) await throwForResponse(response, 'oauth2/token');
  return (await response.json()) as DropboxTokenResponse;
}

/** Obtain a fresh access token from a refresh token */
export async function refreshDropboxToken(params: {
  appKey: string;
  refreshToken: string;
  fetchFn?: typeof fetch;
}): Promise<DropboxTokenResponse> {
  const fetchFn = params.fetchFn ?? fetch;
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: params.refreshToken,
    client_id: params.appKey,
  });
  const response = await fetchFn(DROPBOX_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) await throwForResponse(response, 'oauth2/token (refresh)');
  return (await response.json()) as DropboxTokenResponse;
}

/** RPC-style call (JSON in, JSON out) against api.dropboxapi.com */
export async function dropboxRpc<T>(
  accessToken: string,
  endpoint: string,
  args: unknown,
  fetchFn: typeof fetch = fetch
): Promise<T> {
  const response = await fetchFn(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args ?? null),
  });
  if (!response.ok) await throwForResponse(response, endpoint.slice(1));
  return (await response.json()) as T;
}

/** Fetch the account that owns the token */
export function getDropboxCurrentAccount(
  accessToken: string,
  fetchFn: typeof fetch = fetch
): Promise<DropboxAccount> {
  return dropboxRpc<DropboxAccount>(
    accessToken,
    '/users/get_current_account',
    null,
    fetchFn
  );
}

/** Download a file; returns bytes plus metadata from the response header */
export async function dropboxDownload(
  accessToken: string,
  path: string,
  fetchFn: typeof fetch = fetch
): Promise<{ metadata: DropboxFileMetadata; content: Uint8Array }> {
  const response = await fetchFn(`${CONTENT_BASE}/files/download`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Dropbox-API-Arg': JSON.stringify({ path }),
    },
  });
  if (!response.ok) await throwForResponse(response, 'files/download');
  const header = response.headers.get('Dropbox-API-Result') ?? '{}';
  const metadata = JSON.parse(header) as DropboxFileMetadata;
  const content = new Uint8Array(await response.arrayBuffer());
  return { metadata, content };
}

/**
 * Upload a file (≤150 MB single-shot). `updateRev` switches to Dropbox's
 * "update" write mode which fails on a rev mismatch instead of renaming.
 */
export async function dropboxUpload(
  accessToken: string,
  path: string,
  content: Uint8Array,
  options: { updateRev?: string } = {},
  fetchFn: typeof fetch = fetch
): Promise<DropboxFileMetadata> {
  const mode = options.updateRev
    ? { '.tag': 'update', update: options.updateRev }
    : 'overwrite';
  const response = await fetchFn(`${CONTENT_BASE}/files/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify({
        path,
        mode,
        autorename: false,
        mute: true,
        strict_conflict: !!options.updateRev,
      }),
    },
    body: content as BodyInit,
  });
  if (!response.ok) await throwForResponse(response, 'files/upload');
  return (await response.json()) as DropboxFileMetadata;
}
