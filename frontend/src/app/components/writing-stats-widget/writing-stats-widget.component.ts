import { DatePipe, DecimalPipe } from '@angular/common';
import {
  Component,
  computed,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import type { UserActivityEvent } from '@models/activity-event';
import type { UserStatsResponse } from '@models/writing-stats';
import { LoggerService } from '@services/core/logger.service';
import { StorageContextService } from '@services/core/storage-context.service';
import { ActivityFeedService } from '@services/stats/activity-feed.service';
import { WritingStatsService } from '@services/stats/writing-stats.service';
import { firstValueFrom } from 'rxjs';

import { formatRelativeDate } from '../../utils/date-format';

/**
 * Cross-project stats + recent activity widget for the home page.
 *
 * Shows the signed-in user's writing totals over a configurable window
 * alongside the most-recent activity events from any project they own
 * or collaborate on.
 *
 * Online-only: silently hides on error so the rest of the home page
 * remains usable when the backend is unreachable.
 */
@Component({
  selector: 'app-writing-stats-widget',
  imports: [
    DatePipe,
    DecimalPipe,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    RouterLink,
  ],
  templateUrl: './writing-stats-widget.component.html',
  styleUrl: './writing-stats-widget.component.scss',
})
export class WritingStatsWidgetComponent implements OnInit {
  private readonly statsService = inject(WritingStatsService);
  private readonly activityService = inject(ActivityFeedService);
  private readonly logger = inject(LoggerService);
  private readonly storageContext = inject(StorageContextService);

  /** Look-back window in days; default 30. */
  readonly windowDays = 30;
  /** Max recent events to render. */
  readonly maxEvents = 8;

  protected readonly stats = signal<UserStatsResponse | null>(null);
  protected readonly events = signal<UserActivityEvent[]>([]);
  protected readonly loading = signal(false);
  protected readonly errored = signal(false);

  /** Best (highest-words) day inside the loaded window. */
  protected readonly bestDay = computed(() => {
    const daily = this.stats()?.daily ?? [];
    if (daily.length === 0) return null;
    return daily.reduce((best, p) => (p.words > best.words ? p : best));
  });

  /** Number of days within the window that had any positive output. */
  protected readonly activeDays = computed(
    () => (this.stats()?.daily ?? []).filter(d => d.words > 0).length
  );

  ngOnInit(): void {
    if (this.storageContext.isLocalMode()) {
      return;
    }
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.errored.set(false);
    try {
      const [stats, activity] = await Promise.all([
        firstValueFrom(this.statsService.getMyStats(this.windowDays)),
        firstValueFrom(
          this.activityService.getMyActivity({ limit: this.maxEvents })
        ),
      ]);
      this.stats.set(stats);
      this.events.set(activity.events);
    } catch (err) {
      this.logger.warn(
        'WritingStatsWidget',
        'Failed to load stats/activity widget',
        err
      );
      this.errored.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected formatTime(unixMs: number): string {
    return formatRelativeDate(unixMs);
  }

  protected eventSummary(event: UserActivityEvent): string {
    const who = event.username ?? event.actorLabel ?? 'Someone';
    const name = event.entityName ?? '';
    const onName = name ? ` on ${name}` : '';
    const ofName = name ? ` of ${name}` : '';
    switch (event.eventType) {
      case 'document_edit':
        return `${who} edited ${name || 'a document'}`;
      case 'snapshot_created':
        return `${who} saved a snapshot${ofName}`;
      case 'comment_thread_created':
        return `${who} commented${onName}`;
      case 'comment_reply_added':
        return `${who} replied${onName}`;
      case 'file_published':
        return `${who} published ${name || 'a file'}`;
      case 'collaborator_invited':
        return `${who} invited a collaborator`;
      case 'collaborator_joined':
        return `${who} joined`;
      case 'collaborator_role_changed':
        return `${who} changed a collaborator role`;
      case 'collaborator_removed':
        return `${who} removed a collaborator`;
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

  /** Router link target for an event's owning project, or null if unknown. */
  protected projectLink(event: UserActivityEvent): unknown[] | null {
    if (!event.projectOwnerUsername || !event.projectSlug) return null;
    return ['/', event.projectOwnerUsername, event.projectSlug];
  }
}
