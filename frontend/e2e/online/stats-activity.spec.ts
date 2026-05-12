/**
 * Stats + Activity Tab E2E Tests — Online Mode
 *
 * Verifies the project-scoped activity tab and the user-profile writing-stats
 * widget against a real backend. Covers:
 * - Activity tab empty state for a brand-new project
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
    await expect(page.locator('.activity-tab')).toBeVisible({
      timeout: 15_000,
    });

    // Project bootstrap emits at least one activity event (e.g. element_created
    // for the README seed file). We don't assert which event type appears first
    // since ordering depends on backend timing.
    const items = page.locator('.activity-tab .event-item');
    await expect(items.first()).toBeVisible({ timeout: 15_000 });

    // Sanity: refresh button works and feed survives.
    await page
      .locator('.activity-tab .tab-header button[mat-icon-button]')
      .click();
    await expect(items.first()).toBeVisible({ timeout: 15_000 });
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

    const errorState = page.locator('.activity-tab .error-state');
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
    const populated = page.locator(
      '.activity-tab .event-item, .activity-tab .empty-state'
    );
    await expect(populated.first()).toBeVisible({ timeout: 15_000 });
  });

  test('writing-stats widget renders on the user profile page', async ({
    authenticatedPage: page,
  }) => {
    // Navigate to the signed-in user's own profile page where the widget lives.
    await page.goto(`/${page.testCredentials.username}`);
    const widget = page.locator('app-writing-stats-widget .stats-widget');
    await expect(widget).toBeVisible({ timeout: 15_000 });

    // Window label is "Last 30 days" by default.
    await expect(widget).toContainText(/last 30 days/i);

    // Three labelled stats are always rendered: words, active days, projects.
    await expect(widget.locator('.stat-label')).toContainText(
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
    await expect(
      page.locator('app-writing-stats-widget .stats-widget.loading')
    ).toHaveCount(0, { timeout: 15_000 });

    // The card should not appear at all (errored() branch renders an empty
    // template, by design).
    await expect(
      page.locator('app-writing-stats-widget .stats-widget')
    ).toHaveCount(0);

    // Sanity: the profile page itself still loaded (user menu present).
    await expect(page.getByTestId('user-menu-button')).toBeVisible({
      timeout: 15_000,
    });
  });
});
