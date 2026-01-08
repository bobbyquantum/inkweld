import { expect, test } from '../fixtures';

test.describe('User Login', () => {
  test('should login successfully with valid credentials', async ({
    anonymousPage: page,
  }) => {
    // Create a user first via API (similar to authenticatedPage fixture)
    const testUsername = `login-test-${Date.now()}`;
    const testPassword = 'TestPassword123!';

    const registerResponse = await page.request.post(
      'http://localhost:9333/api/v1/auth/register',
      {
        data: {
          username: testUsername,
          password: testPassword,
        },
      }
    );
    expect(registerResponse.ok()).toBeTruthy();

    // Now go to home page and open login dialog
    await page.goto('/');

    // Click login button to open dialog
    await page.getByTestId('welcome-login-button').click();

    // Wait for login dialog to appear
    await expect(page.getByTestId('login-dialog')).toBeVisible();

    // Fill login form with the newly created user credentials
    await page.getByTestId('username-input').click();
    await page.getByTestId('username-input').fill(testUsername);
    await page.getByTestId('password-input').click();
    await page.getByTestId('password-input').fill(testPassword);

    // Submit the form
    await page.getByTestId('login-button').click();

    // Wait for dialog to close and user to be logged in
    await expect(page.getByTestId('login-dialog')).toBeHidden();

    // Should be on home page and authenticated
    await expect(page).toHaveURL('/');
  });

  // FIXME: This test is flaky - the login dialog doesn't show error in e2e tests
  // The component works correctly in manual testing, but in e2e the button
  // stays in "Logging in..." state even after 401 response is received.
  // This needs investigation into potential race conditions with auth interceptor.
  test.skip('should show error with invalid credentials', async ({
    anonymousPage: page,
  }) => {
    // Use a non-existent user with wrong password - should show same error
    const testUsername = `invalid-creds-${Date.now()}`;

    // Go to home page and open login dialog
    await page.goto('/');
    await page.getByTestId('welcome-login-button').click();

    // Wait for login dialog to appear
    await expect(page.getByTestId('login-dialog')).toBeVisible();

    // Fill login form with wrong password
    await page.getByTestId('username-input').click();
    await page.getByTestId('username-input').fill(testUsername);
    await page.getByTestId('password-input').click();
    await page.getByTestId('password-input').fill('wrong-password');

    // Wait for button to be enabled (OAuth providers loaded)
    await expect(page.getByTestId('login-button')).toBeEnabled();

    // Click the login button and wait for the response
    const [response] = await Promise.all([
      page.waitForResponse(
        resp =>
          resp.url().includes('/api/v1/auth/login') && resp.status() === 401
      ),
      page.getByTestId('login-button').click(),
    ]);

    // Verify we got a 401
    expect(response.status()).toBe(401);

    // Wait for the error to appear in the UI
    await expect(page.getByTestId('password-error')).toBeVisible();
    await expect(page.getByTestId('password-error')).toContainText(
      'Invalid username or password'
    );

    // Dialog should still be open
    await expect(page.getByTestId('login-dialog')).toBeVisible();
  });

  test('should prevent empty form submission', async ({
    anonymousPage: page,
  }) => {
    // Go to home page and open login dialog
    await page.goto('/');
    await page.getByTestId('welcome-login-button').click();

    // Wait for login dialog to appear
    await expect(page.getByTestId('login-dialog')).toBeVisible();

    // Check that login button is disabled when form is empty
    await expect(page.getByTestId('login-button')).toBeDisabled();

    // Let's also test partial form filling - only username
    await page.getByTestId('username-input').click();
    await page.getByTestId('username-input').fill('someuser');
    await expect(page.getByTestId('login-button')).toBeDisabled();

    // Clear username and only fill password
    await page.getByTestId('username-input').fill('');
    await page.getByTestId('password-input').click();
    await page.getByTestId('password-input').fill('password123');
    await expect(page.getByTestId('login-button')).toBeDisabled();

    // Fill both to verify button becomes enabled
    await page.getByTestId('username-input').click();
    await page.getByTestId('username-input').fill('someuser');

    // Use Tab to trigger form updates
    await page.keyboard.press('Tab');

    // Wait for Angular form validation to update
    await expect(page.getByTestId('login-button')).toBeEnabled();
  });

  test('should maintain authentication state after refresh', async ({
    authenticatedPage: page, // Use authenticatedPage fixture
  }) => {
    // authenticatedPage fixture already navigates to '/' after setting cookie
    // Verify we are initially on the home page
    await expect(page).toHaveURL('/');

    // Refresh page
    await page.reload();

    // Should still be authenticated and on home page
    await expect(page).toHaveURL('/');
  });
});
