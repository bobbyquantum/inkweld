import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { ProjectStatsResponse } from '@models/writing-stats';
import { LoggerService } from '@services/core/logger.service';
import { StorageContextService } from '@services/core/storage-context.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { WritingStatsService } from '@services/stats/writing-stats.service';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import {
  buildSparkline,
  ProjectStatsSummaryComponent,
} from './project-stats-summary.component';

const makeStats = (
  overrides: Partial<ProjectStatsResponse> = {}
): ProjectStatsResponse => ({
  projectId: 'p-1',
  windowDays: 30,
  totalWords: 1500,
  daily: [
    { day: '2025-01-01', words: 500 },
    { day: '2025-01-03', words: 1000 },
  ],
  contributors: [
    { userId: 'u-1', username: 'alice', words: 1000 },
    { userId: 'u-2', username: 'bob', words: 500 },
  ],
  ...overrides,
});

describe('ProjectStatsSummaryComponent', () => {
  let fixture: ComponentFixture<ProjectStatsSummaryComponent>;
  let component: ProjectStatsSummaryComponent;
  let statsService: ReturnType<typeof mockDeep<WritingStatsService>>;
  let logger: ReturnType<typeof mockDeep<LoggerService>>;
  let projectState: { project: ReturnType<typeof signal> };
  let localMode: ReturnType<typeof signal<boolean>>;

  const project = { id: 'p-1', username: 'alice', slug: 'my-book' };

  const setup = async (
    stats: ProjectStatsResponse | Error | undefined = makeStats(),
    proj: { username?: string; slug?: string } | null = project,
    isLocal = false
  ) => {
    statsService = mockDeep<WritingStatsService>();
    logger = mockDeep<LoggerService>();
    projectState = { project: signal(proj) };
    localMode = signal(isLocal);

    if (stats instanceof Error) {
      statsService.getProjectStats.mockReturnValue(throwError(() => stats));
    } else if (stats !== undefined) {
      statsService.getProjectStats.mockReturnValue(of(stats));
    }

    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), ProjectStatsSummaryComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: WritingStatsService, useValue: statsService },
        { provide: ProjectStateService, useValue: projectState },
        { provide: LoggerService, useValue: logger },
        {
          provide: StorageContextService,
          useValue: { isLocalMode: localMode },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProjectStatsSummaryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const el = (testId: string): HTMLElement | null =>
    fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);

  afterEach(() => {
    fixture?.destroy();
    vi.restoreAllMocks();
  });

  it('loads stats for the current project and renders the summary', async () => {
    await setup();

    expect(statsService.getProjectStats).toHaveBeenCalledWith(
      'alice',
      'my-book',
      30
    );
    expect(el('project-stats-summary')).toBeTruthy();
    expect(el('project-stat-words')?.textContent).toContain('1,500');
    expect(el('project-stat-active-days')?.textContent).toContain('2');
    expect(el('project-stat-average')?.textContent).toContain('750');
    expect(el('project-stat-best-day')?.textContent).toContain('1,000');
  });

  it('does nothing when no project is loaded', async () => {
    await setup(undefined, null);
    expect(statsService.getProjectStats).not.toHaveBeenCalled();
    expect(el('project-stats-summary')).toBeFalsy();
  });

  it('skips loading entirely in local mode', async () => {
    await setup(makeStats(), project, true);
    expect(statsService.getProjectStats).not.toHaveBeenCalled();
    expect(el('project-stats-summary')).toBeFalsy();
  });

  it('hides itself and logs a warning when the request fails', async () => {
    const err = new Error('boom');
    await setup(err);

    expect(logger.warn).toHaveBeenCalledWith(
      'ProjectStatsSummary',
      'Failed to load project writing stats',
      err
    );
    expect((component as any).errored()).toBe(true);
    expect(el('project-stats-summary')).toBeFalsy();
    expect(el('project-stats-loading')).toBeFalsy();
  });

  it('shows an empty hint when no words were recorded in the window', async () => {
    await setup(makeStats({ totalWords: 0, daily: [], contributors: [] }));

    expect(el('project-stats-empty')).toBeTruthy();
    expect(el('project-stat-words')).toBeFalsy();
    expect(el('project-stats-sparkline')).toBeFalsy();
  });

  it('renders one sparkline bar per day in the window', async () => {
    await setup();
    const bars = fixture.nativeElement.querySelectorAll('.sparkline-bar');
    expect(bars).toHaveLength(30);
  });

  it('lists contributors by output with proportional shares', async () => {
    await setup();

    const rows = fixture.nativeElement.querySelectorAll(
      '[data-testid="project-stats-contributor"]'
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('alice');
    expect(rows[1].textContent).toContain('bob');

    const shares = (component as any).contributors();
    expect(shares[0].sharePct).toBe(67);
    expect(shares[1].sharePct).toBe(33);
  });

  it('hides the contributor breakdown for a single contributor', async () => {
    await setup(
      makeStats({
        contributors: [{ userId: 'u-1', username: 'alice', words: 1500 }],
      })
    );
    expect(el('project-stats-contributors')).toBeFalsy();
  });

  it('caps the contributor list and reports how many were omitted', async () => {
    const contributors = Array.from({ length: 7 }, (_, i) => ({
      userId: `u-${i}`,
      username: `user${i}`,
      words: 100 - i,
    }));
    await setup(makeStats({ totalWords: 700, contributors }));

    expect((component as any).contributors()).toHaveLength(5);
    expect((component as any).hiddenContributorCount()).toBe(2);
    expect(el('project-stats-contributors')?.textContent).toContain('+2 more');
  });

  it('falls back to a truncated user id when a contributor has no username', async () => {
    await setup();
    expect(
      (component as any).contributorLabel({
        userId: 'abcdefghijkl',
        username: null,
        words: 1,
      })
    ).toBe('abcdefgh');
  });

  it('reloads when the active project changes and discards stale responses', async () => {
    await setup();
    statsService.getProjectStats.mockClear();

    projectState.project.set({ id: 'p-2', username: 'bob', slug: 'other' });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(statsService.getProjectStats).toHaveBeenCalledWith(
      'bob',
      'other',
      30
    );
  });

  it('does not load when the project has no slug', async () => {
    await setup(makeStats(), { username: 'alice' });
    expect(statsService.getProjectStats).not.toHaveBeenCalled();
  });
});

describe('buildSparkline', () => {
  const today = new Date('2025-01-10T15:00:00Z');

  it('produces one zero-filled bar per day, oldest first, ending today', () => {
    const bars = buildSparkline(
      [
        { day: '2025-01-08', words: 50 },
        { day: '2025-01-10', words: 100 },
      ],
      5,
      today
    );

    expect(bars.map(b => b.day)).toEqual([
      '2025-01-06',
      '2025-01-07',
      '2025-01-08',
      '2025-01-09',
      '2025-01-10',
    ]);
    expect(bars.map(b => b.words)).toEqual([0, 0, 50, 0, 100]);
    expect(bars.map(b => b.heightPct)).toEqual([0, 0, 50, 0, 100]);
  });

  it('yields all-zero heights when there is no output', () => {
    const bars = buildSparkline([], 3, today);
    expect(bars).toHaveLength(3);
    expect(bars.every(b => b.words === 0 && b.heightPct === 0)).toBe(true);
  });

  it('ignores days outside the window', () => {
    const bars = buildSparkline([{ day: '2024-12-01', words: 999 }], 3, today);
    expect(bars.every(b => b.words === 0)).toBe(true);
  });
});
