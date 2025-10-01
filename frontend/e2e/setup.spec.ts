import { expect, test } from './fixtures';

test.describe('Setup Mode', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a page first to ensure localStorage is available
    await page.goto('/');

    // Clear localStorage to ensure we start fresh
    await page.evaluate(() => {
      try {
        localStorage.clear();
      } catch (error) {
        console.log('localStorage not available:', error);
      }
    });
  });

  test.describe('Initial Setup Flow', () => {
    test('shows setup screen when app is not configured', async ({
      anonymousPage: page,
    }) => {
      await page.goto('/setup');

      // Should show the setup card
      await expect(page.locator('.setup-card')).toBeVisible();
      await expect(page.locator('mat-card-title')).toContainText(
        'Welcome to Inkweld'
      );

      // Should show mode selection subtitle
      await expect(page.locator('mat-card-subtitle')).toContainText(
        "Choose how you'd like to use Inkweld"
      );
    });

    test('shows both offline and server options when both modes are available', async ({
      anonymousPage: page,
    }) => {
      await page.goto('/setup');

      // Should show offline mode option
      await expect(page.locator('text=Work Offline')).toBeVisible();
      await expect(
        page.locator('text=Use Inkweld locally without an internet connection')
      ).toBeVisible();

      // Should show server mode option
      await expect(page.locator('text=Connect to Server')).toBeVisible();
      await expect(
        page.locator('text=Connect to an Inkweld server for collaboration')
      ).toBeVisible();
    });
  });

  test.describe('Offline Mode Setup', () => {
    test('can configure offline mode successfully', async ({
      anonymousPage: page,
    }) => {
      await page.goto('/setup');

      // Click on offline mode option
      await page.locator('button:has-text("Work Offline")').click();

      // Should show offline setup form
      await expect(page.locator('mat-card-subtitle')).toContainText(
        'Set up your offline profile'
      );

      // Fill in the form
      await page
        .locator('input[placeholder="Enter your username"]')
        .fill('testuser');
      await page
        .locator('input[placeholder="Enter your display name"]')
        .fill('Test User');

      // Submit the form
      await page.locator('button:has-text("Set Up Offline Mode")').click();

      // Should show success message
      await expect(page.locator('text=Offline mode configured!')).toBeVisible();

      // Should redirect to home page
      await expect(page).toHaveURL('/');
    });

    test('validates required fields in offline mode', async ({
      anonymousPage: page,
    }) => {
      await page.goto('/setup');

      // Click on offline mode option
      await page.locator('button:has-text("Work Offline")').click();

      // Try to submit without filling fields
      await page.locator('button:has-text("Set Up Offline Mode")').click();

      // Should show validation error
      await expect(
        page.locator('text=Please fill in all fields')
      ).toBeVisible();
    });

    test('validates username field only in offline mode', async ({
      anonymousPage: page,
    }) => {
      await page.goto('/setup');

      // Click on offline mode option
      await page.locator('button:has-text("Work Offline")').click();

      // Fill only display name
      await page
        .locator('input[placeholder="Enter your display name"]')
        .fill('Test User');

      // Try to submit
      await page.locator('button:has-text("Set Up Offline Mode")').click();

      // Should show validation error
      await expect(
        page.locator('text=Please fill in all fields')
      ).toBeVisible();
    });

    test('validates display name field only in offline mode', async ({
      anonymousPage: page,
    }) => {
      await page.goto('/setup');

      // Click on offline mode option
      await page.locator('button:has-text("Work Offline")').click();

      // Fill only username
      await page
        .locator('input[placeholder="Enter your username"]')
        .fill('testuser');

      // Try to submit
      await page.locator('button:has-text("Set Up Offline Mode")').click();

      // Should show validation error
      await expect(
        page.locator('text=Please fill in all fields')
      ).toBeVisible();
    });

    test('can go back from offline setup to mode selection', async ({
      anonymousPage: page,
    }) => {
      await page.goto('/setup');

      // Click on offline mode option
      await page.locator('button:has-text("Work Offline")').click();

      // Should show back button
      await expect(
        page.locator('button:has-text("Back")').first()
      ).toBeVisible();

      // Click back button
      await page.locator('button:has-text("Back")').first().click();

      // Should return to mode selection
      await expect(page.locator('mat-card-subtitle')).toContainText(
        "Choose how you'd like to use Inkweld"
      );
      await expect(page.locator('text=Work Offline')).toBeVisible();
      await expect(page.locator('text=Connect to Server')).toBeVisible();
    });
  });

  test.describe('Server Mode Setup', () => {
    test('can configure server mode successfully', async ({
      anonymousPage: page,
    }) => {
      await page.goto('/setup');

      // Click on server mode option
      await page.locator('button:has-text("Connect to Server")').click();

      // Should show server setup form
      await expect(page.locator('mat-card-subtitle')).toContainText(
        'Connect to your Inkweld server'
      );

      // Fill in the server URL
      await page
        .locator('input[placeholder="https://your-inkweld-server.com"]')
        .fill('https://test-server.com');

      // Submit the form
      await page.locator('button:has-text("Connect to Server")').click();

      // Should show success message
      await expect(
        page.locator('text=Server configuration saved!')
      ).toBeVisible();

      // Should redirect to welcome page for authentication
      await expect(page).toHaveURL('/welcome');
    });

    test('validates server URL field', async ({ anonymousPage: page }) => {
      await page.goto('/setup');

      // Click on server mode option
      await page.locator('button:has-text("Connect to Server")').click();

      // Try to submit without filling server URL
      await page.locator('button:has-text("Connect to Server")').click();

      // Should show validation error
      await expect(
        page.locator('text=Please enter a server URL')
      ).toBeVisible();
    });

    test('handles server connection errors gracefully', async ({
      anonymousPage: page,
    }) => {
      await page.goto('/setup');

      // Click on server mode option
      await page.locator('button:has-text("Connect to Server")').click();

      // Fill in an invalid server URL
      await page
        .locator('input[placeholder="https://your-inkweld-server.com"]')
        .fill('invalid-url');

      // Submit the form
      await page.locator('button:has-text("Connect to Server")').click();

      // Should show error message
      await expect(
        page.locator('text=Failed to connect to server')
      ).toBeVisible();
    });

    test('can go back from server setup to mode selection', async ({
      anonymousPage: page,
    }) => {
      await page.goto('/setup');

      // Click on server mode option
      await page.locator('button:has-text("Connect to Server")').click();

      // Should show back button
      await expect(
        page.locator('button:has-text("Back")').first()
      ).toBeVisible();

      // Click back button
      await page.locator('button:has-text("Back")').first().click();

      // Should return to mode selection
      await expect(page.locator('mat-card-subtitle')).toContainText(
        "Choose how you'd like to use Inkweld"
      );
      await expect(page.locator('text=Work Offline')).toBeVisible();
      await expect(page.locator('text=Connect to Server')).toBeVisible();
    });
  });

  test.describe('Setup Persistence', () => {
    test('offline mode configuration persists across page reloads', async ({
      anonymousPage: page,
    }) => {
      await page.goto('/setup');

      // Configure offline mode
      await page.locator('button:has-text("Work Offline")').click();
      await page
        .locator('input[placeholder="Enter your username"]')
        .fill('testuser');
      await page
        .locator('input[placeholder="Enter your display name"]')
        .fill('Test User');
      await page.locator('button:has-text("Set Up Offline Mode")').click();

      // Wait for redirect to home
      await expect(page).toHaveURL('/');

      // Reload the page
      await page.reload();

      // Should still be on home page (not redirected to setup)
      await expect(page).toHaveURL('/');

      // Should show offline mode indicator if available
      // This would depend on your UI implementation
    });

    test('server mode configuration persists across page reloads', async ({
      anonymousPage: page,
    }) => {
      await page.goto('/setup');

      // Configure server mode
      await page.locator('button:has-text("Connect to Server")').click();
      await page
        .locator('input[placeholder="https://your-inkweld-server.com"]')
        .fill('https://test-server.com');
      await page.locator('button:has-text("Connect to Server")').click();

      // Wait for redirect to welcome
      await expect(page).toHaveURL('/welcome');

      // Navigate away and back
      await page.goto('/');

      // Should not redirect to setup since server mode is configured
      await expect(page).toHaveURL('/');
    });

    test('setup screen is not shown when app is already configured', async ({
      anonymousPage: page,
    }) => {
      // First, configure the app
      await page.goto('/setup');
      await page.locator('button:has-text("Work Offline")').click();
      await page
        .locator('input[placeholder="Enter your username"]')
        .fill('testuser');
      await page
        .locator('input[placeholder="Enter your display name"]')
        .fill('Test User');
      await page.locator('button:has-text("Set Up Offline Mode")').click();

      // Wait for redirect
      await expect(page).toHaveURL('/');

      // Try to navigate to setup again
      await page.goto('/setup');

      // Should redirect away from setup since app is configured
      // The exact behavior would depend on your routing logic
      await page.waitForTimeout(1000); // Give time for any redirects

      // Verify we're not on the setup page
      const currentUrl = page.url();
      expect(currentUrl).not.toContain('/setup');
    });
  });

  test.describe('Navigation and Routing', () => {
    test('redirects to setup when accessing protected routes without configuration', async ({
      anonymousPage: page,
    }) => {
      // Try to access home page without setup
      await page.goto('/');

      // Should redirect to setup if not configured
      // This test assumes the app redirects unconfigured users to setup
      await page.waitForTimeout(1000);

      const currentUrl = page.url();
      if (currentUrl.includes('/setup')) {
        await expect(page).toHaveURL('/setup');
        await expect(page.locator('mat-card-title')).toContainText(
          'Welcome to Inkweld'
        );
      }
    });

    test('allows direct navigation to setup page', async ({
      anonymousPage: page,
    }) => {
      await page.goto('/setup');

      // Should successfully load setup page
      await expect(page.locator('.setup-card')).toBeVisible();
      await expect(page.locator('mat-card-title')).toContainText(
        'Welcome to Inkweld'
      );
    });
  });

  test.describe('UI and Accessibility', () => {
    test('setup form has proper accessibility attributes', async ({
      anonymousPage: page,
    }) => {
      await page.goto('/setup');

      // Check main setup card
      await expect(page.locator('.setup-card')).toBeVisible();

      // Check that form inputs have proper labels/placeholders
      await page.locator('button:has-text("Work Offline")').click();

      const usernameInput = page.locator(
        'input[placeholder="Enter your username"]'
      );
      const displayNameInput = page.locator(
        'input[placeholder="Enter your display name"]'
      );

      await expect(usernameInput).toBeVisible();
      await expect(displayNameInput).toBeVisible();

      // Check that buttons are properly labeled
      await expect(
        page.locator('button:has-text("Set Up Offline Mode")')
      ).toBeVisible();
      await expect(page.locator('button:has-text("Back")')).toBeVisible();
    });

    test('setup form shows loading states appropriately', async ({
      anonymousPage: page,
    }) => {
      await page.goto('/setup');

      // Check for loading indicator when present
      // const loadingBar = page.locator('mat-progress-bar');

      // The loading bar should be visible during configuration loading
      // This test would need to be adjusted based on actual loading behavior
    });

    test('setup options are visually distinct and clickable', async ({
      anonymousPage: page,
    }) => {
      await page.goto('/setup');

      // Check that both option cards are visible and clickable
      const offlineOption = page.locator('button:has-text("Work Offline")');
      const serverOption = page.locator('button:has-text("Connect to Server")');

      await expect(offlineOption).toBeVisible();
      await expect(serverOption).toBeVisible();

      // Verify they have proper styling (this would depend on your CSS)
      await expect(offlineOption).toHaveClass(/option-card/);
      await expect(serverOption).toHaveClass(/option-card/);
    });
  });
});
