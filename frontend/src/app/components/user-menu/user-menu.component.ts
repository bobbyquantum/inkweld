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
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { SetupService } from '@services/core/setup.service';
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

  onThemeChange(theme: ThemeOption): void {
    this.themeService.update(theme);
  }

  getConnectionStatus(): { icon: string; text: string; cssClass: string } {
    const mode = this.setupService.getMode();
    if (mode === 'server') {
      return {
        icon: 'cloud_done',
        text: 'Online',
        cssClass: 'online',
      };
    }
    return {
      icon: 'cloud_off',
      text: 'Offline',
      cssClass: 'offline',
    };
  }
}
