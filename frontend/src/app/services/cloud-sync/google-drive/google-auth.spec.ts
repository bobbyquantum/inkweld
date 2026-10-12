import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildGoogleAuthorizeUrl,
  GOOGLE_AUTH_CHANNEL,
  grantsAppData,
  parseGoogleAuthResponse,
  relayGoogleAuthResponse,
} from './google-auth';
import { GOOGLE_DRIVE_APPDATA_SCOPE } from './google-drive-api';

describe('google-auth', () => {
  describe('buildGoogleAuthorizeUrl', () => {
    it('asks for a token with app data access only', () => {
      const url = new URL(
        buildGoogleAuthorizeUrl({
          clientId: 'cid',
          redirectUri: 'https://x.test/cloud-sync/callback/google-drive',
          state: 's1',
        })
      );

      expect(url.origin + url.pathname).toBe(
        'https://accounts.google.com/o/oauth2/v2/auth'
      );
      expect(url.searchParams.get('client_id')).toBe('cid');
      expect(url.searchParams.get('response_type')).toBe('token');
      expect(url.searchParams.get('scope')).toBe(GOOGLE_DRIVE_APPDATA_SCOPE);
      expect(url.searchParams.get('state')).toBe('s1');
      expect(url.searchParams.has('prompt')).toBe(false);
      expect(url.searchParams.has('login_hint')).toBe(false);
    });

    it('passes prompt and login hint when given', () => {
      const url = new URL(
        buildGoogleAuthorizeUrl({
          clientId: 'cid',
          redirectUri: 'https://x.test/cb',
          state: 's1',
          prompt: 'none',
          loginHint: 'a@b.c',
        })
      );

      expect(url.searchParams.get('prompt')).toBe('none');
      expect(url.searchParams.get('login_hint')).toBe('a@b.c');
    });
  });

  describe('parseGoogleAuthResponse', () => {
    it('reads a token response', () => {
      expect(
        parseGoogleAuthResponse(
          '#access_token=t&expires_in=3599&scope=a%20b&state=s&token_type=Bearer'
        )
      ).toEqual({
        kind: 'token',
        state: 's',
        accessToken: 't',
        expiresIn: 3599,
        scope: 'a b',
      });
    });

    it('reads an error response', () => {
      expect(
        parseGoogleAuthResponse(
          'error=access_denied&error_description=nope&state=s'
        )
      ).toEqual({
        kind: 'error',
        state: 's',
        error: 'access_denied',
        description: 'nope',
      });
    });

    it('rejects fragments that are not sign-in responses', () => {
      expect(parseGoogleAuthResponse('')).toBeNull();
      expect(parseGoogleAuthResponse('access_token=t&expires_in=1')).toBeNull();
      expect(parseGoogleAuthResponse('state=s&access_token=t')).toBeNull();
      expect(
        parseGoogleAuthResponse('state=s&access_token=t&expires_in=0')
      ).toBeNull();
    });
  });

  it('grantsAppData checks for the app data scope among others', () => {
    expect(grantsAppData(`email ${GOOGLE_DRIVE_APPDATA_SCOPE}`)).toBe(true);
    expect(grantsAppData('email')).toBe(false);
  });

  describe('relayGoogleAuthResponse', () => {
    const posted: unknown[] = [];

    class StubChannel {
      constructor(readonly name: string) {}
      postMessage(message: unknown): void {
        posted.push({ name: this.name, message });
      }
      close(): void {
        // nothing to release
      }
    }

    function fakeWindow(isTop: boolean) {
      const win = {
        close: vi.fn(),
        history: { replaceState: vi.fn() },
        self: {},
        top: {},
      };
      if (isTop) win.top = win.self;
      return win;
    }

    afterEach(() => {
      posted.length = 0;
      vi.unstubAllGlobals();
    });

    it('relays a renewal, scrubs the token and closes a popup', () => {
      vi.stubGlobal('BroadcastChannel', StubChannel);
      const win = fakeWindow(true);

      const relayed = relayGoogleAuthResponse(
        {
          pathname: '/cloud-sync/callback/google-drive',
          hash: '#access_token=t&expires_in=10&state=renew.abc',
        },
        win as unknown as Parameters<typeof relayGoogleAuthResponse>[1]
      );

      expect(relayed).toBe(true);
      expect(posted).toEqual([
        {
          name: GOOGLE_AUTH_CHANNEL,
          message: {
            type: 'google-auth-response',
            fragment: 'access_token=t&expires_in=10&state=renew.abc',
          },
        },
      ]);
      expect(win.history.replaceState).toHaveBeenCalledWith(
        null,
        '',
        '/cloud-sync/callback/google-drive'
      );
      expect(win.close).toHaveBeenCalled();
    });

    it('leaves an iframe for its parent to remove', () => {
      vi.stubGlobal('BroadcastChannel', StubChannel);
      const win = fakeWindow(false);

      relayGoogleAuthResponse(
        {
          pathname: '/cloud-sync/callback/google-drive',
          hash: '#error=interaction_required&state=renew.abc',
        },
        win as unknown as Parameters<typeof relayGoogleAuthResponse>[1]
      );

      expect(posted).toHaveLength(1);
      expect(win.close).not.toHaveBeenCalled();
    });

    it('lets the app boot for a first sign-in or any other page', () => {
      const win = fakeWindow(true);
      const cast = win as unknown as Parameters<
        typeof relayGoogleAuthResponse
      >[1];

      expect(
        relayGoogleAuthResponse(
          {
            pathname: '/cloud-sync/callback/google-drive',
            hash: '#access_token=t&state=first-sign-in',
          },
          cast
        )
      ).toBe(false);
      expect(
        relayGoogleAuthResponse(
          { pathname: '/project/x', hash: '#state=renew.abc' },
          cast
        )
      ).toBe(false);
      expect(posted).toHaveLength(0);
    });
  });
});
