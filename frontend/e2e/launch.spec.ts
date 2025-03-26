import { expect, test } from './fixtures';

test.describe('Application Launch', () => {
  test('anonymous user sees welcome page', async ({ anonymousPage: page }) => {
    await page.goto('/');

    // Unauthenticated users should be redirected to welcome page
    await expect(page).toHaveURL('/welcome');

    // Welcome page should have the app title
    await expect(page).toHaveTitle(/Welcome/);

    // Should see the login form
    await expect(page.locator('form')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('authenticated user sees home page', async ({
    authenticatedPage: page,
  }) => {
    // The authenticatedPage fixture already navigates to '/'

    // Authenticated users should remain on the home page
    await expect(page).toHaveURL('/');

    // Home page should have the app title
    await expect(page).toHaveTitle(/Inkweld/);
  });
});
