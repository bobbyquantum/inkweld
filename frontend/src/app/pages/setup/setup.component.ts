import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { ConfigurationService } from '@inkweld/index';

import { SetupService } from '../../services/setup.service';
import { UnifiedUserService } from '../../services/unified-user.service';

type AppMode = 'ONLINE' | 'OFFLINE' | 'BOTH';

// Define a safe interface for the system features response
interface SystemFeaturesResponse {
  appMode?: string;
  defaultServerName?: string | null;
  aiLinting?: boolean;
  aiImageGeneration?: boolean;
  captcha?: {
    enabled?: boolean;
    siteKey?: string;
  };
}

@Component({
  selector: 'app-setup',
  standalone: true,
  imports: [
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatProgressBarModule,
  ],
  templateUrl: './setup.component.html',
  styleUrl: './setup.component.scss',
})
export class SetupComponent implements OnInit {
  private setupService = inject(SetupService);
  private unifiedUserService = inject(UnifiedUserService);
  private ConfigurationService = inject(ConfigurationService);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);

  protected readonly isLoading = this.setupService.isLoading;
  protected readonly showServerSetup = signal(false);
  protected readonly showOfflineSetup = signal(false);
  protected readonly appMode = signal<AppMode>('BOTH');
  protected readonly configLoading = signal(true);

  protected serverUrl = 'http://localhost:8333';
  protected userName = '';
  protected displayName = '';

  ngOnInit(): void {
    // Check if there's already a configured server
    const existingServerUrl = this.setupService.getServerUrl();
    if (existingServerUrl) {
      // If already configured, try to load system config from that server
      void this.loadSystemConfig();
    } else {
      // No server configured yet, skip loading and use defaults
      this.configLoading.set(false);
      console.info('No server configured yet, using default setup options');
    }
  }

  private async loadSystemConfig(): Promise<void> {
    try {
      const systemFeatures =
        await this.ConfigurationService.getApiV1Config().toPromise();

      if (systemFeatures) {
        // Use type assertion to a safe interface
        const response = systemFeatures as SystemFeaturesResponse;

        // Safely handle appMode
        const appModeValue = response.appMode;
        if (
          typeof appModeValue === 'string' &&
          (appModeValue === 'ONLINE' ||
            appModeValue === 'OFFLINE' ||
            appModeValue === 'BOTH')
        ) {
          this.appMode.set(appModeValue as AppMode);

          // Auto-select mode if only one option is available
          if (appModeValue === 'ONLINE') {
            this.chooseServerMode();
          } else if (appModeValue === 'OFFLINE') {
            this.chooseOfflineMode();
          }
        }

        // Safely handle defaultServerName
        const serverName = response.defaultServerName;
        if (typeof serverName === 'string' && serverName.trim().length > 0) {
          this.serverUrl = serverName;
        }
      }
    } catch (error) {
      console.warn(
        'Failed to load system configuration, using defaults:',
        error
      );
      // Keep default mode as 'BOTH' if config fails to load
    } finally {
      this.configLoading.set(false);
    }
  }

  protected shouldShowModeSelection(): boolean {
    return (
      this.appMode() === 'BOTH' &&
      !this.showServerSetup() &&
      !this.showOfflineSetup()
    );
  }

  protected canUseServerMode(): boolean {
    const mode = this.appMode();
    return mode === 'BOTH' || mode === 'ONLINE';
  }

  protected canUseOfflineMode(): boolean {
    const mode = this.appMode();
    return mode === 'BOTH' || mode === 'OFFLINE';
  }

  protected chooseServerMode(): void {
    this.showServerSetup.set(true);
    this.showOfflineSetup.set(false);
  }

  protected chooseOfflineMode(): void {
    this.showOfflineSetup.set(true);
    this.showServerSetup.set(false);
  }

  protected async setupServerMode(): Promise<void> {
    if (!this.serverUrl.trim()) {
      this.snackBar.open('Please enter a server URL', 'Close', {
        duration: 3000,
      });
      return;
    }

    try {
      await this.setupService.configureServerMode(this.serverUrl.trim());
      this.snackBar.open('Server configuration saved!', 'Close', {
        duration: 3000,
      });
      await this.router.navigate(['/welcome']);
    } catch {
      this.snackBar.open(
        'Failed to connect to server. Please check the URL and try again.',
        'Close',
        {
          duration: 5000,
        }
      );
    }
  }

  protected async setupOfflineMode(): Promise<void> {
    if (!this.userName.trim() || !this.displayName.trim()) {
      this.snackBar.open('Please fill in all fields', 'Close', {
        duration: 3000,
      });
      return;
    }

    try {
      this.setupService.configureOfflineMode({
        username: this.userName.trim(),
        name: this.displayName.trim(),
      });

      // Initialize the user service after configuration
      await this.unifiedUserService.initialize();

      this.snackBar.open('Offline mode configured!', 'Close', {
        duration: 3000,
      });
      await this.router.navigate(['/']);
    } catch {
      this.snackBar.open('Failed to configure offline mode', 'Close', {
        duration: 3000,
      });
    }
  }

  protected goBack(): void {
    this.showServerSetup.set(false);
    this.showOfflineSetup.set(false);
  }
}
