import { Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { type PresenceSession } from '@inkweld/presence';
import { PresenceService } from '@services/presence/presence.service';

import { UserAvatarComponent } from '../user-avatar/user-avatar.component';

/**
 * Presence Indicator Component
 *
 * Shows avatars of users currently viewing/editing the same document.
 * Uses the project-level presence protocol to track presence in real-time.
 */
@Component({
  selector: 'app-presence-indicator',
  imports: [MatIconModule, MatTooltipModule, UserAvatarComponent],
  templateUrl: './presence-indicator.component.html',
  styleUrls: ['./presence-indicator.component.scss'],
})
export class PresenceIndicatorComponent {
  private readonly presence = inject(PresenceService);

  /** Maximum number of avatars to display before showing overflow */
  private readonly maxDisplayed = 5;

  /** All active remote sessions from project presence */
  protected readonly activeUsers = this.presence.users;

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
    return overflow.map(u => u.user.username).join(', ');
  });

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

  protected tooltipFor(user: PresenceSession): string {
    return `${user.user.username} (${user.status})`;
  }
}
