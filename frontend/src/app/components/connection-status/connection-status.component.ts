import { Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

import { DocumentSyncState } from '../../models/document-sync-state';
import { MediaSyncState } from '../../services/offline/media-sync.service';

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
  standalone: true,
  imports: [
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
  ],
  template: `
    @if (collapsed()) {
      <!-- Collapsed mode: icon-only button -->
      <button
        mat-icon-button
        class="collapsed-sync-button"
        [class.synced]="syncState() === DocumentSyncState.Synced"
        [class.offline]="displayAsOffline()"
        [class.unavailable]="syncState() === DocumentSyncState.Unavailable"
        [class.spinning]="isConnecting()"
        [disabled]="syncState() === DocumentSyncState.Synced"
        (click)="onSyncClick()"
        [matTooltip]="syncTooltip()"
        data-testid="collapsed-sync-button">
        <mat-icon>{{ syncIcon() }}</mat-icon>
      </button>
    } @else {
      <div class="connection-status" data-testid="connection-status">
        <!-- Project Elements Sync Status -->
        <div
          class="status-row"
          [class.status-synced]="syncState() === DocumentSyncState.Synced"
          [class.status-offline]="displayAsOffline()"
          [class.status-unavailable]="
            syncState() === DocumentSyncState.Unavailable
          "
          [matTooltip]="syncTooltip()"
          data-testid="project-sync-status">
          <mat-icon class="status-icon">{{ syncIcon() }}</mat-icon>
          <span class="status-text">{{ syncStatusText() }}</span>
          @if (showRetryButton()) {
            <button
              mat-icon-button
              class="sync-button"
              [class.spinning]="isConnecting()"
              [disabled]="isConnecting()"
              (click)="onSyncClick()"
              [matTooltip]="retryButtonTooltip()"
              data-testid="retry-sync-button">
              <mat-icon>sync</mat-icon>
            </button>
          }
        </div>

        <!-- Media Sync Status (if applicable) -->
        @if (showMediaStatus() && mediaSyncState()) {
          <div
            class="status-row media-row"
            [class.status-synced]="isMediaSynced()"
            [class.status-syncing]="mediaSyncState()?.isSyncing"
            [class.status-offline]="
              !isMediaSynced() && !mediaSyncState()?.isSyncing
            "
            [matTooltip]="mediaTooltip()"
            data-testid="media-sync-status">
            @if (mediaSyncState()?.isSyncing) {
              <mat-spinner diameter="14" class="status-spinner"></mat-spinner>
            } @else {
              <mat-icon class="status-icon media-icon">{{
                mediaIcon()
              }}</mat-icon>
            }
            <span class="status-text media-text">{{ mediaStatusText() }}</span>
          </div>
        }
      </div>
    }
  `,
  styles: [
    `
      .collapsed-sync-button {
        &.synced mat-icon {
          color: var(--sys-primary);
        }
        &.offline mat-icon {
          color: var(--sys-outline);
        }
        &.unavailable mat-icon {
          color: var(--sys-error);
        }
        &.spinning mat-icon {
          animation: spin 1.5s linear infinite;
          opacity: 0.6;
        }
      }
      .connection-status {
        display: flex;
        flex-direction: column;
        padding: 4px 8px;
        gap: 2px;
        border-bottom: 1px solid var(--sys-outline-variant);
        background-color: var(--sys-surface-container);
      }

      .status-row {
        display: flex;
        align-items: center;
        min-height: 28px;
        padding: 2px 4px;
        border-radius: 4px;
        transition: background-color 150ms ease;
      }

      .status-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        margin-right: 8px;
      }

      .media-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }

      .status-spinner {
        margin-right: 8px;
      }

      .status-text {
        flex: 1;
        font-size: 12px;
        color: var(--sys-on-surface-variant);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .media-text {
        font-size: 11px;
      }

      .media-row {
        padding-left: 26px; /* Indent under main status */
      }

      .sync-button {
        width: 24px;
        height: 24px;
        line-height: 24px;

        mat-icon {
          font-size: 18px;
          width: 18px;
          height: 18px;
        }

        &.spinning {
          mat-icon {
            animation: spin 1.5s linear infinite;
            opacity: 0.6;
          }
        }

        &:disabled {
          opacity: 1; /* Keep button visible when disabled/spinning */
        }
      }

      @keyframes spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }

      /* Status-specific styling */
      .status-synced {
        .status-icon {
          color: var(--sys-primary);
        }
      }

      .status-offline {
        .status-icon {
          color: var(--sys-outline);
        }
        .status-text {
          color: var(--sys-on-surface-variant);
        }
      }

      .status-unavailable {
        .status-icon {
          color: var(--sys-error);
        }
        .status-text {
          color: var(--sys-error);
        }
      }
    `,
  ],
})
export class ConnectionStatusComponent {
  protected readonly DocumentSyncState = DocumentSyncState;

  /** Current document sync state */
  syncState = input.required<DocumentSyncState>();

  /** Media sync state (optional) */
  mediaSyncState = input<MediaSyncState | null>(null);

  /** Whether to show media sync status */
  showMediaStatus = input<boolean>(false);

  /** Whether to show collapsed (icon-only) mode */
  collapsed = input<boolean>(false);

  /** Event emitted when user clicks retry sync */
  syncRequested = output<void>();

  /** Whether we're currently trying to connect (Syncing state) */
  isConnecting = computed(() => this.syncState() === DocumentSyncState.Syncing);

  /** Display as offline when offline OR when connecting (to reduce visual noise) */
  displayAsOffline = computed(() => {
    const state = this.syncState();
    return (
      state === DocumentSyncState.Offline || state === DocumentSyncState.Syncing
    );
  });

  /** Show retry button when offline, connecting, or unavailable */
  showRetryButton = computed(() => {
    const state = this.syncState();
    return (
      state === DocumentSyncState.Offline ||
      state === DocumentSyncState.Syncing ||
      state === DocumentSyncState.Unavailable
    );
  });

  /** Get the appropriate icon for sync state */
  syncIcon = computed(() => {
    switch (this.syncState()) {
      case DocumentSyncState.Synced:
        return 'cloud_done';
      case DocumentSyncState.Syncing:
        return 'cloud_off'; // Show offline icon while connecting
      case DocumentSyncState.Offline:
        return 'cloud_off';
      case DocumentSyncState.Unavailable:
        return 'error_outline';
      default:
        return 'help_outline';
    }
  });

  /** Get the status text for display */
  syncStatusText = computed(() => {
    switch (this.syncState()) {
      case DocumentSyncState.Synced:
        return 'Connected';
      case DocumentSyncState.Syncing:
        return 'Offline Mode'; // Show as offline while connecting
      case DocumentSyncState.Offline:
        return 'Offline Mode';
      case DocumentSyncState.Unavailable:
        return 'Connection Failed';
      default:
        return 'Unknown';
    }
  });

  /** Get tooltip text for sync status row */
  syncTooltip = computed(() => {
    switch (this.syncState()) {
      case DocumentSyncState.Synced:
        return 'Project is synced with server';
      case DocumentSyncState.Syncing:
        return 'Connecting to server...';
      case DocumentSyncState.Offline:
        return 'Working offline - changes saved locally';
      case DocumentSyncState.Unavailable:
        return 'Unable to connect to server';
      default:
        return '';
    }
  });

  /** Get tooltip for the retry button */
  retryButtonTooltip = computed(() => {
    if (this.isConnecting()) {
      return 'Connecting to server...';
    }
    return 'Retry sync';
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
      return `Syncing media... ${state.downloadProgress}%`;
    }
    if (this.isMediaSynced()) {
      return 'Media synced';
    }
    const pending = state.needsDownload + state.needsUpload;
    return `${pending} media pending`;
  });

  /** Get tooltip for media status */
  mediaTooltip = computed(() => {
    const state = this.mediaSyncState();
    if (!state) return '';
    if (state.isSyncing) {
      return `Downloading: ${state.downloadProgress}%`;
    }
    if (this.isMediaSynced()) {
      return 'All media files are synced';
    }
    const parts: string[] = [];
    if (state.needsDownload > 0) {
      parts.push(`${state.needsDownload} to download`);
    }
    if (state.needsUpload > 0) {
      parts.push(`${state.needsUpload} to upload`);
    }
    return parts.join(', ');
  });

  onSyncClick(): void {
    this.syncRequested.emit();
  }
}
