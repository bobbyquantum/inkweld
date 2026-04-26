import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import {
  type PasskeyListResponse,
  PasskeysService,
  type User,
} from '@inkweld/index';
import { AuthTokenService } from '@services/auth/auth-token.service';
import { StorageContextService } from '@services/core/storage-context.service';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  startAuthentication as startAuthenticationType,
  startRegistration as startRegistrationType,
} from '@simplewebauthn/browser';
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  WebAuthnAbortService,
} from '@simplewebauthn/browser';
import { firstValueFrom } from 'rxjs';

// Injection tokens for @simplewebauthn/browser functions.
// Providing these in tests avoids vi.mock() cross-file contamination
// issues in the shared-context Vitest runner (isolate:false + forks).
export const BROWSER_SUPPORTS_WEBAUTHN = new InjectionToken<() => boolean>(
  'BROWSER_SUPPORTS_WEBAUTHN',
  {
    factory: () => browserSupportsWebAuthn,
  }
);

export const START_REGISTRATION = new InjectionToken<
  typeof startRegistrationType
>('START_REGISTRATION', {
  factory: () => startRegistration,
});

export const START_AUTHENTICATION = new InjectionToken<
  typeof startAuthenticationType
>('START_AUTHENTICATION', {
  factory: () => startAuthentication,
});

export class PasskeyError extends Error {
  constructor(
    public code:
      | 'UNSUPPORTED'
      | 'CANCELLED'
      | 'NETWORK_ERROR'
      | 'VERIFICATION_FAILED'
      | 'NO_CREDENTIAL'
      | 'PENDING_APPROVAL'
      | 'ACCOUNT_DISABLED'
      | 'UNKNOWN',
    message: string
  ) {
    super(message);
    this.name = 'PasskeyError';
  }
}

/**
 * Angular wrapper around the WebAuthn (passkey) flows.
 *
 * Uses `@simplewebauthn/browser` for the navigator.credentials interactions
 * and the auto-generated PasskeysService for the backend round-trips.
 */
@Injectable({
  providedIn: 'root',
})
export class PasskeyService {
  private readonly api = inject(PasskeysService);
  private readonly authTokenService = inject(AuthTokenService);
  private readonly storageContext = inject(StorageContextService);
  private readonly browserSupportsWebAuthn = inject(BROWSER_SUPPORTS_WEBAUTHN);
  private readonly startRegistration = inject(START_REGISTRATION);
  private readonly startAuthentication = inject(START_AUTHENTICATION);

  /**
   * Returns true if the current browser exposes the WebAuthn API.
   */
  isSupported(): boolean {
    return this.browserSupportsWebAuthn();
  }

  /**
   * Abort an in-progress passkey login ceremony (e.g. user taps "Cancel").
   * The pending `login()` promise will reject with a `CANCELLED` PasskeyError.
   * If no ceremony is in progress this is a no-op.
   */
  abortLogin(): void {
    WebAuthnAbortService.cancelCeremony();
  }

  /**
   * Register a new passkey for the currently authenticated user.
   */
  async register(name?: string): Promise<void> {
    if (!this.isSupported()) {
      throw new PasskeyError(
        'UNSUPPORTED',
        'This browser does not support passkeys.'
      );
    }

    let options: PublicKeyCredentialCreationOptionsJSON;
    try {
      const startResp = await firstValueFrom(
        this.api.startPasskeyRegistration()
      );
      options = startResp as unknown as PublicKeyCredentialCreationOptionsJSON;
    } catch (err) {
      throw this.toPasskeyError(err, 'Failed to start passkey registration.');
    }

    let attestation: RegistrationResponseJSON;
    try {
      attestation = await this.startRegistration({ optionsJSON: options });
    } catch (err) {
      throw this.toBrowserError(err);
    }

    try {
      await firstValueFrom(
        this.api.finishPasskeyRegistration({
          response: attestation as unknown as Record<string, unknown>,
          name,
        })
      );
    } catch (err) {
      throw this.toPasskeyError(err, 'Failed to verify passkey registration.');
    }
  }

  /**
   * Authenticate with a passkey (discoverable credential / usernameless).
   *
   * On success the returned JWT is stored in `AuthTokenService` for the
   * active server context and the resolved user is returned to the caller.
   */
  async login(): Promise<User> {
    if (!this.isSupported()) {
      throw new PasskeyError(
        'UNSUPPORTED',
        'This browser does not support passkeys.'
      );
    }

    let options: PublicKeyCredentialRequestOptionsJSON;
    try {
      const startResp = await firstValueFrom(this.api.startPasskeyLogin());
      options = startResp as unknown as PublicKeyCredentialRequestOptionsJSON;
    } catch (err) {
      throw this.toPasskeyError(err, 'Failed to start passkey login.');
    }

    let assertion: AuthenticationResponseJSON;
    try {
      assertion = await this.startAuthentication({ optionsJSON: options });
    } catch (err) {
      throw this.toBrowserError(err);
    }

    try {
      const result = await firstValueFrom(
        this.api.finishPasskeyLogin({
          response: assertion as unknown as Record<string, unknown>,
        })
      );

      if (!result.token || !result.user) {
        throw new PasskeyError(
          'VERIFICATION_FAILED',
          'Server did not return a session token.'
        );
      }

      this.authTokenService.setToken(result.token);
      // Mirror UserService.login: persist user profile to active config so
      // the "Switch Server" panel shows the username.
      const activeConfig = this.storageContext.getActiveConfig();
      if (activeConfig) {
        this.storageContext.updateConfigUserProfile(activeConfig.id, {
          name: result.user.name ?? result.user.username,
          username: result.user.username,
        });
      }

      return result.user;
    } catch (err) {
      if (err instanceof PasskeyError) throw err;
      throw this.toPasskeyError(err, 'Failed to verify passkey login.');
    }
  }

  /** List passkeys registered for the current user. */
  async list(): Promise<PasskeyListResponse> {
    return firstValueFrom(this.api.listPasskeys());
  }

  /** Delete a passkey by id. */
  async delete(id: string): Promise<void> {
    await firstValueFrom(this.api.deletePasskey(id));
  }

  /** Rename a passkey. */
  async rename(id: string, name: string): Promise<void> {
    await firstValueFrom(this.api.renamePasskey(id, { name }));
  }

  // ---- Error helpers ----

  private toBrowserError(err: unknown): PasskeyError {
    // Errors thrown by @simplewebauthn/browser surface DOMException-style
    // names (NotAllowedError, AbortError, etc.). User cancellation is the
    // most common case and should not be treated as a hard failure.
    if (err instanceof Error) {
      if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
        return new PasskeyError('CANCELLED', 'Passkey prompt was cancelled.');
      }
      return new PasskeyError('UNKNOWN', err.message);
    }
    return new PasskeyError('UNKNOWN', 'Passkey operation failed.');
  }

  private toPasskeyError(err: unknown, fallback: string): PasskeyError {
    if (err instanceof PasskeyError) return err;

    // Surface backend gating responses as typed codes so callers (esp. the
    // login dialog) can route the user to /approval-pending instead of just
    // painting the raw error string in red. The backend handlers in
    // passkey.routes.ts return:
    //   403 'Account pending approval' — user not yet approved
    //   403 'Account is disabled'      — user disabled by admin
    // Anything else 4xx/5xx falls through to NETWORK_ERROR.
    if (err instanceof HttpErrorResponse) {
      const serverMessage =
        (typeof err.error === 'object' && err.error !== null
          ? (err.error as { error?: string }).error
          : undefined) || err.message;
      if (err.status === 403) {
        const lower = (serverMessage || '').toLowerCase();
        if (lower.includes('pending approval')) {
          return new PasskeyError('PENDING_APPROVAL', serverMessage);
        }
        if (lower.includes('disabled')) {
          return new PasskeyError('ACCOUNT_DISABLED', serverMessage);
        }
      }
      return new PasskeyError('NETWORK_ERROR', serverMessage);
    }

    const message = err instanceof Error ? err.message : fallback;
    return new PasskeyError('NETWORK_ERROR', message);
  }
}
