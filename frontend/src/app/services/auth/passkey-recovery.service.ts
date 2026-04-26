import { inject, Injectable } from '@angular/core';
import { AuthenticationService } from '@inkweld/index';
import {
  BROWSER_SUPPORTS_WEBAUTHN,
  PasskeyError,
  START_REGISTRATION,
} from '@services/auth/passkey.service';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';
import { firstValueFrom } from 'rxjs';

/**
 * Result of a successful recovery redemption. Mirrors the backend's
 * `PasskeyRecoveryFinishResponse` minus the OpenAPI noise.
 *
 * Note: there is intentionally NO `token` field. The backend never issues a
 * session as part of recovery — the user must complete a normal passkey
 * login afterwards. See backend/src/routes/passkey-recovery.routes.ts L178-180.
 */
export interface PasskeyRecoveryFinishResult {
  passkey: {
    id: string;
    name: string | null;
    deviceType: string | null;
    backedUp: boolean;
    createdAt: number;
    lastUsedAt: number | null;
  };
}

/**
 * Frontend wrapper for the passkey recovery (magic-link enrolment) flow.
 *
 * Kept separate from `PasskeyService` for the same reason the backend keeps
 * `passkey-recovery.routes.ts` separate from `passkey.routes.ts`:
 *
 *   - Recovery is *anonymous* — no JWT, no session, the recovery token IS
 *     the proof of identity.
 *   - It only ever ENROLS a credential; it can't list, rename, or delete.
 *   - It can be feature-flagged off independently (EMAIL_RECOVERY_ENABLED).
 *
 * Reuses the `START_REGISTRATION` and `BROWSER_SUPPORTS_WEBAUTHN` injection
 * tokens from `PasskeyService` so test stubs are interchangeable.
 */
@Injectable({
  providedIn: 'root',
})
export class PasskeyRecoveryService {
  private readonly api = inject(AuthenticationService);
  private readonly browserSupportsWebAuthn = inject(BROWSER_SUPPORTS_WEBAUTHN);
  private readonly startRegistration = inject(START_REGISTRATION);

  /** True if the current browser exposes the WebAuthn API. */
  isSupported(): boolean {
    return this.browserSupportsWebAuthn();
  }

  /**
   * Step 1 — request a recovery link by email. The backend always returns a
   * generic success message (to prevent account enumeration) regardless of
   * whether the email matches a real user.
   */
  async requestRecovery(email: string): Promise<void> {
    try {
      await firstValueFrom(this.api.requestPasskeyRecovery({ email }));
    } catch (err) {
      // Surface a network-level error so the UI can show "try again later".
      // The success/no-match distinction is intentionally hidden by the API.
      throw this.toError(err, 'Failed to request a recovery link.');
    }
  }

  /**
   * Step 2 — exchange the recovery token for WebAuthn registration options,
   * run the browser ceremony, then submit the attestation back to the
   * server. On success the new credential is persisted but no session is
   * issued; the caller should redirect the user to log in normally.
   *
   * @param token Recovery token from the email link's `?token=` query param.
   * @param name  Optional human-readable name for the new passkey.
   */
  async redeemRecovery(
    token: string,
    name?: string
  ): Promise<PasskeyRecoveryFinishResult> {
    if (!this.isSupported()) {
      throw new PasskeyError(
        'UNSUPPORTED',
        'This browser does not support passkeys.'
      );
    }

    // Step 2a — fetch options. A 400 here means the token is invalid,
    // already used, or expired; we surface the server's message verbatim so
    // the UI can render it directly.
    let options: PublicKeyCredentialCreationOptionsJSON;
    try {
      const startResp = await firstValueFrom(
        this.api.startPasskeyRecovery({ token })
      );
      options = startResp as unknown as PublicKeyCredentialCreationOptionsJSON;
    } catch (err) {
      throw this.toError(err, 'Invalid or expired recovery link.');
    }

    // Step 2b — browser ceremony. NotAllowedError / AbortError = user
    // cancelled the prompt; surface as CANCELLED so the caller can offer a
    // retry without burning the (still-valid) token.
    let attestation: RegistrationResponseJSON;
    try {
      attestation = await this.startRegistration({ optionsJSON: options });
    } catch (err) {
      throw this.toBrowserError(err);
    }

    // Step 2c — verify and persist. Token is consumed atomically here, so
    // any failure on this leg leaves the link still usable for a retry.
    try {
      const result = await firstValueFrom(
        this.api.finishPasskeyRecovery({
          token,
          response: attestation as unknown as Record<string, unknown>,
          name,
        })
      );
      return {
        passkey: {
          id: result.passkey.id,
          name: result.passkey.name ?? null,
          deviceType: result.passkey.deviceType ?? null,
          backedUp: result.passkey.backedUp,
          createdAt: result.passkey.createdAt,
          lastUsedAt: result.passkey.lastUsedAt ?? null,
        },
      };
    } catch (err) {
      throw this.toError(err, 'Failed to enrol new passkey.');
    }
  }

  // ---- Error helpers ----

  private toBrowserError(err: unknown): PasskeyError {
    if (err instanceof Error) {
      if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
        return new PasskeyError('CANCELLED', 'Passkey prompt was cancelled.');
      }
      return new PasskeyError('UNKNOWN', err.message);
    }
    return new PasskeyError('UNKNOWN', 'Passkey operation failed.');
  }

  private toError(err: unknown, fallback: string): PasskeyError {
    if (err instanceof PasskeyError) return err;
    // HttpErrorResponse from the generated client: extract the server's
    // {error: "..."} body when present.
    if (err && typeof err === 'object' && 'error' in err) {
      const inner = (err as { error: unknown }).error;
      if (inner && typeof inner === 'object' && 'error' in inner) {
        const message = (inner as { error: unknown }).error;
        if (typeof message === 'string') {
          return new PasskeyError('NETWORK_ERROR', message);
        }
      }
    }
    const message = err instanceof Error ? err.message : fallback;
    return new PasskeyError('NETWORK_ERROR', message);
  }
}
