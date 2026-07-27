import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
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
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    DatePipe,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    TranslocoModule,
  ],
})
export class ActivityTabComponent {
  private readonly projectState = inject(ProjectStateService);
  private readonly activityFeed = inject(ActivityFeedService);
  private readonly logger = inject(LoggerService);
  private readonly transloco = inject(TranslocoService);

  /** Monotonically-increasing token; guards against stale async responses. */
  private requestToken = 0;

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

  constructor() {
    // Load (or reload) the feed whenever the active project changes.
    // Using an effect ensures we also handle the case where project() is
    // still undefined when the component first mounts (e.g. during route
    // transitions) and becomes defined shortly after.
    effect(() => {
      const project = this.projectState.project();
      if (project?.username && project.slug) {
        void this.loadInitial();
      }
    });
  }

  protected async loadInitial(): Promise<void> {
    const token = ++this.requestToken;
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
      if (token !== this.requestToken) return; // stale response — discard
      this.events.set(res.events);
      this.nextBefore.set(res.nextBefore);
    } catch (err) {
      if (token !== this.requestToken) return;
      this.logger.error('ActivityTab', 'Failed to load activity feed', err);
      this.error.set('Could not load activity. Check your connection.');
    } finally {
      if (token === this.requestToken) this.loading.set(false);
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
    const who =
      event.username ??
      event.actorLabel ??
      this.transloco.translate('common.someone');
    const name = event.entityName ?? '';
    const params = { who, name };
    const key = (named: string, generic: string) => (name ? named : generic);
    switch (event.eventType) {
      case 'document_edit':
        return this.transloco.translate(
          key(
            'project.activity.events.document_edit',
            'project.activity.events.document_edit_generic'
          ),
          params
        );
      case 'snapshot_created':
        return this.transloco.translate(
          key(
            'project.activity.events.snapshot_created',
            'project.activity.events.snapshot_created_generic'
          ),
          params
        );
      case 'comment_thread_created':
        return this.transloco.translate(
          key(
            'project.activity.events.comment_thread_created',
            'project.activity.events.comment_thread_created_generic'
          ),
          params
        );
      case 'comment_reply_added':
        return this.transloco.translate(
          key(
            'project.activity.events.comment_reply_added',
            'project.activity.events.comment_reply_added_generic'
          ),
          params
        );
      case 'file_published':
        return this.transloco.translate(
          key(
            'project.activity.events.file_published',
            'project.activity.events.file_published_generic'
          ),
          params
        );
      case 'collaborator_invited':
        return this.transloco.translate(
          key(
            'project.activity.events.collaborator_invited',
            'project.activity.events.collaborator_invited_generic'
          ),
          params
        );
      case 'collaborator_joined':
        return this.transloco.translate(
          'project.activity.events.collaborator_joined',
          params
        );
      case 'collaborator_role_changed':
        return this.transloco.translate(
          key(
            'project.activity.events.collaborator_role_changed',
            'project.activity.events.collaborator_role_changed_generic'
          ),
          params
        );
      case 'collaborator_removed':
        return this.transloco.translate(
          key(
            'project.activity.events.collaborator_removed',
            'project.activity.events.collaborator_removed_generic'
          ),
          params
        );
      case 'element_created':
        return this.transloco.translate(
          key(
            'project.activity.events.element_created',
            'project.activity.events.element_created_generic'
          ),
          params
        );
      case 'element_renamed':
        return this.transloco.translate(
          key(
            'project.activity.events.element_renamed',
            'project.activity.events.element_renamed_generic'
          ),
          params
        );
      case 'element_deleted':
        return this.transloco.translate(
          key(
            'project.activity.events.element_deleted',
            'project.activity.events.element_deleted_generic'
          ),
          params
        );
      case 'elements_reorganized':
        return this.transloco.translate(
          'project.activity.events.elements_reorganized',
          params
        );
      case 'element_tagged':
        return this.transloco.translate(
          key(
            'project.activity.events.element_tagged',
            'project.activity.events.element_tagged_generic'
          ),
          params
        );
      case 'worldbuilding_updated':
        return this.transloco.translate(
          key(
            'project.activity.events.worldbuilding_updated',
            'project.activity.events.worldbuilding_updated_generic'
          ),
          params
        );
      case 'relationship_created':
        return this.transloco.translate(
          key(
            'project.activity.events.relationship_created',
            'project.activity.events.relationship_created_generic'
          ),
          params
        );
      case 'relationship_deleted':
        return this.transloco.translate(
          key(
            'project.activity.events.relationship_deleted',
            'project.activity.events.relationship_deleted_generic'
          ),
          params
        );
      default:
        return this.transloco.translate(
          'project.activity.events.unknown',
          params
        );
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
  elements_reorganized: 'low_priority',
  relationship_created: 'account_tree',
  relationship_deleted: 'link_off',
  element_tagged: 'label',
  worldbuilding_updated: 'public',
};
