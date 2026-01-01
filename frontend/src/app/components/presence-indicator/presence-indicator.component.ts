import {
  Component,
  computed,
  effect,
  inject,
  OnDestroy,
  signal,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DocumentService } from '@services/project/document.service';
import { ProjectStateService } from '@services/project/project-state.service';

/**
 * Represents a user state from Yjs awareness
 */
interface AwarenessUserState {
  user?: {
    name?: string;
    color?: string;
  };
}

/**
 * Represents a user currently present in the document
 */
export interface PresenceUser {
  clientId: number;
  username: string;
  color: string;
  /** When the user was last seen active */
  lastActive: number;
}

/**
 * Presence Indicator Component
 *
 * Shows avatars of users currently viewing/editing the same document.
 * Uses Yjs awareness protocol to track presence in real-time.
 */
@Component({
  selector: 'app-presence-indicator',
  standalone: true,
  imports: [MatIconModule, MatTooltipModule],
  template: `
    @if (activeUsers().length > 0) {
      <div class="presence-container" data-testid="presence-indicator">
        <div class="presence-avatars">
          @for (user of displayedUsers(); track user.clientId) {
            <div
              class="presence-avatar"
              [style.background-color]="user.color"
              [matTooltip]="user.username"
              matTooltipPosition="below">
              {{ getInitials(user.username) }}
            </div>
          }
          @if (overflowCount() > 0) {
            <div
              class="presence-avatar overflow"
              [matTooltip]="overflowTooltip()">
              +{{ overflowCount() }}
            </div>
          }
        </div>
        <span class="presence-label">
          {{ activeUsers().length }}
          {{ activeUsers().length === 1 ? 'user' : 'users' }} online
        </span>
      </div>
    }
  `,
  styles: [
    `
      .presence-container {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 8px;
        background: var(--sys-surface-container);
        border-radius: 20px;
      }

      .presence-avatars {
        display: flex;
        align-items: center;
      }

      .presence-avatar {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 600;
        color: white;
        text-transform: uppercase;
        border: 2px solid var(--sys-surface);
        margin-left: -8px;
        cursor: default;
        transition: transform 0.2s ease;

        &:first-child {
          margin-left: 0;
        }

        &:hover {
          transform: scale(1.1);
          z-index: 1;
        }

        &.overflow {
          background: var(--sys-secondary-container);
          color: var(--sys-on-secondary-container);
          font-size: 10px;
        }
      }

      .presence-label {
        font-size: 12px;
        color: var(--sys-on-surface-variant);
        white-space: nowrap;
      }

      @media (max-width: 600px) {
        .presence-label {
          display: none;
        }
      }
    `,
  ],
})
export class PresenceIndicatorComponent implements OnDestroy {
  private readonly documentService = inject(DocumentService);
  private readonly projectState = inject(ProjectStateService);

  /** Maximum number of avatars to display before showing overflow */
  private readonly maxDisplayed = 5;

  /** All active users from awareness */
  protected readonly activeUsers = signal<PresenceUser[]>([]);

  /** Users to display (limited by maxDisplayed) */
  protected readonly displayedUsers = computed(() =>
    this.activeUsers().slice(0, this.maxDisplayed)
  );

  /** Number of users in overflow */
  protected readonly overflowCount = computed(() =>
    Math.max(0, this.activeUsers().length - this.maxDisplayed)
  );

  /** Tooltip for overflow indicator */
  protected readonly overflowTooltip = computed(() => {
    const overflow = this.activeUsers().slice(this.maxDisplayed);
    return overflow.map(u => u.username).join(', ');
  });

  /** Interval for polling awareness state */
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Set up polling for awareness state changes
    effect(() => {
      const project = this.projectState.project();
      if (project) {
        this.startPolling();
      } else {
        this.stopPolling();
      }
    });
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  private startPolling(): void {
    if (this.pollInterval) return;

    // Poll every 2 seconds for awareness updates
    this.pollInterval = setInterval(() => {
      this.updatePresence();
    }, 2000);

    // Initial update
    this.updatePresence();
  }

  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.activeUsers.set([]);
  }

  private updatePresence(): void {
    // Get awareness from active document connections
    const connections = this.documentService.getActiveConnections();
    const users = new Map<number, PresenceUser>();

    for (const connection of connections) {
      const awareness = connection.provider?.awareness;
      if (awareness) {
        const myClientId = awareness.clientID;
        const states = awareness.getStates() as Map<number, AwarenessUserState>;

        states.forEach((state: AwarenessUserState, clientId: number) => {
          // Skip our own client and clients without user info
          if (state.user && clientId !== myClientId) {
            users.set(clientId, {
              clientId,
              username: state.user.name || 'Anonymous',
              color: state.user.color || this.generateColor(clientId),
              lastActive: Date.now(),
            });
          }
        });
      }
    }

    this.activeUsers.set(Array.from(users.values()));
  }

  /**
   * Generate initials from username
   */
  getInitials(username: string): string {
    if (!username) return '?';
    const parts = username.split(/[\s_-]+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return username.substring(0, 2).toUpperCase();
  }

  /**
   * Generate a consistent color for a client ID
   */
  private generateColor(clientId: number): string {
    const hue = (clientId * 137.508) % 360; // Golden angle for good distribution
    return `hsl(${hue}, 65%, 50%)`;
  }
}
