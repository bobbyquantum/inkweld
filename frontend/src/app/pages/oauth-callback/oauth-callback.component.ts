import { Component, inject, type OnInit } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthTokenService } from '../../services/auth/auth-token.service';
import { UserService } from '../../services/user/user.service';

@Component({
  selector: 'app-oauth-callback',
  imports: [MatProgressSpinnerModule],
  template: `
    <div class="callback-container">
      @if (errorMessage) {
        <div class="error">
          <h2>Sign-in failed</h2>
          <p>{{ errorMessage }}</p>
          <a href="/">Return to home</a>
        </div>
      } @else {
        <mat-spinner diameter="40"></mat-spinner>
        <p>Completing sign-in...</p>
      }
    </div>
  `,
  styles: [
    `
      .callback-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100vh;
        gap: 16px;
      }

      .error {
        text-align: center;

        h2 {
          color: var(--mat-theme-error);
        }

        a {
          color: var(--mat-theme-primary);
        }
      }
    `,
  ],
})
export class OAuthCallbackComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authTokenService = inject(AuthTokenService);
  private readonly userService = inject(UserService);

  errorMessage = '';

  ngOnInit(): void {
    void this.handleCallback();
  }

  private async handleCallback(): Promise<void> {
    const token = this.route.snapshot.queryParamMap.get('token');
    const error = this.route.snapshot.queryParamMap.get('error');

    if (error) {
      this.errorMessage = this.getErrorMessage(error);
      return;
    }

    if (!token) {
      this.errorMessage = 'No authentication token received.';
      return;
    }

    try {
      // Store the JWT token
      this.authTokenService.setToken(token);

      // Load the user profile using the new token
      await this.userService.loadCurrentUser();

      // Navigate to home
      await this.router.navigate(['/']);
    } catch {
      this.errorMessage = 'Failed to complete sign-in. Please try again.';
    }
  }

  private getErrorMessage(error: string): string {
    switch (error) {
      case 'github_auth_failed':
        return 'GitHub authentication failed. Please try again.';
      case 'account_disabled':
        return 'Your account has been disabled. Contact an administrator.';
      default:
        return 'An unexpected error occurred during sign-in.';
    }
  }
}
