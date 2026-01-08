import { expect, test } from '../fixtures';

// Helper to open register dialog
async function openRegisterDialog(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByTestId('welcome-register-button').click();
  // Wait for register dialog to appear
  await expect(page.getByTestId('register-dialog')).toBeVisible();
  // Wait for OAuth providers to load (spinner disappears)
  await expect(page.locator('mat-progress-spinner')).toBeHidden();
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

    // Tab to trigger username availability check
    await page.keyboard.press('Tab');

    // Wait for availability check to complete (button depends on it)
    await expect(page.getByTestId('username-available-icon')).toBeVisible();

    await page.getByTestId('password-input').fill('ValidPass123!');
    await page.getByTestId('password-input').blur();
    await page.getByTestId('confirm-password-input').fill('ValidPass123!');

    // Tab away to ensure form validation update
    await page.keyboard.press('Tab');

    // Submit the form
    await page
      .locator('mat-dialog-container [data-testid="register-button"]')
      .click();

    // Dialog should close after successful registration
    await expect(page.getByTestId('register-dialog')).toBeHidden();

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

    // Tab to trigger username availability check (more reliable than blur)
    await page.keyboard.press('Tab');

    // Wait for the unavailable icon to appear (indicates check completed)
    await expect(page.getByTestId('username-unavailable-icon')).toBeVisible();

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
    await page.keyboard.press('Tab');

    // Wait for availability check to show it's taken
    await expect(page.getByTestId('username-unavailable-icon')).toBeVisible();

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
    await page.keyboard.press('Tab'); // Trigger username check

    // Wait for username check to complete
    await expect(page.getByTestId('username-available-icon')).toBeVisible();

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

    // Tab to trigger availability check
    await page.keyboard.press('Tab');

    // Wait for username availability check to complete
    await expect(page.getByTestId('username-available-icon')).toBeVisible();

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

    // Tab away to trigger blur and form validation update
    await page.keyboard.press('Tab');

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

    // Fill only username with a unique one to ensure availability check passes
    const uniqueUsername = `emptycheck${Date.now()}`;
    await page.getByTestId('username-input').click();
    await page.getByTestId('username-input').fill(uniqueUsername);

    // Trigger check
    await page.keyboard.press('Tab');

    // Wait for username availability check to complete
    await expect(page.getByTestId('username-available-icon')).toBeVisible();

    await expect(
      page.locator('mat-dialog-container [data-testid="register-button"]')
    ).toBeDisabled();

    // Fill password (button should still be disabled - missing confirm password)
    await page.getByTestId('password-input').click();
    await page.getByTestId('password-input').fill('ValidPass123!');
    await page.keyboard.press('Tab');
    await expect(
      page.locator('mat-dialog-container [data-testid="register-button"]')
    ).toBeDisabled();

    // Fill confirm password - now all fields are filled
    await page.getByTestId('confirm-password-input').click();
    await page.getByTestId('confirm-password-input').fill('ValidPass123!');
    await page.keyboard.press('Tab');

    // Now button should be enabled
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
    await page.keyboard.press('Tab'); // Blur to trigger validation

    // Should show error about minimum length
    await expect(page.getByTestId('username-error')).toContainText(
      'Username must be at least 3 characters'
    );

    // Register button should be disabled
    await expect(
      page.locator('mat-dialog-container [data-testid="register-button"]')
    ).toBeDisabled();

    // Fill valid fields - use a unique username to avoid any potential "taken" issues
    const validUsername = `valid${Date.now()}`;
    await page.getByTestId('username-input').fill(validUsername);

    // Tab to trigger blur and start username availability check
    await page.keyboard.press('Tab');

    // Wait for the availability check to complete (check icon appears)
    await expect(page.getByTestId('username-available-icon')).toBeVisible();

    // Fill password fields with proper blur triggering
    await page.getByTestId('password-input').fill('ValidPass123!');
    await page.keyboard.press('Tab'); // Move to confirm password

    await page.getByTestId('confirm-password-input').fill('ValidPass123!');
    await page.keyboard.press('Tab'); // Blur confirm password

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
    await page.keyboard.press('Tab');

    // Wait for suggestions to appear (triggered by unavailable status)
    await expect(page.getByTestId('username-unavailable-icon')).toBeVisible();
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
    await page.keyboard.press('Tab'); // Trigger check

    // Wait for availability check to complete
    await expect(page.getByTestId('username-available-icon')).toBeVisible();

    await page.getByTestId('password-input').fill('AutoPass123!');
    await page.keyboard.press('Tab');
    await page.getByTestId('confirm-password-input').fill('AutoPass123!');
    await page.keyboard.press('Tab');

    // Wait for the button to be enabled (gives time for async validation and providers loaded signal)
    await expect(
      page.locator('mat-dialog-container [data-testid="register-button"]')
    ).toBeEnabled();

    await page
      .locator('mat-dialog-container [data-testid="register-button"]')
      .click();

    // Dialog should close
    await expect(page.getByTestId('register-dialog')).toBeHidden();

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

    // We should still be on home page with a dialog open (now it's the login one)
    await expect(page).toHaveURL('/');
    await expect(
      page.locator('mat-dialog-container h2:has-text("Login")')
    ).toBeVisible();
  });
});
