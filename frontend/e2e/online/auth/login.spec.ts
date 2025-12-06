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

    // Now go to welcome page and try to login
    await page.goto('/welcome');

    // Fill login form with the newly created user credentials
    await page.getByTestId('username-input').fill(testUsername);
    await page.getByTestId('password-input').fill(testPassword);

    // Submit the form
    await page.getByTestId('login-button').click();

    // Should redirect to home after successful login
    await expect(page).toHaveURL('/');
  });

  test('should show error with invalid credentials', async ({
    anonymousPage: page,
  }) => {
    // Create a user first via API
    const testUsername = `invalid-creds-${Date.now()}`;
    const testPassword = 'TestPassword123!';

    await page.request.post('http://localhost:9333/api/v1/auth/register', {
      data: {
        username: testUsername,
        password: testPassword,
      },
    });

    // Go to welcome page where login is available
    await page.goto('/welcome');

    // Fill login form with wrong password
    await page.getByTestId('username-input').fill(testUsername);
    await page.getByTestId('password-input').fill('wrong-password');

    // Submit the form - wait for network request to complete
    await page.getByTestId('login-button').click();

    // Should show error message
    await expect(page.getByTestId('password-error')).toBeVisible();
    await expect(page.getByTestId('password-error')).toContainText(
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
    await page.getByTestId('username-input').fill('nonexistent-user');
    await page.getByTestId('password-input').fill('correct-password');

    // Submit the form - wait for network request to complete
    await page.getByTestId('login-button').click();

    // Should show error message
    await expect(page.getByTestId('password-error')).toBeVisible();
    await expect(page.getByTestId('password-error')).toContainText(
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

    // Check that login button is disabled when form is empty
    await expect(page.getByTestId('login-button')).toBeDisabled();

    // Should still be on the welcome page
    await expect(page).toHaveURL('/welcome');

    // Let's also test partial form filling - only username
    await page.getByTestId('username-input').fill('someuser');
    await expect(page.getByTestId('login-button')).toBeDisabled();

    // Clear username and only fill password
    await page.getByTestId('username-input').fill('');
    await page.getByTestId('password-input').fill('password123');
    await expect(page.getByTestId('login-button')).toBeDisabled();

    // Fill both to verify button becomes enabled
    await page.getByTestId('username-input').fill('someuser');
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
