import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoService } from '@jsverse/transloco';

import { DocumentSyncState } from '../../models/document-sync-state';
import { type MediaSyncState } from '../../services/local/media-sync.service';

/**
 * Component to display the connection status for project sync and media sync.
 * Shows appropriate icons and status text based on the current state.
 *
 * Design: While connecting, we show "Offline Mode" with a spinning retry button
 * rather than a prominent "Connecting..." state, to avoid visual distraction
 * during repeated connection attempts.
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

  /** Event emitted when user clicks retry sync */
  syncRequested = output<void>();

  /** Whether we're currently trying to connect (Syncing state) */
  isConnecting = computed(() => this.syncState() === DocumentSyncState.Syncing);

  /** Display as offline when offline OR when connecting (to reduce visual noise) */
  displayAsOffline = computed(() => {
    const state = this.syncState();
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
    const state = this.syncState();
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
    switch (this.syncState()) {
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
    switch (this.syncState()) {
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
    // In local mode, show local-specific tooltip
    if (this.isLocalMode()) {
      return this.transloco.translate('project.connection.localTooltip');
    }
    const error = this.lastError();
    switch (this.syncState()) {
      case DocumentSyncState.Synced:
        return this.transloco.translate('project.connection.connectedTooltip');
      case DocumentSyncState.Syncing:
        return this.transloco.translate('project.connection.connectingTooltip');
      case DocumentSyncState.Local:
        return error
          ? this.transloco.translate('project.connection.offlineTooltip', {
              error,
            })
          : this.transloco.translate(
              'project.connection.offlineNoErrorTooltip'
            );
      case DocumentSyncState.Unavailable:
        return error
          ? this.transloco.translate('project.connection.failedTooltip', {
              error,
            })
          : this.transloco.translate('project.connection.failedNoErrorTooltip');
      default:
        return '';
    }
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
