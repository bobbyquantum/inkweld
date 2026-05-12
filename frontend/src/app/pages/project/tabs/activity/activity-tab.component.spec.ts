import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  ProjectActivityEvent,
  ProjectActivityResponse,
} from '@models/activity-event';
import { LoggerService } from '@services/core/logger.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { ActivityFeedService } from '@services/stats/activity-feed.service';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';

import { ActivityTabComponent } from './activity-tab.component';

const makeEvent = (
  id: string,
  overrides: Partial<ProjectActivityEvent> = {}
): ProjectActivityEvent => ({
  id,
  projectId: 'p-1',
  userId: 'u-1',
  username: 'alice',
  eventType: 'document_edit',
  entityId: 'e-1',
  entityName: 'Chapter 1',
  metadata: null,
  createdAt: 1_700_000_000_000,
  ...overrides,
});

describe('ActivityTabComponent', () => {
  let fixture: ComponentFixture<ActivityTabComponent>;
  let component: ActivityTabComponent;
  let activityFeed: ReturnType<typeof mockDeep<ActivityFeedService>>;
  let projectState: { project: ReturnType<typeof signal> };
  let logger: ReturnType<typeof mockDeep<LoggerService>>;

  const project = { id: 'p-1', username: 'alice', slug: 'my-book' };

  const setup = async (
    initial?: ProjectActivityResponse | Error,
    proj: { username?: string; slug?: string } | null = project
  ) => {
    activityFeed = mockDeep<ActivityFeedService>();
    logger = mockDeep<LoggerService>();
    projectState = { project: signal(proj) };

    if (initial instanceof Error) {
      activityFeed.getProjectActivity.mockReturnValue(
        throwError(() => initial)
      );
    } else if (initial !== undefined) {
      activityFeed.getProjectActivity.mockReturnValue(of(initial));
    }

    await TestBed.configureTestingModule({
      imports: [ActivityTabComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ActivityFeedService, useValue: activityFeed },
        { provide: ProjectStateService, useValue: projectState },
        { provide: LoggerService, useValue: logger },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ActivityTabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  afterEach(() => {
    fixture?.destroy();
    vi.restoreAllMocks();
  });

  it('creates and loads the initial page on init', async () => {
    await setup({
      events: [makeEvent('a'), makeEvent('b')],
      nextBefore: 1_699_000_000_000,
    });

    expect(component).toBeTruthy();
    expect(activityFeed.getProjectActivity).toHaveBeenCalledWith(
      'alice',
      'my-book',
      { limit: 50 }
    );
    expect((component as any).events()).toHaveLength(2);
    expect((component as any).hasMore()).toBe(true);
    expect((component as any).loading()).toBe(false);

    const items = fixture.nativeElement.querySelectorAll('.event-item');
    expect(items.length).toBe(2);
  });

  it('does nothing when no project is loaded', async () => {
    await setup(undefined, null);
    expect(activityFeed.getProjectActivity).not.toHaveBeenCalled();
  });

  it('shows the empty state when there are no events', async () => {
    await setup({ events: [], nextBefore: null });

    expect((component as any).isEmpty()).toBe(true);
    expect(fixture.nativeElement.querySelector('.empty-state')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.event-list')).toBeFalsy();
  });

  it('surfaces an error and logs when the request fails', async () => {
    const err = new Error('boom');
    await setup(err);

    expect((component as any).error()).toBe(
      'Could not load activity. Check your connection.'
    );
    expect(logger.error).toHaveBeenCalledWith(
      'ActivityTab',
      'Failed to load activity feed',
      err
    );
    expect(fixture.nativeElement.querySelector('.error-state')).toBeTruthy();
  });

  it('hides the load-more button when there is no next cursor', async () => {
    await setup({ events: [makeEvent('a')], nextBefore: null });
    expect((component as any).hasMore()).toBe(false);
    expect(fixture.nativeElement.querySelector('.load-more')).toBeFalsy();
  });

  it('appends additional events when loadMore() is invoked', async () => {
    await setup({
      events: [makeEvent('a')],
      nextBefore: 1_699_000_000_000,
    });

    activityFeed.getProjectActivity.mockReturnValue(
      of({ events: [makeEvent('b'), makeEvent('c')], nextBefore: null })
    );

    await (component as any).loadMore();
    fixture.detectChanges();

    expect(activityFeed.getProjectActivity).toHaveBeenLastCalledWith(
      'alice',
      'my-book',
      { limit: 50, before: 1_699_000_000_000 }
    );
    expect((component as any).events()).toHaveLength(3);
    expect((component as any).hasMore()).toBe(false);
    expect((component as any).loadingMore()).toBe(false);
  });

  it('loadMore() is a no-op when nextBefore is null', async () => {
    await setup({ events: [makeEvent('a')], nextBefore: null });
    activityFeed.getProjectActivity.mockClear();

    await (component as any).loadMore();

    expect(activityFeed.getProjectActivity).not.toHaveBeenCalled();
  });

  it('logs but does not surface an error when loadMore() fails', async () => {
    await setup({
      events: [makeEvent('a')],
      nextBefore: 1_699_000_000_000,
    });

    const err = new Error('paginate failed');
    activityFeed.getProjectActivity.mockReturnValue(throwError(() => err));

    await (component as any).loadMore();

    expect(logger.error).toHaveBeenCalledWith(
      'ActivityTab',
      'Failed to load more activity',
      err
    );
    expect((component as any).error()).toBeNull();
    expect((component as any).loadingMore()).toBe(false);
  });

  it('describe() produces a sensible string for each known event type', async () => {
    await setup({ events: [], nextBefore: null });

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
      const text = (component as any).describe(
        makeEvent('x', { eventType: t })
      );
      expect(text).toContain('alice');
      expect(text.length).toBeGreaterThan(5);
    }
  });

  it('describe() falls back when username/entityName are missing', async () => {
    await setup({ events: [], nextBefore: null });

    const text = (component as any).describe(
      makeEvent('x', { username: null, entityName: null })
    );
    expect(text).toContain('Someone');
  });

  it('iconFor() returns a known icon name for each event type', async () => {
    await setup({ events: [], nextBefore: null });
    expect((component as any).iconFor('document_edit')).toBe('edit');
    expect((component as any).iconFor('snapshot_created')).toBe('photo_camera');
    expect((component as any).iconFor('unknown' as any)).toBe('circle');
  });
});
