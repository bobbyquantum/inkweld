/**
 * Application Launch Tests - Online Mode
 *
 * Tests that verify the app launches correctly in server mode
 * with proper authentication and API connectivity.
 */
import { expect, test } from './fixtures';

test.describe('Online Application Launch', () => {
  test('anonymous user sees welcome page content', async ({
    anonymousPage: page,
  }) => {
    await page.goto('/');

    // Unauthenticated users should stay on the home page
    await expect(page).toHaveURL('/');

    // Home page should have the app title
    await expect(page).toHaveTitle(/Home/);

    // Should see the welcome content for unauthenticated users
    await expect(page.getByTestId('welcome-heading')).toContainText('Inkweld');

    // Should see login and register buttons
    await expect(page.getByTestId('welcome-login-button')).toBeVisible();
    await expect(page.getByTestId('welcome-register-button')).toBeVisible();
  });

  test('authenticated user sees home page with projects', async ({
    authenticatedPage,
  }) => {
    // The authenticatedPage fixture already navigates to '/'
    await expect(authenticatedPage).toHaveURL('/');

    // Home page should have the app title
    await expect(authenticatedPage).toHaveTitle(/Home/);

    // Should have auth token
    const token = await authenticatedPage.evaluate(() => {
      return localStorage.getItem('auth_token');
    });
    expect(token).toBeTruthy();
  });

  test('server mode persists across page refresh', async ({
    authenticatedPage: page,
  }) => {
    // Get initial config
    const configBefore = await page.evaluate(() => {
      return localStorage.getItem('inkweld-app-config');
    });
    const parsedBefore = JSON.parse(configBefore!);
    expect(parsedBefore.mode).toBe('server');

    // Refresh the page
    await page.reload();

    // Wait for app to reinitialize
    await page.waitForTimeout(1000);

    // Verify config is still server mode
    const configAfter = await page.evaluate(() => {
      return localStorage.getItem('inkweld-app-config');
    });
    const parsedAfter = JSON.parse(configAfter!);
    expect(parsedAfter.mode).toBe('server');
  });

  test('should handle browser back/forward navigation', async ({
    authenticatedPage: page,
  }) => {
    // Navigate through pages
    await page.goto('/');
    await page.goto('/create-project');

    // Go back
    await page.goBack();
    await expect(page).toHaveURL('/');

    // Go forward
    await page.goForward();
    await expect(page).toHaveURL('/create-project');

    // Go back again
    await page.goBack();
    await expect(page).toHaveURL('/');
  });
});
