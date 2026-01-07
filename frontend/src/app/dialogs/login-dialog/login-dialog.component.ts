import { Component, inject, signal } from '@angular/core';
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
  ],
  templateUrl: './login-dialog.component.html',
  styleUrl: './login-dialog.component.scss',
})
export class LoginDialogComponent {
  private dialogRef = inject(MatDialogRef<LoginDialogComponent>);
  private snackBar = inject(MatSnackBar);
  private userService = inject(UserService);
  private router = inject(Router);

  username = '';
  password = '';
  readonly passwordError = signal<string | null>(null);
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
      this.passwordError.set('Please enter both username and password.');
      return;
    }

    // Set loading state
    this.isLoggingIn.set(true);

    try {
      await this.userService.login(this.username, this.password);
      this.snackBar.open(`Welcome back, ${this.username}!`, 'Close', {
        duration: 3000,
      });
      this.dialogRef.close(true); // Close with success result
      void this.router.navigate(['/']);
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
          this.passwordError.set('Invalid username or password');
          return;
        }
        // Other known errors
        this.passwordError.set(error.message);
      } else {
        // Unknown error
        this.passwordError.set('Login failed. Please try again.');
      }
    } finally {
      this.isLoggingIn.set(false);
    }
  }

  onProvidersLoaded(): void {
    this.providersLoaded.set(true);
  }

  onRegisterClick(): void {
    this.dialogRef.close('register'); // Signal to open register dialog
  }
}
