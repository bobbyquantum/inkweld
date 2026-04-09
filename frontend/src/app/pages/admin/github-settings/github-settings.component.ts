import { Component, inject, type OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatStepperModule } from '@angular/material/stepper';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AdminConfigService } from '@services/admin/admin-config.service';
import { SetupService } from '@services/core/setup.service';

@Component({
  selector: 'app-admin-github-settings',
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatStepperModule,
    MatTooltipModule,
  ],
  templateUrl: './github-settings.component.html',
  styleUrl: './github-settings.component.scss',
})
export class AdminGithubSettingsComponent implements OnInit {
  private readonly configService = inject(AdminConfigService);
  private readonly setupService = inject(SetupService);
  private readonly snackBar = inject(MatSnackBar);

  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly error = signal<Error | null>(null);

  readonly githubEnabled = signal(false);
  readonly clientId = signal('');
  readonly clientSecret = signal('');
  readonly callbackUrl = signal('');

  /** Whether credentials are already configured (client ID present) */
  readonly isConfigured = signal(false);

  ngOnInit(): void {
    void this.loadConfig();
  }

  get defaultCallbackUrl(): string {
    const serverUrl =
      this.setupService.getServerUrl() ?? window.location.origin;
    return `${serverUrl}/api/v1/auth/github`;
  }

  async loadConfig(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const [enabled, clientId, clientSecretConfig, callbackUrl] =
        await Promise.all([
          this.configService.getConfig('GITHUB_ENABLED'),
          this.configService.getConfig('GITHUB_CLIENT_ID'),
          this.configService.getConfig('GITHUB_CLIENT_SECRET'),
          this.configService.getConfig('GITHUB_CALLBACK_URL'),
        ]);

      this.githubEnabled.set(enabled?.value === 'true');
      this.clientId.set(clientId?.value || '');
      this.callbackUrl.set(callbackUrl?.value || '');
      // Client secret is masked by the backend — show placeholder
      this.clientSecret.set('');
      this.isConfigured.set(!!clientId?.value && !!clientSecretConfig?.value);
    } catch (err) {
      this.error.set(
        err instanceof Error ? err : new Error('Failed to load configuration')
      );
    } finally {
      this.isLoading.set(false);
    }
  }

  async toggleGithubEnabled(enabled: boolean): Promise<void> {
    // Don't allow enabling without credentials
    if (enabled && !this.isConfigured()) {
      this.snackBar.open('Configure GitHub credentials first', 'Close', {
        duration: 3000,
      });
      return;
    }

    this.isSaving.set(true);
    try {
      await this.configService.setConfig(
        'GITHUB_ENABLED',
        enabled ? 'true' : 'false'
      );
      this.githubEnabled.set(enabled);
      this.snackBar.open(
        enabled ? 'GitHub sign-in enabled' : 'GitHub sign-in disabled',
        'Close',
        { duration: 2000 }
      );
    } catch {
      this.snackBar.open('Failed to save setting', 'Close', {
        duration: 3000,
      });
      this.githubEnabled.set(!enabled);
    } finally {
      this.isSaving.set(false);
    }
  }

  async saveCredentials(): Promise<void> {
    const id = this.clientId().trim();
    if (!id) {
      this.snackBar.open('Client ID is required', 'Close', { duration: 3000 });
      return;
    }

    this.isSaving.set(true);
    try {
      // Save client ID
      await this.configService.setConfig('GITHUB_CLIENT_ID', id);

      // Only save client secret if a new one was entered
      const secret = this.clientSecret().trim();
      if (secret) {
        await this.configService.setConfig('GITHUB_CLIENT_SECRET', secret);
      }

      // Save callback URL if customized, otherwise let it use the default
      const url = this.callbackUrl().trim();
      if (url) {
        await this.configService.setConfig('GITHUB_CALLBACK_URL', url);
      }

      this.isConfigured.set(true);
      this.clientSecret.set(''); // Clear the field after save
      this.snackBar.open('GitHub credentials saved', 'Close', {
        duration: 2000,
      });
    } catch {
      this.snackBar.open('Failed to save credentials', 'Close', {
        duration: 3000,
      });
    } finally {
      this.isSaving.set(false);
    }
  }
}
