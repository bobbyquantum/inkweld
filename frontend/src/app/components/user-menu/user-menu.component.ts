import { HttpClient } from '@angular/common/http';
import { Component, inject, Input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { Router, RouterModule } from '@angular/router';
import { UserDto } from '@inkweld/index';
import { UserService } from '@services/user.service';

import { UserAvatarComponent } from '../user-avatar/user-avatar.component';

interface LogoutResponse {
  message: string;
  redirectUrl: string;
}

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
  private router = inject(Router);
  private http = inject(HttpClient);

  @Input() user: UserDto | undefined = undefined;
  @Input() miniMode = false;

  onLogout() {
    this.http
      .post<LogoutResponse>('/logout', {}, { withCredentials: true })
      .subscribe({
        next: response => {
          if (response?.redirectUrl) {
            void this.router.navigateByUrl(response.redirectUrl);
          } else {
            void this.router.navigateByUrl('/welcome');
          }
        },
        error: error => {
          console.error('Logout failed', error);
        },
      });
  }

  onSettings() {
    void this.userService.openSettingsDialog();
  }
}
