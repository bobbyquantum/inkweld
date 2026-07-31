import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoService } from '@jsverse/transloco';

import { DocumentSyncState } from '../../models/document-sync-state';
import { type MediaSyncState } from '../../services/local/media-sync.service';
import { DocStatsService } from '../../services/sync/doc-stats.service';

/**
 * How long an *established* (Synced) connection must stay non-synced before
 * the indicator visibly flips to offline. Reconnect handshakes routinely last
 * well under this (a background-tab socket idling out and re-authing on tab
 * return, for example), so debouncing prevents the "flashes offline when
 * changing tabs" effect. Genuine outages exceed this easily and still show.
 */
const OFFLINE_DISPLAY_DEBOUNCE_MS = 4000;

/**
 * Component to display the connection status for project sync and media sync.
 * Shows appropriate icons and status text based on the current state.
 *
 * Design: While connecting, we show "Offline Mode" with a spinning retry button
 * rather than a prominent "Connecting..." state, to avoid visual distraction
 * during repeated connection attempts.
 *
 * The rendered state is a debounced view of the `syncState` input: a blip
 * from Synced to Local/Syncing only becomes visible if it persists for
 * {@link OFFLINE_DISPLAY_DEBOUNCE_MS}; recovery to Synced and the hard
 * Unavailable state render immediately.
 */
@Component({
  selector: 'app-connection-status',
  imports: [
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './connection-status.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./connection-status.component.scss'],
})
export class ConnectionStatusComponent {
  protected readonly DocumentSyncState = DocumentSyncState;
  private readonly transloco = inject(TranslocoService);

  /** Current document sync state */
  syncState = input.required<DocumentSyncState>();

  /** Media sync state (optional) */
  mediaSyncState = input<MediaSyncState | null>(null);

  /** Whether to show media sync status */
  showMediaStatus = input<boolean>(false);

  /** Whether to show collapsed (icon-only) mode */
  collapsed = input<boolean>(false);

  /** Last connection error message (shown in retry button tooltip) */
  lastError = input<string | null>(null);

  /** Whether the app is in local-only mode (no server configured) */
  isLocalMode = input<boolean>(false);

  /** Elements document ID for storage stats hover (e.g. "user:slug:elements") */
  elementsDocId = input<string | null>(null);

  /**
   * Debounce window before an established connection displays as offline.
   * Overridable primarily so tests can shorten the wait; production callers
   * keep the default.
   */
  offlineDebounceMs = input<number>(OFFLINE_DISPLAY_DEBOUNCE_MS);

  /** Event emitted when user clicks retry sync */
  syncRequested = output<void>();

  private readonly docStatsService = inject(DocStatsService);
  private readonly statsText = signal('');

  /**
   * The state the template renders — follows `syncState` with the
   * offline-display debounce applied (see class doc). All display computeds
   * read this instead of the raw input.
   */
  private readonly effectiveState = signal<DocumentSyncState>(
    DocumentSyncState.Syncing
  );
  private offlineDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const state = this.syncState();
      const displayed = untracked(this.effectiveState);

      if (
        state === DocumentSyncState.Synced ||
        state === DocumentSyncState.Unavailable
      ) {
        // Recovery and hard failure render immediately.
        this.clearOfflineDebounce();
        this.effectiveState.set(state);
        return;
      }

      // Local / Syncing: if we were showing a healthy connection, hold the
      // display for the debounce window — most reconnect handshakes finish
      // well inside it. If we weren't Synced (initial connect, or already
      // offline), render the state right away.
      if (displayed === DocumentSyncState.Synced) {
        this.offlineDebounceTimer ??= setTimeout(() => {
          this.offlineDebounceTimer = null;
          this.effectiveState.set(this.syncState());
        }, this.offlineDebounceMs());
      } else {
        this.effectiveState.set(state);
      }
    });

    inject(DestroyRef).onDestroy(() => this.clearOfflineDebounce());
  }

  private clearOfflineDebounce(): void {
    if (this.offlineDebounceTimer) {
      clearTimeout(this.offlineDebounceTimer);
      this.offlineDebounceTimer = null;
    }
  }

  onStatusHover(): void {
    const docId = this.elementsDocId();
    if (!docId || this.isLocalMode()) return;
    void this.docStatsService.fetchStats(docId).then(stats => {
      this.statsText.set(this.docStatsService.formatStats(stats));
    });
  }

  /** Whether we're currently trying to connect (Syncing state) */
  isConnecting = computed(
    () => this.effectiveState() === DocumentSyncState.Syncing
  );

  /** Display as offline when offline OR when connecting (to reduce visual noise) */
  displayAsOffline = computed(() => {
    const state = this.effectiveState();
    return (
      state === DocumentSyncState.Local || state === DocumentSyncState.Syncing
    );
  });

  /** Show retry button when offline, connecting, or unavailable - but not in local mode */
  showRetryButton = computed(() => {
    // No retry button in local mode - there's no server to connect to
    if (this.isLocalMode()) {
      return false;
    }
    const state = this.effectiveState();
    return (
      state === DocumentSyncState.Local ||
      state === DocumentSyncState.Syncing ||
      state === DocumentSyncState.Unavailable
    );
  });

  /** Get the appropriate icon for sync state */
  syncIcon = computed(() => {
    // In local mode, show folder icon instead of cloud
    if (this.isLocalMode()) {
      return 'folder';
    }
    switch (this.effectiveState()) {
      case DocumentSyncState.Synced:
        return 'cloud_done';
      case DocumentSyncState.Syncing:
        return 'cloud_off'; // Show offline icon while connecting
      case DocumentSyncState.Local:
        return 'cloud_off';
      case DocumentSyncState.Unavailable:
        return 'error_outline';
      default:
        return 'help_outline';
    }
  });

  /** Get the status text for display */
  syncStatusText = computed(() => {
    // In local mode, always show "Local Mode" regardless of sync state
    if (this.isLocalMode()) {
      return this.transloco.translate('project.connection.localMode');
    }
    switch (this.effectiveState()) {
      case DocumentSyncState.Synced:
        return this.transloco.translate('project.connection.connected');
      case DocumentSyncState.Syncing:
        return this.transloco.translate('project.connection.offlineMode'); // Show as offline while connecting
      case DocumentSyncState.Local:
        return this.transloco.translate('project.connection.offlineMode');
      case DocumentSyncState.Unavailable:
        return this.transloco.translate('project.connection.connectionFailed');
      default:
        return this.transloco.translate('project.connection.unknown');
    }
  });

  /** Get tooltip text for sync status row - includes last error when offline */
  syncTooltip = computed(() => {
    let base: string;
    // In local mode, show local-specific tooltip
    if (this.isLocalMode()) {
      base = this.transloco.translate('project.connection.localTooltip');
    } else {
      const error = this.lastError();
      switch (this.effectiveState()) {
        case DocumentSyncState.Synced:
          base = this.transloco.translate(
            'project.connection.connectedTooltip'
          );
          break;
        case DocumentSyncState.Syncing:
          base = this.transloco.translate(
            'project.connection.connectingTooltip'
          );
          break;
        case DocumentSyncState.Local:
          base = error
            ? this.transloco.translate('project.connection.offlineTooltip', {
                error,
              })
            : this.transloco.translate(
                'project.connection.offlineNoErrorTooltip'
              );
          break;
        case DocumentSyncState.Unavailable:
          base = error
            ? this.transloco.translate('project.connection.failedTooltip', {
                error,
              })
            : this.transloco.translate(
                'project.connection.failedNoErrorTooltip'
              );
          break;
        default:
          base = '';
      }
    }
    const stats = this.statsText();
    return stats ? `${base}\n${stats}` : base;
  });

  /** Get tooltip for the retry button - includes last error if available */
  retryButtonTooltip = computed(() => {
    if (this.isConnecting()) {
      return this.transloco.translate('project.connection.retryConnecting');
    }
    const error = this.lastError();
    if (error) {
      return this.transloco.translate('project.connection.retryWithError', {
        error,
      });
    }
    return this.transloco.translate('project.connection.retry');
  });

  /** Check if media is fully synced */
  isMediaSynced = computed(() => {
    const state = this.mediaSyncState();
    if (!state) return true;
    return state.needsDownload === 0 && state.needsUpload === 0;
  });

  /** Get media sync icon */
  mediaIcon = computed(() => {
    const state = this.mediaSyncState();
    if (!state) return 'perm_media';
    if (state.isSyncing) return 'sync';
    if (this.isMediaSynced()) return 'check_circle';
    return 'cloud_sync';
  });

  /** Get media status text */
  mediaStatusText = computed(() => {
    const state = this.mediaSyncState();
    if (!state) return '';
    if (state.isSyncing) {
      return this.transloco.translate('project.connection.syncingMedia', {
        progress: state.downloadProgress,
      });
    }
    if (this.isMediaSynced()) {
      return this.transloco.translate('project.connection.mediaSynced');
    }
    const pending = state.needsDownload + state.needsUpload;
    return this.transloco.translate('project.connection.mediaPending', {
      count: pending,
    });
  });

  /** Get tooltip for media status */
  mediaTooltip = computed(() => {
    const state = this.mediaSyncState();
    if (!state) return '';
    if (state.isSyncing) {
      return this.transloco.translate('project.connection.downloading', {
        progress: state.downloadProgress,
      });
    }
    if (this.isMediaSynced()) {
      return this.transloco.translate('project.connection.allMediaSynced');
    }
    const parts: string[] = [];
    if (state.needsDownload > 0) {
      parts.push(
        this.transloco.translate('project.connection.toDownload', {
          count: state.needsDownload,
        })
      );
    }
    if (state.needsUpload > 0) {
      parts.push(
        this.transloco.translate('project.connection.toUpload', {
          count: state.needsUpload,
        })
      );
    }
    return parts.join(', ');
  });

  onSyncClick(): void {
    this.syncRequested.emit();
  }
}
