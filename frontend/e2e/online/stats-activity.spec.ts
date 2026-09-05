/**
 * Stats + Activity Tab E2E Tests — Online Mode
 *
 * Verifies the project-scoped activity tab and the user-profile writing-stats
 * widget against a real backend. Covers:
 * - Activity tab empty state for a brand-new project
 * - Project writing-stats summary renders above the feed and survives a
 *   refresh
 * - Activity tab error state when the API is unreachable
 * - Writing-stats widget renders against the real /api/v1/stats/me endpoint
 * - Writing-stats widget hides itself when stats fail to load
 */

import { expect, test } from './fixtures';

test.describe('Stats + Activity — Online Mode', () => {
  test('activity tab renders events emitted by project creation', async ({
    authenticatedPage: page,
  }) => {
    const slug = `activity-events-${Date.now()}`;

    // Create a project via the wizard.
    await page.goto('/create-project');
    await page.getByRole('button', { name: /next/i }).click();
    await page.getByTestId('project-title-input').fill('Activity Events');
    await page.getByTestId('project-slug-input').fill(slug);
    await page.getByTestId('create-project-button').click();
    await expect(page).toHaveURL(new RegExp(slug));
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Open the activity tab from the sidebar.
    await page.getByTestId('sidebar-activity-button').click();

    // Wait for the activity-tab component to mount.
    await expect(page.getByTestId('activity-tab')).toBeVisible({
      timeout: 15_000,
    });

    // Project bootstrap emits at least one activity event (e.g. element_created
    // for the README seed file). We don't assert which event type appears first
    // since ordering depends on backend timing.
    const items = page.getByTestId('event-item');
    await expect(items.first()).toBeVisible({ timeout: 15_000 });

    // The per-project writing-stats summary sits above the feed. Project
    // bootstrap seeds a README through a live session, which may or may not
    // have recorded a positive word delta by now, so accept either the empty
    // hint or the words figure.
    const summary = page.getByTestId('project-stats-summary');
    await expect(summary).toBeVisible({ timeout: 15_000 });
    await expect(summary).toContainText(/last 30 days/i);
    const summaryBody = page
      .getByTestId('project-stats-empty')
      .or(page.getByTestId('project-stat-words'));
    await expect(summaryBody.first()).toBeVisible();

    // Sanity: refresh button works and both the feed and summary survive.
    await page.getByTestId('activity-refresh-button').click();
    await expect(items.first()).toBeVisible({ timeout: 15_000 });
    await expect(summary).toBeVisible({ timeout: 15_000 });
  });

  test('activity tab surfaces an error state when the API is blocked', async ({
    authenticatedPage: page,
  }) => {
    const slug = `activity-error-${Date.now()}`;

    // Register the intercept on the browser context so it fires before any
    // service-worker or page-level caching layers.  Using 'connectionfailed'
    // (the same error code used by the serverUnavailablePage fixture) ensures
    // Angular's HttpClient surfaces a real network error.
    const activityMatcher = (url: URL) =>
      url.pathname.includes('/api/v1/activity/');
    const activityHandler = (route: import('@playwright/test').Route) =>
      route.abort('connectionfailed');
    await page.context().route(activityMatcher, activityHandler);

    await page.goto('/create-project');
    await page.getByRole('button', { name: /next/i }).click();
    await page.getByTestId('project-title-input').fill('Activity Error');
    await page.getByTestId('project-slug-input').fill(slug);
    await page.getByTestId('create-project-button').click();
    await expect(page).toHaveURL(new RegExp(slug));
    await expect(page.getByTestId('project-tree')).toBeVisible();

    await page.getByTestId('sidebar-activity-button').click();

    const errorState = page.getByTestId('activity-error-state');
    await expect(errorState).toBeVisible({ timeout: 15_000 });
    await expect(errorState).toContainText(/could not load activity/i);

    // Retry button should be present.
    await expect(
      errorState.getByRole('button', { name: /retry/i })
    ).toBeVisible();

    // Now restore the endpoint and click retry — the activity feed should
    // render successfully (either an empty state or one or more events).
    await page.context().unroute(activityMatcher);
    await errorState.getByRole('button', { name: /retry/i }).click();

    await expect(errorState).toHaveCount(0, { timeout: 15_000 });
    const populated = page
      .getByTestId('event-item')
      .or(page.getByTestId('activity-empty-state'));
    await expect(populated.first()).toBeVisible({ timeout: 15_000 });
  });

  test('writing-stats widget renders on the user profile page', async ({
    authenticatedPage: page,
  }) => {
    // Navigate to the signed-in user's own profile page where the widget lives.
    await page.goto(`/${page.testCredentials.username}`);
    const widget = page.getByTestId('stats-widget');
    await expect(widget).toBeVisible({ timeout: 15_000 });

    // Window label is "Last 30 days" by default.
    await expect(widget).toContainText(/last 30 days/i);

    // Three labelled stats are always rendered: words, active days, projects.
    await expect(widget.getByTestId('stat-label')).toContainText(
      ['words', 'active days', 'projects'],
      { timeout: 5_000 }
    );
  });

  test('writing-stats widget hides itself when /stats/me fails', async ({
    authenticatedPage: page,
  }) => {
    // Block ONLY the stats/me endpoint using a context-level route so the
    // intercept fires before any service-worker or page-level caching layers.
    // 'connectionfailed' matches the abort code used by serverUnavailablePage.
    const statsMatcher = (url: URL) =>
      url.pathname.startsWith('/api/v1/stats/me');
    const statsHandler = (route: import('@playwright/test').Route) =>
      route.abort('connectionfailed');
    await page.context().route(statsMatcher, statsHandler);
    await page.goto(`/${page.testCredentials.username}`);

    // Wait for the loading card to disappear (errored() supersedes loading()).
    await expect(page.getByTestId('stats-widget-loading')).toHaveCount(0, {
      timeout: 15_000,
    });

    // The card should not appear at all (errored() branch renders an empty
    // template, by design).
    await expect(page.getByTestId('stats-widget')).toHaveCount(0);

    // Sanity: the profile page itself still loaded correctly.
    // The user-profile page renders a toolbar with an "User Profile" heading.
    await expect(page.getByTestId('profile-toolbar')).toBeVisible({
      timeout: 15_000,
    });
  });
});
