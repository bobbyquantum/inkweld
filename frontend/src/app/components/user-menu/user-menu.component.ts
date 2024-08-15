import { Component, Input, NgZone } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';

import { User } from 'worm-api-client';

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
  @Input() user: User | null = null;
  constructor(private ngZone: NgZone) {
  }
  onLogout() {
    this.ngZone.runOutsideAngular(() => {
      window.location.href = '/logout';
    });
  }

  onSettings() {
    console.log('Settings clicked');
  }
}
