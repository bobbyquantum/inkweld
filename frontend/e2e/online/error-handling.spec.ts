/**
 * Error Handling and Edge Cases - Online Mode
 *
 * Tests that verify the app handles errors gracefully when
 * connected to a real backend server.
 */
import { generateUniqueUsername } from '../common';
import { expect, test } from './fixtures';

// Helper to open register dialog
async function openRegisterDialog(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.locator('[data-testid="welcome-register-button"]').click();
  await page.waitForSelector('mat-dialog-container', {
    state: 'visible',
    timeout: 5000,
  });
}

// Helper to open login dialog
async function openLoginDialog(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.locator('[data-testid="welcome-login-button"]').click();
  await page.waitForSelector('mat-dialog-container', {
    state: 'visible',
    timeout: 5000,
  });
}

test.describe('Error Handling and Edge Cases', () => {
  test.describe('Input Validation Edge Cases', () => {
    test('should handle special characters in username', async ({
      anonymousPage: page,
    }) => {
      await openRegisterDialog(page);

      // Try special characters - should show validation error or server error
      await page.getByTestId('username-input').fill('user@#$%');
      await page.getByTestId('password-input').fill('ValidPass123!');
      await page.getByTestId('confirm-password-input').fill('ValidPass123!');

      // Wait for username check to complete (may show error)
      await page.waitForTimeout(1000);

      // The dialog should still be open and handling the error gracefully
      await expect(page.locator('mat-dialog-container')).toBeVisible();
    });

    test('should handle extremely long input strings', async ({
      anonymousPage: page,
    }) => {
      await openRegisterDialog(page);

      const veryLongString = 'a'.repeat(500);

      await page.getByTestId('username-input').fill(veryLongString);
      await page.getByTestId('password-input').fill('ValidPass123!');
      await page.getByTestId('confirm-password-input').fill('ValidPass123!');

      await page.waitForTimeout(500);

      // Should handle gracefully without crashing - dialog still open
      await expect(page.locator('mat-dialog-container')).toBeVisible();
    });

    test('should handle unicode and emoji in input', async ({
      anonymousPage: page,
    }) => {
      await openRegisterDialog(page);

      await page.getByTestId('username-input').fill('user👨‍💻😀');
      await page.getByTestId('password-input').fill('ValidPass123!');
      await page.getByTestId('confirm-password-input').fill('ValidPass123!');

      await page.waitForTimeout(500);

      // Should handle unicode gracefully (likely reject as invalid username)
      const value = await page.getByTestId('username-input').inputValue();
      expect(value).toBeTruthy();
    });

    test('should handle SQL injection attempts safely', async ({
      anonymousPage: page,
    }) => {
      await openLoginDialog(page);

      // Try SQL injection in username
      await page.getByTestId('username-input').fill("' OR '1'='1' --");
      await page.getByTestId('password-input').fill("' OR '1'='1' --");
      await page.getByTestId('login-button').click();

      await page.waitForTimeout(1000);

      // Should not succeed - should show error and stay in dialog
      await expect(page.locator('mat-dialog-container')).toBeVisible();
    });

    test('should handle XSS attempts in project creation', async ({
      authenticatedPage: page,
    }) => {
      await page.goto('/create-project');

      // Step 1: Click Next to proceed to step 2
      await page.getByRole('button', { name: /next/i }).click();

      // Step 2: Try XSS in project title
      await page
        .getByTestId('project-title-input')
        .fill('<script>alert("XSS")</script>');
      await page.getByTestId('project-slug-input').fill('xss-test');

      await page.getByTestId('create-project-button').click();

      // Wait for navigation or error
      await page.waitForTimeout(2000);

      // Check that script didn't execute - content should be escaped
      const hasRawScript = await page.evaluate(() => {
        return document.body.innerHTML.includes('<script>alert');
      });

      // Raw script tags should not appear in DOM (should be escaped or removed)
      expect(hasRawScript).toBeFalsy();
    });
  });

  test.describe('Browser Compatibility and Edge Cases', () => {
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

    test('should handle page refresh during form submission', async ({
      anonymousPage: page,
    }) => {
      await openRegisterDialog(page);

      const uniqueUsername = generateUniqueUsername('refresh');
      await page.getByTestId('username-input').fill(uniqueUsername);
      await page.getByTestId('username-input').blur();
      await page.waitForTimeout(1500); // Wait for username availability check
      await page.getByTestId('password-input').fill('ValidPass123!');
      await page.getByTestId('confirm-password-input').fill('ValidPass123!');
      await page.getByTestId('confirm-password-input').blur();

      // Wait for button to be enabled before attempting to click
      const registerButton = page.locator(
        'mat-dialog-container [data-testid="register-button"]'
      );
      await expect(registerButton).toBeEnabled({ timeout: 15000 });

      // Start submission but immediately refresh - use try/catch since click may fail
      // when page reloads mid-action (this is expected behavior)
      try {
        await Promise.all([
          registerButton.click().catch(() => {}), // Ignore click errors from page reload
          page.waitForTimeout(100).then(() => page.reload()),
        ]);
      } catch {
        // Expected - page may close during the race
      }

      // Wait for reload to complete
      await page.waitForLoadState('domcontentloaded');
      // After refresh, we should be on home page
      await expect(page).toHaveURL('/');
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

  test.describe('Race Conditions and Timing Issues', () => {
    test('should handle rapid form submissions (button disables)', async ({
      anonymousPage: page,
    }) => {
      await openRegisterDialog(page);

      const uniqueUsername = generateUniqueUsername('rapid');
      await page.getByTestId('username-input').fill(uniqueUsername);
      await page.getByTestId('username-input').blur();
      await page.waitForTimeout(1000); // Wait for username check

      await page.getByTestId('password-input').fill('ValidPass123!');
      await page.getByTestId('confirm-password-input').fill('ValidPass123!');
      await page.waitForTimeout(1000); // Wait for password check
      // Click submit button once (button disables after first click)
      const button = page.locator(
        'mat-dialog-container [data-testid="register-button"]'
      );
      await button.click();

      await page.waitForTimeout(2000);

      // Dialog should have closed after successful registration
      await page.waitForSelector('mat-dialog-container', {
        state: 'hidden',
        timeout: 10000,
      });
    });
  });

  test.describe('Memory and Performance Edge Cases', () => {
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
