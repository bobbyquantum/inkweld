import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SetupService } from '@services/setup.service';

interface SyncStatus {
  lastSync: Date | null;
  isSyncing: boolean;
  pendingChanges: number;
  syncEnabled: boolean;
}

@Component({
  selector: 'app-sync-settings',
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatSlideToggleModule,
  ],
  templateUrl: './sync-settings.component.html',
  styleUrl: './sync-settings.component.scss',
})
export class SyncSettingsComponent {
  private setupService = inject(SetupService);
  private snackBar = inject(MatSnackBar);

  protected currentMode = this.setupService.getMode();
  protected syncStatus = signal<SyncStatus>({
    lastSync: null,
    isSyncing: false,
    pendingChanges: 0,
    syncEnabled: true,
  });

  protected autoSyncEnabled = signal(true);
  protected syncInterval = signal(5); // minutes

  async triggerManualSync() {
    if (this.currentMode === 'offline') {
      this.snackBar.open('Sync is not available in offline mode', 'Close', {
        duration: 3000,
      });
      return;
    }

    this.syncStatus.update(status => ({ ...status, isSyncing: true }));

    try {
      // TODO: Implement actual sync logic with backend
      await new Promise(resolve => setTimeout(resolve, 2000));

      this.syncStatus.update(status => ({
        ...status,
        isSyncing: false,
        lastSync: new Date(),
        pendingChanges: 0,
      }));

      this.snackBar.open('Sync completed successfully', 'Close', {
        duration: 3000,
      });
    } catch (error) {
      console.error('Sync failed:', error);
      this.syncStatus.update(status => ({ ...status, isSyncing: false }));
      this.snackBar.open('Sync failed. Please try again.', 'Close', {
        duration: 3000,
      });
    }
  }

  toggleAutoSync() {
    this.autoSyncEnabled.update(enabled => !enabled);
    this.snackBar.open(
      `Auto-sync ${this.autoSyncEnabled() ? 'enabled' : 'disabled'}`,
      'Close',
      {
        duration: 2000,
      }
    );
  }

  updateSyncInterval(minutes: number) {
    this.syncInterval.set(minutes);
    this.snackBar.open(`Sync interval updated to ${minutes} minutes`, 'Close', {
      duration: 2000,
    });
  }

  resolveConflicts() {
    this.snackBar.open('Conflict resolution not yet implemented', 'Close', {
      duration: 3000,
    });
  }

  getLastSyncTime(): string {
    const lastSync = this.syncStatus().lastSync;
    if (!lastSync) return 'Never';

    const now = new Date();
    const diff = now.getTime() - lastSync.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
  }
}
