import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { ProfileActivityDay } from '@inkweld/model/profile-activity-day';
import type { ProfileActivityYear } from '@inkweld/model/profile-activity-year';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import {
  ActivityGridComponent,
  buildGrid,
  buildMonthLabels,
  levelFor,
  quartileThresholds,
  weekdayIndex,
} from './activity-grid.component';

/** Every day of `year`, with words from `fill(day)`. */
function yearDays(
  year: number,
  fill: (day: string, index: number) => number = () => 0
): ProfileActivityDay[] {
  const out: ProfileActivityDay[] = [];
  const d = new Date(Date.UTC(year, 0, 1));
  let i = 0;
  while (d.getUTCFullYear() === year) {
    const day = d.toISOString().slice(0, 10);
    const words = fill(day, i++);
    out.push({ day, words, sessions: words > 0 ? 1 : 0 });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

const makeYear = (
  overrides: Partial<ProfileActivityYear> = {}
): ProfileActivityYear => ({
  year: 2026,
  timeZone: 'UTC',
  days: yearDays(2026, (_, i) => (i % 5 === 0 ? (i % 400) + 1 : 0)),
  totalWords: 1234,
  activeDays: 73,
  longestStreak: 3,
  currentStreak: 1,
  availableYears: [2026, 2025, 2024],
  ...overrides,
});

describe('activity grid helpers', () => {
  it('weekdayIndex is Monday-first', () => {
    expect(weekdayIndex('2024-01-01')).toBe(0); // Monday
    expect(weekdayIndex('2024-01-07')).toBe(6); // Sunday
    expect(weekdayIndex('2026-01-01')).toBe(3); // Thursday
  });

  it('quartileThresholds ignores zero days and returns null when empty', () => {
    expect(quartileThresholds([])).toBeNull();
    expect(
      quartileThresholds([{ day: 'x', words: 0, sessions: 0 }])
    ).toBeNull();
    const days = [10, 20, 30, 40, 50, 60, 70, 80].map(w => ({
      day: 'x',
      words: w,
      sessions: 1,
    }));
    expect(quartileThresholds(days)).toEqual([30, 50, 70]);
  });

  it('levelFor maps words onto 0..4', () => {
    const t: [number, number, number] = [30, 50, 70];
    expect(levelFor(0, t)).toBe(0);
    expect(levelFor(10, null)).toBe(0);
    expect(levelFor(30, t)).toBe(1);
    expect(levelFor(31, t)).toBe(2);
    expect(levelFor(60, t)).toBe(3);
    expect(levelFor(999, t)).toBe(4);
  });

  it('buildGrid pads the first and last week and lays out 7 rows per column', () => {
    const days = yearDays(2026);
    const { cells, columns } = buildGrid(days);
    // 2026-01-01 is a Thursday → 3 padding cells (Mon–Wed) first.
    expect(cells.slice(0, 3).every(c => c.day === null)).toBe(true);
    expect(cells[3]).toMatchObject({ day: '2026-01-01', col: 0, row: 3 });
    expect(cells.length % 7).toBe(0);
    expect(columns).toBe(cells.length / 7);
    expect(columns).toBe(53);
    const last = cells.filter(c => c.day).at(-1);
    expect(last).toMatchObject({ day: '2026-12-31', col: 52 });
    expect(buildGrid([])).toEqual({ cells: [], columns: 0 });
  });

  it('buildMonthLabels emits one label per month with no near-collisions', () => {
    const { cells } = buildGrid(yearDays(2026));
    const labels = buildMonthLabels(cells, 'en-US');
    expect(labels.map(l => l.label)).toEqual([
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ]);
    for (let i = 1; i < labels.length; i++) {
      expect(labels[i].col - labels[i - 1].col).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('ActivityGridComponent', () => {
  let fixture: ComponentFixture<ActivityGridComponent>;

  const setup = async (data: ProfileActivityYear | null, loading = false) => {
    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), ActivityGridComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(ActivityGridComponent);
    fixture.componentRef.setInput('data', data);
    fixture.componentRef.setInput('loading', loading);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(() => TestBed.resetTestingModule());

  it('renders one rect per day with level attributes', async () => {
    await setup(makeYear());
    const el: HTMLElement = fixture.nativeElement;
    const rects = el.querySelectorAll('rect.cell');
    expect(rects).toHaveLength(365);
    const levels = new Set(
      Array.from(rects).map(r => r.getAttribute('data-level'))
    );
    expect(levels.has('0')).toBe(true);
    expect(levels.has('4')).toBe(true);
    expect(
      el.querySelector('[data-testid="activity-summary"]')?.textContent
    ).toContain('2026');
  });

  it('shows the year picker and emits yearChange for a different year', async () => {
    await setup(makeYear());
    const emitted: number[] = [];
    fixture.componentInstance.yearChange.subscribe(y => emitted.push(y));
    const el: HTMLElement = fixture.nativeElement;
    const current = el.querySelector<HTMLButtonElement>(
      '[data-testid="activity-year-2026"]'
    );
    expect(current?.classList.contains('active')).toBe(true);
    current?.click();
    el.querySelector<HTMLButtonElement>(
      '[data-testid="activity-year-2024"]'
    )?.click();
    expect(emitted).toEqual([2024]);
  });

  it('hides the year picker when only one year exists', async () => {
    await setup(makeYear({ availableYears: [2026] }));
    expect(fixture.nativeElement.querySelector('.year-picker')).toBeNull();
  });

  it('shows a spinner while loading and an empty message with no data', async () => {
    await setup(null, true);
    expect(
      fixture.nativeElement.querySelector('[data-testid="activity-loading"]')
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-testid="activity-empty"]')
    ).toBeNull();

    fixture.componentRef.setInput('loading', false);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid="activity-empty"]')
    ).not.toBeNull();
  });

  it('shows a tooltip for the hovered cell and clears it on leave', async () => {
    await setup(makeYear());
    const el: HTMLElement = fixture.nativeElement;
    const rect = el.querySelector<SVGRectElement>(
      'rect.cell[data-day="2026-01-01"]'
    );
    expect(rect).not.toBeNull();
    vi.spyOn(rect!, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 50,
      width: 10,
      height: 10,
    } as DOMRect);
    rect!.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    fixture.detectChanges();
    const tooltip = el.querySelector('[data-testid="activity-tooltip"]');
    expect(tooltip).not.toBeNull();
    expect(tooltip?.textContent).toContain('2026');

    el.querySelector('.grid-scroller')!.dispatchEvent(
      new MouseEvent('mouseleave')
    );
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="activity-tooltip"]')).toBeNull();
  });
});
