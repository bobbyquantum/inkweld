import { describe, expect, it, vi } from 'vitest';

import {
  buildDropboxAuthorizeUrl,
  DROPBOX_TOKEN_URL,
  DropboxApiError,
  dropboxDownload,
  dropboxRpc,
  dropboxUpload,
  exchangeDropboxCode,
  getDropboxCurrentAccount,
  refreshDropboxToken,
} from './dropbox-api';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('dropbox-api', () => {
  describe('buildDropboxAuthorizeUrl', () => {
    it('includes every PKCE parameter and requests offline access', () => {
      const url = new URL(
        buildDropboxAuthorizeUrl({
          appKey: 'key123',
          redirectUri: 'http://localhost:4200/cloud-sync/callback/dropbox',
          codeChallenge: 'challenge',
          state: 'state-abc',
        })
      );
      expect(url.origin + url.pathname).toBe(
        'https://www.dropbox.com/oauth2/authorize'
      );
      expect(url.searchParams.get('client_id')).toBe('key123');
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('redirect_uri')).toBe(
        'http://localhost:4200/cloud-sync/callback/dropbox'
      );
      expect(url.searchParams.get('code_challenge')).toBe('challenge');
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('token_access_type')).toBe('offline');
      expect(url.searchParams.get('state')).toBe('state-abc');
      // A PKCE public client must never send a secret
      expect(url.searchParams.has('client_secret')).toBe(false);
    });
  });

  describe('exchangeDropboxCode', () => {
    it('posts a form-encoded PKCE exchange without a client secret', async () => {
      const fetchFn = vi.fn().mockResolvedValue(
        jsonResponse({
          access_token: 'at',
          refresh_token: 'rt',
          expires_in: 14400,
          token_type: 'bearer',
        })
      );

      const result = await exchangeDropboxCode({
        appKey: 'key',
        code: 'code',
        codeVerifier: 'verifier',
        redirectUri: 'http://localhost/cb',
        fetchFn,
      });

      expect(result.access_token).toBe('at');
      expect(fetchFn).toHaveBeenCalledTimes(1);
      const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(DROPBOX_TOKEN_URL);
      expect(init.method).toBe('POST');
      const body = init.body as URLSearchParams;
      expect(body.get('grant_type')).toBe('authorization_code');
      expect(body.get('code')).toBe('code');
      expect(body.get('code_verifier')).toBe('verifier');
      expect(body.get('client_id')).toBe('key');
      expect(body.get('redirect_uri')).toBe('http://localhost/cb');
      expect(body.has('client_secret')).toBe(false);
    });

    it('throws DropboxApiError with the error description on failure', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { error: 'invalid_grant', error_description: 'code expired' },
            { status: 400 }
          )
        );
      await expect(
        exchangeDropboxCode({
          appKey: 'k',
          code: 'c',
          codeVerifier: 'v',
          redirectUri: 'r',
          fetchFn,
        })
      ).rejects.toMatchObject({
        name: 'DropboxApiError',
        status: 400,
        summary: 'code expired',
      });
    });
  });

  describe('refreshDropboxToken', () => {
    it('posts a refresh_token grant', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ access_token: 'new', expires_in: 100 })
        );
      const result = await refreshDropboxToken({
        appKey: 'k',
        refreshToken: 'rt',
        fetchFn,
      });
      expect(result.access_token).toBe('new');
      const body = (fetchFn.mock.calls[0] as [string, RequestInit])[1]
        .body as URLSearchParams;
      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('refresh_token')).toBe('rt');
      expect(body.get('client_id')).toBe('k');
    });
  });

  describe('dropboxRpc', () => {
    it('sends a bearer token and JSON body', async () => {
      const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ ok: 1 }));
      const result = await dropboxRpc<{ ok: number }>(
        'token',
        '/files/get_metadata',
        { path: '/x' },
        fetchFn
      );
      expect(result.ok).toBe(1);
      const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.dropboxapi.com/2/files/get_metadata');
      expect((init.headers as Record<string, string>)['Authorization']).toBe(
        'Bearer token'
      );
      expect(init.body).toBe(JSON.stringify({ path: '/x' }));
    });

    it('sends JSON null for endpoints without arguments', async () => {
      const fetchFn = vi.fn().mockResolvedValue(jsonResponse({}));
      await getDropboxCurrentAccount('t', fetchFn);
      const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        'https://api.dropboxapi.com/2/users/get_current_account'
      );
      expect(init.body).toBe('null');
    });

    it('classifies not_found, auth and conflict errors', () => {
      const make = (status: number, summary: string) =>
        new DropboxApiError(status, summary, null);
      expect(make(409, 'path/not_found/..').isNotFound).toBe(true);
      expect(make(401, 'invalid_access_token/...').isAuthError).toBe(true);
      expect(make(409, 'expired_access_token/').isAuthError).toBe(false);
      expect(make(409, 'path/conflict/file/..').isConflict).toBe(true);
    });

    it('flags throttling and reads Retry-After', async () => {
      const fetchFn = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error_summary: 'too_many_requests/..',
            error: { reason: { '.tag': 'too_many_requests' }, retry_after: 7 },
          }),
          { status: 429, headers: { 'Retry-After': '12' } }
        )
      );
      const error = await dropboxRpc('t', '/x', {}, fetchFn).catch(e => e);
      expect(error).toBeInstanceOf(DropboxApiError);
      expect((error as DropboxApiError).isRateLimited).toBe(true);
      expect((error as DropboxApiError).retryAfterSeconds).toBe(12);
    });

    it('falls back to retry_after in the body', async () => {
      const fetchFn = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error_summary: 'too_many_write_operations/..',
            error: { '.tag': 'too_many_write_operations', retry_after: 3 },
          }),
          { status: 429 }
        )
      );
      const error = (await dropboxRpc('t', '/x', {}, fetchFn).catch(
        e => e
      )) as DropboxApiError;
      expect(error.isRateLimited).toBe(true);
      expect(error.retryAfterSeconds).toBe(3);
    });

    it('parses error_summary from a failed response', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { error_summary: 'path/not_found/...', error: {} },
            { status: 409 }
          )
        );
      await expect(dropboxRpc('t', '/x', {}, fetchFn)).rejects.toMatchObject({
        status: 409,
        summary: 'path/not_found/...',
      });
    });
  });

  describe('dropboxDownload', () => {
    it('returns bytes and metadata from the Dropbox-API-Result header', async () => {
      const fetchFn = vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: {
            'Dropbox-API-Result': JSON.stringify({
              '.tag': 'file',
              name: 'manifest.json',
              path_display: '/manifest.json',
              rev: 'abc',
              size: 3,
            }),
          },
        })
      );
      const { metadata, content } = await dropboxDownload(
        't',
        '/manifest.json',
        fetchFn
      );
      expect(Array.from(content)).toEqual([1, 2, 3]);
      expect(metadata.rev).toBe('abc');
      const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://content.dropboxapi.com/2/files/download');
      expect(
        JSON.parse((init.headers as Record<string, string>)['Dropbox-API-Arg'])
      ).toEqual({ path: '/manifest.json' });
    });
  });

  describe('dropboxUpload', () => {
    it('uses overwrite mode by default', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(jsonResponse({ '.tag': 'file', rev: 'r1' }));
      await dropboxUpload('t', '/a.txt', new Uint8Array([1]), {}, fetchFn);
      const init = (fetchFn.mock.calls[0] as [string, RequestInit])[1];
      const arg = JSON.parse(
        (init.headers as Record<string, string>)['Dropbox-API-Arg']
      );
      expect(arg.mode).toBe('overwrite');
      expect(arg.strict_conflict).toBe(false);
    });

    it('uses update mode with strict conflicts when a rev is given', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(jsonResponse({ '.tag': 'file', rev: 'r2' }));
      await dropboxUpload(
        't',
        '/a.txt',
        new Uint8Array([1]),
        { updateRev: 'r1' },
        fetchFn
      );
      const init = (fetchFn.mock.calls[0] as [string, RequestInit])[1];
      const arg = JSON.parse(
        (init.headers as Record<string, string>)['Dropbox-API-Arg']
      );
      expect(arg.mode).toEqual({ '.tag': 'update', update: 'r1' });
      expect(arg.strict_conflict).toBe(true);
    });
  });
});
