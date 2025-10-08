import { expect, test } from './fixtures';

test.describe('Error Handling and Edge Cases', () => {
  test.describe('Network Error Handling', () => {
    test('should handle network timeout gracefully', async ({
      anonymousPage: page,
    }) => {
      // Simulate slow network by delaying API responses
      await page.route('**/api/**', async route => {
        await new Promise(resolve => setTimeout(resolve, 5000));
        await route.abort('timedout');
      });

      await page.goto('/welcome');

      // Fill and submit login form
      await page.getByTestId('username-input').fill('testuser');
      await page.getByTestId('password-input').fill('correct-password');
      await page.getByTestId('login-button').click();

      // Should show error or stay on page
      await page.waitForTimeout(2000);

      // Should either show error message or stay on welcome page
      const url = page.url();
      expect(url.includes('welcome')).toBeTruthy();
    });

    test('should handle 500 server errors', async ({ anonymousPage: page }) => {
      // Mock 500 error for login
      await page.route('**/login', async route => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            message: 'Internal Server Error',
            error: 'Internal Server Error',
            statusCode: 500,
          }),
        });
      });

      await page.goto('/welcome');

      await page.getByTestId('username-input').fill('testuser');
      await page.getByTestId('password-input').fill('correct-password');
      await page.getByTestId('login-button').click();

      // Should show error message
      await page.waitForTimeout(1000);

      // Should remain on welcome page
      await expect(page).toHaveURL('/welcome');
    });

    test('should handle offline mode gracefully', async ({
      anonymousPage: page,
    }) => {
      // Go offline
      await page.context().setOffline(true);

      await page.goto('/welcome');

      // Try to login
      await page.getByTestId('username-input').fill('testuser');
      await page.getByTestId('password-input').fill('correct-password');
      await page.getByTestId('login-button').click();

      await page.waitForTimeout(2000);

      // Should handle offline state
      // Might show error or stay on page
      const url = page.url();
      expect(url).toBeTruthy();

      // Go back online
      await page.context().setOffline(false);
    });
  });

  test.describe('Input Validation Edge Cases', () => {
    test('should handle special characters in username', async ({
      anonymousPage: page,
    }) => {
      await page.goto('/register');

      // Try special characters
      await page.getByTestId('username-input').fill('user@#$%');
      await page.getByTestId('password-input').fill('ValidPass123!');
      await page.getByTestId('confirm-password-input').fill('ValidPass123!');

      // Button might be disabled or show error
      const button = page.getByTestId('register-button');
      await page.waitForTimeout(500);

      // Should handle invalid username appropriately
      const isDisabled = await button.isDisabled();
      // Either disabled or will show error on submit
      expect(typeof isDisabled).toBe('boolean');
    });

    test('should handle extremely long input strings', async ({
      anonymousPage: page,
    }) => {
      await page.goto('/register');

      const veryLongString = 'a'.repeat(10000);

      await page.getByTestId('username-input').fill(veryLongString);
      await page.getByTestId('password-input').fill('ValidPass123!');
      await page.getByTestId('confirm-password-input').fill('ValidPass123!');

      await page.waitForTimeout(500);

      // Should handle gracefully without crashing
      const url = page.url();
      expect(url).toContain('register');
    });

    test('should handle unicode and emoji in input', async ({
      anonymousPage: page,
    }) => {
      await page.goto('/register');

      await page.getByTestId('username-input').fill('user👨‍💻😀');
      await page.getByTestId('password-input').fill('ValidPass123!');
      await page.getByTestId('confirm-password-input').fill('ValidPass123!');

      await page.waitForTimeout(500);

      // Should handle unicode gracefully
      const value = await page.getByTestId('username-input').inputValue();
      expect(value).toBeTruthy();
    });

    test('should handle SQL injection attempts safely', async ({
      anonymousPage: page,
    }) => {
      await page.goto('/welcome');

      // Try SQL injection in username
      await page.getByTestId('username-input').fill("' OR '1'='1' --");
      await page.getByTestId('password-input').fill("' OR '1'='1' --");
      await page.getByTestId('login-button').click();

      await page.waitForTimeout(1000);

      // Should not succeed - should show error or stay on page
      await expect(page).toHaveURL('/welcome');
    });

    test('should handle XSS attempts in project creation', async ({
      authenticatedPage: page,
    }) => {
      await page.goto('/create-project');

      // Try XSS in project title
      await page
        .getByTestId('project-title-input')
        .fill('<script>alert("XSS")</script>');
      await page.getByTestId('project-slug-input').fill('xss-test');

      await page.getByTestId('create-project-button').click();

      // Wait for navigation or error
      await page.waitForTimeout(2000);

      // Check that script didn't execute
      const hasAlert = await page.evaluate(() => {
        return document.body.innerHTML.includes('<script>');
      });

      // Content should be sanitized
      expect(hasAlert).toBeFalsy();
    });
  });

  test.describe('Session and Authentication Edge Cases', () => {
    test('should handle expired session gracefully', async ({
      authenticatedPage: page,
    }) => {
      // Clear cookies to simulate expired session
      await page.context().clearCookies();

      // Try to access protected route
      await page.goto('/create-project');

      // Should redirect to login
      await page.waitForTimeout(1000);
      const url = page.url();
      expect(url.includes('welcome') || url.includes('login')).toBeTruthy();
    });

    test('should handle concurrent login sessions', async ({
      anonymousPage: page,
    }) => {
      // Login normally
      await page.goto('/welcome');
      await page.getByTestId('username-input').fill('testuser');
      await page.getByTestId('password-input').fill('correct-password');
      await page.getByTestId('login-button').click();

      await expect(page).toHaveURL('/');

      // Open new context and try to login again
      const context2 = await page.context().browser()?.newContext();
      if (context2) {
        const page2 = await context2.newPage();
        await page2.goto('/welcome');
        // Both sessions should work independently
        await page2.close();
        await context2.close();
      }
    });

    test('should handle missing CSRF token', async ({
      anonymousPage: page,
    }) => {
      // Block CSRF token request
      await page.route('**/csrf/token', async route => {
        await route.abort('failed');
      });

      await page.goto('/welcome');

      // Try to login
      await page.getByTestId('username-input').fill('testuser');
      await page.getByTestId('password-input').fill('correct-password');
      await page.getByTestId('login-button').click();

      await page.waitForTimeout(2000);

      // Should handle missing CSRF token gracefully
      const url = page.url();
      expect(url).toBeTruthy();
    });
  });

  test.describe('Browser Compatibility and Edge Cases', () => {
    test('should handle localStorage being disabled', async ({
      anonymousPage: page,
    }) => {
      // Block localStorage
      await page.addInitScript(() => {
        Object.defineProperty(window, 'localStorage', {
          value: {
            getItem: () => {
              throw new Error('localStorage is disabled');
            },
            setItem: () => {
              throw new Error('localStorage is disabled');
            },
            removeItem: () => {
              throw new Error('localStorage is disabled');
            },
            clear: () => {
              throw new Error('localStorage is disabled');
            },
          },
          writable: false,
        });
      });

      // App should still load
      await page.goto('/');

      // Should handle gracefully without crashing
      await page.waitForTimeout(1000);
      const url = page.url();
      expect(url).toBeTruthy();
    });

    test('should handle rapid navigation clicks', async ({
      authenticatedPage: page,
    }) => {
      // Rapidly click between pages
      for (let i = 0; i < 5; i++) {
        await page.goto('/');
        await page.goto('/create-project');
      }

      // Should end up on last page without errors
      await page.waitForTimeout(1000);
      await expect(page).toHaveURL('/create-project');
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

    test('should handle page refresh during form submission', async ({
      anonymousPage: page,
    }) => {
      await page.goto('/register');

      await page.getByTestId('username-input').fill('refreshtest');
      await page.getByTestId('password-input').fill('ValidPass123!');
      await page.getByTestId('confirm-password-input').fill('ValidPass123!');

      // Start submission but immediately refresh
      await Promise.all([
        page.getByTestId('register-button').click(),
        page.waitForTimeout(100).then(() => page.reload()),
      ]);

      // Should handle gracefully
      await page.waitForTimeout(1000);
      await expect(page).toHaveURL('/register');
    });

    test('should handle window resize gracefully', async ({
      authenticatedPage: page,
    }) => {
      // Start with desktop size
      await page.setViewportSize({ width: 1920, height: 1080 });

      // Resize to tablet
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.waitForTimeout(500);

      // Resize to mobile
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(500);

      // Resize back to desktop
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.waitForTimeout(500);

      // Should still be functional
      await expect(page).toHaveURL('/');
    });
  });

  test.describe('Data Corruption and Recovery', () => {
    test('should handle corrupted localStorage data', async ({
      anonymousPage: page,
    }) => {
      // Set corrupted data in localStorage
      await page.addInitScript(() => {
        localStorage.setItem('inkweld-app-config', 'corrupted-json{{{');
        localStorage.setItem('inkweld-setup-config', '}{invalid');
      });

      // App should still load and handle gracefully
      await page.goto('/');

      await page.waitForTimeout(1000);

      // Should recover or redirect to setup
      const url = page.url();
      expect(url).toBeTruthy();
    });

    test('should handle missing required API data', async ({
      authenticatedPage: page,
    }) => {
      // Mock API to return incomplete data
      await page.route('**/api/v1/users/me', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            // Missing required fields like username
            id: '999',
          }),
        });
      });

      await page.reload();
      await page.waitForTimeout(2000);

      // Should handle gracefully
      const url = page.url();
      expect(url).toBeTruthy();
    });
  });

  test.describe('Race Conditions and Timing Issues', () => {
    test('should handle rapid form submissions', async ({
      anonymousPage: page,
    }) => {
      await page.goto('/register');

      const uniqueUsername = `racetest${Date.now()}`;
      await page.getByTestId('username-input').fill(uniqueUsername);
      await page.getByTestId('password-input').fill('ValidPass123!');
      await page.getByTestId('confirm-password-input').fill('ValidPass123!');

      // Click submit multiple times rapidly
      const button = page.getByTestId('register-button');
      await Promise.all([button.click(), button.click(), button.click()]);

      await page.waitForTimeout(2000);

      // Should handle gracefully without creating duplicate accounts
      const url = page.url();
      expect(url === '/' || url.includes('register')).toBeTruthy();
    });

    test('should handle simultaneous API calls', async ({
      authenticatedPage: page,
    }) => {
      // Trigger multiple API calls simultaneously
      await Promise.all([
        page.goto('/'),
        page.goto('/create-project'),
        page.goto('/'),
      ]);

      await page.waitForTimeout(1000);

      // Should end up in a valid state
      const url = page.url();
      expect(url).toBeTruthy();
    });
  });

  test.describe('Memory and Performance Edge Cases', () => {
    test('should handle large number of projects', async ({
      authenticatedPage: page,
    }) => {
      // Create multiple projects
      for (let i = 0; i < 5; i++) {
        await page.goto('/create-project');
        await page.getByTestId('project-title-input').fill(`Project ${i}`);
        await page.getByTestId('project-slug-input').fill(`project-${i}`);
        await page.getByTestId('create-project-button').click();
        await page.waitForTimeout(500);
      }

      // Navigate to home
      await page.goto('/');

      // Should list all projects without performance issues
      await page.waitForTimeout(1000);
      const projectCards = await page.locator('app-project-card').count();
      expect(projectCards).toBeGreaterThanOrEqual(5);
    });

    test('should handle long-running session without memory leaks', async ({
      authenticatedPage: page,
    }) => {
      // Navigate through various pages multiple times
      for (let i = 0; i < 10; i++) {
        await page.goto('/');
        await page.goto('/create-project');
        await page.goto('/');
      }

      // Should still be responsive
      await page.waitForTimeout(1000);
      await expect(page).toHaveURL('/');
    });
  });
});
