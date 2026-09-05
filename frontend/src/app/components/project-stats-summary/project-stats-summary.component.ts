import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule } from '@jsverse/transloco';
import type {
  ContributorWords,
  DailyWordPoint,
  ProjectStatsResponse,
} from '@models/writing-stats';
import { LoggerService } from '@services/core/logger.service';
import { StorageContextService } from '@services/core/storage-context.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { WritingStatsService } from '@services/stats/writing-stats.service';
import { firstValueFrom } from 'rxjs';

/** One bar in the daily sparkline; `words` is 0 for days with no output. */
export interface SparklineBar {
  day: string;
  words: number;
  /** Bar height as a percentage of the tallest day (0–100). */
  heightPct: number;
}

/** A contributor row with its share of the window's total output. */
export interface ContributorShare extends ContributorWords {
  /** Percentage of the window total this contributor produced (0–100). */
  sharePct: number;
}

/** Number of contributors listed before collapsing the rest. */
const MAX_CONTRIBUTORS = 5;

/**
 * Per-project writing statistics summary for the Activity tab.
 *
 * Shows net words written across the look-back window, active days, the best
 * day, a zero-filled daily sparkline, and a contributor breakdown. Data comes
 * from `GET /api/v1/stats/projects/:username/:slug` via `WritingStatsService`.
 *
 * Online-only: hidden entirely in local mode and on request failure so the
 * activity feed below remains usable when the backend is unreachable.
 */
@Component({
  selector: 'app-project-stats-summary',
  imports: [
    DecimalPipe,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    TranslocoModule,
  ],
  templateUrl: './project-stats-summary.component.html',
  styleUrl: './project-stats-summary.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class ProjectStatsSummaryComponent {
  private readonly projectState = inject(ProjectStateService);
  private readonly statsService = inject(WritingStatsService);
  private readonly storageContext = inject(StorageContextService);
  private readonly logger = inject(LoggerService);

  /** Look-back window in days. */
  readonly windowDays = 30;

  /** Monotonically-increasing token; guards against stale async responses. */
  private requestToken = 0;

  protected readonly stats = signal<ProjectStatsResponse | null>(null);
  protected readonly loading = signal(false);
  protected readonly errored = signal(false);

  /** True when the window holds no recorded words at all. */
  protected readonly isEmpty = computed(
    () => (this.stats()?.totalWords ?? 0) === 0
  );

  /** Number of days within the window that had any positive output. */
  protected readonly activeDays = computed(
    () => (this.stats()?.daily ?? []).filter(d => d.words > 0).length
  );

  /** Best (highest-words) day inside the loaded window. */
  protected readonly bestDay = computed<DailyWordPoint | null>(() => {
    const daily = this.stats()?.daily ?? [];
    if (daily.length === 0) return null;
    return daily.reduce((best, p) => (p.words > best.words ? p : best));
  });

  /** Mean words per active day, rounded; 0 when there were no active days. */
  protected readonly averagePerActiveDay = computed(() => {
    const active = this.activeDays();
    if (active === 0) return 0;
    return Math.round((this.stats()?.totalWords ?? 0) / active);
  });

  /**
   * Zero-filled daily series covering the whole window, oldest first. The
   * server only returns days with output, so gaps are filled here to keep
   * the sparkline's horizontal axis uniform.
   */
  protected readonly sparkline = computed<SparklineBar[]>(() =>
    buildSparkline(this.stats()?.daily ?? [], this.windowDays, new Date())
  );

  /** Contributors sorted by output, capped at {@link MAX_CONTRIBUTORS}. */
  protected readonly contributors = computed<ContributorShare[]>(() => {
    const stats = this.stats();
    if (!stats || stats.totalWords <= 0) return [];
    return [...stats.contributors]
      .filter(c => c.words > 0)
      .sort((a, b) => b.words - a.words)
      .slice(0, MAX_CONTRIBUTORS)
      .map(c => ({
        ...c,
        sharePct: Math.min(100, Math.round((c.words / stats.totalWords) * 100)),
      }));
  });

  /** How many contributors were omitted by the cap. */
  protected readonly hiddenContributorCount = computed(() => {
    const total = (this.stats()?.contributors ?? []).filter(
      c => c.words > 0
    ).length;
    return Math.max(0, total - MAX_CONTRIBUTORS);
  });

  constructor() {
    // Reload whenever the active project or storage mode changes. Every
    // transition goes through reload() so that an in-flight request for a
    // previous project (or from before local mode was selected) is
    // invalidated rather than landing on the new state.
    effect(() => {
      this.projectState.project();
      this.storageContext.isLocalMode();
      void this.reload();
    });
  }

  /**
   * (Re)fetch stats for the current project. Safe to call repeatedly.
   *
   * Invalidates any in-flight request first; when there is no fetchable
   * project (local mode, or no active project) the displayed state is
   * cleared instead.
   */
  async reload(): Promise<void> {
    const token = ++this.requestToken;
    const project = this.projectState.project();
    if (
      this.storageContext.isLocalMode() ||
      !project?.username ||
      !project.slug
    ) {
      this.stats.set(null);
      this.errored.set(false);
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.errored.set(false);
    try {
      const res = await firstValueFrom(
        this.statsService.getProjectStats(
          project.username,
          project.slug,
          this.windowDays
        )
      );
      if (token !== this.requestToken) return; // stale response — discard
      this.stats.set(res);
    } catch (err) {
      if (token !== this.requestToken) return;
      this.logger.warn(
        'ProjectStatsSummary',
        'Failed to load project writing stats',
        err
      );
      this.errored.set(true);
    } finally {
      if (token === this.requestToken) this.loading.set(false);
    }
  }

  /** Display label for a contributor: username, else a truncated user id. */
  protected contributorLabel(c: ContributorWords): string {
    return c.username ?? c.userId.slice(0, 8);
  }
}

/**
 * Build a zero-filled, oldest-first series of `windowDays` bars ending on
 * `today` (UTC, matching the server's ISO-date bucketing).
 */
export function buildSparkline(
  daily: readonly DailyWordPoint[],
  windowDays: number,
  today: Date
): SparklineBar[] {
  const byDay = new Map(daily.map(d => [d.day, d.words]));
  const max = Math.max(0, ...daily.map(d => d.words));
  const end = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate()
  );
  const bars: SparklineBar[] = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    const day = new Date(end - i * 86_400_000).toISOString().slice(0, 10);
    const words = byDay.get(day) ?? 0;
    bars.push({
      day,
      words,
      heightPct: max > 0 ? Math.round((words / max) * 100) : 0,
    });
  }
  return bars;
}
