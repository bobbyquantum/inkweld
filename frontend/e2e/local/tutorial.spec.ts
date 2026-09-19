import { openProjectFromGrid } from '../common/test-helpers';
import { expect, openUserSettings, test } from './fixtures';
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
    // Re-enable auto-start. Init-script execution order is not guaranteed,
    // so also re-remove the fixture's opt-out once the DOM is ready — still
    // long before the app evaluates it.
    await page.addInitScript(() => {
      const enableAutoStart = () =>
        localStorage.removeItem('inkweld-tutorial-autostart');
      enableAutoStart();
      document.addEventListener('DOMContentLoaded', enableAutoStart);
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
      const enableAutoStart = () =>
        localStorage.removeItem('inkweld-tutorial-autostart');
      enableAutoStart();
      document.addEventListener('DOMContentLoaded', enableAutoStart);
    });
    await page.goto('/');

    await expect(page.getByTestId('tutorial-card')).toBeVisible();
    await page.getByTestId('tutorial-start-button').click();

    // A fresh local profile plans three steps: create button → empty state
    // → account menu. The projects-grid and sync steps have no anchors here,
    // so they are left out of the run and out of the counter's total.
    const counter = page.getByTestId('tutorial-step-counter');
    const next = page.getByTestId('tutorial-next-button');

    await expect(counter).toContainText('1 of 3');
    await next.click();
    await expect(counter).toContainText('2 of 3');
    await next.click();
    await expect(counter).toContainText('3 of 3');
    await expect(next).toContainText('Done');
    await next.click();
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

  test('turns every tour off from the first offer, and back on in settings', async ({
    localPageWithProject: page,
  }) => {
    // Re-enable auto-start (see the note above) and reload into the offer
    await page.addInitScript(() => {
      const enableAutoStart = () =>
        localStorage.removeItem('inkweld-tutorial-autostart');
      enableAutoStart();
      document.addEventListener('DOMContentLoaded', enableAutoStart);
    });
    await page.goto('/');

    await expect(page.getByTestId('tutorial-card')).toBeVisible();
    await page.getByTestId('tutorial-disable-button').click();
    await expect(page.getByTestId('tutorial-overlay')).toHaveCount(0);

    // Explicit entry points still work while tours are off
    await page.getByTestId('user-menu-button').click();
    await page.getByTestId('tutorial-menu-item').click();
    await expect(page.getByTestId('tutorial-card')).toBeVisible();
    await page.getByTestId('tutorial-close-button').click();
    await expect(page.getByTestId('tutorial-overlay')).toHaveCount(0);

    // The workspace tour has never been seen, and is not offered either
    await openProjectFromGrid(page);
    await page.waitForURL(/testuser.*test-project/);
    await expect(page.getByTestId('project-tree')).toBeVisible();
    await expect(page.getByTestId('tutorial-overlay')).toHaveCount(0);

    // Settings → General is the way back
    await openUserSettings(page);
    await page.getByRole('tab', { name: /general settings/i }).click();
    const toursToggle = page.getByTestId('show-tours-toggle');
    await expect(toursToggle).toBeVisible();
    // A slide toggle is a button[role="switch"]; `toBeChecked` reads its
    // aria-checked, and clicking the switch itself avoids depending on
    // whether the label forwards the click.
    const toursSwitch = toursToggle.locator('button[role="switch"]');
    await expect(toursSwitch).not.toBeChecked();

    await toursSwitch.click();
    await expect(toursSwitch).toBeChecked();
    await page.getByTestId('settings-close-button').click();

    // Re-enabled and persisted: the unseen workspace tour is offered again
    await page.reload();
    await expect(page.getByTestId('project-tree')).toBeVisible();
    await expect(page.getByTestId('tutorial-card')).toContainText('workspace');
  });

  test('offers the workspace tour inside a project and Escape dismisses it', async ({
    localPageWithProject: page,
  }) => {
    // Open the project
    await openProjectFromGrid(page);
    await page.waitForURL(/testuser.*test-project/);

    // Auto-start is off in fixtures; use the account menu
    await page.getByTestId('user-menu-button').click();
    await page.getByTestId('tutorial-menu-item').click();

    const card = page.getByTestId('tutorial-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('workspace');

    // Start, then verify an anchored step highlights the project tree
    await page.getByTestId('tutorial-start-button').click();
    await expect(page.getByTestId('tutorial-highlight')).toBeVisible();
    await expect(page.getByTestId('tutorial-step-counter')).toContainText(
      '1 of'
    );

    // Escape ends the tour
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tutorial-overlay')).toHaveCount(0);
  });
});
