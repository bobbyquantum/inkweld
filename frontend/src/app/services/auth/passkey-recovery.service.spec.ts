// The generated API client returns Observable<HttpEvent<T>>; our `obs()` test
// helper returns Observable<any> for ergonomic mocking. The cast is safe in
// tests because we control both sides — disable the rule file-wide rather
// than annotating every call site.
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthenticationService } from '@inkweld/index';
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

import {
  BROWSER_SUPPORTS_WEBAUTHN,
  PasskeyError,
  START_REGISTRATION,
} from './passkey.service';
import { PasskeyRecoveryService } from './passkey-recovery.service';

function obs<T>(value: T): Observable<any> {
  return of(value);
}
function errObs(err: unknown): Observable<any> {
  return throwError(() => err);
}

const fakeOptions = {
  challenge: 'recover-challenge',
  rp: { id: 'localhost', name: 'Test' },
};

const fakeAttestation = {
  id: 'cred-id',
  rawId: 'cred-id',
  response: {},
  type: 'public-key',
};

const fakeFinishResponse = {
  passkey: {
    id: 'pk-1',
    name: 'Recovered Key',
    deviceType: 'multiDevice',
    backedUp: true,
    createdAt: 1700000000,
    lastUsedAt: null,
  },
};

describe('PasskeyRecoveryService', () => {
  let service: PasskeyRecoveryService;
  let api: MockedObject<AuthenticationService>;
  let fakeBrowserSupportsWebAuthn: ReturnType<typeof vi.fn>;
  let fakeStartRegistration: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    api = {
      requestPasskeyRecovery: vi.fn(),
      startPasskeyRecovery: vi.fn(),
      finishPasskeyRecovery: vi.fn(),
    } as unknown as MockedObject<AuthenticationService>;

    fakeBrowserSupportsWebAuthn = vi.fn().mockReturnValue(true);
    fakeStartRegistration = vi.fn().mockResolvedValue(fakeAttestation);

    await TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        PasskeyRecoveryService,
        { provide: AuthenticationService, useValue: api },
        {
          provide: BROWSER_SUPPORTS_WEBAUTHN,
          useValue: fakeBrowserSupportsWebAuthn,
        },
        { provide: START_REGISTRATION, useValue: fakeStartRegistration },
      ],
    }).compileComponents();

    service = TestBed.inject(PasskeyRecoveryService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  describe('isSupported()', () => {
    it('returns true when WebAuthn is available', () => {
      fakeBrowserSupportsWebAuthn.mockReturnValue(true);
      expect(service.isSupported()).toBe(true);
    });

    it('returns false when WebAuthn is unavailable', () => {
      fakeBrowserSupportsWebAuthn.mockReturnValue(false);
      expect(service.isSupported()).toBe(false);
    });
  });

  describe('requestRecovery()', () => {
    it('calls API with the email and resolves on success', async () => {
      api.requestPasskeyRecovery.mockReturnValue(obs({ message: 'ok' }));
      await expect(
        service.requestRecovery('user@example.com')
      ).resolves.toBeUndefined();
      expect(api.requestPasskeyRecovery).toHaveBeenCalledWith({
        email: 'user@example.com',
      });
    });

    it('throws a PasskeyError on network failure', async () => {
      api.requestPasskeyRecovery.mockReturnValue(errObs(new Error('boom')));
      await expect(
        service.requestRecovery('user@example.com')
      ).rejects.toBeInstanceOf(PasskeyError);
    });

    it('extracts server error body when present', async () => {
      api.requestPasskeyRecovery.mockReturnValue(
        errObs({ error: { error: 'Email recovery is disabled' } })
      );
      try {
        await service.requestRecovery('user@example.com');
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(PasskeyError);
        expect((err as PasskeyError).message).toBe(
          'Email recovery is disabled'
        );
        expect((err as PasskeyError).code).toBe('NETWORK_ERROR');
      }
    });
  });

  describe('redeemRecovery()', () => {
    it('throws UNSUPPORTED when browser lacks WebAuthn', async () => {
      fakeBrowserSupportsWebAuthn.mockReturnValue(false);
      await expect(service.redeemRecovery('tok')).rejects.toMatchObject({
        code: 'UNSUPPORTED',
      });
      expect(api.startPasskeyRecovery).not.toHaveBeenCalled();
    });

    it('throws on invalid/expired token at start step', async () => {
      api.startPasskeyRecovery.mockReturnValue(
        errObs({ error: { error: 'Invalid or expired recovery token' } })
      );
      try {
        await service.redeemRecovery('bad-token');
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(PasskeyError);
        expect((err as PasskeyError).message).toBe(
          'Invalid or expired recovery token'
        );
      }
    });

    it('throws CANCELLED when user cancels the prompt', async () => {
      api.startPasskeyRecovery.mockReturnValue(obs(fakeOptions));
      const cancelErr = new Error('User cancelled');
      cancelErr.name = 'NotAllowedError';
      fakeStartRegistration.mockRejectedValueOnce(cancelErr);
      await expect(service.redeemRecovery('tok')).rejects.toMatchObject({
        code: 'CANCELLED',
      });
      expect(api.finishPasskeyRecovery).not.toHaveBeenCalled();
    });

    it('throws CANCELLED on AbortError too', async () => {
      api.startPasskeyRecovery.mockReturnValue(obs(fakeOptions));
      const abortErr = new Error('aborted');
      abortErr.name = 'AbortError';
      fakeStartRegistration.mockRejectedValueOnce(abortErr);
      await expect(service.redeemRecovery('tok')).rejects.toMatchObject({
        code: 'CANCELLED',
      });
    });

    it('throws UNKNOWN for other browser errors', async () => {
      api.startPasskeyRecovery.mockReturnValue(obs(fakeOptions));
      fakeStartRegistration.mockRejectedValueOnce(new Error('weird'));
      await expect(service.redeemRecovery('tok')).rejects.toMatchObject({
        code: 'UNKNOWN',
      });
    });

    it('completes successfully and returns normalized passkey info', async () => {
      api.startPasskeyRecovery.mockReturnValue(obs(fakeOptions));
      api.finishPasskeyRecovery.mockReturnValue(obs(fakeFinishResponse));
      const result = await service.redeemRecovery('tok', 'My Backup Key');
      expect(result.passkey.id).toBe('pk-1');
      expect(result.passkey.name).toBe('Recovered Key');
      expect(result.passkey.lastUsedAt).toBeNull();
      expect(api.finishPasskeyRecovery).toHaveBeenCalledWith({
        token: 'tok',
        response: fakeAttestation,
        name: 'My Backup Key',
      });
      expect(fakeStartRegistration).toHaveBeenCalledWith({
        optionsJSON: fakeOptions,
      });
    });

    it('handles missing optional fields in the finish response', async () => {
      api.startPasskeyRecovery.mockReturnValue(obs(fakeOptions));
      api.finishPasskeyRecovery.mockReturnValue(
        obs({
          passkey: {
            id: 'pk-2',
            backedUp: false,
            createdAt: 1700000000,
          },
        })
      );
      const result = await service.redeemRecovery('tok');
      expect(result.passkey.name).toBeNull();
      expect(result.passkey.deviceType).toBeNull();
      expect(result.passkey.lastUsedAt).toBeNull();
    });

    it('throws on server error during finish step', async () => {
      api.startPasskeyRecovery.mockReturnValue(obs(fakeOptions));
      api.finishPasskeyRecovery.mockReturnValue(
        errObs({ error: { error: 'verification failed' } })
      );
      try {
        await service.redeemRecovery('tok');
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(PasskeyError);
        expect((err as PasskeyError).message).toBe('verification failed');
      }
    });
  });
});
