import { inject, Injectable, type OnDestroy, signal } from '@angular/core';

import { LoggerService } from '../core/logger.service';
import { SetupService } from '../core/setup.service';
import { MediaSyncService } from '../local/media-sync.service';

/**
 * Service that automates media library synchronization.
 *
 * Features:
 * 1. **Sync on project open** — runs a full sync when connecting to a project
 * 2. **Sync after upload** — triggers sync after a local media upload completes
 * 3. **Periodic background sync** — polls every 60 seconds while a project is open
 *
 * Usage:
 * ```typescript
 * // Start auto-sync when opening a project
 * mediaAutoSync.startAutoSync('alice/my-novel');
 *
 * // Stop when leaving the project
 * mediaAutoSync.stopAutoSync();
 *
 * // Trigger sync after a local upload
 * mediaAutoSync.triggerSyncAfterUpload();
 * ```
 */
@Injectable({
  providedIn: 'root',
})
export class MediaAutoSyncService implements OnDestroy {
  private readonly logger = inject(LoggerService);
  private readonly setupService = inject(SetupService);
  private readonly mediaSyncService = inject(MediaSyncService);

  /** Currently active project key */
  private activeProjectKey: string | null = null;

  /** Periodic sync interval handle */
  private periodicSyncInterval: ReturnType<typeof setInterval> | null = null;

  /** Whether a sync is currently in progress (prevents overlapping syncs) */
  private isSyncing = false;

  /** Periodic sync interval in ms (60 seconds) */
  private readonly PERIODIC_SYNC_INTERVAL = 60_000;

  /** Whether auto-sync is currently active */
  readonly isActive = signal(false);

  /** Last time a sync was triggered */
  readonly lastSyncTime = signal<string | null>(null);

  ngOnDestroy(): void {
    this.stopAutoSync();
  }

  /**
   * Start auto-syncing for a project.
   * Call this when a user opens a project.
   *
   * @param projectKey - Project key in "username/slug" format
   */
  async startAutoSync(projectKey: string): Promise<void> {
    // No server sync in local mode
    if (this.setupService.getMode() === 'local') {
      this.logger.debug('MediaAutoSync', 'Skipping auto-sync — local mode');
      return;
    }

    // Skip if already syncing this project
    if (this.activeProjectKey === projectKey && this.isActive()) {
      this.logger.debug('MediaAutoSync', `Already syncing ${projectKey}`);
      return;
    }

    // Stop any existing sync first
    this.stopAutoSync();

    this.activeProjectKey = projectKey;
    this.isActive.set(true);

    this.logger.info('MediaAutoSync', `Starting auto-sync for ${projectKey}`);

    // 1. Initial sync on project open
    await this.runSync('initial');

    // 2. Start periodic background sync
    this.startPeriodicSync();
  }

  /**
   * Stop all auto-sync activities.
   * Call this when a user leaves a project.
   */
  stopAutoSync(): void {
    if (!this.activeProjectKey) return;

    this.logger.info(
      'MediaAutoSync',
      `Stopping auto-sync for ${this.activeProjectKey}`
    );

    this.stopPeriodicSync();

    this.activeProjectKey = null;
    this.isActive.set(false);
  }

  /**
   * Trigger a sync after a local media upload completes.
   * This ensures the server's state is reflected locally after uploading.
   */
  async triggerSyncAfterUpload(): Promise<void> {
    if (!this.activeProjectKey) return;
    if (this.setupService.getMode() === 'local') return;

    this.logger.debug(
      'MediaAutoSync',
      `Triggering sync after upload for ${this.activeProjectKey}`
    );

    await this.runSync('after-upload');
  }

  /**
   * Run a media sync, preventing overlapping executions
   */
  private async runSync(
    trigger: 'initial' | 'periodic' | 'after-upload'
  ): Promise<void> {
    if (!this.activeProjectKey) return;

    if (this.isSyncing) {
      this.logger.debug(
        'MediaAutoSync',
        `Skipping ${trigger} sync — already syncing`
      );
      return;
    }

    this.isSyncing = true;
    const projectKey = this.activeProjectKey;

    try {
      this.logger.debug(
        'MediaAutoSync',
        `Running ${trigger} sync for ${projectKey}`
      );

      await this.mediaSyncService.fullSync(projectKey);

      this.lastSyncTime.set(new Date().toISOString());

      this.logger.debug(
        'MediaAutoSync',
        `${trigger} sync completed for ${projectKey}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        'MediaAutoSync',
        `${trigger} sync failed for ${projectKey}: ${message}`
      );
      // Don't rethrow — sync failures shouldn't break the app
    } finally {
      this.isSyncing = false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Periodic Background Sync
  // ─────────────────────────────────────────────────────────────────────────────

  private startPeriodicSync(): void {
    this.stopPeriodicSync();

    this.periodicSyncInterval = setInterval(() => {
      void this.runSync('periodic');
    }, this.PERIODIC_SYNC_INTERVAL);

    this.logger.debug(
      'MediaAutoSync',
      `Periodic sync started (every ${this.PERIODIC_SYNC_INTERVAL / 1000}s)`
    );
  }

  private stopPeriodicSync(): void {
    if (this.periodicSyncInterval) {
      clearInterval(this.periodicSyncInterval);
      this.periodicSyncInterval = null;
    }
  }
}
