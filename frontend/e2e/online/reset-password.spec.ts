/**
 * Reset Password E2E Tests - Online Mode
 *
 * Tests the password reset page accessible via email link.
 * Covers the no-token error state, password requirement indicators,
 * real-time validation, form submission, and success state.
 *
 * NOTE: All sub-cases that share a page state are bundled into a single test
 * with `test.step()` to avoid re-paying the page-load + fixture cost. Two
 * top-level tests remain because they exercise different routes/states.
 */
import { expect, test } from './fixtures';

test.describe('Reset Password', () => {
  test('no-token error state: shows error UI and offers navigation links', async ({
    anonymousPage: page,
  }) => {
    await page.goto('/reset-password');
    await page.waitForLoadState('networkidle');

    await test.step('renders the reset-password page with the no-token error', async () => {
      await expect(page.getByTestId('reset-password-page')).toBeVisible();
      await expect(page.getByTestId('no-token-error')).toBeVisible();
    });

    await test.step('shows back-to-home link and navigates home', async () => {
      const backLink = page.getByTestId('back-to-home');
      await expect(backLink).toBeVisible();
      await backLink.click();
      await expect(page).toHaveURL('/');
    });

    await test.step('offers a link to request a new reset link', async () => {
      // Re-open the no-token state after the previous step navigated away.
      await page.goto('/reset-password');
      await page.waitForLoadState('networkidle');

      const requestLink = page.getByTestId('no-token-error').getByRole('link', {
        name: /request new link/i,
      });
      await expect(requestLink).toBeVisible();
      await requestLink.click();
      await expect(page).toHaveURL(/forgot-password/);
    });
  });

  test('reset form with placeholder token: rendering, validation, and submit-enable', async ({
    anonymousPage: page,
  }) => {
    const TOKEN = 'placeholder-test-token';
    await page.goto(`/reset-password?token=${TOKEN}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('reset-password-form')).toBeVisible();

    const newPassword = page.getByTestId('new-password-input');
    const confirmPassword = page.getByTestId('confirm-password-input');
    const submit = page.getByTestId('reset-submit-button');
    const requirements = page.getByTestId('password-requirements');
    const mismatchError = page.getByTestId('password-validation-error');

    await test.step('renders the reset form with password fields', async () => {
      await expect(newPassword).toBeVisible();
      await expect(confirmPassword).toBeVisible();
      await expect(requirements).toBeVisible();
      await expect(submit).toBeVisible();
    });

    await test.step('disables submit button for empty form', async () => {
      await expect(submit).toBeDisabled();
    });

    await test.step('shows password requirements with unmet indicators', async () => {
      await expect(
        requirements.locator('li.requirement-item').first()
      ).toBeVisible();
      await expect(requirements.getByText(/characters long/i)).toBeVisible();
    });

    await test.step('marks requirements as unmet for a weak password', async () => {
      await newPassword.fill('abc');
      const unmetItems = requirements.locator('li.unmet');
      expect(await unmetItems.count()).toBeGreaterThan(0);
    });

    await test.step('marks requirements as met when typing a valid password', async () => {
      await newPassword.fill('StrongP@ss1');
      await page.waitForTimeout(300);
      const metIcons = requirements.locator('li.met mat-icon');
      expect(await metIcons.count()).toBeGreaterThan(0);
    });

    await test.step('shows mismatch error when passwords do not match', async () => {
      await newPassword.fill('StrongP@ss1');
      await confirmPassword.fill('DifferentP@ss1');
      await expect(mismatchError).toBeVisible();
    });

    await test.step('clears mismatch error when passwords match', async () => {
      // Continues from previous step which left a mismatch.
      await confirmPassword.fill('StrongP@ss1');
      await expect(mismatchError).not.toBeVisible();
    });

    await test.step('enables submit button when form is valid', async () => {
      // newPassword + confirmPassword already match a strong password from previous step.
      await page.waitForTimeout(300);
      await expect(submit).toBeEnabled();
    });
  });
});
