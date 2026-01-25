import { Component, computed, inject, Input, OnInit } from '@angular/core';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterModule } from '@angular/router';
import { User } from '@inkweld/index';
import { AnnouncementService } from '@services/announcement/announcement.service';
import { AuthTokenService } from '@services/auth/auth-token.service';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { SetupService } from '@services/core/setup.service';
import {
  ServerConfig,
  StorageContextService,
} from '@services/core/storage-context.service';
import { UnifiedUserService } from '@services/user/unified-user.service';
import { ThemeOption, ThemeService } from '@themes/theme.service';

import { UserAvatarComponent } from '../user-avatar/user-avatar.component';

// Extended user interface that includes isAdmin
// This will be properly typed once the API client is regenerated
interface AdminUser extends User {
  isAdmin?: boolean;
}

@Component({
  selector: 'app-user-menu',
  standalone: true,
  imports: [
    MatBadgeModule,
    MatButtonModule,
    MatMenuModule,
    MatIconModule,
    MatDividerModule,
    MatTooltipModule,
    UserAvatarComponent,
    RouterModule,
  ],
  templateUrl: './user-menu.component.html',
  styleUrl: './user-menu.component.scss',
})
export class UserMenuComponent implements OnInit {
  protected userService = inject(UnifiedUserService);
  protected setupService = inject(SetupService);
  protected announcementService = inject(AnnouncementService);
  protected storageContext = inject(StorageContextService);
  protected authTokenService = inject(AuthTokenService);
  private dialogGateway = inject(DialogGatewayService);
  private themeService = inject(ThemeService);

  @Input() user: User | undefined = undefined;
  @Input() miniMode = false;

  // Check if current user is an admin (only in server mode)
  protected isAdmin = computed(() => {
    const mode = this.setupService.getMode();
    if (mode !== 'server') {
      return false;
    }
    const currentUser = this.userService.currentUser() as AdminUser | undefined;
    return currentUser?.isAdmin === true;
  });

  // Unread announcement count
  protected unreadCount = computed(() =>
    this.announcementService.unreadCount()
  );

  // Available profiles for switching
  protected profiles = computed(() => {
    return this.storageContext.configurations();
  });

  // Check if we have multiple profiles
  protected hasMultipleProfiles = computed(() => {
    return this.profiles().length > 1;
  });

  // Get the active profile
  protected activeProfile = computed(() => {
    return this.storageContext.activeConfig();
  });

  ngOnInit(): void {
    // Load unread count when in server mode
    if (this.setupService.getMode() === 'server') {
      void this.announcementService.loadUnreadCount();
    }
  }

  async onLogout() {
    try {
      await this.userService.logout();
    } catch (error) {
      console.error('Logout failed', error);
    }
  }

  async onSettings() {
    await this.dialogGateway.openUserSettingsDialog();
  }

  async onManageProfiles() {
    await this.dialogGateway.openProfileManagerDialog();
  }

  onThemeChange(theme: ThemeOption): void {
    this.themeService.update(theme);
  }

  getConnectionStatus(): { icon: string; text: string; cssClass: string } {
    const mode = this.setupService.getMode();
    if (mode === 'server') {
      return {
        icon: 'cloud_done',
        text: 'Connected',
        cssClass: 'online',
      };
    }
    return {
      icon: 'computer',
      text: 'Local Mode',
      cssClass: 'local',
    };
  }

  /**
   * Get the display name for the current server/profile
   */
  getCurrentServerName(): string {
    const profile = this.activeProfile();
    if (!profile) return 'Not configured';

    if (profile.type === 'local') {
      return 'Local Mode';
    }

    // Use display name if set, otherwise extract hostname from URL
    if (profile.displayName) {
      return profile.displayName;
    }

    try {
      const url = new URL(profile.serverUrl!);
      return url.hostname;
    } catch {
      return 'Server';
    }
  }

  /**
   * Get display info for a profile
   */
  getProfileDisplay(profile: ServerConfig): {
    name: string;
    subtitle: string;
    icon: string;
    isActive: boolean;
    hasAuth: boolean;
  } {
    const isActive = profile.id === this.activeProfile()?.id;
    const hasAuth = this.authTokenService.hasTokenForConfig(profile.id);

    if (profile.type === 'local') {
      return {
        name: profile.displayName ?? 'Local Mode',
        subtitle: profile.userProfile?.username ?? 'Offline',
        icon: 'computer',
        isActive,
        hasAuth: true, // Local mode doesn't need auth
      };
    }

    return {
      name: profile.displayName ?? profile.serverUrl ?? 'Server',
      subtitle: profile.userProfile?.username ?? 'Not logged in',
      icon: 'cloud',
      isActive,
      hasAuth,
    };
  }

  /**
   * Switch to a different profile
   */
  onSwitchProfile(profile: ServerConfig): void {
    if (profile.id === this.activeProfile()?.id) {
      return; // Already on this profile
    }

    // Switch the storage context
    this.storageContext.switchToConfig(profile.id);

    // Navigate to home - the current project URL won't exist in the new profile context
    window.location.href = '/';
  }
}
