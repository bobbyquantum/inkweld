import { type Route } from '@playwright/test';

import { mockApi } from './index';

/**
 * Mock handlers for the writing-statistics and activity-feed APIs.
 *
 * These power the home-page writing-stats widget and the per-project
 * activity tab in screenshot tests. The shapes mirror the real
 * `/api/v1/stats` and `/api/v1/activity` responses.
 *
 * NOTE: The stats / activity feature is online-only — see
 * docs-user-guide/collaboration/activity-and-stats.md. Local-mode
 * sessions never call these endpoints.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function todayIso(offsetDays = 0): string {
  return new Date(Date.now() - offsetDays * DAY_MS).toISOString().slice(0, 10);
}

function buildDailySeries(days: number): { day: string; words: number }[] {
  const base = [120, 340, 0, 510, 220, 80, 600, 410, 0, 295];
  return Array.from({ length: days }, (_, i) => ({
    day: todayIso(days - 1 - i),
    words: base[i % base.length],
  }));
}

export function setupStatsHandlers(): void {
  // GET /api/v1/stats/me — cross-project user stats for the home widget.
  mockApi.addHandler('**/api/v1/stats/me*', async (route: Route) => {
    const daily = buildDailySeries(30);
    const totalWords = daily.reduce((sum, d) => sum + d.words, 0);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        windowDays: 30,
        projectCount: 3,
        totalWords,
        daily,
      }),
    });
  });

  // GET /api/v1/stats/projects/:username/:slug — per-project stats.
  mockApi.addHandler('**/api/v1/stats/projects/**', async (route: Route) => {
    const daily = buildDailySeries(30);
    const totalWords = daily.reduce((sum, d) => sum + d.words, 0);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        projectId: 'mock-project-id',
        windowDays: 30,
        totalWords,
        daily,
        contributors: [
          { userId: '1', username: 'testuser', words: totalWords },
        ],
      }),
    });
  });

  // GET /api/v1/activity/me — cross-project activity feed for the widget.
  mockApi.addHandler('**/api/v1/activity/me*', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        events: buildUserActivityEvents(),
        nextBefore: null,
      }),
    });
  });

  // GET /api/v1/activity/projects/:username/:slug — project activity tab.
  mockApi.addHandler('**/api/v1/activity/projects/**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        events: buildProjectActivityEvents(),
        nextBefore: null,
      }),
    });
  });
}

function buildProjectActivityEvents(): unknown[] {
  const now = Date.now();
  return [
    {
      id: 'evt-1',
      projectId: 'mock-project-id',
      userId: '1',
      username: 'testuser',
      eventType: 'document_edit',
      entityId: 'doc-1',
      entityName: 'Chapter 3 — The Hollow',
      metadata: { wordsAdded: 412 },
      createdAt: now - 5 * 60 * 1000,
    },
    {
      id: 'evt-2',
      projectId: 'mock-project-id',
      userId: '2',
      username: 'adminuser',
      eventType: 'comment_thread_created',
      entityId: 'thread-7',
      entityName: 'Chapter 3 — The Hollow',
      metadata: { excerpt: 'Consider tightening this paragraph…' },
      createdAt: now - 42 * 60 * 1000,
    },
    {
      id: 'evt-3',
      projectId: 'mock-project-id',
      userId: '1',
      username: 'testuser',
      eventType: 'snapshot_created',
      entityId: 'snap-12',
      entityName: 'Draft v0.4',
      metadata: null,
      createdAt: now - 3 * 60 * 60 * 1000,
    },
    {
      id: 'evt-4',
      projectId: 'mock-project-id',
      userId: '2',
      username: 'adminuser',
      eventType: 'collaborator_joined',
      entityId: '2',
      entityName: 'adminuser',
      metadata: null,
      createdAt: now - 26 * 60 * 60 * 1000,
    },
    {
      id: 'evt-5',
      projectId: 'mock-project-id',
      userId: '1',
      username: 'testuser',
      eventType: 'file_published',
      entityId: 'pub-9',
      entityName: 'draft.epub',
      metadata: { format: 'epub' },
      createdAt: now - 3 * 24 * 60 * 60 * 1000,
    },
  ];
}

function buildUserActivityEvents(): unknown[] {
  return buildProjectActivityEvents().map((e, i) => ({
    ...(e as Record<string, unknown>),
    projectSlug: 'wandering-stars',
    projectTitle: 'Wandering Stars',
    projectOwnerUsername: 'testuser',
    id: `user-${i + 1}`,
  }));
}
