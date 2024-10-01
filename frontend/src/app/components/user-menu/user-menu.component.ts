import { Component, Input, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';

import { User } from 'worm-api-client';
import { UserSettingsService } from '@services/user-settings.service';

interface LogoutResponse {
  message: string;
  redirectUrl: string;
}

@Component({
  selector: 'app-user-menu',
  standalone: true,
  imports: [MatButtonModule, MatMenuModule, MatIconModule, MatDividerModule],
  templateUrl: './user-menu.component.html',
  styleUrl: './user-menu.component.scss',
})
export class UserMenuComponent {
  @Input() user: User | undefined = undefined;

  private userSettings = inject(UserSettingsService);
  private router = inject(Router);
  private http = inject(HttpClient);

  onLogout() {
    this.http
      .post<LogoutResponse>('/logout', {}, { withCredentials: true })
      .subscribe({
        next: response => {
          if (response && response.redirectUrl) {
            this.router.navigateByUrl(response.redirectUrl);
          } else {
            this.router.navigateByUrl('/welcome');
          }
        },
        error: error => {
          console.error('Logout failed', error);
        },
      });
  }

  onSettings() {
    this.userSettings.openSettingsDialog();
  }

  onFiles() {
    this.userSettings.openFileDialog();
  }
}
