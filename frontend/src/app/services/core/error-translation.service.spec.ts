import { TestBed } from '@angular/core/testing';
import { PasskeyError } from '@services/auth/passkey.service';
import { UserServiceError } from '@services/user/user.service';
import { describe, expect, it } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { ErrorTranslationService } from './error-translation.service';

describe('ErrorTranslationService', () => {
  let service: ErrorTranslationService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [translocoTestProvider()],
      providers: [ErrorTranslationService],
    });

    service = TestBed.inject(ErrorTranslationService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('translate', () => {
    describe('PasskeyError', () => {
      it('should return silent result for CANCELLED code', () => {
        const error = new PasskeyError('CANCELLED', 'Cancelled by user');
        const result = service.translate(error);

        expect(result.message).toBe('');
        expect(result.shouldRedirect).toBe(false);
        expect(result.silent).toBe(true);
      });

      it('should return redirect result for PENDING_APPROVAL code', () => {
        const error = new PasskeyError('PENDING_APPROVAL', 'Pending approval');
        const result = service.translate(error);

        expect(result.message).toBe('');
        expect(result.shouldRedirect).toBe(true);
        expect(result.silent).toBe(false);
      });

      it.each([
        [
          'NO_CREDENTIAL',
          'No credential',
          'Something went wrong. Please try again.',
        ],
        [
          'VERIFICATION_FAILED',
          'Verification failed',
          'Passkey verification failed. Please try again.',
        ],
        [
          'NETWORK_ERROR',
          'Network error',
          'Network error. Please check your connection and try again.',
        ],
        [
          'UNSUPPORTED',
          'Unsupported',
          'Passkeys are not supported by this browser.',
        ],
        [
          'ACCOUNT_DISABLED',
          'Account disabled',
          'Your account has been disabled. Please contact an administrator.',
        ],
        ['UNKNOWN', 'Unknown error', 'Something went wrong. Please try again.'],
      ] as const)(
        'should translate %s error to localized message',
        (code, rawMessage, expectedMessage) => {
          const error = new PasskeyError(code, rawMessage);
          const result = service.translate(error);

          expect(result.message).toBe(expectedMessage);
          expect(result.shouldRedirect).toBe(false);
          expect(result.silent).toBe(false);
        }
      );
    });

    describe('UserServiceError', () => {
      it('should return redirect result for ACCOUNT_PENDING code', () => {
        const error = new UserServiceError(
          'ACCOUNT_PENDING',
          'Account pending'
        );
        const result = service.translate(error);

        expect(result.message).toBe('');
        expect(result.shouldRedirect).toBe(true);
        expect(result.silent).toBe(false);
      });

      it('should translate LOGIN_FAILED error', () => {
        const error = new UserServiceError('LOGIN_FAILED', 'Login failed');
        const result = service.translate(error);

        expect(result.message).toBe('Invalid username or password');
        expect(result.shouldRedirect).toBe(false);
        expect(result.silent).toBe(false);
      });

      it('should fall back to unknown error for ACCESS_DENIED code', () => {
        const error = new UserServiceError('ACCESS_DENIED', 'Access denied');
        const result = service.translate(error);

        expect(result.message).toBe('Something went wrong. Please try again.');
        expect(result.shouldRedirect).toBe(false);
        expect(result.silent).toBe(false);
      });
    });

    describe('unknown errors', () => {
      it('should return unknown error message for non-typed errors', () => {
        const error = new Error('Generic error');
        const result = service.translate(error);

        expect(result.message).toBe('Something went wrong. Please try again.');
        expect(result.shouldRedirect).toBe(false);
        expect(result.silent).toBe(false);
      });

      it('should return unknown error message for string errors', () => {
        const result = service.translate('Some error string');

        expect(result.message).toBe('Something went wrong. Please try again.');
        expect(result.shouldRedirect).toBe(false);
        expect(result.silent).toBe(false);
      });

      it('should return unknown error message for null', () => {
        const result = service.translate(null);

        expect(result.message).toBe('Something went wrong. Please try again.');
        expect(result.shouldRedirect).toBe(false);
        expect(result.silent).toBe(false);
      });

      it('should return unknown error message for undefined', () => {
        const result = service.translate(undefined);

        expect(result.message).toBe('Something went wrong. Please try again.');
        expect(result.shouldRedirect).toBe(false);
        expect(result.silent).toBe(false);
      });
    });
  });
});
