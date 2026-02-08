/**
 * 404 Not Found Page Tests - Local Mode
 *
 * Tests that verify the 404 page renders correctly when navigating
 * to deeply nested non-existent routes in pure local mode.
 *
 * Note: Single-segment routes like `/nonexistent` are matched by the
 * `/:username` dynamic route and show the user profile page instead.
 * The 404 page is only shown for routes that don't match any pattern,
 * typically deeply nested paths with many segments.
 */
import { expect, test } from './fixtures';

test.describe('404 Not Found Page', () => {
  test('should show 404 page for deeply nested non-existent route', async ({
    localPage: page,
  }) => {
    // Use a multi-segment path that won't match any defined route pattern
    await page.goto('/this/is/a/deeply/nested/non-existent/path');
    await page.waitForLoadState('domcontentloaded');

    // Should display 404 message
    await expect(page.locator('h1')).toContainText('404');
  });

  test('should show "Page Not Found" text on 404 page', async ({
    localPage: page,
  }) => {
    await page.goto('/a/b/c/d/e/f');
    await page.waitForLoadState('domcontentloaded');

    // Should display explanation text
    await expect(page.locator('body')).toContainText(
      /page.*not.*found|does not exist/i
    );
  });

  test('should have a link back to home page on 404', async ({
    localPage: page,
  }) => {
    await page.goto('/deeply/nested/invalid/path');
    await page.waitForLoadState('domcontentloaded');

    // Should have a "Return to Home" link
    const homeLink = page.locator('a[href="/"]');
    await expect(homeLink).toBeVisible();
    await expect(homeLink).toContainText(/home/i);
  });

  test('should navigate to home when clicking the home link on 404', async ({
    localPage: page,
  }) => {
    await page.goto('/x/y/z/w/v');
    await page.waitForLoadState('domcontentloaded');

    // Click the home link
    await page.locator('a[href="/"]').click();

    // Should navigate to home
    await expect(page).toHaveURL('/');
  });

  test('should show user profile for single-segment unknown routes', async ({
    localPage: page,
  }) => {
    // Single-segment routes match `/:username` and show user profile
    await page.goto('/nonexistentuser');
    await page.waitForLoadState('domcontentloaded');

    // Should show user profile page, not 404
    await expect(page.locator('h1').first()).toContainText('User Profile');
  });
});
