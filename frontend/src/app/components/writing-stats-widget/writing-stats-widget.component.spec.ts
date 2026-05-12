import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type {
  UserActivityEvent,
  UserActivityResponse,
} from '@models/activity-event';
import type { UserStatsResponse } from '@models/writing-stats';
import { LoggerService } from '@services/core/logger.service';
import { ActivityFeedService } from '@services/stats/activity-feed.service';
import { WritingStatsService } from '@services/stats/writing-stats.service';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';

import { WritingStatsWidgetComponent } from './writing-stats-widget.component';

const makeUserEvent = (
  id: string,
  overrides: Partial<UserActivityEvent> = {}
): UserActivityEvent => ({
  id,
  projectId: 'p-1',
  userId: 'u-1',
  username: 'alice',
  eventType: 'document_edit',
  entityId: 'e-1',
  entityName: 'Chapter 1',
  metadata: null,
  createdAt: 1_700_000_000_000,
  projectSlug: 'my-book',
  projectTitle: 'My Book',
  projectOwnerUsername: 'alice',
  ...overrides,
});

describe('WritingStatsWidgetComponent', () => {
  let fixture: ComponentFixture<WritingStatsWidgetComponent>;
  let component: WritingStatsWidgetComponent;
  let statsService: ReturnType<typeof mockDeep<WritingStatsService>>;
  let activityService: ReturnType<typeof mockDeep<ActivityFeedService>>;
  let logger: ReturnType<typeof mockDeep<LoggerService>>;

  const setup = async (
    stats: UserStatsResponse | Error,
    activity: UserActivityResponse | Error
  ) => {
    statsService = mockDeep<WritingStatsService>();
    activityService = mockDeep<ActivityFeedService>();
    logger = mockDeep<LoggerService>();

    statsService.getMyStats.mockReturnValue(
      stats instanceof Error ? throwError(() => stats) : of(stats)
    );
    activityService.getMyActivity.mockReturnValue(
      activity instanceof Error ? throwError(() => activity) : of(activity)
    );

    await TestBed.configureTestingModule({
      imports: [WritingStatsWidgetComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: WritingStatsService, useValue: statsService },
        { provide: ActivityFeedService, useValue: activityService },
        { provide: LoggerService, useValue: logger },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WritingStatsWidgetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    // Flush several microtasks for Promise.all + firstValueFrom + finally.
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
    }
    await fixture.whenStable();
    fixture.detectChanges();
  };

  afterEach(() => {
    fixture?.destroy();
    vi.restoreAllMocks();
  });

  it('loads stats and activity on init and renders the card', async () => {
    const stats: UserStatsResponse = {
      windowDays: 30,
      projectCount: 3,
      totalWords: 1234,
      daily: [
        { day: '2025-01-01', words: 100 },
        { day: '2025-01-02', words: 200 },
        { day: '2025-01-03', words: 0 },
      ],
    };
    await setup(stats, {
      events: [makeUserEvent('a'), makeUserEvent('b')],
      nextBefore: null,
    });

    expect(component).toBeTruthy();
    expect(statsService.getMyStats).toHaveBeenCalledWith(30);
    expect(activityService.getMyActivity).toHaveBeenCalledWith({ limit: 8 });

    expect((component as any).stats()).toEqual(stats);
    expect((component as any).events()).toHaveLength(2);
    expect((component as any).errored()).toBe(false);
    expect((component as any).loading()).toBe(false);

    expect(fixture.nativeElement.querySelector('.stats-widget')).toBeTruthy();
    expect(fixture.nativeElement.querySelectorAll('.recent-item').length).toBe(
      2
    );
  });

  it('computes activeDays as the count of days with positive words', async () => {
    await setup(
      {
        windowDays: 30,
        projectCount: 1,
        totalWords: 300,
        daily: [
          { day: '2025-01-01', words: 100 },
          { day: '2025-01-02', words: 0 },
          { day: '2025-01-03', words: 200 },
        ],
      },
      { events: [], nextBefore: null }
    );

    expect((component as any).activeDays()).toBe(2);
  });

  it('computes bestDay as the highest-words day in the window', async () => {
    await setup(
      {
        windowDays: 30,
        projectCount: 1,
        totalWords: 300,
        daily: [
          { day: '2025-01-01', words: 50 },
          { day: '2025-01-02', words: 250 },
          { day: '2025-01-03', words: 0 },
        ],
      },
      { events: [], nextBefore: null }
    );

    expect((component as any).bestDay()).toEqual({
      day: '2025-01-02',
      words: 250,
    });
  });

  it('returns null bestDay when daily series is empty', async () => {
    await setup(
      { windowDays: 30, projectCount: 0, totalWords: 0, daily: [] },
      { events: [], nextBefore: null }
    );
    expect((component as any).bestDay()).toBeNull();
  });

  it('hides the card on error and logs a warning', async () => {
    const err = new Error('network down');
    await setup(err, err);

    expect((component as any).errored()).toBe(true);
    expect((component as any).loading()).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      'WritingStatsWidget',
      'Failed to load stats/activity widget',
      err
    );
    // No card rendered on error.
    expect(fixture.nativeElement.querySelector('.stats-widget')).toBeFalsy();
  });

  it('hides the recent-activity section when there are no events', async () => {
    await setup(
      { windowDays: 30, projectCount: 1, totalWords: 10, daily: [] },
      { events: [], nextBefore: null }
    );
    expect(fixture.nativeElement.querySelector('.recent-section')).toBeFalsy();
  });

  it('eventSummary() handles every event type and missing username', async () => {
    await setup(
      { windowDays: 30, projectCount: 0, totalWords: 0, daily: [] },
      { events: [], nextBefore: null }
    );

    const types = [
      'document_edit',
      'snapshot_created',
      'comment_thread_created',
      'comment_reply_added',
      'file_published',
      'collaborator_invited',
      'collaborator_joined',
      'collaborator_role_changed',
      'collaborator_removed',
      'element_created',
      'element_renamed',
      'element_deleted',
    ] as const;

    for (const t of types) {
      const text = (component as any).eventSummary(
        makeUserEvent('x', { eventType: t })
      );
      expect(text).toContain('alice');
    }

    const fallback = (component as any).eventSummary(
      makeUserEvent('x', { username: null })
    );
    expect(fallback).toContain('Someone');
  });

  it('projectLink() returns a router link or null based on event ownership', async () => {
    await setup(
      { windowDays: 30, projectCount: 0, totalWords: 0, daily: [] },
      { events: [], nextBefore: null }
    );

    expect(
      (component as any).projectLink(
        makeUserEvent('a', {
          projectOwnerUsername: 'bob',
          projectSlug: 'novel',
        })
      )
    ).toEqual(['/', 'bob', 'novel']);

    expect(
      (component as any).projectLink(
        makeUserEvent('a', { projectOwnerUsername: null })
      )
    ).toBeNull();

    expect(
      (component as any).projectLink(makeUserEvent('a', { projectSlug: null }))
    ).toBeNull();
  });
});
