import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LoggerService } from '@services/core/logger.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CloudSyncConfigService } from '../cloud-sync-config.service';
import { CloudTokenStoreService } from '../cloud-token-store.service';
import {
  RemoteAuthError,
  RemoteReauthRequiredError,
} from '../remote-store.interface';
import { GOOGLE_DRIVE_APPDATA_SCOPE } from './google-drive-api';
import {
  GOOGLE_AUTH_CHANNEL_FACTORY,
  GOOGLE_AUTH_TIMING,
  GoogleDriveAuthService,
} from './google-drive-auth.service';

/** Stands in for BroadcastChannel: `relay` delivers to every open channel */
class FakeChannelHub {
  readonly open = new Set<FakeChannel>();
  created = 0;

  readonly factory = (): BroadcastChannel => {
    this.created++;
    const channel = new FakeChannel(this);
    this.open.add(channel);
    return channel as unknown as BroadcastChannel;
  };

  relay(fragment: string): void {
    for (const channel of [...this.open]) {
      channel.onmessage?.({
        data: { type: 'google-auth-response', fragment },
      } as MessageEvent);
    }
  }
}

class FakeChannel {
  onmessage: ((event: MessageEvent) => void) | null = null;
  constructor(private readonly hub: FakeChannelHub) {}
  close(): void {
    this.hub.open.delete(this);
  }
}

/** Let the relayed response, the account check and the store settle */
const flush = (): Promise<void> => new Promise(r => setTimeout(r, 20));

describe('GoogleDriveAuthService', () => {
  const configId = 'cloud-google-drive-abc';
  let hub: FakeChannelHub;
  let service: GoogleDriveAuthService;
  let tokens: CloudTokenStoreService;
  let logger: Record<string, ReturnType<typeof vi.fn>>;
  let openSpy: ReturnType<typeof vi.spyOn>;
  let popup: { closed: boolean; close: ReturnType<typeof vi.fn> };
  /** Account the stubbed about.get reports for any renewed token */
  let renewedAccount: string;

  beforeEach(() => {
    renewedAccount = 'abc';
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              user: {
                permissionId: renewedAccount,
                emailAddress: 'bobby@example.com',
                displayName: 'Bobby',
              },
            })
          )
        )
      )
    );
    hub = new FakeChannelHub();
    logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    popup = { closed: false, close: vi.fn() };
    openSpy = vi
      .spyOn(window, 'open')
      .mockReturnValue(popup as unknown as Window);

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        CloudTokenStoreService,
        {
          provide: CloudSyncConfigService,
          useValue: { getAppKey: () => 'client-id' },
        },
        { provide: LoggerService, useValue: logger },
        { provide: GOOGLE_AUTH_CHANNEL_FACTORY, useValue: hub.factory },
        // Short real timeouts: fake timers proved flaky under full-suite load
        {
          provide: GOOGLE_AUTH_TIMING,
          useValue: {
            silentTimeoutMs: 30,
            popupTimeoutMs: 1000,
            popupPollMs: 10,
          },
        },
      ],
    });
    service = TestBed.inject(GoogleDriveAuthService);
    tokens = TestBed.inject(CloudTokenStoreService);
  });

  afterEach(() => {
    service.cancel(configId);
    tokens.clear(configId);
    openSpy.mockRestore();
    vi.unstubAllGlobals();
    for (const frame of document.querySelectorAll('iframe')) frame.remove();
  });

  function seed(expiresInMs: number): void {
    tokens.set(configId, {
      provider: 'google-drive',
      accountId: 'abc',
      accessToken: 'old',
      expiresAt: Date.now() + expiresInMs,
      loginHint: 'bobby@example.com',
    });
  }

  function frameUrl(): URL {
    const frame = document.querySelector('iframe');
    if (!frame) throw new Error('no renewal iframe');
    return new URL(frame.src);
  }

  function popupUrl(): URL {
    return new URL(openSpy.mock.calls.at(-1)?.[0] as string);
  }

  function respond(url: URL, overrides: Record<string, string> = {}): void {
    hub.relay(
      new URLSearchParams({
        access_token: 'new',
        expires_in: '3599',
        token_type: 'Bearer',
        scope: GOOGLE_DRIVE_APPDATA_SCOPE,
        state: url.searchParams.get('state') ?? '',
        ...overrides,
      }).toString()
    );
  }

  function refuse(url: URL): void {
    hub.relay(
      `error=interaction_required&state=${url.searchParams.get('state')}`
    );
  }

  it('returns a token with plenty of life left without renewing', async () => {
    seed(30 * 60_000);

    await expect(service.getAccessToken(configId)).resolves.toBe('old');
    expect(hub.created).toBe(0);
  });

  it('fails with RemoteAuthError when the account is not connected', async () => {
    await expect(service.getAccessToken(configId)).rejects.toBeInstanceOf(
      RemoteAuthError
    );
  });

  it('renews silently in a hidden iframe ahead of expiry', async () => {
    seed(5 * 60_000);

    await expect(service.getAccessToken(configId)).resolves.toBe('old');

    const url = frameUrl();
    expect(url.host).toBe('accounts.google.com');
    expect(url.searchParams.get('prompt')).toBe('none');
    expect(url.searchParams.get('login_hint')).toBe('bobby@example.com');
    expect(url.searchParams.get('state')).toMatch(/^renew\./);
    expect(url.searchParams.get('redirect_uri')).toBe(
      `${location.origin}/cloud-sync/callback/google-drive`
    );

    respond(url);
    await flush();

    expect(tokens.get(configId)?.accessToken).toBe('new');
    expect(document.querySelector('iframe')).toBeNull();
    expect(service.renewals()).toBe(1);
  });

  it('waits for a silent renewal when the token has expired', async () => {
    seed(-1000);

    const token = service.getAccessToken(configId);
    respond(frameUrl());

    await expect(token).resolves.toBe('new');
  });

  it('rejects a renewed token for a different Google account', async () => {
    seed(-1000);
    renewedAccount = 'someone-else';

    const token = service.getAccessToken(configId);
    respond(frameUrl());

    await expect(token).rejects.toBeInstanceOf(RemoteReauthRequiredError);
    expect(tokens.get(configId)?.accessToken).toBe('old');
    expect(logger['warn']).toHaveBeenCalled();
  });

  it('renews on the next request after Drive rejects the token', async () => {
    seed(30 * 60_000);

    service.invalidate(configId);
    const token = service.getAccessToken(configId);
    respond(frameUrl());

    await expect(token).resolves.toBe('new');
    expect(tokens.get(configId)?.loginHint).toBe('bobby@example.com');
  });

  it('ignores responses meant for another request', async () => {
    seed(-1000);

    const token = service.getAccessToken(configId);
    respond(frameUrl(), { state: 'renew.someone-else' });
    respond(frameUrl(), { scope: 'email' });

    await expect(token).rejects.toBeInstanceOf(RemoteReauthRequiredError);
    expect(tokens.get(configId)?.accessToken).toBe('old');
  });

  it('gives up on a silent renewal that never answers', async () => {
    seed(-1000);

    await expect(service.getAccessToken(configId)).rejects.toBeInstanceOf(
      RemoteReauthRequiredError
    );
    expect(hub.open.size).toBe(0);
    expect(document.querySelector('iframe')).toBeNull();
  });

  describe('when silent renewal fails', () => {
    async function failSilently(): Promise<void> {
      seed(-1000);
      const token = service.getAccessToken(configId);
      refuse(frameUrl());
      await expect(token).rejects.toBeInstanceOf(RemoteReauthRequiredError);
    }

    it('pauses and waits for the user', async () => {
      await failSilently();

      expect(service.renewalNeeded()).toBe(configId);
      expect(tokens.get(configId)).not.toBeNull();
    });

    it('does not retry silently straight away', async () => {
      await failSilently();
      const created = hub.created;

      await expect(service.getAccessToken(configId)).rejects.toBeInstanceOf(
        RemoteReauthRequiredError
      );
      expect(hub.created).toBe(created);
    });

    it('renews in a popup on the next click, once', async () => {
      await failSilently();

      document.body.click();

      expect(openSpy).toHaveBeenCalledTimes(1);
      const url = popupUrl();
      expect(url.searchParams.has('prompt')).toBe(false);
      expect(url.searchParams.get('login_hint')).toBe('bobby@example.com');

      respond(url);
      await flush();

      expect(tokens.get(configId)?.accessToken).toBe('new');
      expect(service.renewalNeeded()).toBeNull();
      expect(service.renewals()).toBe(1);
      expect(popup.close).toHaveBeenCalled();

      document.body.click();
      expect(openSpy).toHaveBeenCalledTimes(1);
    });

    it('stays paused when the user closes the popup', async () => {
      await failSilently();

      const renewal = service.renewWithPopup();
      popup.closed = true;

      await expect(renewal).resolves.toBe(false);
      expect(service.renewalNeeded()).toBe(configId);
    });

    it('reports a blocked popup', async () => {
      await failSilently();
      openSpy.mockReturnValue(null);

      await expect(service.renewWithPopup()).resolves.toBe(false);
      expect(logger['warn']).toHaveBeenCalled();
    });

    it('stops waiting once the profile is disconnected', async () => {
      await failSilently();

      service.cancel(configId);
      document.body.click();

      expect(service.renewalNeeded()).toBeNull();
      expect(openSpy).not.toHaveBeenCalled();
    });
  });

  it('does nothing when no renewal is pending', async () => {
    await expect(service.renewWithPopup()).resolves.toBe(false);
    expect(openSpy).not.toHaveBeenCalled();
  });
});
