import { expect, test } from './fixtures';

/**
 * Interactive Tutorial (guided tour) Tests - Local Mode
 *
 * The shared fixtures set `inkweld-tutorial-autostart=off` so unrelated tests
 * are never interrupted by the first-run offer. These tests remove that
 * override (via a later init script) where the auto-offer itself is under
 * test, and use the account-menu entry point elsewhere.
 */

test.describe('Interactive Tutorial', () => {
  test('auto-offers the home tour once and remembers dismissal', async ({
    localPage: page,
  }) => {
    // Re-enable auto-start (fixture init scripts run first, this one last)
    await page.addInitScript(() => {
      localStorage.removeItem('inkweld-tutorial-autostart');
    });
    await page.goto('/');

    // The welcome card should offer the tour
    const card = page.getByTestId('tutorial-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Welcome to Inkweld!');

    // Decline it
    await page.getByTestId('tutorial-not-now-button').click();
    await expect(page.getByTestId('tutorial-overlay')).toHaveCount(0);

    // Dismissal is persisted — no offer after a reload
    await page.reload();
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await expect(page.getByTestId('tutorial-overlay')).toHaveCount(0);
  });

  test('walks through the home tour to completion', async ({
    localPage: page,
  }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('inkweld-tutorial-autostart');
    });
    await page.goto('/');

    await expect(page.getByTestId('tutorial-card')).toBeVisible();
    await page.getByTestId('tutorial-start-button').click();

    // A fresh local profile shows: create button → empty state → (projects
    // grid and sync steps skip — no anchors) → account menu, then Done.
    const counter = page.getByTestId('tutorial-step-counter');
    const next = page.getByTestId('tutorial-next-button');

    await expect(counter).toContainText('1 of 5');
    await next.click();
    await expect(counter).toContainText('2 of 5');
    await next.click();
    await expect(counter).toContainText('5 of 5');
    await next.click(); // Done
    await expect(page.getByTestId('tutorial-overlay')).toHaveCount(0);

    // Completed — no offer on the next visit
    await page.reload();
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await expect(page.getByTestId('tutorial-overlay')).toHaveCount(0);
  });

  test('replays the home tour from the account menu and the empty state', async ({
    localPage: page,
  }) => {
    // Auto-start stays off (fixture default) — explicit entry points only
    await expect(page.getByTestId('tutorial-overlay')).toHaveCount(0);

    // Empty-state button starts the tour
    await page.getByTestId('take-tour-button').click();
    await expect(page.getByTestId('tutorial-card')).toBeVisible();
    await page.getByTestId('tutorial-close-button').click();
    await expect(page.getByTestId('tutorial-overlay')).toHaveCount(0);

    // Account menu entry point works even after dismissal
    await page.getByTestId('user-menu-button').click();
    await page.getByTestId('tutorial-menu-item').click();
    await expect(page.getByTestId('tutorial-card')).toBeVisible();
    await expect(page.getByTestId('tutorial-card')).toContainText(
      'Welcome to Inkweld!'
    );
  });

  test('offers the workspace tour inside a project and Escape dismisses it', async ({
    localPageWithProject: page,
  }) => {
    // Open the project
    await page.getByTestId('project-card').first().click();
    await page.waitForURL(/testuser.*test-project/);

    // Auto-start is off in fixtures; use the account menu
    await page.getByTestId('user-menu-button').click();
    await page.getByTestId('tutorial-menu-item').click();

    const card = page.getByTestId('tutorial-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('workspace');

    // Start, then verify an anchored step highlights the project tree
    await page.getByTestId('tutorial-start-button').click();
    await expect(page.locator('.tutorial-highlight')).toBeVisible();
    await expect(page.getByTestId('tutorial-step-counter')).toContainText(
      '1 of'
    );

    // Escape ends the tour
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tutorial-overlay')).toHaveCount(0);
  });
});
