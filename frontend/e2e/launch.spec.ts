import { expect, test } from './fixtures';

test.describe('Application Launch', () => {
  test('anonymous user sees home page with welcome content', async ({
    anonymousPage: page,
  }) => {
    await page.goto('/');

    // Unauthenticated users should stay on the home page
    await expect(page).toHaveURL('/');

    // Home page should have the app title
    await expect(page).toHaveTitle(/Home/);

    // Should see the welcome content for unauthenticated users
    await expect(page.locator('h1')).toContainText('Welcome to InkWeld');

    // Should see login and register buttons in the header
    await expect(page.locator('button:has-text("Login")')).toBeVisible();
    await expect(page.locator('button:has-text("Register")')).toBeVisible();

    // Should see feature cards
    await expect(page.locator('text=Write & Organize')).toBeVisible();
    await expect(page.locator('text=Collaborate')).toBeVisible();
    await expect(page.locator('text=Version Control')).toBeVisible();
    await expect(page.locator('text=Share & Publish')).toBeVisible();
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
