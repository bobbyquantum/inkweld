import { Component, inject, Input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { RouterModule } from '@angular/router';
import { UserDto } from '@inkweld/index';
import { UserService } from '@services/user.service';

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
  protected userService = inject(UserService);

  @Input() user: UserDto | undefined = undefined;
  @Input() miniMode = false;

  async onLogout() {
    try {
      await this.userService.logout();
    } catch (error) {
      console.error('Logout failed', error);
    }
  }

  onSettings() {
    void this.userService.openSettingsDialog();
  }
}
