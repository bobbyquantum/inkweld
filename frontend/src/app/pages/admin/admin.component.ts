import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { RouterModule } from '@angular/router';
import { UnifiedUserService } from '@services/user/unified-user.service';

import { UserMenuComponent } from '../../components/user-menu/user-menu.component';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatSidenavModule,
    RouterModule,
    UserMenuComponent,
  ],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss',
})
export class AdminComponent {
  private readonly userService = inject(UnifiedUserService);

  readonly currentUser = this.userService.currentUser;
}
