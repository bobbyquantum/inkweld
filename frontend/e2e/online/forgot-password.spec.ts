/**
 * Forgot Password E2E Tests - Online Mode
 *
 * Tests the forgot password request form accessible to anonymous users.
 * Covers form validation, error states, and the success confirmation.
 */
import { expect, test } from './fixtures';

test.describe('Forgot Password', () => {
  test.describe('Page Rendering', () => {
    test('should render the forgot password page for anonymous users', async ({
      anonymousPage: page,
    }) => {
      await page.goto('/forgot-password');
      await page.waitForLoadState('networkidle');

      await expect(page.getByTestId('forgot-password-page')).toBeVisible();
      await expect(page.getByTestId('forgot-password-form')).toBeVisible();
      await expect(page.getByTestId('forgot-email-input')).toBeVisible();
      await expect(page.getByTestId('forgot-submit-button')).toBeVisible();
    });

    test('should show back-to-login link', async ({ anonymousPage: page }) => {
      await page.goto('/forgot-password');
      await page.waitForLoadState('networkidle');

      await expect(page.getByTestId('back-to-login')).toBeVisible();
    });
  });

  test.describe('Form Validation', () => {
    test('should disable submit button when email is empty', async ({
      anonymousPage: page,
    }) => {
      await page.goto('/forgot-password');
      await page.waitForLoadState('networkidle');

      // Submit button should be disabled with empty email
      await expect(page.getByTestId('forgot-submit-button')).toBeDisabled();
    });

    test('should enable submit button when email is filled', async ({
      anonymousPage: page,
    }) => {
      await page.goto('/forgot-password');
      await page.waitForLoadState('networkidle');

      await page.getByTestId('forgot-email-input').fill('user@example.com');
      await expect(page.getByTestId('forgot-submit-button')).toBeEnabled();
    });

    test('should show success after submitting valid email', async ({
      anonymousPage: page,
    }) => {
      await page.goto('/forgot-password');
      await page.waitForLoadState('networkidle');

      const email = 'user@example.com';
      await page.getByTestId('forgot-email-input').fill(email);

      // Click submit — the backend will respond even if email isn't configured;
      // the page should show the success state
      await page.getByTestId('forgot-submit-button').click();

      // The success message should appear: "Check Your Email"
      await expect(page.getByTestId('forgot-success')).toBeVisible();
      await expect(page.getByText(/check your email/i)).toBeVisible();
    });
  });

  test.describe('Navigation', () => {
    test('should navigate back to home page from the success state', async ({
      anonymousPage: page,
    }) => {
      await page.goto('/forgot-password');
      await page.waitForLoadState('networkidle');

      // Submit to get to success state
      await page.getByTestId('forgot-email-input').fill('navigate@test.com');
      await page.getByTestId('forgot-submit-button').click();
      await expect(page.getByTestId('forgot-success')).toBeVisible();

      // Click back to login/home
      await page.getByTestId('back-to-login').click();
      await expect(page).toHaveURL('/');
    });

    test('should navigate back to home from the form state', async ({
      anonymousPage: page,
    }) => {
      await page.goto('/forgot-password');
      await page.waitForLoadState('networkidle');

      await page.getByTestId('back-to-login').click();
      await expect(page).toHaveURL('/');
    });
  });
});
