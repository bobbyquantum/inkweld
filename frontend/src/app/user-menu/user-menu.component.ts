import { Component, Input, NgZone } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';

import { UserDto } from 'worm-api-client';

@Component({
  selector: 'app-user-menu',
  standalone: true,
  imports: [
    MatButtonModule,
    MatMenuModule,
    MatIconModule,
    MatDividerModule
  ],
  templateUrl: './user-menu.component.html',
  styleUrl: './user-menu.component.scss'
})
export class UserMenuComponent {
  @Input() user: UserDto | null = null;
  constructor(private ngZone: NgZone) {
  }
  onLogout() {
    // Implement logout logic here
    console.log('Logout clicked');
    this.ngZone.runOutsideAngular(() => {
      window.location.href = '/logout';
    });
  }

  onSettings() {
    // Implement settings navigation here
    console.log('Settings clicked');
  }
}
