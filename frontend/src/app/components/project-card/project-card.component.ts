import { Component, computed, inject, Input, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterModule } from '@angular/router';
import { Project } from '@inkweld/index';
import { SyncQueueService, SyncStage } from '@services/sync/sync-queue.service';

import { ProjectCoverComponent } from '../project-cover/project-cover.component';

@Component({
  selector: 'app-project-card',
  standalone: true,
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    RouterModule,
    ProjectCoverComponent,
  ],
  templateUrl: './project-card.component.html',
  styleUrl: './project-card.component.scss',
})
export class ProjectCardComponent {
  private syncQueueService = inject(SyncQueueService);

  @Input()
  public project!: Project;

  /** When true, shows a shared indicator badge on the card */
  @Input()
  public isShared = false;

  /** The owner's username for shared projects */
  @Input()
  public sharedByUsername?: string;

  /** Project key for looking up sync status */
  readonly projectKey = input<string>();

  /** Current sync status for this project */
  readonly syncStatus = computed(() => {
    // Read statusVersion to trigger re-evaluation when statuses change
    this.syncQueueService.statusVersion();
    const key = this.projectKey();
    if (!key) return null;
    const statusSignal = this.syncQueueService.getProjectStatus(key);
    return statusSignal?.() ?? null;
  });

  /** Whether this project is currently syncing */
  readonly isSyncing = computed(() => {
    const status = this.syncStatus();
    if (!status) return false;
    return (
      status.stage !== SyncStage.Queued &&
      status.stage !== SyncStage.Completed &&
      status.stage !== SyncStage.Failed
    );
  });

  /** Whether this project is queued for sync */
  readonly isQueued = computed(() => {
    const status = this.syncStatus();
    return status?.stage === SyncStage.Queued;
  });

  /** Whether sync completed successfully */
  readonly isSynced = computed(() => {
    const status = this.syncStatus();
    return status?.stage === SyncStage.Completed;
  });

  /** Whether sync failed */
  readonly hasFailed = computed(() => {
    const status = this.syncStatus();
    return status?.stage === SyncStage.Failed;
  });

  /** User-friendly label for current sync stage */
  readonly syncStageLabel = computed(() => {
    const status = this.syncStatus();
    if (!status) return '';

    switch (status.stage) {
      case SyncStage.Queued:
        return 'Waiting...';
      case SyncStage.Metadata:
        return 'Syncing metadata...';
      case SyncStage.Elements:
        return 'Syncing structure...';
      case SyncStage.Documents:
        return 'Syncing documents...';
      case SyncStage.Media:
        return 'Syncing media...';
      case SyncStage.Worldbuilding:
        return 'Syncing worldbuilding...';
      case SyncStage.Completed:
        return 'Synced!';
      case SyncStage.Failed:
        return status.error ?? 'Sync failed';
      default:
        return '';
    }
  });
}
