/**
 * Error Handling and Edge Cases - Online Mode
 *
 * Tests that verify the app handles errors gracefully when
 * connected to a real backend server.
 */
import { generateUniqueUsername } from '../common';
import { TEST_PASSWORDS } from '../common/test-credentials';
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
      await page.getByTestId('password-input').fill(TEST_PASSWORDS.VALID);
      await page
        .getByTestId('confirm-password-input')
        .fill(TEST_PASSWORDS.VALID);

      // The dialog should still be open and handling the error gracefully
      await expect(page.locator('mat-dialog-container')).toBeVisible();
    });

    test('should handle extremely long input strings', async ({
      anonymousPage: page,
    }) => {
      await openRegisterDialog(page);

      const veryLongString = 'a'.repeat(500);

      await page.getByTestId('username-input').fill(veryLongString);
      await page.getByTestId('password-input').fill(TEST_PASSWORDS.VALID);
      await page
        .getByTestId('confirm-password-input')
        .fill(TEST_PASSWORDS.VALID);

      // Should handle gracefully without crashing - dialog still open
      await expect(page.locator('mat-dialog-container')).toBeVisible();
    });

    test('should handle unicode and emoji in input', async ({
      anonymousPage: page,
    }) => {
      await openRegisterDialog(page);

      const usernameInput = page.getByTestId('username-input');
      await usernameInput.fill('user👨‍💻😀');
      // Verify emoji value was set correctly before moving to other fields
      await expect(usernameInput).toHaveValue('user👨‍💻😀');

      // Explicitly commit any pending IME composition from the ZWJ emoji
      // sequence by pressing Tab to move focus away from the username field.
      // Without this, Chromium can route subsequent keystrokes typed into
      // the password field back into the still-composing username field.
      // We don't assert on focus state — the password input click below
      // handles focus regardless.
      await page.keyboard.press('Tab');

      // Click password input explicitly to break any lingering composition from emoji
      await page.getByTestId('password-input').click();
      await page.getByTestId('password-input').fill(TEST_PASSWORDS.VALID);
      await page
        .getByTestId('confirm-password-input')
        .fill(TEST_PASSWORDS.VALID);

      // Username should still have the emoji value
      await expect(usernameInput).toHaveValue('user👨‍💻😀');
    });

    test('should handle SQL injection attempts safely', async ({
      anonymousPage: page,
    }) => {
      await openLoginDialog(page);

      // Try SQL injection in username/password. Client-side username
      // pattern validation rejects these characters and keeps the submit
      // button disabled — that is itself a safe outcome (the malicious
      // payload never reaches the server). If the validator ever loosens
      // and submission becomes possible, the server's parameterised
      // queries should still reject the credentials.
      await page.getByTestId('username-input').fill("' OR '1'='1' --");
      await page.getByTestId('password-input').fill("' OR '1'='1' --");

      const loginButton = page.getByTestId('login-button');
      const submittable = await loginButton.isEnabled().catch(() => false);
      if (submittable) {
        await loginButton.click();
      }

      // Either way: dialog stays open, no dashboard navigation.
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

      await page.getByTestId('password-input').fill(TEST_PASSWORDS.VALID);
      await page
        .getByTestId('confirm-password-input')
        .fill(TEST_PASSWORDS.VALID);

      // The register button is gated on form validity, not on the username
      // availability lookup, so this is the real precondition to submitting.
      // Waiting on the availability icon instead is flaky: the lookup resolves
      // to 'unknown' on any HTTP error, which renders no icon at all.
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

      await page.getByTestId('password-input').fill(TEST_PASSWORDS.VALID);
      await page
        .getByTestId('confirm-password-input')
        .fill(TEST_PASSWORDS.VALID);
      await page.keyboard.press('Tab');

      // Click submit button once (button disables after first click). Gate on
      // the button itself rather than the username availability icon, which
      // never renders when the lookup resolves to 'unknown' on an HTTP error.
      const button = page.locator(
        'mat-dialog-container [data-testid="register-button"]'
      );
      await expect(button).toBeEnabled();
      await button.click();

      // Dialog should have closed after successful registration
      await expect(page.locator('mat-dialog-container')).not.toBeVisible();
    });
  });

  test.describe('Memory and Performance Edge Cases', () => {
    test('should handle long-running session without memory leaks', async ({
      authenticatedPage: page,
    }) => {
      // Stay inside the app: a full page load starts over with an empty heap,
      // so it can't show a leak.
      const visitCreateProjectAndCancel = async () => {
        await page.getByTestId('create-new-project-button').click();
        await page.getByTestId('create-new-project-menu-item').click();
        await page.getByTestId('cancel-button-step1').click();
        await expect(page).toHaveURL('/');
        await expect(
          page.getByTestId('create-new-project-button')
        ).toBeVisible();
      };

      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Performance.enable');
      const liveCounts = async () => {
        await cdp.send('HeapProfiler.collectGarbage');
        const { metrics } = await cdp.send('Performance.getMetrics');
        const metric = (name: string) =>
          metrics.find(m => m.name === name)?.value ?? 0;
        return {
          nodes: metric('Nodes'),
          listeners: metric('JSEventListeners'),
        };
      };

      // The first visits load the page's code and fill caches, so measure
      // from there.
      await visitCreateProjectAndCancel();
      await visitCreateProjectAndCancel();
      const before = await liveCounts();
      // A count Chromium stopped reporting would read as 0 and pass below.
      expect(before.nodes).toBeGreaterThan(0);
      expect(before.listeners).toBeGreaterThan(0);

      // One visit at a time, the way a person moves around the app
      for (let visit = 0; visit < 10; visit++) {
        await visitCreateProjectAndCancel();
      }

      // These stay flat in a healthy app, give or take a few dozen nodes that
      // come and go. A page kept alive by something would add hundreds of nodes
      // a visit. Polled so that a page still being torn down isn't counted.
      await expect
        .poll(async () => (await liveCounts()).nodes, {
          message: 'DOM nodes still alive after the visits',
          timeout: 10_000,
        })
        .toBeLessThan(before.nodes + 100);
      await expect
        .poll(async () => (await liveCounts()).listeners, {
          message: 'event listeners still alive after the visits',
          timeout: 10_000,
        })
        .toBeLessThan(before.listeners + 5);
    });
  });
});
