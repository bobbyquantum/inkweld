import { Component, Input, NgZone } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';

import { User } from 'worm-api-client';
import { UserSettingsService } from '@services/user-settings.service';

@Component({
  selector: 'app-user-menu',
  standalone: true,
  imports: [MatButtonModule, MatMenuModule, MatIconModule, MatDividerModule],
  templateUrl: './user-menu.component.html',
  styleUrl: './user-menu.component.scss',
})
export class UserMenuComponent {
  @Input() user: User | undefined = undefined;
  constructor(
    private ngZone: NgZone,
    private userSettings: UserSettingsService
  ) {}
  onLogout() {
    this.ngZone.runOutsideAngular(() => {
      window.location.href = '/logout';
    });
  }
  onSettings() {
    this.userSettings.openSettingsDialog();
  }
  onFiles() {
    this.userSettings.openFileDialog();
  }
}
