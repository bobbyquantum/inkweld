import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  CLOUD_MANIFEST_PATH,
  createCloudManifest,
} from '@models/cloud-manifest';
import { LoggerService } from '@services/core/logger.service';
import { SetupService } from '@services/core/setup.service';
import {
  buildCloudConfigId,
  type CloudProvider,
} from '@services/core/storage-context.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CloudSyncConfigService } from './cloud-sync-config.service';
import {
  buildCloudCallbackRedirectUri,
  CloudSyncConnectService,
  suggestUsername,
} from './cloud-sync-connect.service';
import { CloudTokenStoreService } from './cloud-token-store.service';

/**
 * The Dropbox helpers default to the global `fetch` at call time, so the
 * spec installs a URL-routing fake there (the Angular test system does not
 * allow vi.mock on relative imports).
 */
type FetchRoute = (url: string, init: RequestInit) => Response | undefined;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function dropboxError(summary: string, status = 409): Response {
  return jsonResponse({ error_summary: summary, error: {} }, status);
}

describe('CloudSyncConnectService', () => {
  let service: CloudSyncConnectService;
  let tokenStore: CloudTokenStoreService;
  let setupService: { configureCloudMode: ReturnType<typeof vi.fn> };
  let cloudConfig: { getAppKey: ReturnType<typeof vi.fn> };
  let session: Record<string, string>;
  let local: Record<string, string>;
  let fetchMock: ReturnType<typeof vi.fn>;
  let routes: FetchRoute[];
  const originalSession = window.sessionStorage;
  const originalLocal = window.localStorage;
  const originalFetch = globalThis.fetch;
  const originalLocation = globalThis.location;

  function fakeStorage(backing: Record<string, string>): Storage {
    return {
      getItem: vi.fn((k: string) => backing[k] ?? null),
      setItem: vi.fn((k: string, v: string) => {
        backing[k] = v;
      }),
      removeItem: vi.fn((k: string) => {
        delete backing[k];
      }),
    } as unknown as Storage;
  }

  /** Calls made to a given Dropbox endpoint (by URL substring) */
  function callsTo(fragment: string): [string, RequestInit][] {
    return (fetchMock.mock.calls as [string, RequestInit][]).filter(([url]) =>
      url.includes(fragment)
    );
  }

  const account = {
    account_id: 'dbid:abc',
    email: 'bobby@example.com',
    name: {
      given_name: 'Bobby',
      surname: 'Quantum',
      display_name: 'Bobby Quantum',
    },
  };

  beforeEach(() => {
    session = {};
    local = {};
    routes = [];
    Object.defineProperty(window, 'sessionStorage', {
      value: fakeStorage(session),
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'localStorage', {
      value: fakeStorage(local),
      writable: true,
      configurable: true,
    });
    fetchMock = vi.fn((url: string, init: RequestInit) => {
      for (const route of routes) {
        const response = route(url, init);
        if (response) return Promise.resolve(response);
      }
      return Promise.resolve(new Response(`unrouted ${url}`, { status: 500 }));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    setupService = {
      configureCloudMode: vi
        .fn()
        .mockImplementation(
          (opts: { provider: CloudProvider; accountId: string }) => ({
            id: buildCloudConfigId(opts.provider, opts.accountId),
            type: 'cloud',
            ...opts,
          })
        ),
    };
    cloudConfig = { getAppKey: vi.fn().mockReturnValue('appkey') };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        CloudSyncConnectService,
        CloudTokenStoreService,
        { provide: SetupService, useValue: setupService },
        { provide: CloudSyncConfigService, useValue: cloudConfig },
        {
          provide: LoggerService,
          useValue: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        },
      ],
    });
    service = TestBed.inject(CloudSyncConnectService);
    tokenStore = TestBed.inject(CloudTokenStoreService);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    Object.defineProperty(window, 'sessionStorage', {
      value: originalSession,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'localStorage', {
      value: originalLocal,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  function stubLocation(origin = 'http://localhost:4200'): {
    assign: ReturnType<typeof vi.fn>;
  } {
    const assign = vi.fn();
    Object.defineProperty(globalThis, 'location', {
      value: { origin, assign },
      writable: true,
      configurable: true,
    });
    return { assign };
  }

  function routeTokenExchange(): void {
    routes.push(url =>
      url.includes('/oauth2/token')
        ? jsonResponse({
            access_token: 'at',
            refresh_token: 'rt',
            expires_in: 14400,
            token_type: 'bearer',
          })
        : undefined
    );
    routes.push(url =>
      url.includes('/users/get_current_account')
        ? jsonResponse(account)
        : undefined
    );
  }

  function routeManifestDownload(body: string | null): void {
    routes.push(url => {
      if (!url.includes('/files/download')) return undefined;
      if (body === null) return dropboxError('path/not_found/...');
      return new Response(new TextEncoder().encode(body), {
        status: 200,
        headers: {
          'Dropbox-API-Result': JSON.stringify({
            '.tag': 'file',
            name: 'manifest.json',
            path_display: CLOUD_MANIFEST_PATH,
            rev: 'r1',
          }),
        },
      });
    });
  }

  describe('buildCloudCallbackRedirectUri', () => {
    it('uses the current origin and the registered callback path', () => {
      stubLocation('https://preview.inkweld.app');
      expect(buildCloudCallbackRedirectUri('dropbox')).toBe(
        'https://preview.inkweld.app/cloud-sync/callback/dropbox'
      );
    });
  });

  describe('beginAuthorization', () => {
    it('stores the PKCE handshake and redirects to Dropbox', async () => {
      const { assign } = stubLocation();

      await service.beginAuthorization('dropbox');

      expect(assign).toHaveBeenCalledTimes(1);
      const url = new URL(assign.mock.calls[0][0] as string);
      expect(url.host).toBe('www.dropbox.com');
      expect(url.searchParams.get('client_id')).toBe('appkey');
      expect(url.searchParams.get('redirect_uri')).toBe(
        'http://localhost:4200/cloud-sync/callback/dropbox'
      );

      const pending = JSON.parse(
        session['inkweld-cloud-sync-pending-auth']
      ) as { provider: string; state: string; codeVerifier: string };
      expect(pending.provider).toBe('dropbox');
      expect(pending.state).toBe(url.searchParams.get('state'));
      expect(pending.codeVerifier.length).toBeGreaterThanOrEqual(43);
    });

    it('refuses when the provider has no app key', async () => {
      const { assign } = stubLocation();
      cloudConfig.getAppKey.mockReturnValue('');

      await expect(service.beginAuthorization('dropbox')).rejects.toThrow(
        /not configured/
      );
      expect(assign).not.toHaveBeenCalled();
    });
  });

  describe('completeAuthorization', () => {
    function seedPendingAuth(state = 'state-1'): void {
      session['inkweld-cloud-sync-pending-auth'] = JSON.stringify({
        provider: 'dropbox',
        codeVerifier: 'verifier',
        state,
        redirectUri: 'http://localhost:4200/cloud-sync/callback/dropbox',
        startedAt: Date.now(),
      });
    }

    it('rejects when no handshake is pending', async () => {
      await expect(
        service.completeAuthorization('dropbox', 'code', 'state-1')
      ).rejects.toThrow(/No authorization in progress/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects a state mismatch and consumes the handshake', async () => {
      seedPendingAuth('state-1');
      await expect(
        service.completeAuthorization('dropbox', 'code', 'wrong')
      ).rejects.toThrow(/state mismatch/);
      expect(session['inkweld-cloud-sync-pending-auth']).toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects a stale handshake', async () => {
      session['inkweld-cloud-sync-pending-auth'] = JSON.stringify({
        provider: 'dropbox',
        codeVerifier: 'v',
        state: 's',
        redirectUri: 'r',
        startedAt: Date.now() - 11 * 60 * 1000,
      });
      await expect(
        service.completeAuthorization('dropbox', 'code', 's')
      ).rejects.toThrow(/No authorization in progress/);
    });

    it('adopts an existing manifest and configures cloud mode', async () => {
      seedPendingAuth();
      routeTokenExchange();
      const manifest = createCloudManifest(
        { provider: 'dropbox', accountId: 'dbid:abc' },
        { name: 'Bobby Quantum', username: 'bobby' }
      );
      routeManifestDownload(JSON.stringify(manifest));

      const result = await service.completeAuthorization(
        'dropbox',
        'code',
        'state-1'
      );

      expect(result.kind).toBe('configured');
      expect(setupService.configureCloudMode).toHaveBeenCalledWith({
        provider: 'dropbox',
        accountId: 'dbid:abc',
        accountLabel: 'bobby@example.com',
        userProfile: { name: 'Bobby Quantum', username: 'bobby' },
      });

      // The code exchange used the stored verifier and no secret
      const [, tokenInit] = callsTo('/oauth2/token')[0];
      const body = tokenInit.body as URLSearchParams;
      expect(body.get('code')).toBe('code');
      expect(body.get('code_verifier')).toBe('verifier');
      expect(body.get('client_id')).toBe('appkey');
      expect(body.has('client_secret')).toBe(false);

      const configId = buildCloudConfigId('dropbox', 'dbid:abc');
      expect(tokenStore.get(configId)).toMatchObject({
        provider: 'dropbox',
        accountId: 'dbid:abc',
        accessToken: 'at',
        refreshToken: 'rt',
      });
      expect(session['inkweld-cloud-sync-pending-connection']).toBeUndefined();
    });

    it('asks for a profile when the folder has no manifest', async () => {
      seedPendingAuth();
      routeTokenExchange();
      routeManifestDownload(null);

      const result = await service.completeAuthorization(
        'dropbox',
        'code',
        'state-1'
      );

      expect(result.kind).toBe('needs-profile');
      if (result.kind !== 'needs-profile') return;
      expect(result.pending).toEqual({
        provider: 'dropbox',
        accountId: 'dbid:abc',
        accountLabel: 'bobby@example.com',
        suggestedName: 'Bobby Quantum',
        suggestedUsername: 'bobby-quantum',
      });
      expect(service.getPendingConnection()).toEqual(result.pending);
      expect(setupService.configureCloudMode).not.toHaveBeenCalled();
    });

    it('treats an unparseable manifest as absent', async () => {
      seedPendingAuth();
      routeTokenExchange();
      routeManifestDownload('garbage');

      const result = await service.completeAuthorization(
        'dropbox',
        'code',
        'state-1'
      );
      expect(result.kind).toBe('needs-profile');
    });

    it('propagates a failed token exchange', async () => {
      seedPendingAuth();
      routes.push(url =>
        url.includes('/oauth2/token')
          ? jsonResponse(
              { error: 'invalid_grant', error_description: 'code expired' },
              400
            )
          : undefined
      );

      await expect(
        service.completeAuthorization('dropbox', 'code', 'state-1')
      ).rejects.toMatchObject({ name: 'DropboxApiError', status: 400 });
      expect(setupService.configureCloudMode).not.toHaveBeenCalled();
    });
  });

  describe('finishNewConnection', () => {
    it('writes the manifest, configures the app and clears the pending state', async () => {
      const pending = {
        provider: 'dropbox' as const,
        accountId: 'dbid:abc',
        accountLabel: 'bobby@example.com',
        suggestedName: 'Bobby Quantum',
        suggestedUsername: 'bobby-quantum',
      };
      session['inkweld-cloud-sync-pending-connection'] =
        JSON.stringify(pending);
      const configId = buildCloudConfigId('dropbox', 'dbid:abc');
      tokenStore.set(configId, {
        provider: 'dropbox',
        accountId: 'dbid:abc',
        accessToken: 'at',
        expiresAt: Date.now() + 100_000,
      });
      routes.push(url =>
        url.includes('/files/upload')
          ? jsonResponse({
              '.tag': 'file',
              name: 'manifest.json',
              path_display: CLOUD_MANIFEST_PATH,
              rev: 'r1',
            })
          : undefined
      );

      const config = await service.finishNewConnection(pending, {
        name: 'Bobby',
        username: 'bobby',
      });

      expect(config.type).toBe('cloud');
      const [, uploadInit] = callsTo('/files/upload')[0];
      const headers = uploadInit.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer at');
      expect(JSON.parse(headers['Dropbox-API-Arg']).path).toBe(
        CLOUD_MANIFEST_PATH
      );
      const written = JSON.parse(
        new TextDecoder().decode(uploadInit.body as Uint8Array)
      );
      expect(written.owner).toEqual({
        provider: 'dropbox',
        accountId: 'dbid:abc',
      });
      expect(written.profile).toEqual({ name: 'Bobby', username: 'bobby' });
      expect(setupService.configureCloudMode).toHaveBeenCalledWith({
        provider: 'dropbox',
        accountId: 'dbid:abc',
        accountLabel: 'bobby@example.com',
        userProfile: { name: 'Bobby', username: 'bobby' },
      });
      expect(service.getPendingConnection()).toBeNull();
    });
  });

  describe('token refresh', () => {
    it('refreshes an expired access token before calling the API', async () => {
      const configId = buildCloudConfigId('dropbox', 'dbid:abc');
      tokenStore.set(configId, {
        provider: 'dropbox',
        accountId: 'dbid:abc',
        accessToken: 'old',
        refreshToken: 'rt',
        expiresAt: Date.now() - 1,
      });
      routes.push(url =>
        url.includes('/oauth2/token')
          ? jsonResponse({
              access_token: 'fresh',
              expires_in: 14400,
              token_type: 'bearer',
            })
          : undefined
      );
      routeManifestDownload('{}');

      const store = service.createStore('dropbox', configId);
      await store.get('/x');

      const [, refreshInit] = callsTo('/oauth2/token')[0];
      const body = refreshInit.body as URLSearchParams;
      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('refresh_token')).toBe('rt');
      const [, downloadInit] = callsTo('/files/download')[0];
      expect(
        (downloadInit.headers as Record<string, string>)['Authorization']
      ).toBe('Bearer fresh');
      expect(tokenStore.get(configId)?.accessToken).toBe('fresh');
    });

    it('fails with RemoteAuthError when expired and no refresh token exists', async () => {
      const configId = buildCloudConfigId('dropbox', 'dbid:abc');
      tokenStore.set(configId, {
        provider: 'dropbox',
        accountId: 'dbid:abc',
        accessToken: 'old',
        expiresAt: Date.now() - 1,
      });
      const store = service.createStore('dropbox', configId);
      await expect(store.get('/x')).rejects.toMatchObject({
        name: 'RemoteAuthError',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('hasCredentials / disconnect reflect the token store', () => {
      const configId = 'cloud-dropbox-zzz';
      expect(service.hasCredentials(configId)).toBe(false);
      tokenStore.set(configId, {
        provider: 'dropbox',
        accountId: 'a',
        accessToken: 't',
        expiresAt: Date.now() + 1000,
      });
      expect(service.hasCredentials(configId)).toBe(true);
      service.disconnect(configId);
      expect(service.hasCredentials(configId)).toBe(false);
    });
  });

  describe('suggestUsername', () => {
    it('slugifies the display name', () => {
      expect(suggestUsername('Bobby Quantum', 'x@y.z')).toBe('bobby-quantum');
      expect(suggestUsername('Zoë  Ångström', 'x@y.z')).toBe('zoe-angstrom');
    });

    it('falls back to the email local part, then a default', () => {
      expect(suggestUsername('Bo', 'bobby@quantum.observer')).toBe('bobby');
      expect(suggestUsername('', 'ab@x.y')).toBe('writer');
    });

    it('caps the length', () => {
      expect(suggestUsername('a'.repeat(50), 'x@y.z')).toHaveLength(32);
    });
  });
});
