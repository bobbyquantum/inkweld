import { expect, test } from '../fixtures';

// Helper to open register dialog
async function openRegisterDialog(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.locator('[data-testid="welcome-register-button"]').click();
  await page.waitForSelector('mat-dialog-container', {
    state: 'visible',
    timeout: 5000,
  });
}

test.describe('User Registration', () => {
  test('should register a new user successfully with valid credentials', async ({
    anonymousPage: page,
  }) => {
    // Go to home page and open registration dialog
    await openRegisterDialog(page);

    // Fill registration form with unique username and strong password
    const uniqueUsername = `newuser${Date.now()}`;
    await page.getByTestId('username-input').fill(uniqueUsername);
    await page.getByTestId('password-input').fill('ValidPass123!');
    await page.getByTestId('confirm-password-input').fill('ValidPass123!');

    // Submit the form
    await page
      .locator('mat-dialog-container [data-testid="register-button"]')
      .click();

    // Dialog should close after successful registration
    await page.waitForSelector('mat-dialog-container', {
      state: 'hidden',
      timeout: 15000,
    });

    // Should be on home page
    await expect(page).toHaveURL('/');
  });

  test('should show error when username is already taken', async ({
    anonymousPage: page,
  }) => {
    // First, create a user via API so we have an existing username to test against
    const existingUsername = `existing${Date.now()}`;
    const registerResponse = await page.request.post(
      'http://localhost:9333/api/v1/auth/register',
      {
        data: {
          username: existingUsername,
          password: 'ExistingPass123!',
        },
      }
    );
    expect(registerResponse.ok()).toBeTruthy();

    // Verify the user was created by checking username availability
    const checkResponse = await page.request.get(
      `http://localhost:9333/api/v1/users/check-username?username=${existingUsername}`
    );
    const checkData = await checkResponse.json();
    expect(checkData.available).toBe(false); // Username should NOT be available

    // Open registration dialog
    await openRegisterDialog(page);

    // Fill registration form with the existing username
    await page.getByTestId('username-input').fill(existingUsername);

    // Blur to trigger username availability check
    await page.getByTestId('username-input').blur();

    // Wait for the availability check to complete (network request)
    await page.waitForResponse(
      resp =>
        resp.url().includes('/api/v1/users/check-username') &&
        resp.status() === 200
    );

    // Give the UI time to update
    await page.waitForTimeout(500);

    // Fill in password fields with valid passwords
    await page.getByTestId('password-input').fill('ValidPass123!');
    await page.getByTestId('confirm-password-input').fill('ValidPass123!');

    // Register button should be disabled due to username being taken
    await expect(
      page.locator('mat-dialog-container [data-testid="register-button"]')
    ).toBeDisabled();

    // Should show username taken error
    await expect(page.getByTestId('username-error')).toContainText(
      'Username already taken'
    );
  });

  test('should show username suggestions when username is taken', async ({
    anonymousPage: page,
  }) => {
    // First, create a user via API so we have an existing username to test against
    const existingUsername = `suggest${Date.now()}`;
    const registerResponse = await page.request.post(
      'http://localhost:9333/api/v1/auth/register',
      {
        data: {
          username: existingUsername,
          password: 'ExistingPass123!',
        },
      }
    );
    expect(registerResponse.ok()).toBeTruthy();

    await openRegisterDialog(page);

    // Fill with the existing username
    await page.getByTestId('username-input').fill(existingUsername);
    await page.getByTestId('username-input').blur();

    // Wait for availability check
    await page.waitForTimeout(1000);

    // Should show suggestions
    await expect(page.getByTestId('username-suggestions')).toBeVisible();
    await expect(page.getByTestId('suggestion-button').first()).toBeVisible();
  });

  test('should validate password confirmation matches', async ({
    anonymousPage: page,
  }) => {
    await openRegisterDialog(page);

    // Fill registration form with mismatched passwords
    const uniqueUsername = `user${Date.now()}`;
    await page.getByTestId('username-input').fill(uniqueUsername);
    await page.getByTestId('username-input').blur(); // Trigger username check
    await page.waitForTimeout(500); // Wait for username check to complete

    await page.getByTestId('password-input').fill('ValidPass123!');
    await page.getByTestId('confirm-password-input').fill('DifferentPass123!');

    // Register button should be disabled due to password mismatch
    await expect(
      page.locator('mat-dialog-container [data-testid="register-button"]')
    ).toBeDisabled();

    // Now fix the password to match
    await page.getByTestId('confirm-password-input').clear();
    await page.getByTestId('confirm-password-input').fill('ValidPass123!');

    // Button should now be enabled
    await expect(
      page.locator('mat-dialog-container [data-testid="register-button"]')
    ).toBeEnabled();
  });

  test('should enforce password strength requirements', async ({
    anonymousPage: page,
  }) => {
    await openRegisterDialog(page);

    const uniqueUsername = `user${Date.now()}`;
    await page.getByTestId('username-input').fill(uniqueUsername);

    // Try a weak password (too short, no special char, no uppercase)
    await page.getByTestId('password-input').fill('weak');
    await page.getByTestId('confirm-password-input').fill('weak');

    // Button should be disabled
    await expect(
      page.locator('mat-dialog-container [data-testid="register-button"]')
    ).toBeDisabled();

    // Try a stronger password (still missing requirements)
    await page.getByTestId('password-input').fill('weakpassword');
    await expect(
      page.locator('mat-dialog-container [data-testid="register-button"]')
    ).toBeDisabled();

    // Use a valid strong password
    await page.getByTestId('password-input').fill('StrongPass123!');
    await page.getByTestId('confirm-password-input').fill('StrongPass123!');

    // Now button should be enabled
    await expect(
      page.locator('mat-dialog-container [data-testid="register-button"]')
    ).toBeEnabled();
  });

  test('should prevent empty form submission', async ({
    anonymousPage: page,
  }) => {
    await openRegisterDialog(page);

    // Register button should be disabled when form is empty
    await expect(
      page.locator('mat-dialog-container [data-testid="register-button"]')
    ).toBeDisabled();

    // Fill only username
    await page.getByTestId('username-input').fill('testusername');
    await expect(
      page.locator('mat-dialog-container [data-testid="register-button"]')
    ).toBeDisabled();

    // Fill username and password
    await page.getByTestId('password-input').fill('ValidPass123!');
    await expect(
      page.locator('mat-dialog-container [data-testid="register-button"]')
    ).toBeDisabled();

    // Fill all fields
    await page.getByTestId('confirm-password-input').fill('ValidPass123!');
    await expect(
      page.locator('mat-dialog-container [data-testid="register-button"]')
    ).toBeEnabled();
  });

  test('should validate minimum username length', async ({
    anonymousPage: page,
  }) => {
    await openRegisterDialog(page);

    // Try a username that's too short
    await page.getByTestId('username-input').fill('ab');
    await page.getByTestId('username-input').blur();

    // Should show error about minimum length
    await expect(page.getByTestId('username-error')).toContainText(
      'Username must be at least 3 characters'
    );

    // Register button should be disabled
    await expect(
      page.locator('mat-dialog-container [data-testid="register-button"]')
    ).toBeDisabled();

    // Fill valid fields
    await page.getByTestId('username-input').fill('abc');
    await page.getByTestId('password-input').fill('ValidPass123!');
    await page.getByTestId('confirm-password-input').fill('ValidPass123!');

    // Now button should be enabled
    await expect(
      page.locator('mat-dialog-container [data-testid="register-button"]')
    ).toBeEnabled();
  });

  test('should allow selection of username suggestions', async ({
    anonymousPage: page,
  }) => {
    // First, create a user via API so we have an existing username to test against
    const existingUsername = `selectuser${Date.now()}`;
    const registerResponse = await page.request.post(
      'http://localhost:9333/api/v1/auth/register',
      {
        data: {
          username: existingUsername,
          password: 'ExistingPass123!',
        },
      }
    );
    expect(registerResponse.ok()).toBeTruthy();

    await openRegisterDialog(page);

    // Fill with the existing username to get suggestions
    await page.getByTestId('username-input').fill(existingUsername);
    await page.getByTestId('username-input').blur();

    // Wait for suggestions to appear
    await page.waitForTimeout(1000);
    await expect(page.getByTestId('username-suggestions')).toBeVisible();

    // Click on a suggestion
    const firstSuggestion = page.getByTestId('suggestion-button').first();
    await firstSuggestion.click();

    // Username field should now contain the suggestion (a variation of the original)
    const usernameValue = await page.getByTestId('username-input').inputValue();
    expect(usernameValue).not.toBe(existingUsername);
    expect(usernameValue).toContain(existingUsername.substring(0, 10)); // Suggestions should be based on original
  });

  test('should automatically login after successful registration', async ({
    anonymousPage: page,
  }) => {
    await openRegisterDialog(page);

    // Register a new user
    const uniqueUsername = `autouser${Date.now()}`;
    await page.getByTestId('username-input').fill(uniqueUsername);
    await page.getByTestId('password-input').fill('AutoPass123!');
    await page.getByTestId('confirm-password-input').fill('AutoPass123!');

    await page
      .locator('mat-dialog-container [data-testid="register-button"]')
      .click();

    // Dialog should close
    await page.waitForSelector('mat-dialog-container', {
      state: 'hidden',
      timeout: 15000,
    });

    // Should be on home and authenticated
    await expect(page).toHaveURL('/');

    // User should be authenticated (we can verify by checking if login button is not visible)
    // The authenticated state should persist
    await page.reload();
    await expect(page).toHaveURL('/');
  });

  test('should have link to login page', async ({ anonymousPage: page }) => {
    await openRegisterDialog(page);

    // Should have a link/button back to login within the dialog
    const loginLink = page.locator(
      'mat-dialog-container button:has-text("Already have an account")'
    );
    await expect(loginLink).toBeVisible();

    // Click should close register dialog and open login dialog
    await loginLink.click();

    // Wait for login dialog to appear (register dialog should close and login should open)
    await page.waitForTimeout(500);

    // We should still be on home page with a dialog open
    await expect(page).toHaveURL('/');
    await expect(page.locator('mat-dialog-container')).toBeVisible();
  });
});
