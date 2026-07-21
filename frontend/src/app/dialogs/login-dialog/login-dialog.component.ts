import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { OAuthProviderListComponent } from '@components/oauth-provider-list/oauth-provider-list.component';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { PasskeyError, PasskeyService } from '@services/auth/passkey.service';
import { ErrorTranslationService } from '@services/core/error-translation.service';
import { SystemConfigService } from '@services/core/system-config.service';
import { UserService, UserServiceError } from '@services/user/user.service';

@Component({
  selector: 'app-login-dialog',
  imports: [
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    OAuthProviderListComponent,
    TranslocoModule,
  ],
  templateUrl: './login-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './login-dialog.component.scss',
})
export class LoginDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<LoginDialogComponent>);
  private readonly snackBar = inject(MatSnackBar);
  private readonly userService = inject(UserService);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly errorTranslation = inject(ErrorTranslationService);
  readonly systemConfig = inject(SystemConfigService);
  private readonly passkeyService = inject(PasskeyService);

  readonly isEmailEnabled = this.systemConfig.isEmailEnabled;
  readonly isPasswordLoginEnabled = this.systemConfig.isPasswordLoginEnabled;
  readonly isEmailRecoveryEnabled = this.systemConfig.isEmailRecoveryEnabled;
  readonly isPasskeySupported = this.passkeyService.isSupported();
  readonly isPasskeyLoggingIn = signal(false);

  /**
   * Whether to show the "Lost your passkey?" recovery link. Only meaningful
   * in passwordless deployments where email recovery is on — in classic
   * mode the existing "Forgot password?" link covers the recovery story.
   */
  readonly showPasskeyRecoveryLink = computed(
    () =>
      !this.isPasswordLoginEnabled() &&
      this.isEmailRecoveryEnabled() &&
      this.systemConfig.isPasskeysEnabled()
  );

  username = '';
  password = '';
  readonly passwordError = signal<string | null>(null);
  readonly passkeyError = signal<string | null>(null);
  readonly isLoggingIn = signal(false);
  lastAttemptedUsername = '';
  lastAttemptedPassword = '';
  readonly providersLoaded = signal(false);

  // Clear error when username is changed
  onUsernameChange(): void {
    if (this.passwordError()) {
      this.passwordError.set(null);
    }

    // If username is different from the last attempt, clear the lastAttemptedUsername
    if (this.username !== this.lastAttemptedUsername) {
      this.lastAttemptedUsername = '';
    }
  }

  // Clear error when password is changed
  onPasswordChange(): void {
    if (this.passwordError()) {
      this.passwordError.set(null);
    }

    // If password is different from the last attempt, clear the lastAttemptedPassword
    if (this.password !== this.lastAttemptedPassword) {
      this.lastAttemptedPassword = '';
    }
  }

  // Check if form is valid and can be submitted
  isFormValid(): boolean {
    // Basic form validation - fields must not be empty
    const basicValidation =
      this.username.trim() !== '' && this.password.trim() !== '';

    // Don't allow resubmitting the same failing password
    const notSameFailedPassword =
      this.password !== this.lastAttemptedPassword ||
      this.lastAttemptedPassword === '';

    return basicValidation && notSameFailedPassword;
  }

  // Check if login button should be disabled
  isLoginButtonDisabled(): boolean {
    return !this.isFormValid() || this.isLoggingIn() || !this.providersLoaded();
  }

  async onLogin(): Promise<void> {
    // Clear previous error messages
    this.passwordError.set(null);

    // Validate form before submission
    if (!this.isFormValid()) {
      this.passwordError.set(this.transloco.translate('login.enterBothFields'));
      return;
    }

    // Set loading state
    this.isLoggingIn.set(true);

    try {
      await this.userService.login(this.username, this.password);
      this.snackBar.open(
        this.transloco.translate('login.welcomeBack', {
          username: this.username,
        }),
        this.transloco.translate('close'),
        {
          duration: 3000,
        }
      );
      this.dialogRef.close(true); // Close with success result

      // Check for OAuth return URL (set by authGuard when redirecting from protected routes)
      const oauthReturnUrl = sessionStorage.getItem('oauth_return_url');
      if (oauthReturnUrl) {
        sessionStorage.removeItem('oauth_return_url');
        // Use navigateByUrl to preserve the full URL with query params
        void this.router.navigateByUrl(oauthReturnUrl);
      } else {
        void this.router.navigate(['/']);
      }
    } catch (error: unknown) {
      if (error instanceof UserServiceError) {
        // Check for pending approval
        if (error.code === 'ACCOUNT_PENDING') {
          this.dialogRef.close(false);
          void this.router.navigate(['/approval-pending']);
          return;
        }

        // Handle specific error types
        if (error.code === 'LOGIN_FAILED') {
          // Track the username/password that failed
          this.lastAttemptedUsername = this.username;
          this.lastAttemptedPassword = this.password;
          this.passwordError.set(
            this.transloco.translate('login.errors.loginFailed')
          );
          return;
        }
        // Other known errors — use the error-translation service
        const result = this.errorTranslation.translate(error);
        this.passwordError.set(result.message);
      } else {
        // Unknown error
        this.passwordError.set(
          this.transloco.translate('login.loginFailedGeneric')
        );
      }
    } finally {
      this.isLoggingIn.set(false);
    }
  }

  onProvidersLoaded(): void {
    this.providersLoaded.set(true);
  }

  async onPasskeyLogin(): Promise<void> {
    // Defence-in-depth: the button is `[disabled]` while a login is in flight,
    // but a programmatic invocation or a double-fired event could still re-enter
    // here. Bail out early in that case so we never start two parallel
    // ceremonies (which the authenticator would reject anyway).
    if (this.isPasskeyLoggingIn()) {
      return;
    }
    this.passkeyError.set(null);
    this.isPasskeyLoggingIn.set(true);
    try {
      const user = await this.passkeyService.login();
      // Sync the UserService cache so the rest of the app picks up the
      // freshly-authenticated user without an extra round trip.
      await this.userService.setCurrentUser(user);
      this.snackBar.open(
        this.transloco.translate('login.welcomeBack', {
          username: user.username,
        }),
        this.transloco.translate('close'),
        {
          duration: 3000,
        }
      );
      this.dialogRef.close(true);

      const oauthReturnUrl = sessionStorage.getItem('oauth_return_url');
      if (oauthReturnUrl) {
        sessionStorage.removeItem('oauth_return_url');
        void this.router.navigateByUrl(oauthReturnUrl);
      } else {
        void this.router.navigate(['/']);
      }
    } catch (error: unknown) {
      this.handlePasskeyLoginError(error);
    } finally {
      this.isPasskeyLoggingIn.set(false);
    }
  }

  private handlePasskeyLoginError(error: unknown): void {
    if (!(error instanceof PasskeyError)) {
      this.passkeyError.set(
        this.transloco.translate('login.passkeyLoginFailed')
      );
      return;
    }
    const result = this.errorTranslation.translate(error);
    if (result.silent) {
      // User cancelled the prompt - silent.
      return;
    }
    // Mirror the password-login flow: when the backend rejects with
    // pending-approval or account-disabled, send the user to the
    // dedicated /approval-pending page instead of leaving them
    // staring at red error text inside the login dialog. They've
    // proved possession of the passkey — the only thing missing is
    // admin approval, and the pending page tells them that clearly.
    if (result.shouldRedirect) {
      this.dialogRef.close(false);
      void this.router.navigate(['/approval-pending']);
      return;
    }
    this.passkeyError.set(result.message);
  }

  /**
   * Cancel an in-progress passkey login ceremony. The passkey service aborts
   * the browser prompt; the pending `login()` promise will resolve as CANCELLED
   * which the `onPasskeyLogin` handler already treats silently (no error shown).
   */
  cancelPasskeyLogin(): void {
    this.passkeyService.abortLogin();
    // The finally block in onPasskeyLogin() will reset isPasskeyLoggingIn.
  }

  onRegisterClick(): void {
    this.dialogRef.close('register'); // Signal to open register dialog
  }

  goToForgotPassword(): void {
    this.dialogRef.close(false);
    void this.router.navigate(['/forgot-password']);
  }

  /**
   * Send the user to the magic-link recovery request page. Used when password
   * login is off so users who lost their device can request a one-time link
   * by email and enrol a fresh passkey.
   */
  goToPasskeyRecovery(): void {
    this.dialogRef.close(false);
    void this.router.navigate(['/recover-passkey']);
  }
}
