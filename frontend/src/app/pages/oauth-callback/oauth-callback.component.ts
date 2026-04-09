import { HttpClient } from '@angular/common/http';
import { Component, inject, type OnInit } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthTokenService } from '@services/auth/auth-token.service';
import { SetupService } from '@services/core/setup.service';
import { UserService } from '@services/user/user.service';
import { firstValueFrom } from 'rxjs';

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
  private readonly http = inject(HttpClient);
  private readonly authTokenService = inject(AuthTokenService);
  private readonly setupService = inject(SetupService);
  private readonly userService = inject(UserService);

  errorMessage = '';

  ngOnInit(): void {
    void this.handleCallback();
  }

  private async handleCallback(): Promise<void> {
    const code = this.route.snapshot.queryParamMap.get('code');
    const error = this.route.snapshot.queryParamMap.get('error');

    if (error) {
      this.errorMessage = this.getErrorMessage(error);
      return;
    }

    if (!code) {
      this.errorMessage = 'No authorization code received.';
      return;
    }

    try {
      // Exchange the one-time code for a JWT token
      const baseUrl =
        this.setupService.getServerUrl() || window.location.origin;
      const response = await firstValueFrom(
        this.http.post<{ token: string }>(
          `${baseUrl}/api/v1/auth/exchange-code`,
          { code }
        )
      );

      // Store the JWT token
      this.authTokenService.setToken(response.token);

      // Load the user profile using the new token
      await this.userService.loadCurrentUser();

      // Navigate to home (replaceUrl prevents back-nav to callback)
      await this.router.navigate(['/'], { replaceUrl: true });
    } catch {
      // Clear any partially stored token on failure
      this.authTokenService.clearToken();
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
