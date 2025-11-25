import { Component, inject, Input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { Router, RouterModule } from '@angular/router';
import { UserService } from '@services/user/user.service';

export interface NavItem {
  label: string;
  icon: string;
  route?: string;
  action?: () => void;
}

@Component({
  selector: 'app-side-nav',
  standalone: true,
  imports: [
    MatSidenavModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    RouterModule,
  ],
  templateUrl: './side-nav.component.html',
  styleUrls: ['./side-nav.component.scss'],
})
export class SideNavComponent {
  protected router = inject(Router);
  private userService = inject(UserService);

  @Input() isOpen = signal(false);
  @Input() isMobile = false;

  get navItems(): NavItem[] {
    const username = this.userService.currentUser()?.username;
    return [
      {
        label: 'Bookshelf',
        icon: 'collections_bookmark',
        route: '/home',
      },
      {
        label: 'Profile',
        icon: 'person',
        route: username ? `/${username}` : '/home',
      },
    ];
  }

  onNavItemClick(item: NavItem): void {
    if (item.action) {
      item.action();
    } else if (item.route) {
      void this.router.navigate([item.route]);
    }

    // Close menu on mobile after navigation
    if (this.isMobile) {
      this.isOpen.set(false);
    }
  }
}
