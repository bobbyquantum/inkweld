import { Component, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AdminConfigService } from '@services/admin/admin-config.service';
import { SystemConfigService } from '@services/core/system-config.service';

import { AiKillSwitchDialogComponent } from './ai-kill-switch-dialog/ai-kill-switch-dialog.component';

@Component({
  selector: 'app-admin-settings',
  standalone: true,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatDialogModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class AdminSettingsComponent implements OnInit {
  private readonly configService = inject(AdminConfigService);
  private readonly systemConfigService = inject(SystemConfigService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly error = signal<Error | null>(null);
  readonly userApprovalRequired = signal(false);

  // AI Kill Switch state
  readonly aiKillSwitchEnabled = signal(true); // Default to ON (AI disabled)
  readonly aiKillSwitchLockedByEnv = signal(false);

  ngOnInit(): void {
    void this.loadConfig();
  }

  async loadConfig(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const [userApproval, aiKillSwitch] = await Promise.all([
        this.configService.getConfig('USER_APPROVAL_REQUIRED'),
        this.configService.getConfig('AI_KILL_SWITCH'),
      ]);

      this.userApprovalRequired.set(userApproval?.value === 'true');

      // For AI kill switch, also check the system config for lockedByEnv status
      const aiKillSwitchValue = aiKillSwitch?.value !== 'false'; // Default to true
      this.aiKillSwitchEnabled.set(aiKillSwitchValue);

      // Get lock status from system config
      this.aiKillSwitchLockedByEnv.set(
        this.systemConfigService.isAiKillSwitchLockedByEnv()
      );
    } catch (err) {
      console.error('Failed to load config:', err);
      this.error.set(
        err instanceof Error ? err : new Error('Failed to load configuration')
      );
    } finally {
      this.isLoading.set(false);
    }
  }

  async toggleUserApproval(enabled: boolean): Promise<void> {
    this.isSaving.set(true);

    try {
      await this.configService.setConfig(
        'USER_APPROVAL_REQUIRED',
        enabled ? 'true' : 'false'
      );
      this.userApprovalRequired.set(enabled);
      this.snackBar.open('Setting saved', 'Close', { duration: 2000 });
    } catch (err) {
      console.error('Failed to save setting:', err);
      this.snackBar.open('Failed to save setting', 'Close', { duration: 3000 });
      // Revert toggle on failure
      this.userApprovalRequired.set(!enabled);
    } finally {
      this.isSaving.set(false);
    }
  }

  /**
   * Handle AI kill switch toggle with confirmation dialog
   */
  async toggleAiKillSwitch(enabled: boolean): Promise<void> {
    // If disabling the kill switch (enabling AI), show warning dialog
    if (!enabled) {
      const dialogRef = this.dialog.open(AiKillSwitchDialogComponent, {
        width: '500px',
        disableClose: true,
      });

      const confirmed = await dialogRef
        .afterClosed()
        .toPromise()
        .then((result: boolean) => result);
      if (!confirmed) {
        // User cancelled, revert the toggle
        return;
      }
    }

    this.isSaving.set(true);

    try {
      await this.configService.setConfig(
        'AI_KILL_SWITCH',
        enabled ? 'true' : 'false'
      );
      this.aiKillSwitchEnabled.set(enabled);

      // Refresh system config to update all AI-related features
      this.systemConfigService.refreshSystemFeatures();

      const message = enabled
        ? 'AI features disabled'
        : 'AI features enabled (warning: data may be sent to third parties)';
      this.snackBar.open(message, 'Close', { duration: 3000 });
    } catch (err) {
      console.error('Failed to save AI kill switch setting:', err);
      this.snackBar.open('Failed to save setting', 'Close', { duration: 3000 });
    } finally {
      this.isSaving.set(false);
    }
  }
}
