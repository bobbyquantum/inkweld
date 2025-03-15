import { expect, test } from '../fixtures';

test.describe('User Login', () => {
  test('should login successfully with valid credentials', async ({
    anonymousPage: page,
  }) => {
    // Go to welcome page where login is available
    await page.goto('/welcome');

    // Fill login form with valid credentials
    await page.fill('input[name="username"]', 'testuser');
    await page.fill('input[name="password"]', 'correct-password');

    // Submit the form
    await page.click('button[type="submit"]');

    // Should redirect to home after successful login
    await expect(page).toHaveURL('/');
  });

  test('should show error with invalid credentials', async ({
    anonymousPage: page,
  }) => {
    // Go to welcome page where login is available
    await page.goto('/welcome');

    // Fill login form with wrong password
    await page.fill('input[name="username"]', 'testuser');
    await page.fill('input[name="password"]', 'wrong-password');

    // Submit the form
    await page.click('button[type="submit"]');

    // Should show error message in snackbar
    await expect(page.locator('.mat-mdc-snack-bar-container')).toContainText(
      'Invalid username or password'
    );

    // Should still be on the welcome page
    await expect(page).toHaveURL('/welcome');
  });

  test('should show error with non-existent user', async ({
    anonymousPage: page,
  }) => {
    // Go to welcome page where login is available
    await page.goto('/welcome');

    // Fill login form with non-existent user
    await page.fill('input[name="username"]', 'nonexistent-user');
    await page.fill('input[name="password"]', 'correct-password');

    // Submit the form
    await page.click('button[type="submit"]');

    // Should show error message in snackbar
    await expect(page.locator('.mat-mdc-snack-bar-container')).toContainText(
      'Invalid username or password'
    );

    // Should still be on the welcome page
    await expect(page).toHaveURL('/welcome');
  });

  test('should prevent empty form submission', async ({
    anonymousPage: page,
  }) => {
    // Go to welcome page where login is available
    await page.goto('/welcome');

    // Submit empty form
    await page.click('button[type="submit"]');

    // Should show validation errors (could be form validation or snackbar)
    // Look for either native form validation or snackbar error
    await expect(
      page.locator('.mat-mdc-snack-bar-container, input:invalid')
    ).toBeVisible();

    // Should still be on the welcome page
    await expect(page).toHaveURL('/welcome');
  });

  test('should maintain authentication state after refresh', async ({
    anonymousPage: page,
  }) => {
    // Login on welcome page
    await page.goto('/welcome');
    await page.fill('input[name="username"]', 'testuser');
    await page.fill('input[name="password"]', 'correct-password');
    await page.click('button[type="submit"]');

    // Verify we're on home page
    await expect(page).toHaveURL('/');

    // Refresh page
    await page.reload();

    // Should still be authenticated and on home page
    await expect(page).toHaveURL('/');
  });
});
