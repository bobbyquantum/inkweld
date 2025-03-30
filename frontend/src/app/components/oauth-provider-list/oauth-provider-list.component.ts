import {
  Component,
  inject,
  Input,
  NgZone,
  OnInit,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '@inkweld/index';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-oauth-provider-list',
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    @if (isLoadingProviders() || hasAnyProviderEnabled()) {
      <div class="oauth-container">
        @if (shouldShowText()) {
          <h3 class="mat-subtitle-1">
            {{ isRegisterContext ? 'Or register with:' : 'Or sign in with:' }}
          </h3>
        }

        @if (isLoadingProviders()) {
          <div class="loading-spinner">
            <mat-progress-spinner
              mode="indeterminate"
              diameter="24"></mat-progress-spinner>
            <span>Loading sign-in options...</span>
          </div>
        } @else {
          @if (googleEnabled()) {
            <button mat-raised-button (click)="signInWithProvider('google')">
              <mat-icon svgIcon="google"></mat-icon> Google
            </button>
          }
          @if (facebookEnabled()) {
            <button mat-raised-button (click)="signInWithProvider('facebook')">
              <mat-icon svgIcon="facebook"></mat-icon> Facebook
            </button>
          }
          @if (githubEnabled()) {
            <button mat-raised-button (click)="signInWithProvider('github')">
              <mat-icon svgIcon="github"></mat-icon> GitHub
            </button>
          }
          @if (appleEnabled()) {
            <button mat-raised-button (click)="signInWithProvider('apple')">
              <mat-icon svgIcon="apple"></mat-icon> Apple
            </button>
          }
          @if (discordEnabled()) {
            <button mat-raised-button (click)="signInWithProvider('discord')">
              <mat-icon svgIcon="discord"></mat-icon> Discord
            </button>
          }
        }
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }

      button {
        width: 100%;
        margin-bottom: 8px;

        mat-icon {
          margin-right: 8px;
        }
      }

      .loading-spinner {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 16px 0;
        color: var(--mdc-theme-text-secondary-on-background);

        mat-progress-spinner {
          margin-bottom: 4px;
        }

        span {
          font-size: 0.9em;
        }
      }

      .oauth-container {
        margin-top: 16px;
      }

      h3 {
        text-align: center;
        margin-bottom: 16px;
      }
    `,
  ],
})
export class OAuthProviderListComponent implements OnInit {
  private authService = inject(AuthService);
  private snackBar = inject(MatSnackBar);
  private ngZone = inject(NgZone);

  /**
   * Whether this component is being used in the register context.
   * If false, it's assumed to be in the sign-in context.
   */
  @Input() isRegisterContext = false;

  isLoadingProviders = signal(false);
  enabledProviders = signal<string[]>([]);

  githubEnabled = signal(false);
  googleEnabled = signal(false);
  facebookEnabled = signal(false);
  discordEnabled = signal(false);
  appleEnabled = signal(false);

  /**
   * Returns true if any provider is enabled, false otherwise
   */
  hasAnyProviderEnabled(): boolean {
    return (
      this.githubEnabled() ||
      this.googleEnabled() ||
      this.facebookEnabled() ||
      this.discordEnabled() ||
      this.appleEnabled()
    );
  }

  ngOnInit(): void {
    void this.loadOAuth2Providers();
  }

  /**
   * Returns true if the component should display the "Or sign in/register with:" text.
   * The text should only be shown if providers are loaded and at least one is enabled.
   */
  shouldShowText(): boolean {
    return !this.isLoadingProviders() && this.hasAnyProviderEnabled();
  }

  signInWithProvider(provider: string): void {
    console.log(`Sign in with ${provider} clicked`);
    this.ngZone.runOutsideAngular(() => {
      let apiUrl = '';
      if (typeof environment !== 'undefined' && environment?.apiUrl) {
        apiUrl = (environment as { apiUrl: string }).apiUrl;
      }
      window.location.href = `${apiUrl}/oauth2/authorization/${provider.toLowerCase()}`;
    });
  }

  private async loadOAuth2Providers(): Promise<void> {
    this.isLoadingProviders.set(true);

    try {
      const providers: string[] = await firstValueFrom(
        this.authService.authControllerGetOAuthProviders()
      );
      this.enabledProviders.set(providers);

      // Update individual provider signals
      this.githubEnabled.set(providers.includes('github'));
      this.googleEnabled.set(providers.includes('google'));
      this.facebookEnabled.set(providers.includes('facebook'));
      this.discordEnabled.set(providers.includes('discord'));
      this.appleEnabled.set(providers.includes('apple'));
    } catch {
      this.snackBar.open('Failed to load sign-in options', 'Close', {
        duration: 5000,
      });
    } finally {
      this.isLoadingProviders.set(false);
    }
  }
}
