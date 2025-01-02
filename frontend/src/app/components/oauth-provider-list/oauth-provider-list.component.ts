import { CommonModule } from '@angular/common';
import { Component, inject, NgZone, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { UserAPIService } from '@worm/index';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-oauth-provider-list',
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  template: `
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
    `,
  ],
})
export class OAuthProviderListComponent implements OnInit {
  isLoadingProviders = signal(false);
  enabledProviders = signal<string[]>([]);

  githubEnabled = signal(false);
  googleEnabled = signal(false);
  facebookEnabled = signal(false);
  discordEnabled = signal(false);
  appleEnabled = signal(false);

  private userService = inject(UserAPIService);
  private snackBar = inject(MatSnackBar);
  private ngZone = inject(NgZone);

  ngOnInit(): void {
    void this.loadOAuth2Providers();
  }

  signInWithProvider(provider: string): void {
    console.log(`Sign in with ${provider} clicked`);
    this.ngZone.runOutsideAngular(() => {
      window.location.href = `/oauth2/authorization/${provider.toLowerCase()}`;
    });
  }

  private async loadOAuth2Providers(): Promise<void> {
    this.isLoadingProviders.set(true);

    try {
      const providers: string[] = await firstValueFrom(
        this.userService.userControllerGetOAuthProviders()
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
