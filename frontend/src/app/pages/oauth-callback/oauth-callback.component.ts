import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { AuthTokenService } from '@services/auth/auth-token.service';
import { SetupService } from '@services/core/setup.service';
import { UserService } from '@services/user/user.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-oauth-callback',
  imports: [MatProgressSpinnerModule, TranslocoModule],
  templateUrl: './oauth-callback.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./oauth-callback.component.scss'],
})
export class OAuthCallbackComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly authTokenService = inject(AuthTokenService);
  private readonly setupService = inject(SetupService);
  private readonly userService = inject(UserService);
  private readonly transloco = inject(TranslocoService);

  // Signal required: the exchange-failure path assigns this from an async
  // continuation (catch after `await`) with no other state writes in the
  // flow, so a plain property would never re-render in zoneless mode and the
  // user would stare at the spinner forever.
  readonly errorMessage = signal('');

  ngOnInit(): void {
    void this.handleCallback();
  }

  private async handleCallback(): Promise<void> {
    const code = this.route.snapshot.queryParamMap.get('code');
    const error = this.route.snapshot.queryParamMap.get('error');

    if (error) {
      this.errorMessage.set(this.getErrorMessage(error));
      return;
    }

    if (!code) {
      this.errorMessage.set(
        this.transloco.translate('auth.oauthCallback.signInFailed')
      );
      return;
    }

    try {
      // Exchange the one-time code for a JWT token
      const baseUrl =
        this.setupService.getServerUrl() || globalThis.location.origin;
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
      this.errorMessage.set(this.transloco.translate('errors.unknown'));
    }
  }

  private getErrorMessage(_error: string): string {
    // All error cases map to the same generic message
    return this.transloco.translate('errors.unknown');
  }
}
