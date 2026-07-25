import {
  ChangeDetectionStrategy,
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
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterModule } from '@angular/router';
import { type Project } from '@inkweld/index';
import { TranslocoModule } from '@jsverse/transloco';
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
  imports: [
    MatSidenavModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    RouterModule,
    ProjectCoverComponent,
    TranslocoModule,
  ],
  templateUrl: './side-nav.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./side-nav.component.scss'],
})
export class SideNavComponent {
  protected router = inject(Router);
  private readonly userService = inject(UnifiedUserService);
  private readonly syncQueueService = inject(SyncQueueService);

  @Input() isOpen = signal(false);
  @Input() isMobile = false;
  /** @deprecated Use projectItems instead */
  @Input() projects: Project[] = [];
  /** Unified project items (owned + shared) */
  @Input() projectItems: UnifiedProjectItem[] = [];
  @Input() selectedProject: Project | null = null;
  /**
   * Predicate that returns true when the given project key
   * (`username/slug`) is activated on this device. When omitted, all
   * projects are treated as activated.
   */
  @Input() isActivatedFn: (projectKey: string) => boolean = () => true;
  /**
   * Whether activation is required at all (false in local mode). Used to
   * hide the kebab menu and download hint in local mode where everything
   * is always activated.
   */
  @Input() activationRequired = false;

  @Output() projectSelected = new EventEmitter<Project>();
  /** Emitted when the user requests deactivation via the tile kebab menu. */
  @Output() deactivateRequested = new EventEmitter<Project>();
  /** Emitted when the user requests activation via the tile hover/kebab. */
  @Output() activateRequested = new EventEmitter<Project>();

  /** Build the project key for a project. */
  projectKey(project: Project): string {
    return `${project.username}/${project.slug}`;
  }

  /** Whether a project is activated on this device. */
  isProjectActivated(project: Project): boolean {
    if (!this.activationRequired) return true;
    return this.isActivatedFn(this.projectKey(project));
  }

  /** Stop click propagation so tile selection doesn't fire when the kebab is used. */
  onKebabClick(event: MouseEvent): void {
    event.stopPropagation();
    event.preventDefault();
  }

  requestActivate(project: Project): void {
    this.activateRequested.emit(project);
  }

  requestDeactivate(project: Project): void {
    this.deactivateRequested.emit(project);
  }

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
