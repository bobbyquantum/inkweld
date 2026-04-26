/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { provideHttpClient } from '@angular/common/http';
import { HttpErrorResponse } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { PasskeyListResponse, User } from '@inkweld/index';
import { PasskeysService } from '@inkweld/index';
import type { Observable } from 'rxjs';
import { of, throwError } from 'rxjs';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockedObject,
  vi,
} from 'vitest';

import { StorageContextService } from '../core/storage-context.service';
import { AuthTokenService } from './auth-token.service';
import {
  BROWSER_SUPPORTS_WEBAUTHN,
  PasskeyService,
  START_AUTHENTICATION,
  START_REGISTRATION,
} from './passkey.service';

// Helpers to return observables without fighting TypeScript's strict
// HttpEvent<T> wrapping that the generated Angular API client uses.
function obs<T>(value: T): Observable<any> {
  return of(value);
}

function errObs(err: unknown): Observable<any> {
  return throwError(() => err);
}

// ─── Fake data ────────────────────────────────────────────────────────────────

const fakeRegistrationOptions = {
  challenge: 'reg-challenge',
  rp: { id: 'localhost', name: 'Test' },
};
const fakeAttestation = {
  id: 'cred-id',
  rawId: 'cred-id',
  response: {},
  type: 'public-key',
};

const fakeLoginOptions = {
  challenge: 'login-challenge',
  rpId: 'localhost',
};
const fakeAssertion = {
  id: 'cred-id',
  rawId: 'cred-id',
  response: {},
  type: 'public-key',
};

const fakeUser: User = {
  id: '1',
  username: 'testuser',
  name: 'Test User',
  email: 'test@example.com',
  approved: true,
  enabled: true,
  isAdmin: false,
};

const fakeToken = 'jwt-token-123';

const fakePasskeys: PasskeyListResponse = {
  passkeys: [
    {
      id: 'pk-1',
      name: 'My Key',
      deviceType: 'multiDevice',
      backedUp: true,
      createdAt: 1700000000,
    },
  ],
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PasskeyService', () => {
  let service: PasskeyService;
  let passkeyApi: MockedObject<PasskeysService>;
  let authTokenService: MockedObject<AuthTokenService>;
  let storageContext: MockedObject<StorageContextService>;

  // Plain vi.fn() stubs provided via Angular DI — completely isolated from
  // vi.mock() and immune to cross-file vi.clearAllMocks()/vi.resetAllMocks().
  let fakeBrowserSupportsWebAuthn: ReturnType<typeof vi.fn>;
  let fakeStartRegistration: ReturnType<typeof vi.fn>;
  let fakeStartAuthentication: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    passkeyApi = {
      startPasskeyRegistration: vi.fn(),
      finishPasskeyRegistration: vi.fn(),
      startPasskeyLogin: vi.fn(),
      finishPasskeyLogin: vi.fn(),
      listPasskeys: vi.fn(),
      deletePasskey: vi.fn(),
      renamePasskey: vi.fn(),
    } as unknown as MockedObject<PasskeysService>;

    authTokenService = {
      setToken: vi.fn(),
    } as unknown as MockedObject<AuthTokenService>;

    storageContext = {
      getActiveConfig: vi.fn().mockReturnValue({ id: 'server-1' }),
      updateConfigUserProfile: vi.fn(),
    } as unknown as MockedObject<StorageContextService>;

    fakeBrowserSupportsWebAuthn = vi.fn().mockReturnValue(true);
    fakeStartRegistration = vi.fn().mockResolvedValue(fakeAttestation);
    fakeStartAuthentication = vi.fn().mockResolvedValue(fakeAssertion);

    await TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        PasskeyService,
        { provide: PasskeysService, useValue: passkeyApi },
        { provide: AuthTokenService, useValue: authTokenService },
        { provide: StorageContextService, useValue: storageContext },
        // Provide fake browser functions via DI — no vi.mock() needed.
        {
          provide: BROWSER_SUPPORTS_WEBAUTHN,
          useValue: fakeBrowserSupportsWebAuthn,
        },
        { provide: START_REGISTRATION, useValue: fakeStartRegistration },
        { provide: START_AUTHENTICATION, useValue: fakeStartAuthentication },
      ],
    }).compileComponents();

    service = TestBed.inject(PasskeyService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  // ── isSupported ────────────────────────────────────────────────────────────

  describe('isSupported()', () => {
    it('returns true when browserSupportsWebAuthn returns true', () => {
      fakeBrowserSupportsWebAuthn.mockReturnValue(true);
      expect(service.isSupported()).toBe(true);
    });

    it('returns false when browserSupportsWebAuthn returns false', () => {
      fakeBrowserSupportsWebAuthn.mockReturnValue(false);
      expect(service.isSupported()).toBe(false);
    });
  });

  // ── register() ────────────────────────────────────────────────────────────

  describe('register()', () => {
    it('completes successfully when all steps succeed', async () => {
      passkeyApi.startPasskeyRegistration.mockReturnValue(
        obs(fakeRegistrationOptions)
      );
      fakeStartRegistration.mockResolvedValue(fakeAttestation);
      passkeyApi.finishPasskeyRegistration.mockReturnValue(
        obs({ verified: true, passkey: { id: 'pk-1' } })
      );

      await expect(service.register('My Key')).resolves.toBeUndefined();
      expect(passkeyApi.startPasskeyRegistration).toHaveBeenCalledOnce();
      expect(fakeStartRegistration).toHaveBeenCalledWith({
        optionsJSON: fakeRegistrationOptions,
      });
      expect(passkeyApi.finishPasskeyRegistration).toHaveBeenCalledOnce();
    });

    it('throws UNSUPPORTED when browser does not support passkeys', async () => {
      fakeBrowserSupportsWebAuthn.mockReturnValue(false);
      await expect(service.register()).rejects.toMatchObject({
        code: 'UNSUPPORTED',
      });
    });

    it('throws NETWORK_ERROR when startPasskeyRegistration fails', async () => {
      passkeyApi.startPasskeyRegistration.mockReturnValue(
        errObs(new Error('Network error'))
      );
      await expect(service.register()).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
      });
    });

    it('throws CANCELLED when startRegistration throws NotAllowedError', async () => {
      passkeyApi.startPasskeyRegistration.mockReturnValue(
        obs(fakeRegistrationOptions)
      );
      const err = Object.assign(new Error('User cancelled'), {
        name: 'NotAllowedError',
      });
      fakeStartRegistration.mockRejectedValue(err);

      await expect(service.register()).rejects.toMatchObject({
        code: 'CANCELLED',
      });
    });

    it('throws CANCELLED when startRegistration throws AbortError', async () => {
      passkeyApi.startPasskeyRegistration.mockReturnValue(
        obs(fakeRegistrationOptions)
      );
      const err = Object.assign(new Error('Aborted'), { name: 'AbortError' });
      fakeStartRegistration.mockRejectedValue(err);

      await expect(service.register()).rejects.toMatchObject({
        code: 'CANCELLED',
      });
    });

    it('throws NETWORK_ERROR when finishPasskeyRegistration fails', async () => {
      passkeyApi.startPasskeyRegistration.mockReturnValue(
        obs(fakeRegistrationOptions)
      );
      fakeStartRegistration.mockResolvedValue(fakeAttestation);
      passkeyApi.finishPasskeyRegistration.mockReturnValue(
        errObs(new Error('Server error'))
      );

      await expect(service.register()).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
      });
    });
  });

  // ── login() ───────────────────────────────────────────────────────────────

  describe('login()', () => {
    it('returns the user and stores the token on success', async () => {
      passkeyApi.startPasskeyLogin.mockReturnValue(obs(fakeLoginOptions));
      fakeStartAuthentication.mockResolvedValue(fakeAssertion);
      passkeyApi.finishPasskeyLogin.mockReturnValue(
        obs({ token: fakeToken, user: fakeUser })
      );

      const result = await service.login();

      expect(result).toEqual(fakeUser);
      expect(authTokenService.setToken).toHaveBeenCalledWith(fakeToken);
      expect(storageContext.updateConfigUserProfile).toHaveBeenCalledWith(
        'server-1',
        { name: 'Test User', username: 'testuser' }
      );
    });

    it('throws UNSUPPORTED when browser does not support passkeys', async () => {
      fakeBrowserSupportsWebAuthn.mockReturnValue(false);
      await expect(service.login()).rejects.toMatchObject({
        code: 'UNSUPPORTED',
      });
    });

    it('throws NETWORK_ERROR when startPasskeyLogin fails', async () => {
      passkeyApi.startPasskeyLogin.mockReturnValue(
        errObs(new Error('Network error'))
      );
      await expect(service.login()).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
      });
    });

    it('throws CANCELLED when startAuthentication throws NotAllowedError', async () => {
      passkeyApi.startPasskeyLogin.mockReturnValue(obs(fakeLoginOptions));
      const err = Object.assign(new Error('Cancelled'), {
        name: 'NotAllowedError',
      });
      fakeStartAuthentication.mockRejectedValue(err);

      await expect(service.login()).rejects.toMatchObject({
        code: 'CANCELLED',
      });
    });

    it('throws CANCELLED when startAuthentication throws AbortError', async () => {
      passkeyApi.startPasskeyLogin.mockReturnValue(obs(fakeLoginOptions));
      const err = Object.assign(new Error('Aborted'), { name: 'AbortError' });
      fakeStartAuthentication.mockRejectedValue(err);

      await expect(service.login()).rejects.toMatchObject({
        code: 'CANCELLED',
      });
    });

    it('throws NETWORK_ERROR when finishPasskeyLogin fails', async () => {
      passkeyApi.startPasskeyLogin.mockReturnValue(obs(fakeLoginOptions));
      fakeStartAuthentication.mockResolvedValue(fakeAssertion);
      passkeyApi.finishPasskeyLogin.mockReturnValue(
        errObs(new Error('Server error'))
      );

      await expect(service.login()).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
      });
    });

    it('throws PENDING_APPROVAL on 403 with pending-approval message', async () => {
      // Simulate the backend's 403 response from passkey.routes.ts:275 so the
      // login dialog can route the user to /approval-pending instead of just
      // displaying raw red error text.
      const httpError = new HttpErrorResponse({
        status: 403,
        statusText: 'Forbidden',
        error: { error: 'Account pending approval' },
      });
      passkeyApi.startPasskeyLogin.mockReturnValue(obs(fakeLoginOptions));
      fakeStartAuthentication.mockResolvedValue(fakeAssertion);
      passkeyApi.finishPasskeyLogin.mockReturnValue(errObs(httpError));

      await expect(service.login()).rejects.toMatchObject({
        code: 'PENDING_APPROVAL',
        message: 'Account pending approval',
      });
    });

    it('throws ACCOUNT_DISABLED on 403 with disabled message', async () => {
      const httpError = new HttpErrorResponse({
        status: 403,
        statusText: 'Forbidden',
        error: { error: 'Account is disabled' },
      });
      passkeyApi.startPasskeyLogin.mockReturnValue(obs(fakeLoginOptions));
      fakeStartAuthentication.mockResolvedValue(fakeAssertion);
      passkeyApi.finishPasskeyLogin.mockReturnValue(errObs(httpError));

      await expect(service.login()).rejects.toMatchObject({
        code: 'ACCOUNT_DISABLED',
      });
    });

    it('throws VERIFICATION_FAILED when server returns no token', async () => {
      passkeyApi.startPasskeyLogin.mockReturnValue(obs(fakeLoginOptions));
      fakeStartAuthentication.mockResolvedValue(fakeAssertion);
      passkeyApi.finishPasskeyLogin.mockReturnValue(
        obs({ token: null, user: null })
      );

      await expect(service.login()).rejects.toMatchObject({
        code: 'VERIFICATION_FAILED',
      });
    });

    it('uses username as name fallback when user.name is absent', async () => {
      const userNoName: User = { ...fakeUser, name: undefined };
      passkeyApi.startPasskeyLogin.mockReturnValue(obs(fakeLoginOptions));
      fakeStartAuthentication.mockResolvedValue(fakeAssertion);
      passkeyApi.finishPasskeyLogin.mockReturnValue(
        obs({ token: fakeToken, user: userNoName })
      );

      await service.login();

      expect(storageContext.updateConfigUserProfile).toHaveBeenCalledWith(
        'server-1',
        { name: 'testuser', username: 'testuser' }
      );
    });

    it('skips updateConfigUserProfile when no active config', async () => {
      storageContext.getActiveConfig.mockReturnValue(null);
      passkeyApi.startPasskeyLogin.mockReturnValue(obs(fakeLoginOptions));
      fakeStartAuthentication.mockResolvedValue(fakeAssertion);
      passkeyApi.finishPasskeyLogin.mockReturnValue(
        obs({ token: fakeToken, user: fakeUser })
      );

      await service.login();

      expect(storageContext.updateConfigUserProfile).not.toHaveBeenCalled();
    });
  });

  // ── abortLogin() ──────────────────────────────────────────────────────────

  describe('abortLogin()', () => {
    it('does not throw when called with no ceremony in progress', () => {
      // WebAuthnAbortService.cancelCeremony() is a no-op when there is no
      // active controller. We verify the public contract: calling abortLogin()
      // never throws, regardless of state.
      expect(() => service.abortLogin()).not.toThrow();
    });
  });

  // ── list() ────────────────────────────────────────────────────────────────
  describe('list()', () => {
    it('returns passkeys from the API', async () => {
      passkeyApi.listPasskeys.mockReturnValue(obs(fakePasskeys));
      await expect(service.list()).resolves.toEqual(fakePasskeys);
    });
  });

  // ── delete() ──────────────────────────────────────────────────────────────

  describe('delete()', () => {
    it('calls deletePasskey with the given id', async () => {
      passkeyApi.deletePasskey.mockReturnValue(obs(undefined));
      await service.delete('pk-1');
      expect(passkeyApi.deletePasskey).toHaveBeenCalledWith('pk-1');
    });
  });

  // ── rename() ──────────────────────────────────────────────────────────────

  describe('rename()', () => {
    it('calls renamePasskey with id and name', async () => {
      passkeyApi.renamePasskey.mockReturnValue(obs(undefined));
      await service.rename('pk-1', 'New Name');
      expect(passkeyApi.renamePasskey).toHaveBeenCalledWith('pk-1', {
        name: 'New Name',
      });
    });
  });
});
