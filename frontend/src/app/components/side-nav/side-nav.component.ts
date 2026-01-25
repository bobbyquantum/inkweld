import {
  Component,
  EventEmitter,
  inject,
  Input,
  Output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterModule } from '@angular/router';
import { Project } from '@inkweld/index';
import { SyncQueueService, SyncStage } from '@services/sync/sync-queue.service';
import { UnifiedUserService } from '@services/user/unified-user.service';

import { ProjectCoverComponent } from '../project-cover/project-cover.component';

export interface NavItem {
  label: string;
  icon: string;
  route?: string;
  action?: () => void;
}

/** Unified project item that can be owned or shared */
export interface UnifiedProjectItem {
  project: Project;
  isShared: boolean;
  sharedByUsername?: string;
}

@Component({
  selector: 'app-side-nav',
  standalone: true,
  imports: [
    MatSidenavModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    RouterModule,
    ProjectCoverComponent,
  ],
  templateUrl: './side-nav.component.html',
  styleUrls: ['./side-nav.component.scss'],
})
export class SideNavComponent {
  protected router = inject(Router);
  private userService = inject(UnifiedUserService);
  private syncQueueService = inject(SyncQueueService);

  @Input() isOpen = signal(false);
  @Input() isMobile = false;
  /** @deprecated Use projectItems instead */
  @Input() projects: Project[] = [];
  /** Unified project items (owned + shared) */
  @Input() projectItems: UnifiedProjectItem[] = [];
  @Input() selectedProject: Project | null = null;

  @Output() projectSelected = new EventEmitter<Project>();

  /** Get sync status for a project by username/slug key */
  getSyncStatus(
    project: Project
  ): ReturnType<SyncQueueService['getProjectStatus']> {
    // Read statusVersion to trigger re-evaluation when statuses change
    this.syncQueueService.statusVersion();
    const key = `${project.username}/${project.slug}`;
    return this.syncQueueService.getProjectStatus(key);
  }

  /** Check if project is currently syncing */
  isSyncing(project: Project): boolean {
    const statusSignal = this.getSyncStatus(project);
    if (!statusSignal) return false;
    const status = statusSignal();
    return (
      status.stage !== SyncStage.Queued &&
      status.stage !== SyncStage.Completed &&
      status.stage !== SyncStage.Failed
    );
  }

  /** Check if project is queued for sync */
  isQueued(project: Project): boolean {
    const statusSignal = this.getSyncStatus(project);
    return statusSignal?.().stage === SyncStage.Queued;
  }

  /** Check if project sync completed successfully */
  isSynced(project: Project): boolean {
    const statusSignal = this.getSyncStatus(project);
    return statusSignal?.().stage === SyncStage.Completed;
  }

  /** Check if project sync failed */
  hasFailed(project: Project): boolean {
    const statusSignal = this.getSyncStatus(project);
    return statusSignal?.().stage === SyncStage.Failed;
  }

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
