import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Input,
  type OnInit,
  signal,
} from '@angular/core';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterModule } from '@angular/router';
import { type User } from '@inkweld/index';
import { TranslocoModule } from '@jsverse/transloco';
import { type TutorialTourId } from '@models/tutorial';
import { AnnouncementService } from '@services/announcement/announcement.service';
import { AuthTokenService } from '@services/auth/auth-token.service';
import { CloudSyncEngineService } from '@services/cloud-sync/cloud-sync-engine.service';
import { CloudTokenStoreService } from '@services/cloud-sync/cloud-token-store.service';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { SetupService } from '@services/core/setup.service';
import {
  getLocalConfigDisplayName,
  type ServerConfig,
  StorageContextService,
} from '@services/core/storage-context.service';
import { TutorialService } from '@services/core/tutorial.service';
import { UnifiedUserService } from '@services/user/unified-user.service';
import { type ThemeOption, ThemeService } from '@themes/theme.service';

import { UserAvatarComponent } from '../user-avatar/user-avatar.component';

@Component({
  selector: 'app-user-menu',
  imports: [
    MatBadgeModule,
    MatButtonModule,
    MatMenuModule,
    MatIconModule,
    MatDividerModule,
    MatTooltipModule,
    UserAvatarComponent,
    RouterModule,
    TranslocoModule,
  ],
  templateUrl: './user-menu.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './user-menu.component.scss',
})
export class UserMenuComponent implements OnInit {
  protected userService = inject(UnifiedUserService);
  protected setupService = inject(SetupService);
  protected announcementService = inject(AnnouncementService);
  protected storageContext = inject(StorageContextService);
  protected authTokenService = inject(AuthTokenService);
  protected cloudSync = inject(CloudSyncEngineService);
  private readonly cloudTokens = inject(CloudTokenStoreService);
  private readonly dialogGateway = inject(DialogGatewayService);
  private readonly router = inject(Router);
  private readonly themeService = inject(ThemeService);
  private readonly tutorialService = inject(TutorialService);

  @Input() user: User | undefined = undefined;
  @Input() miniMode = false;
  /** Which guided tour this menu offers; omit to hide the menu item. */
  @Input() tutorialTour: TutorialTourId | null = null;

  // Check if current user is an admin (only in server mode)
  protected isAdmin = computed(() => {
    const mode = this.setupService.getMode();
    if (mode !== 'server') {
      return false;
    }
    const currentUser = this.userService.currentUser();
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

  /** Whether the menu is showing the account list instead of the actions */
  protected readonly switcherOpen = signal(false);

  /** Browser and cloud profiles can move up to cloud storage or a server */
  protected canUpgrade = computed(() => {
    const type = this.activeProfile()?.type;
    return type === 'local' || type === 'cloud';
  });

  /** The next step up, worded for where the profile lives now */
  protected upgradeAction = computed(() =>
    this.activeProfile()?.type === 'cloud'
      ? { icon: 'dns', label: 'settings.connectionTab.moveToServer' }
      : { icon: 'cloud', label: 'settings.connectionTab.upgradeProfile' }
  );

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

  /** Add another profile via the welcome screen; existing ones are untouched */
  onAddConnection(): void {
    void this.router.navigate(['/setup']);
  }

  /** Flip between the action list and the account switcher, menu stays open */
  toggleSwitcher(event?: Event): void {
    event?.stopPropagation();
    event?.preventDefault();
    this.switcherOpen.update(open => !open);
  }

  /** Offer the upgrade paths for the active profile */
  async onUpgradeProfile(): Promise<void> {
    await this.dialogGateway.openProfileManagerDialog({ view: 'upgrade' });
  }

  onStartTutorial(): void {
    if (this.tutorialTour) {
      this.tutorialService.start(this.tutorialTour);
    }
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
    if (mode === 'cloud') {
      return this.cloudStatus();
    }
    return {
      icon: 'computer',
      text: 'Browser · this device only',
      cssClass: 'local',
    };
  }

  /** Cloud Sync status line for the profile switcher */
  private cloudStatus(): { icon: string; text: string; cssClass: string } {
    switch (this.cloudSync.status()) {
      case 'syncing':
        return { icon: 'cloud_sync', text: 'Syncing…', cssClass: 'online' };
      case 'synced':
        return {
          icon: 'cloud_done',
          text: 'Cloud Sync · up to date',
          cssClass: 'online',
        };
      case 'offline':
        return {
          icon: 'cloud_off',
          text: 'Cloud Sync · offline',
          cssClass: 'local',
        };
      case 'error':
        return {
          icon: 'cloud_alert',
          text: 'Cloud Sync · error',
          cssClass: 'local',
        };
      case 'disconnected':
        return {
          icon: 'cloud_off',
          text: 'Cloud Sync · reconnect needed',
          cssClass: 'local',
        };
      default:
        return { icon: 'cloud_sync', text: 'Cloud Sync', cssClass: 'local' };
    }
  }

  onSyncNow(event?: Event): void {
    // Lives in the header card, so keep the menu open while it runs
    event?.stopPropagation();
    void this.cloudSync.syncNow();
  }

  /**
   * Get the display name for the current server/profile
   */
  getCurrentServerName(): string {
    const profile = this.activeProfile();
    if (!profile) return 'Not configured';

    if (profile.type === 'local') {
      return getLocalConfigDisplayName(profile);
    }

    if (profile.type === 'cloud') {
      return profile.displayName ?? 'Cloud Sync';
    }

    // Use display name if set, otherwise extract hostname from URL
    if (profile.displayName) {
      return profile.displayName;
    }

    try {
      const url = new URL(profile.serverUrl ?? '');
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
    /** Short kind label shown next to the name */
    kind: string;
    icon: string;
    isActive: boolean;
    hasAuth: boolean;
  } {
    const isActive = profile.id === this.activeProfile()?.id;
    const hasAuth = this.authTokenService.hasTokenForConfig(profile.id);

    // GitHub-style rows: the author is the headline, the place is the detail
    const user = profile.userProfile;
    const handle = user?.username ? `@${user.username}` : null;

    if (profile.type === 'local') {
      return {
        name: user?.name ?? getLocalConfigDisplayName(profile),
        subtitle: handle ? `${handle} · this browser` : 'This browser only',
        kind: 'Browser',
        icon: 'computer',
        isActive,
        hasAuth: true, // Local mode doesn't need auth
      };
    }

    if (profile.type === 'cloud') {
      const provider = profile.displayName ?? 'Cloud Sync';
      return {
        name: user?.name ?? provider,
        subtitle: [handle, provider, profile.cloudAccountLabel ?? null]
          .filter(Boolean)
          .join(' · '),
        kind: 'Cloud Sync',
        icon: 'cloud_sync',
        isActive,
        hasAuth: this.cloudTokens.has(profile.id),
      };
    }

    const serverName = profile.displayName ?? profile.serverUrl ?? 'Server';
    return {
      name: user?.name ?? serverName,
      subtitle: handle
        ? `${handle} · ${serverName}`
        : `${serverName} · not logged in`,
      kind: 'Server',
      icon: 'dns',
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
    globalThis.location.href = '/';
  }
}
