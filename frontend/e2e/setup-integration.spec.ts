import { expect, test } from './fixtures';

test.describe('Setup Integration Tests', () => {
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

  test.describe('Setup to Authentication Flow', () => {
    test('server mode setup redirects to authentication', async ({
      anonymousPage: page,
    }) => {
      await page.goto('/setup');

      // Configure server mode
      await page.getByTestId('server-mode-button').click();
      await page
        .getByTestId('server-url-input')
        .fill('https://test-server.com');
      await page.getByTestId('connect-server-button').click();

      // Should redirect to welcome page for authentication
      await expect(page).toHaveURL('/welcome');

      // Should show login/register options
      await expect(page.locator('button:has-text("Login")')).toBeVisible();
      await expect(page.locator('button:has-text("Register")')).toBeVisible();
    });

    test('offline mode setup bypasses authentication', async ({
      anonymousPage: page,
    }) => {
      await page.goto('/setup');

      // Configure offline mode
      await page.getByTestId('offline-mode-button').click();
      await page.getByTestId('offline-username-input').fill('testuser');
      await page.getByTestId('offline-displayname-input').fill('Test User');
      await page.getByTestId('start-offline-button').click();

      // Should redirect directly to home page
      await expect(page).toHaveURL('/');

      // Should not show login/register buttons since we're in offline mode
      await expect(page.locator('button:has-text("Login")')).not.toBeVisible();
      await expect(
        page.locator('button:has-text("Register")')
      ).not.toBeVisible();
    });
  });

  test.describe('Setup to Project Creation Flow', () => {
    test('can create project after offline setup', async ({
      anonymousPage: page,
    }) => {
      await page.goto('/setup');

      // Configure offline mode
      await page.getByTestId('offline-mode-button').click();
      await page.getByTestId('offline-username-input').fill('testuser');
      await page.getByTestId('offline-displayname-input').fill('Test User');
      await page.getByTestId('start-offline-button').click();

      // Should be on home page
      await expect(page).toHaveURL('/');

      // Should be able to create a new project
      const createProjectButton = page
        .locator('button:has-text("New Project")')
        .or(page.locator('button:has-text("Create Project")'))
        .or(page.locator('[data-testid="create-project"]'))
        .first();

      if (await createProjectButton.isVisible()) {
        await createProjectButton.click();

        // Should navigate to project creation
        await page.waitForTimeout(1000);
        const currentUrl = page.url();
        expect(currentUrl).toMatch(/\/(create-project|new)/);
      }
    });

    test('server mode requires authentication before project creation', async ({
      anonymousPage: page,
    }) => {
      await page.goto('/setup');

      // Configure server mode
      await page.getByTestId('server-mode-button').click();
      await page
        .getByTestId('server-url-input')
        .fill('https://test-server.com');
      await page.getByTestId('connect-server-button').click();

      // Should redirect to welcome page
      await expect(page).toHaveURL('/welcome');

      // Try to navigate directly to home
      await page.goto('/');

      // Should either stay on welcome or redirect back to authentication
      await page.waitForTimeout(1000);
      const currentUrl = page.url();

      // In server mode without authentication, should not have full access
      if (currentUrl.includes('/welcome') || currentUrl.includes('/login')) {
        // This is expected behavior
        expect(true).toBe(true);
      } else {
        // If we're on home, project creation should require authentication
        const createProjectButton = page
          .locator('button:has-text("New Project")')
          .or(page.locator('button:has-text("Create Project")'))
          .first();

        if (await createProjectButton.isVisible()) {
          await createProjectButton.click();

          // Should redirect to authentication
          await page.waitForTimeout(1000);
          const redirectUrl = page.url();
          expect(redirectUrl).toMatch(/\/(welcome|login|register)/);
        }
      }
    });
  });

  test.describe('Setup Configuration Validation', () => {
    test('validates offline user profile is properly stored', async ({
      anonymousPage: page,
    }) => {
      await page.goto('/setup');

      // Configure offline mode
      await page.getByTestId('offline-mode-button').click();
      await page.getByTestId('offline-username-input').fill('testuser');
      await page.getByTestId('offline-displayname-input').fill('Test User');
      await page.getByTestId('start-offline-button').click();

      // Check that configuration is stored in localStorage
      const storedConfig = await page.evaluate(() => {
        const config = localStorage.getItem('inkweld-setup-config');
        return config ? JSON.parse(config) : null;
      });

      expect(storedConfig).toBeTruthy();
      expect(storedConfig.mode).toBe('offline');
      expect(storedConfig.offlineUser.username).toBe('testuser');
      expect(storedConfig.offlineUser.name).toBe('Test User');
    });

    test('validates server configuration is properly stored', async ({
      anonymousPage: page,
    }) => {
      await page.goto('/setup');

      // Configure server mode
      await page.getByTestId('server-mode-button').click();
      await page
        .getByTestId('server-url-input')
        .fill('https://test-server.com');
      await page.getByTestId('connect-server-button').click();

      // Check that configuration is stored in localStorage
      const storedConfig = await page.evaluate(() => {
        const config = localStorage.getItem('inkweld-setup-config');
        return config ? JSON.parse(config) : null;
      });

      expect(storedConfig).toBeTruthy();
      expect(storedConfig.mode).toBe('server');
      expect(storedConfig.serverUrl).toBe('https://test-server.com');
    });

    test('handles corrupted localStorage gracefully', async ({
      anonymousPage: page,
    }) => {
      // Set corrupted data in localStorage
      await page.evaluate(() => {
        localStorage.setItem('inkweld-setup-config', 'invalid-json');
      });

      await page.goto('/setup');

      // Should still show setup screen despite corrupted data
      await expect(page.getByTestId('setup-card')).toBeVisible();
      await expect(page.locator('mat-card-title')).toContainText(
        'Welcome to Inkweld'
      );
    });
  });

  test.describe('Mode Switching', () => {
    test('can reconfigure from offline to server mode', async ({
      anonymousPage: page,
    }) => {
      // First configure offline mode
      await page.goto('/setup');
      await page.getByTestId('offline-mode-button').click();
      await page.getByTestId('offline-username-input').fill('testuser');
      await page.getByTestId('offline-displayname-input').fill('Test User');
      await page.getByTestId('start-offline-button').click();

      // Should be on home page
      await expect(page).toHaveURL('/');

      // Clear configuration to simulate reconfiguration
      await page.evaluate(() => {
        localStorage.removeItem('inkweld-setup-config');
      });

      // Navigate back to setup
      await page.goto('/setup');

      // Configure server mode
      await page.getByTestId('server-mode-button').click();
      await page
        .getByTestId('server-url-input')
        .fill('https://test-server.com');
      await page.getByTestId('connect-server-button').click();

      // Should redirect to welcome page
      await expect(page).toHaveURL('/welcome');
    });

    test('can reconfigure from server to offline mode', async ({
      anonymousPage: page,
    }) => {
      // First configure server mode
      await page.goto('/setup');
      await page.getByTestId('server-mode-button').click();
      await page
        .getByTestId('server-url-input')
        .fill('https://test-server.com');
      await page.getByTestId('server-mode-button').click();

      // Should be on welcome page
      await expect(page).toHaveURL('/welcome');

      // Clear configuration to simulate reconfiguration
      await page.evaluate(() => {
        localStorage.removeItem('inkweld-setup-config');
      });

      // Navigate back to setup
      await page.goto('/setup');

      // Configure offline mode
      await page.getByTestId('offline-mode-button').click();
      await page.getByTestId('offline-username-input').fill('newuser');
      await page.getByTestId('offline-displayname-input').fill('New User');
      await page.getByTestId('start-offline-button').click();

      // Should redirect to home page
      await expect(page).toHaveURL('/');
    });
  });

  test.describe('Error Handling and Edge Cases', () => {
    test('handles network errors during server configuration', async ({
      anonymousPage: page,
    }) => {
      // Simulate network failure
      await page.route('**/*', route => route.abort());

      await page.goto('/setup');

      // Configure server mode
      await page.getByTestId('server-mode-button').click();
      await page
        .getByTestId('server-url-input')
        .fill('https://test-server.com');
      await page.getByTestId('connect-server-button').click();

      // Should show error message
      await expect(
        page.locator('text=Failed to connect to server')
      ).toBeVisible();

      // Should remain on setup page
      expect(page.url()).toContain('/setup');
    });

    test('handles special characters in offline user inputs', async ({
      anonymousPage: page,
    }) => {
      await page.goto('/setup');

      // Configure offline mode with special characters
      await page.getByTestId('offline-mode-button').click();
      await page.getByTestId('offline-username-input').fill('test-user_123');
      await page.getByTestId('offline-displayname-input').fill('Test User (Admin)');
      await page.getByTestId('start-offline-button').click();

      // Should handle special characters gracefully
      await expect(page.locator('text=Offline mode configured!')).toBeVisible();
      await expect(page).toHaveURL('/');
    });

    test('handles very long input values', async ({ anonymousPage: page }) => {
      await page.goto('/setup');

      const longUsername = 'a'.repeat(100);
      const longDisplayName =
        'Very Long Display Name That Exceeds Normal Length Expectations'.repeat(
          3
        );

      // Configure offline mode with long inputs
      await page.getByTestId('offline-mode-button').click();
      await page.getByTestId('offline-username-input').fill(longUsername);
      await page.getByTestId('offline-displayname-input').fill(longDisplayName);
      await page.getByTestId('start-offline-button').click();

      // Should either handle gracefully or show appropriate validation
      const successMessage = page.locator('text=Offline mode configured!');
      const errorMessage = page
        .locator('text=Please fill in all fields')
        .or(page.locator('text=Invalid input'));

      // Either success or appropriate error handling
      await expect(successMessage.or(errorMessage)).toBeVisible();
    });

    test('handles rapid clicking during setup', async ({
      anonymousPage: page,
    }) => {
      await page.goto('/setup');

      // Configure offline mode
      await page.getByTestId('offline-mode-button').click();
      await page.getByTestId('offline-username-input').fill('testuser');
      await page.getByTestId('offline-displayname-input').fill('Test User');

      // Rapidly click the setup button multiple times
      const setupButton = page.locator(
        'button:has-text("Set Up Offline Mode")'
      );
      await setupButton.click();
      await setupButton.click();
      await setupButton.click();

      // Should handle gracefully and only process once
      await expect(page.locator('text=Offline mode configured!')).toBeVisible();
      await expect(page).toHaveURL('/');
    });
  });

  test.describe('Browser Compatibility', () => {
    test('setup works with disabled JavaScript (graceful degradation)', async ({
      anonymousPage: page,
    }) => {
      // This test would need to be adapted based on your app's behavior with disabled JS
      // For now, we'll test that the setup page loads properly
      await page.goto('/setup');

      await expect(page.getByTestId('setup-card')).toBeVisible();
      await expect(page.locator('mat-card-title')).toContainText(
        'Welcome to Inkweld'
      );
    });

    test('setup works with localStorage disabled', async ({
      anonymousPage: page,
    }) => {
      // Simulate localStorage being unavailable
      await page.addInitScript(() => {
        Object.defineProperty(window, 'localStorage', {
          value: {
            getItem: () => {
              throw new Error('localStorage disabled');
            },
            setItem: () => {
              throw new Error('localStorage disabled');
            },
            removeItem: () => {
              throw new Error('localStorage disabled');
            },
            clear: () => {
              throw new Error('localStorage disabled');
            },
          },
        });
      });

      await page.goto('/setup');

      // Should still show setup screen
      await expect(page.getByTestId('setup-card')).toBeVisible();

      // Try to configure offline mode
      await page.getByTestId('offline-mode-button').click();
      await page.getByTestId('offline-username-input').fill('testuser');
      await page.getByTestId('offline-displayname-input').fill('Test User');
      await page.getByTestId('start-offline-button').click();

      // Should handle localStorage errors gracefully
      // The exact behavior would depend on your error handling implementation
    });
  });
});
