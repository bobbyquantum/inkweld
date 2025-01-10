import { HttpClient } from '@angular/common/http';
import { Component, inject, Input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { Router } from '@angular/router';
import { UserService } from '@services/user.service';
import { UserDto } from '@worm/index';

interface LogoutResponse {
  message: string;
  redirectUrl: string;
}

@Component({
  selector: 'app-user-menu',
  imports: [MatButtonModule, MatMenuModule, MatIconModule, MatDividerModule],
  templateUrl: './user-menu.component.html',
  styleUrl: './user-menu.component.scss',
})
export class UserMenuComponent {
  @Input() user: UserDto | undefined = undefined;

  protected userService = inject(UserService);
  private router = inject(Router);
  private http = inject(HttpClient);

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
