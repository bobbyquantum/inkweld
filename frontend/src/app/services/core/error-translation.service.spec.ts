import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { ErrorTranslationService } from './error-translation.service';
import { PasskeyError } from '@services/auth/passkey.service';
import { UserServiceError } from '@services/user/user.service';

const { spyOn } = vi;

describe('ErrorTranslationService', () => {
  let service: ErrorTranslationService;
  let transloco: TranslocoService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [translocoTestProvider()],
      providers: [ErrorTranslationService],
    });

    service = TestBed.inject(ErrorTranslationService);
    transloco = TestBed.inject(TranslocoService);
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

      it('should return silent result for NO_CREDENTIAL code', () => {
        const error = new PasskeyError('NO_CREDENTIAL', 'No credential');
        const result = service.translate(error);

        expect(result.message).toBe('Something went wrong. Please try again.');
        expect(result.shouldRedirect).toBe(false);
        expect(result.silent).toBe(false);
      });

      it('should translate VERIFICATION_FAILED error', () => {
        const error = new PasskeyError(
          'VERIFICATION_FAILED',
          'Verification failed'
        );
        const result = service.translate(error);

        expect(result.message).toBe(
          'Passkey verification failed. Please try again.'
        );
        expect(result.shouldRedirect).toBe(false);
        expect(result.silent).toBe(false);
      });

      it('should translate NETWORK_ERROR error', () => {
        const error = new PasskeyError('NETWORK_ERROR', 'Network error');
        const result = service.translate(error);

        expect(result.message).toBe(
          'Network error. Please check your connection and try again.'
        );
        expect(result.shouldRedirect).toBe(false);
        expect(result.silent).toBe(false);
      });

      it('should translate UNSUPPORTED error', () => {
        const error = new PasskeyError('UNSUPPORTED', 'Unsupported');
        const result = service.translate(error);

        expect(result.message).toBe(
          'Passkeys are not supported by this browser.'
        );
        expect(result.shouldRedirect).toBe(false);
        expect(result.silent).toBe(false);
      });

      it('should translate ACCOUNT_DISABLED error', () => {
        const error = new PasskeyError('ACCOUNT_DISABLED', 'Account disabled');
        const result = service.translate(error);

        expect(result.message).toBe(
          'Your account has been disabled. Please contact an administrator.'
        );
        expect(result.shouldRedirect).toBe(false);
        expect(result.silent).toBe(false);
      });

      it('should fall back to unknown error for UNKNOWN code', () => {
        const error = new PasskeyError('UNKNOWN', 'Unknown error');
        const result = service.translate(error);

        expect(result.message).toBe('Something went wrong. Please try again.');
        expect(result.shouldRedirect).toBe(false);
        expect(result.silent).toBe(false);
      });
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
