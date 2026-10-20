import { inject, Injectable } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { PasskeyError } from '@services/auth/passkey.service';
import { UserServiceError } from '@services/user/user.service';

export type ErrorTranslationResult = {
  message: string;
  shouldRedirect: boolean;
  silent: boolean;
  /** Set with shouldRedirect: the registration was rejected, not pending. */
  rejected?: boolean;
};

const PASSKEY_ERROR_KEYS: Record<string, string> = {
  VERIFICATION_FAILED: 'login.errors.verificationFailed',
  NETWORK_ERROR: 'login.errors.networkError',
  UNSUPPORTED: 'login.errors.unsupported',
  ACCOUNT_DISABLED: 'login.errors.accountDisabled',
};

const USER_ERROR_KEYS: Record<string, string> = {
  LOGIN_FAILED: 'login.errors.loginFailed',
};

const SILENT_CODES = new Set(['CANCELLED']);
const REDIRECT_CODES = new Set([
  'PENDING_APPROVAL',
  'ACCOUNT_PENDING',
  'ACCOUNT_REJECTED',
]);

@Injectable({ providedIn: 'root' })
export class ErrorTranslationService {
  private readonly transloco = inject(TranslocoService);

  translate(error: unknown): ErrorTranslationResult {
    if (error instanceof PasskeyError) {
      return this.translatePasskeyError(error);
    }

    if (error instanceof UserServiceError) {
      return this.translateUserError(error);
    }

    return {
      message: this.transloco.translate('errors.unknown'),
      shouldRedirect: false,
      silent: false,
    };
  }

  private translatePasskeyError(error: PasskeyError): ErrorTranslationResult {
    if (SILENT_CODES.has(error.code)) {
      return { message: '', shouldRedirect: false, silent: true };
    }

    if (REDIRECT_CODES.has(error.code)) {
      return this.redirect(error.code);
    }

    const key = PASSKEY_ERROR_KEYS[error.code];
    return {
      message: key
        ? this.transloco.translate(key)
        : this.transloco.translate('errors.unknown'),
      shouldRedirect: false,
      silent: false,
    };
  }

  private translateUserError(error: UserServiceError): ErrorTranslationResult {
    if (REDIRECT_CODES.has(error.code)) {
      return this.redirect(error.code);
    }

    const key = USER_ERROR_KEYS[error.code];
    return {
      message: key
        ? this.transloco.translate(key)
        : this.transloco.translate('errors.unknown'),
      shouldRedirect: false,
      silent: false,
    };
  }

  private redirect(code: string): ErrorTranslationResult {
    return {
      message: '',
      shouldRedirect: true,
      silent: false,
      rejected: code === 'ACCOUNT_REJECTED',
    };
  }
}
