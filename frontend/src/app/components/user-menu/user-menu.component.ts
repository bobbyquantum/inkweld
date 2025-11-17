import { Component, inject, Input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { RouterModule } from '@angular/router';
import { User } from '@inkweld/index';
import { DialogGatewayService } from '@services/dialog-gateway.service';
import { SetupService } from '@services/setup.service';
import { UnifiedUserService } from '@services/unified-user.service';

import { UserAvatarComponent } from '../user-avatar/user-avatar.component';

@Component({
  selector: 'app-user-menu',
  standalone: true,
  imports: [
    MatButtonModule,
    MatMenuModule,
    MatIconModule,
    MatDividerModule,
    UserAvatarComponent,
    RouterModule,
  ],
  templateUrl: './user-menu.component.html',
  styleUrl: './user-menu.component.scss',
})
export class UserMenuComponent {
  protected userService = inject(UnifiedUserService);
  protected setupService = inject(SetupService);
  private dialogGateway = inject(DialogGatewayService);

  @Input() user: User | undefined = undefined;
  @Input() miniMode = false;

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
