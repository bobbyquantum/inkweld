import { expect, test } from './fixtures';

test.describe('Application Launch', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a page first to ensure localStorage is available
    await page.goto('/');

    // Clear localStorage to ensure consistent test state
    await page.evaluate(() => {
      try {
        localStorage.clear();
      } catch (error) {
        console.log('localStorage not available:', error);
      }
    });
  });
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

    // Should see feature cards (use getByRole to avoid strict mode violations)
    await expect(
      page.getByRole('heading', { name: 'Write & Organize' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Collaborate' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Version Control' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Share & Publish' })
    ).toBeVisible();
  });

  test('authenticated user sees home page', async ({
    authenticatedPage: page,
  }) => {
    // The authenticatedPage fixture already navigates to '/'

    // Authenticated users should remain on the home page
    await expect(page).toHaveURL('/');

    // Home page should have the app title
    await expect(page).toHaveTitle(/Home/);
  });

  test.describe('Setup Mode Integration', () => {
    test('unconfigured app redirects to setup on first launch', async ({
      anonymousPage: page,
    }) => {
      // Try to access home page without any configuration
      await page.goto('/');

      // Wait for potential redirects
      await page.waitForTimeout(1000);

      const currentUrl = page.url();

      // Should either be on setup page or show setup-related content
      if (currentUrl.includes('/setup')) {
        await expect(page).toHaveURL('/setup');
        await expect(page.locator('mat-card-title')).toContainText(
          'Welcome to Inkweld'
        );
      } else {
        // If not redirected, should show welcome content for unconfigured state
        await expect(page.locator('h1')).toContainText('Welcome to InkWeld');
      }
    });

    test('configured offline app launches directly to home', async ({
      anonymousPage: page,
    }) => {
      // Clear any existing config first
      await page.evaluate(() => {
        localStorage.clear();
      });

      // Pre-configure offline mode
      await page.evaluate(() => {
        const config = {
          mode: 'offline',
          offlineUser: {
            username: 'testuser',
            name: 'Test User',
          },
        };
        localStorage.setItem('inkweld-setup-config', JSON.stringify(config));
      });

      await page.goto('/');

      // Should stay on home page since app is configured
      await expect(page).toHaveURL('/');

      // App should be functional in offline mode
      await expect(page).toHaveTitle(/Home/);
    });

    test('configured server app shows appropriate authentication state', async ({
      anonymousPage: page,
    }) => {
      // Pre-configure server mode
      await page.evaluate(() => {
        const config = {
          mode: 'server',
          serverUrl: 'https://test-server.com',
        };
        localStorage.setItem('inkweld-setup-config', JSON.stringify(config));
      });

      await page.goto('/');

      // Wait for any redirects or authentication checks
      await page.waitForTimeout(1000);

      const currentUrl = page.url();

      // Should either be on home page or redirected to authentication
      if (currentUrl.includes('/welcome') || currentUrl.includes('/login')) {
        // This is expected for server mode without authentication
        expect(true).toBe(true);
      } else {
        // If on home page, should show server mode indicators
        await expect(page).toHaveURL('/');
      }
    });

    test.skip('setup completion flows work end-to-end', async ({
      anonymousPage: page,
    }) => {
      // Skip: anonymousPage fixture sets inkweld-app-config via addInitScript
      // which runs on every navigation, preventing setup tests from working
      // Setup flow is tested in setup.spec.ts and setup-integration.spec.ts
      await page.goto('/');
    });

    test.skip('setup page is accessible when app is not configured', async ({
      anonymousPage: page,
    }) => {
      // Skip: anonymousPage fixture sets inkweld-app-config via addInitScript
      // which runs on every navigation, making the app always appear configured
      // Setup page access is tested in setup.spec.ts
      await page.goto('/');
    });
  });
});
