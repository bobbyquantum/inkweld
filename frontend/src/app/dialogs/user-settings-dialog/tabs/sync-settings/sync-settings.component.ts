import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SetupService } from '@services/core/setup.service';
import {
  MediaSyncService,
  MediaSyncState,
} from '@services/offline/media-sync.service';
import { ProjectStateService } from '@services/project/project-state.service';

interface SyncStatus {
  lastSync: Date | null;
  isSyncing: boolean;
  pendingChanges: number;
  syncEnabled: boolean;
}

@Component({
  selector: 'app-sync-settings',
  imports: [
    DatePipe,
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
  private mediaSyncService = inject(MediaSyncService);
  private projectState = inject(ProjectStateService);

  protected currentMode = this.setupService.getMode();
  protected syncStatus = signal<SyncStatus>({
    lastSync: null,
    isSyncing: false,
    pendingChanges: 0,
    syncEnabled: true,
  });

  protected autoSyncEnabled = signal(true);
  protected syncInterval = signal(5); // minutes

  // Media sync state
  protected projectKey = computed(() => {
    const project = this.projectState.project();
    if (!project) return null;
    return `${project.username}/${project.slug}`;
  });

  protected mediaSyncState = signal<MediaSyncState | null>(null);

  constructor() {
    // Watch for project changes and update media sync state
    effect(() => {
      const key = this.projectKey();
      if (key && this.currentMode === 'server') {
        void this.checkMediaSyncStatus();
      }
    });
  }

  // Media sync methods
  async checkMediaSyncStatus(): Promise<void> {
    const key = this.projectKey();
    if (!key) return;

    try {
      const state = await this.mediaSyncService.checkSyncStatus(key);
      this.mediaSyncState.set(state);
    } catch (error) {
      console.error('Failed to check media sync status:', error);
      this.snackBar.open('Failed to check media sync status', 'Close', {
        duration: 3000,
      });
    }
  }

  async downloadAllMedia(): Promise<void> {
    const key = this.projectKey();
    if (!key) return;

    try {
      await this.mediaSyncService.downloadAllFromServer(key);
      this.snackBar.open('All media downloaded successfully', 'Close', {
        duration: 3000,
      });
      // Refresh state
      await this.checkMediaSyncStatus();
    } catch (error) {
      console.error('Failed to download media:', error);
      this.snackBar.open('Failed to download some media files', 'Close', {
        duration: 3000,
      });
    }
  }

  async uploadAllMedia(): Promise<void> {
    const key = this.projectKey();
    if (!key) return;

    try {
      await this.mediaSyncService.uploadAllToServer(key);
      this.snackBar.open('All media uploaded successfully', 'Close', {
        duration: 3000,
      });
      // Refresh state
      await this.checkMediaSyncStatus();
    } catch (error) {
      console.error('Failed to upload media:', error);
      this.snackBar.open('Failed to upload some media files', 'Close', {
        duration: 3000,
      });
    }
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  getServerTotalSize(): number {
    const state = this.mediaSyncState();
    if (!state) return 0;
    return state.items
      .filter(item => item.server)
      .reduce((sum, item) => sum + (item.server?.size ?? 0), 0);
  }

  getLocalTotalSize(): number {
    const state = this.mediaSyncState();
    if (!state) return 0;
    return state.items
      .filter(item => item.local)
      .reduce((sum, item) => sum + (item.local?.size ?? 0), 0);
  }

  getServerFileCount(): number {
    const state = this.mediaSyncState();
    if (!state) return 0;
    return state.items.filter(item => item.server).length;
  }

  getLocalFileCount(): number {
    const state = this.mediaSyncState();
    if (!state) return 0;
    return state.items.filter(item => item.local).length;
  }

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
