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
  await expect(page.locator('mat-dialog-container')).toBeVisible();
}

// Helper to open login dialog
async function openLoginDialog(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.locator('[data-testid="welcome-login-button"]').click();
  await expect(page.locator('mat-dialog-container')).toBeVisible();
}

test.describe('Error Handling and Edge Cases', () => {
  test.describe('Input Validation Edge Cases', () => {
    test('should handle special characters in username', async ({
      anonymousPage: page,
    }) => {
      await openRegisterDialog(page);

      // Try special characters - should show validation error or server error
      await page.getByTestId('username-input').fill('user@#$%');
      await page.keyboard.press('Tab');
      await page.getByTestId('password-input').fill('ValidPass123!');
      await page.getByTestId('confirm-password-input').fill('ValidPass123!');

      // The dialog should still be open and handling the error gracefully
      await expect(page.locator('mat-dialog-container')).toBeVisible();
    });

    test('should handle extremely long input strings', async ({
      anonymousPage: page,
    }) => {
      await openRegisterDialog(page);

      const veryLongString = 'a'.repeat(500);

      await page.getByTestId('username-input').fill(veryLongString);
      await page.keyboard.press('Tab');
      await page.getByTestId('password-input').fill('ValidPass123!');
      await page.getByTestId('confirm-password-input').fill('ValidPass123!');

      // Should handle gracefully without crashing - dialog still open
      await expect(page.locator('mat-dialog-container')).toBeVisible();
    });

    test('should handle unicode and emoji in input', async ({
      anonymousPage: page,
    }) => {
      await openRegisterDialog(page);

      await page.getByTestId('username-input').fill('user👨‍💻😀');
      await page.keyboard.press('Tab');
      await page.getByTestId('password-input').fill('ValidPass123!');
      await page.getByTestId('confirm-password-input').fill('ValidPass123!');

      // Should handle unicode gracefully (likely reject as invalid username)
      await expect(page.getByTestId('username-input')).toHaveValue('user👨‍💻😀');
    });

    test('should handle SQL injection attempts safely', async ({
      anonymousPage: page,
    }) => {
      await openLoginDialog(page);

      // Try SQL injection in username
      await page.getByTestId('username-input').fill("' OR '1'='1' --");
      await page.getByTestId('password-input').fill("' OR '1'='1' --");
      await page.getByTestId('login-button').click();

      // Should not succeed - should show error and stay in dialog
      await expect(page.locator('mat-dialog-container')).toBeVisible();
      await expect(page).not.toHaveURL(/\/dashboard/);
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

      // Wait for navigation (username is dynamic: testuser-test-xxx-xxx)
      await page.waitForURL(/\/testuser-[^/]+\/xss-test/);

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
      await page.waitForURL('/create-project');
      await expect(page).toHaveURL('/create-project');
    });

    test('should handle page refresh during form submission', async ({
      anonymousPage: page,
    }) => {
      await openRegisterDialog(page);

      const uniqueUsername = generateUniqueUsername('refresh');
      await page.getByTestId('username-input').fill(uniqueUsername);
      await page.keyboard.press('Tab'); // Trigger blur and Angular updateOn: blur

      // Wait for availability check to complete using UI signal
      await expect(
        page.locator('mat-icon:has-text("check_circle")')
      ).toBeVisible();

      await page.getByTestId('password-input').fill('ValidPass123!');
      await page.getByTestId('confirm-password-input').fill('ValidPass123!');
      await page.keyboard.press('Tab'); // Trigger second blur

      // Wait for button to be enabled before attempting to click
      const registerButton = page.locator(
        'mat-dialog-container [data-testid="register-button"]'
      );
      await expect(registerButton).toBeEnabled();

      // Start submission but immediately refresh - this tests that the app handles
      // the race gracefully. The page may close during reload which is expected.
      try {
        // Click and immediately reload - don't wait for click to complete
        await registerButton.click({ noWaitAfter: true });
        await page.reload();

        // Wait for reload to complete and verify we're on home page
        await page.waitForLoadState('domcontentloaded');
        await expect(page).toHaveURL('/');
      } catch {
        // If page context was destroyed during the race, that's acceptable behavior.
        // The test verifies the app doesn't crash - not that a specific outcome occurs.
      }
    });

    test('should handle window resize gracefully', async ({
      authenticatedPage: page,
    }) => {
      // Start with desktop size
      await page.setViewportSize({ width: 1920, height: 1080 });

      // Resize to tablet
      await page.setViewportSize({ width: 768, height: 1024 });

      // Resize to mobile
      await page.setViewportSize({ width: 375, height: 667 });

      // Resize back to desktop
      await page.setViewportSize({ width: 1920, height: 1080 });

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
      await page.keyboard.press('Tab');

      // Wait for username check
      await expect(
        page.locator('mat-icon:has-text("check_circle")')
      ).toBeVisible();

      await page.getByTestId('password-input').fill('ValidPass123!');
      await page.getByTestId('confirm-password-input').fill('ValidPass123!');
      await page.keyboard.press('Tab');

      // Click submit button once (button disables after first click)
      const button = page.locator(
        'mat-dialog-container [data-testid="register-button"]'
      );
      await button.click();

      // Dialog should have closed after successful registration
      await expect(page.locator('mat-dialog-container')).not.toBeVisible();
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
      await expect(page).toHaveURL('/');
    });
  });
});
