import { inject, Injectable, OnDestroy, signal } from '@angular/core';

import { AuthTokenService } from '../auth/auth-token.service';
import { LoggerService } from '../core/logger.service';
import { SetupService } from '../core/setup.service';
import { MediaSyncService } from '../local/media-sync.service';

/**
 * Media change event received from the server WebSocket
 */
interface MediaChangeEvent {
  type: 'media-changed';
  projectKey: string;
  filename: string;
  action: 'uploaded' | 'deleted';
  timestamp: string;
}

/**
 * Service that automates media library synchronization.
 *
 * Features:
 * 1. **Sync on project open** — runs a full sync when connecting to a project
 * 2. **Sync after upload** — triggers sync after a local media upload completes
 * 3. **Periodic background sync** — polls every 60 seconds while a project is open
 * 4. **WebSocket notifications** — listens for real-time media change events
 *    from other users and triggers an immediate sync
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
  private readonly authTokenService = inject(AuthTokenService);
  private readonly mediaSyncService = inject(MediaSyncService);

  /** Currently active project key */
  private activeProjectKey: string | null = null;

  /** WebSocket connection for media notifications */
  private notificationWs: WebSocket | null = null;

  /** Periodic sync interval handle */
  private periodicSyncInterval: ReturnType<typeof setInterval> | null = null;

  /** Whether a sync is currently in progress (prevents overlapping syncs) */
  private isSyncing = false;

  /** Debounce timer for WebSocket-triggered syncs */
  private wsSyncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  /** Reconnect timer for WebSocket */
  private wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;

  /** Number of consecutive WebSocket reconnection attempts */
  private wsReconnectAttempts = 0;

  /** Max reconnection attempts before giving up */
  private readonly MAX_RECONNECT_ATTEMPTS = 10;

  /** Periodic sync interval in ms (60 seconds) */
  private readonly PERIODIC_SYNC_INTERVAL = 60_000;

  /** Debounce delay for WebSocket-triggered syncs (prevents rapid re-syncs) */
  private readonly WS_SYNC_DEBOUNCE = 2_000;

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

    // 3. Connect to WebSocket for real-time notifications
    this.connectNotificationWebSocket();
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
    this.disconnectNotificationWebSocket();

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
    trigger: 'initial' | 'periodic' | 'websocket' | 'after-upload'
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

  // ─────────────────────────────────────────────────────────────────────────────
  // WebSocket Notification Connection
  // ─────────────────────────────────────────────────────────────────────────────

  private connectNotificationWebSocket(): void {
    if (this.setupService.getMode() === 'local') {
      this.logger.debug('MediaAutoSync', 'Skipping WebSocket — local mode');
      return;
    }

    const wsBaseUrl = this.setupService.getWebSocketUrl();
    if (!wsBaseUrl) {
      this.logger.debug(
        'MediaAutoSync',
        'Skipping WebSocket — no WebSocket URL configured'
      );
      return;
    }

    const token = this.authTokenService.getToken();
    if (!token) {
      this.logger.debug('MediaAutoSync', 'Skipping WebSocket — no auth token');
      return;
    }

    const projectKey = this.activeProjectKey;
    if (!projectKey) return;

    // Build WebSocket URL
    const wsUrl = `${wsBaseUrl}/api/v1/ws/media?projectKey=${encodeURIComponent(projectKey)}`;

    this.logger.debug(
      'MediaAutoSync',
      `Connecting to media notification WebSocket for ${projectKey}`
    );

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        this.logger.debug(
          'MediaAutoSync',
          'WebSocket connected, sending auth token...'
        );
        ws.send(token);
      };

      ws.onmessage = (event: MessageEvent) => {
        if (typeof event.data !== 'string') return;

        const data = event.data;

        // Handle auth response
        if (data === 'authenticated') {
          this.logger.info(
            'MediaAutoSync',
            `WebSocket authenticated for ${projectKey}`
          );
          this.wsReconnectAttempts = 0;
          return;
        }

        if (data.startsWith('access-denied')) {
          this.logger.warn('MediaAutoSync', `WebSocket auth denied: ${data}`);
          this.notificationWs = null;
          return;
        }

        if (data === 'pong') return;

        // Handle media change notifications
        try {
          const event = JSON.parse(data) as MediaChangeEvent;
          if (event.type === 'media-changed') {
            this.logger.debug(
              'MediaAutoSync',
              `Media change notification: ${event.action} ${event.filename}`
            );
            this.debouncedWebSocketSync();
          }
        } catch {
          this.logger.warn(
            'MediaAutoSync',
            `Unknown WebSocket message: ${data}`
          );
        }
      };

      ws.onclose = () => {
        this.logger.debug('MediaAutoSync', 'WebSocket disconnected');
        this.notificationWs = null;

        // Attempt reconnection if still active
        if (this.activeProjectKey === projectKey) {
          this.scheduleReconnect();
        }
      };

      ws.onerror = () => {
        this.logger.warn('MediaAutoSync', 'WebSocket error');
        // onclose will fire after onerror
      };

      this.notificationWs = ws;
    } catch (error) {
      this.logger.warn('MediaAutoSync', 'Failed to create WebSocket', error);
    }
  }

  /**
   * Debounce WebSocket-triggered syncs to avoid rapid re-syncing
   * when multiple files are uploaded in quick succession.
   */
  private debouncedWebSocketSync(): void {
    if (this.wsSyncDebounceTimer) {
      clearTimeout(this.wsSyncDebounceTimer);
    }

    this.wsSyncDebounceTimer = setTimeout(() => {
      this.wsSyncDebounceTimer = null;
      void this.runSync('websocket');
    }, this.WS_SYNC_DEBOUNCE);
  }

  /**
   * Schedule a WebSocket reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.wsReconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      this.logger.warn(
        'MediaAutoSync',
        `Giving up WebSocket reconnection after ${this.MAX_RECONNECT_ATTEMPTS} attempts`
      );
      return;
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s max
    const delay = Math.min(
      1000 * Math.pow(2, this.wsReconnectAttempts),
      30_000
    );
    this.wsReconnectAttempts++;

    this.logger.debug(
      'MediaAutoSync',
      `Scheduling WebSocket reconnect in ${delay / 1000}s (attempt ${this.wsReconnectAttempts})`
    );

    this.wsReconnectTimer = setTimeout(() => {
      this.wsReconnectTimer = null;
      if (this.activeProjectKey) {
        this.connectNotificationWebSocket();
      }
    }, delay);
  }

  private disconnectNotificationWebSocket(): void {
    if (this.wsSyncDebounceTimer) {
      clearTimeout(this.wsSyncDebounceTimer);
      this.wsSyncDebounceTimer = null;
    }

    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }

    this.wsReconnectAttempts = 0;

    if (this.notificationWs) {
      this.notificationWs.close();
      this.notificationWs = null;
    }
  }
}
