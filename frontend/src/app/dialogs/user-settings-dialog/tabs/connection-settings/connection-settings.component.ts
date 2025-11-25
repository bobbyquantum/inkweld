import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { MigrationService, MigrationStatus } from '@services/offline/migration.service';
import { SetupService } from '@services/core/setup.service';
import { UserService } from '@services/user/user.service';
import { firstValueFrom } from 'rxjs';

import {
  ConfirmationDialogComponent,
  ConfirmationDialogData,
} from '../../../confirmation-dialog/confirmation-dialog.component';

@Component({
  selector: 'app-connection-settings',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    FormsModule,
  ],
  templateUrl: './connection-settings.component.html',
  styleUrl: './connection-settings.component.scss',
})
export class ConnectionSettingsComponent {
  private setupService = inject(SetupService);
  private migrationService = inject(MigrationService);
  private userService = inject(UserService);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);
  private dialog = inject(MatDialog);

  protected currentMode = this.setupService.getMode();
  protected currentServerUrl = this.setupService.getServerUrl() || '';
  protected newServerUrl = '';
  protected isConnecting = signal(false);
  protected connectionError = signal<string | null>(null);

  // Migration state
  protected migrationState = this.migrationService.migrationState;
  protected offlineProjectsCount = computed(() =>
    this.migrationService.getOfflineProjectsCount()
  );
  protected migrationProgress = computed(() => {
    const state = this.migrationState();
    if (state.totalProjects === 0) return 0;
    return (state.completedProjects / state.totalProjects) * 100;
  });

  // Auth for migration
  protected showAuthForm = signal(false);
  protected authMode = signal<'login' | 'register'>('register');
  protected username = signal('');
  protected password = signal('');
  protected confirmPassword = signal('');
  protected authError = signal<string | null>(null);
  protected isAuthenticating = signal(false);

  // Expose MigrationStatus enum for template
  protected readonly MigrationStatus = MigrationStatus;

  async switchToOfflineMode() {
    // Check if user has server projects - warn about potential data loss
    if (this.currentMode === 'server') {
      const confirmed = await this.confirmModeSwitch(
        'Switch to Offline Mode?',
        'Switching to offline mode will disconnect from the server. You will need to reconnect and log in again to access your server projects. Continue?',
        'Switch to Offline'
      );

      if (!confirmed) {
        return;
      }
    }

    try {
      // Navigate to setup page which will handle the transition
      this.setupService.resetConfiguration();
      await this.router.navigate(['/setup']);
      this.snackBar.open('Switched to offline mode configuration', 'Close', {
        duration: 3000,
      });
    } catch (error) {
      console.error('Failed to switch to offline mode:', error);
      this.snackBar.open('Failed to switch modes', 'Close', {
        duration: 3000,
      });
    }
  }

  async switchToServerMode() {
    if (!this.newServerUrl.trim()) {
      this.connectionError.set('Please enter a server URL');
      return;
    }

    this.isConnecting.set(true);
    this.connectionError.set(null);

    try {
      await this.setupService.configureServerMode(this.newServerUrl.trim());
      this.currentServerUrl = this.newServerUrl.trim();
      this.newServerUrl = '';
      this.currentMode = 'server';

      // Reload the page to reinitialize with new server
      window.location.reload();
    } catch (error) {
      console.error('Failed to connect to server:', error);
      this.connectionError.set(
        'Failed to connect to server. Please check the URL and try again.'
      );
    } finally {
      this.isConnecting.set(false);
    }
  }

  async changeServer() {
    await this.switchToServerMode();
  }

  async testConnection() {
    if (!this.newServerUrl.trim()) {
      this.connectionError.set('Please enter a server URL');
      return;
    }

    this.isConnecting.set(true);
    this.connectionError.set(null);

    try {
      const response = await fetch(`${this.newServerUrl.trim()}/api/v1/health`);
      if (response.ok) {
        this.snackBar.open('Connection successful!', 'Close', {
          duration: 3000,
        });
      } else {
        this.connectionError.set('Server is not responding correctly');
      }
    } catch (error) {
      console.error('Connection test failed:', error);
      this.connectionError.set('Failed to connect to server');
    } finally {
      this.isConnecting.set(false);
    }
  }

  /**
   * Start migration process - shows auth form if offline projects exist
   */
  async startMigration() {
    if (!this.newServerUrl.trim()) {
      this.connectionError.set('Please enter a server URL');
      return;
    }

    const hasOfflineProjects = this.migrationService.hasOfflineProjects();

    if (!hasOfflineProjects) {
      // No offline projects, but still warn if changing servers in server mode
      if (this.currentMode === 'server') {
        const confirmed = await this.confirmModeSwitch(
          'Change Server?',
          'Changing servers will disconnect you from the current server. You will need to log in again. Continue?',
          'Change Server'
        );

        if (!confirmed) {
          return;
        }
      }

      // Just switch to server mode
      await this.switchToServerMode();
      return;
    }

    // Has offline projects - warn about migration
    const projectCount = this.migrationService.getOfflineProjectsCount();
    const confirmed = await this.confirmModeSwitch(
      'Migrate Offline Projects?',
      `You have ${projectCount} offline project${projectCount === 1 ? '' : 's'}. ${projectCount === 1 ? 'It' : 'They'} will be uploaded to the server after you authenticate. Your offline data will be removed after successful migration. Continue?`,
      'Continue'
    );

    if (!confirmed) {
      return;
    }

    // Show auth form for migration
    this.showAuthForm.set(true);
  }

  /**
   * Handle authentication for migration
   */
  async authenticate() {
    console.log('[Migration] authenticate() called');
    const usernameValue = this.username();
    const passwordValue = this.password();
    const confirmPasswordValue = this.confirmPassword();

    // Validation
    if (!usernameValue || !passwordValue) {
      this.authError.set('Please enter username and password');
      return;
    }

    if (
      this.authMode() === 'register' &&
      passwordValue !== confirmPasswordValue
    ) {
      this.authError.set('Passwords do not match');
      return;
    }

    console.log('[Migration] Starting authentication, mode:', this.authMode());
    this.isAuthenticating.set(true);
    this.authError.set(null);

    try {
      // Set server URL first
      console.log(
        '[Migration] Before configureServerMode, current mode:',
        this.setupService.getMode()
      );
      await this.setupService.configureServerMode(this.newServerUrl.trim());
      console.log(
        '[Migration] After configureServerMode, new mode:',
        this.setupService.getMode()
      );
      console.log(
        '[Migration] localStorage inkweld-app-config:',
        localStorage.getItem('inkweld-app-config')
      );

      // Register or login
      if (this.authMode() === 'register') {
        await this.migrationService.registerOnServer(
          usernameValue,
          passwordValue
        );
      } else {
        await this.migrationService.loginToServer(usernameValue, passwordValue);
      }
      console.log(
        '[Migration] After auth, token in localStorage:',
        localStorage.getItem('auth_token') ? 'EXISTS' : 'MISSING'
      );

      // Start migration
      await this.migrationService.migrateToServer(this.newServerUrl.trim());

      // Hide auth form
      this.showAuthForm.set(false);

      // Show success message
      const state = this.migrationState();
      console.log('[Migration] Final state:', JSON.stringify(state));

      if (state.status === MigrationStatus.Completed) {
        this.snackBar.open(
          `Successfully migrated ${state.completedProjects} project(s)!`,
          'Close',
          { duration: 5000 }
        );

        // Configure server mode BEFORE cleanup
        // Note: We skip the health check since we just successfully authenticated and migrated
        console.log('[Migration] Configuring server mode...');
        const serverUrl = this.newServerUrl.trim();
        const config = {
          mode: 'server' as const,
          serverUrl: serverUrl,
        };
        localStorage.setItem('inkweld-app-config', JSON.stringify(config));
        console.log(
          '[Migration] Server mode configured, app-config:',
          localStorage.getItem('inkweld-app-config')
        );

        // Clean up offline data
        console.log(
          '[Migration] Before cleanup, offline user:',
          localStorage.getItem('inkweld-offline-user')
        );
        this.migrationService.cleanupOfflineData();
        console.log(
          '[Migration] After cleanup, offline user:',
          localStorage.getItem('inkweld-offline-user')
        );
        console.log(
          '[Migration] After cleanup, app-config:',
          localStorage.getItem('inkweld-app-config')
        );
        console.log(
          '[Migration] After cleanup, auth_token:',
          localStorage.getItem('auth_token') ? 'EXISTS' : 'MISSING'
        );

        // Reload the page to reinitialize the app in server mode
        // This ensures Angular picks up the new mode from localStorage
        setTimeout(() => {
          console.log('[Migration] About to reload...');
          window.location.reload();
        }, 1000);
      } else if (state.status === MigrationStatus.Failed) {
        this.snackBar.open(
          `Migration completed with errors. ${state.completedProjects} succeeded, ${state.failedProjects} failed.`,
          'Close',
          { duration: 7000 }
        );
      }
    } catch (error) {
      console.error('Authentication/Migration failed:', error);
      this.authError.set(
        error instanceof Error
          ? error.message
          : 'Authentication failed. Please try again.'
      );
    } finally {
      this.isAuthenticating.set(false);
    }
  }

  /**
   * Cancel migration and hide auth form
   */
  cancelMigration() {
    this.showAuthForm.set(false);
    this.username.set('');
    this.password.set('');
    this.confirmPassword.set('');
    this.authError.set(null);
  }

  /**
   * Toggle between login and register modes
   */
  toggleAuthMode() {
    this.authMode.set(this.authMode() === 'login' ? 'register' : 'login');
    this.authError.set(null);
  }

  /**
   * Show confirmation dialog for mode/server switches
   */
  private async confirmModeSwitch(
    title: string,
    message: string,
    confirmText: string
  ): Promise<boolean> {
    const dialogRef = this.dialog.open<
      ConfirmationDialogComponent,
      ConfirmationDialogData,
      boolean
    >(ConfirmationDialogComponent, {
      width: '450px',
      data: {
        title,
        message,
        confirmText,
        cancelText: 'Cancel',
      },
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    return result === true;
  }
}
