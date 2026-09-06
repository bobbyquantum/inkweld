import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import type { ProfileActivityDay } from '@inkweld/model/profile-activity-day';
import type { ProfileActivityYear } from '@inkweld/model/profile-activity-year';
import { TranslocoModule } from '@jsverse/transloco';

/** One square in the grid. `day` is null for padding cells outside the year. */
export interface GridCell {
  day: string | null;
  words: number;
  sessions: number;
  /** 0 = no writing, 1..4 = quartile bucket of the year's non-zero days. */
  level: 0 | 1 | 2 | 3 | 4;
  /** Column (week) index. */
  col: number;
  /** Row index, 0 = Monday … 6 = Sunday. */
  row: number;
}

export interface MonthLabel {
  col: number;
  label: string;
}

/** Cell edge length and gap in SVG user units. */
export const CELL = 10;
export const GAP = 3;
export const STEP = CELL + GAP;
/** Horizontal room reserved for weekday labels. */
export const LEFT_GUTTER = 28;
/** Vertical room reserved for month labels. */
export const TOP_GUTTER = 16;

/** Monday-first weekday index (0..6) for a YYYY-MM-DD string. */
export function weekdayIndex(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  // getUTCDay: 0 = Sunday … 6 = Saturday → rotate so Monday is 0.
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/**
 * Quartile thresholds over the non-zero day totals. Returns the three cut
 * points that split active days into four roughly equal buckets, or null
 * when nothing was written.
 */
export function quartileThresholds(
  days: readonly ProfileActivityDay[]
): [number, number, number] | null {
  const values = days
    .map(d => d.words)
    .filter(w => w > 0)
    .sort((a, b) => a - b);
  if (values.length === 0) return null;
  const at = (q: number) =>
    values[Math.min(values.length - 1, Math.floor(q * values.length))];
  return [at(0.25), at(0.5), at(0.75)];
}

export function levelFor(
  words: number,
  thresholds: [number, number, number] | null
): GridCell['level'] {
  if (words <= 0 || !thresholds) return 0;
  if (words <= thresholds[0]) return 1;
  if (words <= thresholds[1]) return 2;
  if (words <= thresholds[2]) return 3;
  return 4;
}

/**
 * Lay a year of days out GitHub-style: one column per week, Monday at the
 * top. Cells before Jan 1 in the first week and after Dec 31 in the last
 * are padding so every column has seven rows.
 */
export function buildGrid(days: readonly ProfileActivityDay[]): {
  cells: GridCell[];
  columns: number;
} {
  if (days.length === 0) return { cells: [], columns: 0 };
  const thresholds = quartileThresholds(days);
  const cells: GridCell[] = [];
  const firstRow = weekdayIndex(days[0].day);

  for (let r = 0; r < firstRow; r++) {
    cells.push({ day: null, words: 0, sessions: 0, level: 0, col: 0, row: r });
  }
  days.forEach((d, i) => {
    const idx = firstRow + i;
    cells.push({
      day: d.day,
      words: d.words,
      sessions: d.sessions,
      level: levelFor(d.words, thresholds),
      col: Math.floor(idx / 7),
      row: idx % 7,
    });
  });
  const lastIdx = firstRow + days.length - 1;
  const columns = Math.floor(lastIdx / 7) + 1;
  for (let r = (lastIdx % 7) + 1; r < 7; r++) {
    cells.push({
      day: null,
      words: 0,
      sessions: 0,
      level: 0,
      col: columns - 1,
      row: r,
    });
  }
  return { cells, columns };
}

/**
 * A label above the first column of each month, skipping any that would sit
 * within two columns of the previous label so they never overlap.
 */
export function buildMonthLabels(
  cells: readonly GridCell[],
  locale?: string
): MonthLabel[] {
  const fmt = new Intl.DateTimeFormat(locale, {
    month: 'short',
    timeZone: 'UTC',
  });
  const labels: MonthLabel[] = [];
  let lastMonth = -1;
  let lastCol = -Infinity;
  for (const cell of cells) {
    if (!cell.day) continue;
    const [y, m, d] = cell.day.split('-').map(Number);
    if (m - 1 === lastMonth) continue;
    lastMonth = m - 1;
    if (cell.col - lastCol < 2) continue;
    labels.push({
      col: cell.col,
      label: fmt.format(new Date(Date.UTC(y, m - 1, d))),
    });
    lastCol = cell.col;
  }
  return labels;
}

/**
 * GitHub-style contribution grid of a user's writing: one square per day of
 * a calendar year, shaded by words written, with a year picker, streak
 * summary and a hover tooltip.
 *
 * Pure presentation — the parent fetches `ProfileActivityYear` and reacts to
 * `yearChange` to load a different year.
 */
@Component({
  selector: 'app-activity-grid',
  imports: [
    DecimalPipe,
    MatIconModule,
    MatProgressSpinnerModule,
    TranslocoModule,
  ],
  templateUrl: './activity-grid.component.html',
  styleUrl: './activity-grid.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityGridComponent {
  readonly data = input<ProfileActivityYear | null>(null);
  readonly loading = input(false);
  readonly yearChange = output<number>();

  protected readonly CELL = CELL;
  protected readonly STEP = STEP;
  protected readonly LEFT_GUTTER = LEFT_GUTTER;
  protected readonly TOP_GUTTER = TOP_GUTTER;

  protected readonly grid = computed(() => buildGrid(this.data()?.days ?? []));
  protected readonly cells = computed(() => this.grid().cells);
  protected readonly monthLabels = computed(() =>
    buildMonthLabels(this.cells())
  );
  protected readonly svgWidth = computed(
    () => LEFT_GUTTER + this.grid().columns * STEP
  );
  protected readonly svgHeight = computed(() => TOP_GUTTER + 7 * STEP);

  /** Mon/Wed/Fri labels, localised. */
  protected readonly weekdayLabels = computed(() => {
    const fmt = new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      timeZone: 'UTC',
    });
    // 2024-01-01 was a Monday.
    return [0, 2, 4].map(row => ({
      row,
      label: fmt.format(new Date(Date.UTC(2024, 0, 1 + row))),
    }));
  });

  protected readonly years = computed(() => this.data()?.availableYears ?? []);

  protected readonly hovered = signal<{
    cell: GridCell;
    x: number;
    y: number;
  } | null>(null);

  protected readonly legendLevels: GridCell['level'][] = [0, 1, 2, 3, 4];

  protected onCellEnter(cell: GridCell, event: MouseEvent): void {
    if (!cell.day) return;
    const target = event.target as Element;
    const host = target.closest('.grid-scroller');
    const rect = target.getBoundingClientRect();
    const hostRect = host?.getBoundingClientRect();
    this.hovered.set({
      cell,
      x:
        rect.left +
        rect.width / 2 -
        (hostRect?.left ?? 0) +
        (host?.scrollLeft ?? 0),
      y: rect.top - (hostRect?.top ?? 0),
    });
  }

  protected onGridLeave(): void {
    this.hovered.set(null);
  }

  protected selectYear(year: number): void {
    if (year !== this.data()?.year) this.yearChange.emit(year);
  }

  protected cellX(cell: GridCell): number {
    return LEFT_GUTTER + cell.col * STEP;
  }

  protected cellY(cell: GridCell): number {
    return TOP_GUTTER + cell.row * STEP;
  }

  /** Long, localised date for tooltips and aria-labels. */
  protected formatDay(day: string): string {
    const [y, m, d] = day.split('-').map(Number);
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'long',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(y, m - 1, d)));
  }
}
