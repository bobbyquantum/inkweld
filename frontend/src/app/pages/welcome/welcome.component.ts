import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { OAuthProviderListComponent } from '@components/oauth-provider-list/oauth-provider-list.component';
import { UserService, UserServiceError } from '@services/user.service';

@Component({
  selector: 'app-welcome',
  imports: [
    FormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    OAuthProviderListComponent,
  ],
  templateUrl: './welcome.component.html',
  styleUrl: './welcome.component.scss',
})
export class WelcomeComponent {
  private snackBar = inject(MatSnackBar);
  private userService = inject(UserService);
  private router = inject(Router);

  username = '';
  password = '';
  passwordError: string | null = null;
  isLoggingIn = false;
  lastAttemptedUsername = '';
  lastAttemptedPassword = '';

  // Clear error when username is changed
  onUsernameChange(): void {
    if (this.passwordError) {
      this.passwordError = null;
    }

    // If username is different from the last attempt, clear the lastAttemptedUsername
    if (this.username !== this.lastAttemptedUsername) {
      this.lastAttemptedUsername = '';
    }
  }

  // Clear error when password is changed
  onPasswordChange(): void {
    if (this.passwordError) {
      this.passwordError = null;
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
    return !this.isFormValid() || this.isLoggingIn;
  }

  async onLogin(): Promise<void> {
    // Clear previous error messages
    this.passwordError = null;

    // Validate form before submission
    if (!this.isFormValid()) {
      this.passwordError = 'Please enter both username and password.';
      return;
    }

    // Set loading state
    this.isLoggingIn = true;

    try {
      await this.userService.login(this.username, this.password);
      // Login successful - no need to do anything here as user will be redirected
    } catch (error) {
      if (error instanceof UserServiceError) {
        if (error.code === 'LOGIN_FAILED') {
          // Remember the failed username and password attempt
          this.lastAttemptedUsername = this.username;
          this.lastAttemptedPassword = this.password;

          // Set form-level error for password field
          this.passwordError =
            'Invalid username or password. Please check your credentials.';

          // Also keep the snackbar notification for accessibility
          this.snackBar.open(
            'Invalid username or password. Please check your credentials.',
            'Close',
            {
              duration: 5000,
              panelClass: ['error-snackbar'],
            }
          );
        } else if (error.code === 'ACCOUNT_PENDING') {
          // Handle pending approval case
          this.passwordError = null; // Clear password error since credentials are correct
          void this.router.navigate(['/approval-pending']);
        } else {
          this.snackBar.open(error.message, 'Close', {
            duration: 5000,
          });
        }
      } else if (error instanceof Error) {
        this.snackBar.open(
          'An unexpected error occurred during login.',
          'Close',
          {
            duration: 5000,
          }
        );
      }
    } finally {
      // Always reset loading state when done
      this.isLoggingIn = false;
    }
  }
}




