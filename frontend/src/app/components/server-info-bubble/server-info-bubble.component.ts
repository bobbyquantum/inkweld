import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthTokenService } from '@services/auth/auth-token.service';
import {
  ServerConfig,
  StorageContextService,
} from '@services/core/storage-context.service';

/**
 * Floating bubble that shows current server connection status.
 * Appears in the bottom-left corner of the screen.
 * Allows switching between configured profiles.
 */
@Component({
  selector: 'app-server-info-bubble',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule],
  templateUrl: './server-info-bubble.component.html',
  styleUrl: './server-info-bubble.component.scss',
})
export class ServerInfoBubbleComponent {
  private storageContext = inject(StorageContextService);
  private authTokenService = inject(AuthTokenService);

  /** All available profiles/configurations */
  readonly profiles = computed(() => this.storageContext.getConfigurations());

  /** Current active profile */
  readonly activeProfile = computed(() =>
    this.storageContext.getActiveConfig()
  );

  /** Whether there are multiple profiles to switch between */
  readonly hasMultipleProfiles = computed(() => this.profiles().length > 1);

  /** Whether we're in local mode */
  readonly isLocalMode = computed(() => this.storageContext.isLocalMode());

  /** Whether user is configured (has at least one profile) */
  readonly isConfigured = computed(() => this.storageContext.isConfigured());

  /**
   * Get display name for a profile
   */
  getProfileDisplayName(profile: ServerConfig): string {
    if (profile.type === 'local') {
      return 'Local Mode';
    }
    return profile.displayName || profile.serverUrl || 'Server';
  }

  /**
   * Get short display name for current profile (for bubble)
   */
  getShortDisplayName(): string {
    const profile = this.activeProfile();
    if (!profile) return 'Not configured';
    if (profile.type === 'local') return 'Local';
    // Extract hostname from URL
    try {
      const url = new URL(profile.serverUrl!);
      return url.hostname;
    } catch {
      return profile.displayName || 'Server';
    }
  }

  /**
   * Check if a profile has a stored auth token
   */
  hasTokenForProfile(profile: ServerConfig): boolean {
    return this.authTokenService.hasTokenForConfig(profile.id);
  }

  /**
   * Switch to a different profile
   */
  switchToProfile(profile: ServerConfig): void {
    if (profile.id === this.activeProfile()?.id) return;

    this.storageContext.switchToConfig(profile.id);
    // Navigate to home before reloading - the current project URL
    // won't exist in the new profile context
    window.location.href = '/';
  }

  /**
   * Get icon for profile type
   */
  getProfileIcon(profile: ServerConfig): string {
    if (profile.type === 'local') return 'folder';
    return 'cloud';
  }

  /**
   * Get connection status icon
   */
  getStatusIcon(): string {
    const profile = this.activeProfile();
    if (!profile) return 'cloud_off';
    if (profile.type === 'local') return 'folder';
    return 'cloud_done';
  }
}
