import { Component, EventEmitter, inject, Input, Output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { Router, RouterModule } from '@angular/router';
import { Project } from '@inkweld/index';
import { UserService } from '@services/user/user.service';

import { ProjectCoverComponent } from '../project-cover/project-cover.component';

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
    ProjectCoverComponent,
  ],
  templateUrl: './side-nav.component.html',
  styleUrls: ['./side-nav.component.scss'],
})
export class SideNavComponent {
  protected router = inject(Router);
  private userService = inject(UserService);

  @Input() isOpen = signal(false);
  @Input() isMobile = false;
  @Input() projects: Project[] = [];
  @Input() selectedProject: Project | null = null;

  @Output() projectSelected = new EventEmitter<Project>();

  get navItems(): NavItem[] {
    const username = this.userService.currentUser()?.username;
    return [
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
  }

  toggleNav(): void {
    this.isOpen.set(!this.isOpen());
  }

  onProjectClick(project: Project): void {
    this.projectSelected.emit(project);
  }
}
