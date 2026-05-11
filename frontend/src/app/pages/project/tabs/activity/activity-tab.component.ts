import { DatePipe } from '@angular/common';
import {
  Component,
  computed,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import type {
  ActivityEventType,
  ProjectActivityEvent,
} from '@models/activity-event';
import { LoggerService } from '@services/core/logger.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { ActivityFeedService } from '@services/stats/activity-feed.service';
import { firstValueFrom } from 'rxjs';

import { formatRelativeDate } from '../../../../utils/date-format';

/**
 * Project-scoped activity feed tab.
 *
 * Shows the append-only audit log of meaningful actions in the current project
 * (document edits, snapshots, comments, publishes, collaborator changes).
 *
 * Online-only: relies on the `/api/v1/activity/projects/...` backend endpoint;
 * offline / unreachable backends surface an error state with retry.
 *
 * Pagination: cursor-based using the `nextBefore` (unix-ms) value returned
 * by the API. Initial page size is 50; "Load more" appends the next page.
 */
@Component({
  selector: 'app-activity-tab',
  templateUrl: './activity-tab.component.html',
  styleUrls: ['./activity-tab.component.scss'],
  imports: [
    DatePipe,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
})
export class ActivityTabComponent implements OnInit {
  private readonly projectState = inject(ProjectStateService);
  private readonly activityFeed = inject(ActivityFeedService);
  private readonly logger = inject(LoggerService);

  /** Loaded events, newest-first. */
  protected readonly events = signal<ProjectActivityEvent[]>([]);
  /** Initial-load spinner. */
  protected readonly loading = signal(false);
  /** Subsequent-page spinner. */
  protected readonly loadingMore = signal(false);
  /** Last error message, if any. */
  protected readonly error = signal<string | null>(null);
  /** Cursor for the next page; null when exhausted. */
  protected readonly nextBefore = signal<number | null>(null);

  protected readonly hasMore = computed(() => this.nextBefore() !== null);
  protected readonly isEmpty = computed(
    () => !this.loading() && this.events().length === 0 && !this.error()
  );

  ngOnInit(): void {
    void this.loadInitial();
  }

  protected async loadInitial(): Promise<void> {
    const project = this.projectState.project();
    if (!project?.username || !project.slug) return;

    this.loading.set(true);
    this.error.set(null);
    this.events.set([]);
    this.nextBefore.set(null);

    try {
      const res = await firstValueFrom(
        this.activityFeed.getProjectActivity(project.username, project.slug, {
          limit: 50,
        })
      );
      this.events.set(res.events);
      this.nextBefore.set(res.nextBefore);
    } catch (err) {
      this.logger.error('ActivityTab', 'Failed to load activity feed', err);
      this.error.set('Could not load activity. Check your connection.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async loadMore(): Promise<void> {
    const before = this.nextBefore();
    const project = this.projectState.project();
    if (before === null || !project?.username || !project.slug) return;

    this.loadingMore.set(true);
    try {
      const res = await firstValueFrom(
        this.activityFeed.getProjectActivity(project.username, project.slug, {
          limit: 50,
          before,
        })
      );
      this.events.update(curr => [...curr, ...res.events]);
      this.nextBefore.set(res.nextBefore);
    } catch (err) {
      this.logger.error('ActivityTab', 'Failed to load more activity', err);
    } finally {
      this.loadingMore.set(false);
    }
  }

  protected formatTime(unixMs: number): string {
    return formatRelativeDate(unixMs);
  }

  protected iconFor(type: ActivityEventType): string {
    return ACTIVITY_ICONS[type] ?? 'circle';
  }

  protected describe(event: ProjectActivityEvent): string {
    const who = event.username ?? 'Someone';
    const name = event.entityName ?? '';
    switch (event.eventType) {
      case 'document_edit':
        return `${who} edited ${name || 'a document'}`;
      case 'snapshot_created':
        return `${who} saved a snapshot${name ? ` of ${name}` : ''}`;
      case 'comment_thread_created':
        return `${who} started a comment thread${name ? ` on ${name}` : ''}`;
      case 'comment_reply_added':
        return `${who} replied to a comment${name ? ` on ${name}` : ''}`;
      case 'file_published':
        return `${who} published ${name || 'a file'}`;
      case 'collaborator_invited':
        return `${who} invited ${name || 'a collaborator'}`;
      case 'collaborator_joined':
        return `${who} joined the project`;
      case 'collaborator_role_changed':
        return `${who} changed the role of ${name || 'a collaborator'}`;
      case 'collaborator_removed':
        return `${who} removed ${name || 'a collaborator'}`;
      case 'element_created':
        return `${who} created ${name || 'an item'}`;
      case 'element_renamed':
        return `${who} renamed ${name || 'an item'}`;
      case 'element_deleted':
        return `${who} deleted ${name || 'an item'}`;
      default:
        return `${who} did something`;
    }
  }
}

const ACTIVITY_ICONS: Record<ActivityEventType, string> = {
  document_edit: 'edit',
  snapshot_created: 'photo_camera',
  comment_thread_created: 'comment',
  comment_reply_added: 'reply',
  file_published: 'publish',
  collaborator_invited: 'person_add',
  collaborator_joined: 'how_to_reg',
  collaborator_role_changed: 'admin_panel_settings',
  collaborator_removed: 'person_remove',
  element_created: 'add_circle',
  element_renamed: 'drive_file_rename_outline',
  element_deleted: 'delete',
};
