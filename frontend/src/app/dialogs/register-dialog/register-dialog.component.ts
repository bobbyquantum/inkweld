import {
  ChangeDetectorRef,
  Component,
  inject,
  type OnDestroy,
  type OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { OAuthProviderListComponent } from '@components/oauth-provider-list/oauth-provider-list.component';
import {
  RegistrationFormComponent,
  type RegistrationResult,
} from '@components/registration-form/registration-form.component';
import { AuthTokenService } from '@services/auth/auth-token.service';
import { PasskeyError, PasskeyService } from '@services/auth/passkey.service';
import { SystemConfigService } from '@services/core/system-config.service';
import { Subject } from 'rxjs';

@Component({
  selector: 'app-register-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatDividerModule,
    OAuthProviderListComponent,
    RegistrationFormComponent,
  ],
  templateUrl: './register-dialog.component.html',
  styleUrl: './register-dialog.component.scss',
})
export class RegisterDialogComponent implements OnInit, OnDestroy {
  private readonly dialogRef = inject(MatDialogRef<RegisterDialogComponent>);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly passkeyService = inject(PasskeyService);
  private readonly authTokenService = inject(AuthTokenService);
  private readonly systemConfig = inject(SystemConfigService);

  readonly isPasswordLoginEnabled = this.systemConfig.isPasswordLoginEnabled;
  readonly isEnrollingPasskey = signal(false);

  @ViewChild(RegistrationFormComponent)
  registrationForm?: RegistrationFormComponent;

  isMobile = false;
  readonly providersLoaded = signal(false);

  private readonly destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.isMobile = globalThis.innerWidth < 768;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Handle providers loaded event
  onProvidersLoaded(): void {
    // Signal handles change detection properly, no setTimeout needed
    this.providersLoaded.set(true);
    this.changeDetectorRef.detectChanges();
  }

  // Handle successful registration
  async onRegistered(result: RegistrationResult): Promise<void> {
    if (result.requiresApproval) {
      // Passwordless + approval-required: the brand-new account has NO
      // credential at all (no password by definition; no passkey yet).
      // The backend issued a 15-minute enrolment-only token specifically
      // so we can attach a passkey BEFORE parking the user at
      // /approval-pending. If we skip enrolment they'd be permanently
      // locked out — admin approval would unlock an account they can't
      // sign into. Block dialog closure until enrolment succeeds.
      if (!this.isPasswordLoginEnabled() && result.enrolmentToken) {
        const enrolled = await this.enrollPasskeyAfterRegistration(
          result,
          result.enrolmentToken
        );
        if (!enrolled) {
          // Keep the dialog open so the user can retry. The 15-minute
          // window on the enrolment token is generous; cancel/error here
          // is recoverable. Closing without a passkey AND without a
          // password would leave the account unreachable.
          return;
        }
      }

      // Close dialog and redirect to dedicated pending approval page.
      // In password mode, the account has a password and the user can
      // sign in once approved (and add a passkey from settings if they
      // want), so no enrolment ceremony here.
      this.dialogRef.close(false);
      void this.router.navigate(['/approval-pending'], {
        queryParams: {
          username: result.user.username,
          name: result.user.name || result.user.username,
          userId: result.user.id,
        },
      });
      return;
    }

    // Passwordless mode (no approval required): the account was created
    // with NULL password, so the user has no way to sign back in unless
    // we enrol a passkey right now while their session is still alive.
    // Block dialog closure until enrolment succeeds (or the user
    // explicitly bails). Uses the FULL session token already persisted
    // to AuthTokenService by RegistrationFormComponent.
    if (!this.isPasswordLoginEnabled()) {
      const enrolled = await this.enrollPasskeyAfterRegistration(result);
      if (!enrolled) {
        // User cancelled or hit a hard error — keep them in the dialog so
        // they can retry. Their account exists and they're authenticated;
        // closing without a passkey would leave them locked out next session.
        return;
      }
    }

    this.snackBar.open('Registration successful!', 'Close', {
      duration: 3000,
    });
    this.dialogRef.close(true); // Close with success result
    void this.router.navigate(['/']);
  }

  /**
   * Enrol the user's first passkey immediately after a passwordless signup.
   *
   * Returns true on success, false on user cancellation or recoverable error
   * (so the caller can keep the dialog open for a retry).
   *
   * Two call sites:
   * 1. No-approval mode: the user is fully authenticated (RegistrationForm
   *    persisted the full-scope JWT and called userService.setCurrentUser),
   *    so passkeyService.register can call the authenticated WebAuthn
   *    endpoints directly. Pass `enrolmentToken=undefined`.
   * 2. Approval-required mode: the user is NOT authenticated for general
   *    use; the backend issued a short-lived enrolment-scope token. We
   *    apply it to AuthTokenService transiently — set BEFORE the ceremony,
   *    cleared in `finally` regardless of outcome — so the auto-generated
   *    PasskeysService picks it up via the auth interceptor. Leaving an
   *    enrolment token in storage is harmless (every other middleware
   *    rejects it) but tidiness helps debugging.
   */
  private async enrollPasskeyAfterRegistration(
    result: RegistrationResult,
    enrolmentToken?: string
  ): Promise<boolean> {
    this.isEnrollingPasskey.set(true);
    if (enrolmentToken) {
      this.authTokenService.setToken(enrolmentToken);
    }
    try {
      // Default credential name uses the device hint; users can rename later
      // from account settings.
      await this.passkeyService.register('Primary passkey');
      return true;
    } catch (err) {
      const message =
        err instanceof PasskeyError
          ? err.message
          : 'Could not set up your passkey. Please try again.';
      // No action button: the user can simply trigger the passkey flow
      // again from the dialog's "Set up passkey" button. A "Retry" snackbar
      // action with no handler would silently dismiss the toast and confuse
      // users who tapped it expecting it to do something.
      this.snackBar.open(message, 'Dismiss', { duration: 6000 });
      // Surface the username so the user knows their account exists even
      // though enrolment failed — important context if they close the dialog.
      console.error(
        `[register-dialog] Passkey enrolment failed for ${result.user.username}:`,
        err
      );
      return false;
    } finally {
      // Always clear the enrolment-scope token, success or failure. On
      // success the user proceeds to /approval-pending where they shouldn't
      // carry a session of any kind; on failure they'll retry, which calls
      // this method again and re-applies the same token. The token itself
      // remains valid server-side until its 15-minute TTL expires.
      if (enrolmentToken) {
        this.authTokenService.clearToken();
      }
      this.isEnrollingPasskey.set(false);
    }
  }

  // Handle registration error
  onRegistrationError(error: Error): void {
    this.snackBar.open(error.message, 'Close', { duration: 5000 });
  }

  onLoginClick(): void {
    this.dialogRef.close('login'); // Signal to open login dialog
  }
}
