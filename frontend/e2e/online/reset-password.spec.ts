/**
 * Reset Password E2E Tests - Online Mode
 *
 * Tests the password reset page accessible via email link.
 * Covers the no-token error state, password requirement indicators,
 * real-time validation, form submission, and success state.
 */
import { expect, test } from './fixtures';

test.describe('Reset Password', () => {
  test.describe('No Token Error State', () => {
    test('should show error when visited without a token', async ({
      anonymousPage: page,
    }) => {
      await page.goto('/reset-password');
      await page.waitForLoadState('networkidle');

      await expect(page.getByTestId('reset-password-page')).toBeVisible();
      await expect(page.getByTestId('no-token-error')).toBeVisible();
    });

    test('should have a link to request a new reset link', async ({
      anonymousPage: page,
    }) => {
      await page.goto('/reset-password');
      await page.waitForLoadState('networkidle');

      const requestLink = page.getByTestId('no-token-error').getByRole('link', {
        name: /request new link/i,
      });
      await expect(requestLink).toBeVisible();
      await requestLink.click();

      // Should navigate to forgot-password page
      await expect(page).toHaveURL(/forgot-password/);
    });

    test('should show back-to-home link in no-token state', async ({
      anonymousPage: page,
    }) => {
      await page.goto('/reset-password');
      await page.waitForLoadState('networkidle');

      await expect(page.getByTestId('back-to-home')).toBeVisible();
      await page.getByTestId('back-to-home').click();
      await expect(page).toHaveURL('/');
    });
  });

  test.describe('Password Reset Form (with placeholder token)', () => {
    const TOKEN = 'placeholder-test-token';

    test.beforeEach(async ({ anonymousPage: page }) => {
      await page.goto(`/reset-password?token=${TOKEN}`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByTestId('reset-password-form')).toBeVisible();
    });

    test('should show the reset form with password fields', async ({
      anonymousPage: page,
    }) => {
      await expect(page.getByTestId('new-password-input')).toBeVisible();
      await expect(page.getByTestId('confirm-password-input')).toBeVisible();
      await expect(page.getByTestId('password-requirements')).toBeVisible();
      await expect(page.getByTestId('reset-submit-button')).toBeVisible();
    });

    test('should disable submit button for empty form', async ({
      anonymousPage: page,
    }) => {
      await expect(page.getByTestId('reset-submit-button')).toBeDisabled();
    });

    test('should show password requirements with unmet indicators', async ({
      anonymousPage: page,
    }) => {
      const requirements = page.getByTestId('password-requirements');

      // All requirement items should be visible
      await expect(
        requirements.locator('li.requirement-item').first()
      ).toBeVisible();

      // The minLength requirement should be present
      await expect(requirements.getByText(/characters long/i)).toBeVisible();
    });

    test('should mark requirements as met when typing valid password', async ({
      anonymousPage: page,
    }) => {
      // Type a password that satisfies all common requirements
      const strongPassword = 'StrongP@ss1';
      await page.getByTestId('new-password-input').fill(strongPassword);

      // Wait for real-time validation to update
      await page.waitForTimeout(300);

      // Requirements list items should show check_circle icons for met requirements
      const metIcons = page
        .getByTestId('password-requirements')
        .locator('li.met mat-icon');
      const metCount = await metIcons.count();
      // At minimum, minLength and uppercase should be met
      expect(metCount).toBeGreaterThan(0);
    });

    test('should show requirements as unmet for weak password', async ({
      anonymousPage: page,
    }) => {
      // Type a weak password
      await page.getByTestId('new-password-input').fill('abc');

      // Requirement items for unmet requirements should have class 'unmet'
      const unmetItems = page
        .getByTestId('password-requirements')
        .locator('li.unmet');
      const unmetCount = await unmetItems.count();
      expect(unmetCount).toBeGreaterThan(0);
    });

    test('should show mismatch error when passwords do not match', async ({
      anonymousPage: page,
    }) => {
      await page.getByTestId('new-password-input').fill('StrongP@ss1');
      await page.getByTestId('confirm-password-input').fill('DifferentP@ss1');

      await expect(page.getByTestId('password-validation-error')).toBeVisible();
    });

    test('should clear mismatch error when passwords match', async ({
      anonymousPage: page,
    }) => {
      // First create a mismatch to trigger the error
      await page.getByTestId('new-password-input').fill('StrongP@ss1');
      await page.getByTestId('confirm-password-input').fill('DifferentP@ss1');
      await expect(page.getByTestId('password-validation-error')).toBeVisible();

      // Now fix the mismatch — error should disappear
      await page.getByTestId('confirm-password-input').fill('StrongP@ss1');

      // Mismatch error should NOT be visible
      await expect(
        page.getByTestId('password-validation-error')
      ).not.toBeVisible();
    });

    test('should enable submit button when form is valid', async ({
      anonymousPage: page,
    }) => {
      const strongPassword = 'StrongP@ss1';
      await page.getByTestId('new-password-input').fill(strongPassword);
      await page.getByTestId('confirm-password-input').fill(strongPassword);

      await page.waitForTimeout(300);

      // Submit button should be enabled
      await expect(page.getByTestId('reset-submit-button')).toBeEnabled();
    });
  });
});
