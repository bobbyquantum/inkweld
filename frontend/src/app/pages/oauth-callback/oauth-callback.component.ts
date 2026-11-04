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

/**
 * Sign-in errors (the server's `?error=` code) that have a message of their
 * own. Any other code shows the generic message.
 */
const ERROR_MESSAGE_KEYS: ReadonlyMap<string, string> = new Map([
  // A new GitHub identity whose verified email an existing account uses.
  ['email_in_use', 'auth.oauthCallback.emailInUse'],
]);

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
    const provider = this.route.snapshot.queryParamMap.get('provider');

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
      const exchangePath =
        provider === 'oidc' ? 'oidc/exchange-code' : 'exchange-code';
      const response = await firstValueFrom(
        this.http.post<{ token: string }>(
          `${baseUrl}/api/v1/auth/${exchangePath}`,
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

  private getErrorMessage(error: string): string {
    return this.transloco.translate(
      ERROR_MESSAGE_KEYS.get(error) ?? 'errors.unknown'
    );
  }
}
