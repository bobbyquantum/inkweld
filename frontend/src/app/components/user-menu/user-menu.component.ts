import { HttpClient } from '@angular/common/http';
import { Component, inject, Input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { Router } from '@angular/router';
import { UserSettingsService } from '@services/user-settings.service';
import { User } from 'worm-api-client';

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
