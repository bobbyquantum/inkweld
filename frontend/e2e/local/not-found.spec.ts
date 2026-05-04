/**
 * 404 Not Found Page Tests - Local Mode
 *
 * Verifies the 404 page renders correctly when navigating to deeply nested
 * non-existent routes in pure local mode.
 *
 * Note: single-segment routes like `/nonexistent` are matched by the
 * `/:username` dynamic route and show the user profile page instead.
 * The 404 page is only shown for routes that don't match any pattern,
 * typically deeply nested paths with many segments.
 *
 * Consolidated from 5 individual tests into 2 grouped tests using
 * `test.step()`. The user-profile assertion is kept separate because it
 * exercises a different route pattern (`/:username`).
 */
import { expect, test } from './fixtures';

test.describe('404 Not Found Page', () => {
  test('renders 404 content and provides a working home link', async ({
    localPage: page,
  }) => {
    await page.goto('/this/is/a/deeply/nested/non-existent/path');
    await page.waitForLoadState('domcontentloaded');

    await test.step('shows 404 heading and "Page Not Found" copy', async () => {
      await expect(page.locator('h1')).toContainText('404');
      await expect(page.locator('body')).toContainText(
        /page.*not.*found|does not exist/i
      );
    });

    await test.step('home link is visible and labelled', async () => {
      const homeLink = page.locator('a[href="/"]');
      await expect(homeLink).toBeVisible();
      await expect(homeLink).toContainText(/home/i);
    });

    await test.step('clicking the home link navigates to /', async () => {
      await page.locator('a[href="/"]').click();
      await expect(page).toHaveURL('/');
    });
  });

  test('single-segment unknown routes show the user profile page', async ({
    localPage: page,
  }) => {
    await page.goto('/nonexistentuser');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('h1').first()).toContainText('User Profile');
  });
});
