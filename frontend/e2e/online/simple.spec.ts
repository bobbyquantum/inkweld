import { expect, test } from './fixtures';

/**
 * Simple test to verify online/full-stack infrastructure is working
 */
test.describe('Online Infrastructure', () => {
  test('should access backend health endpoint', async ({ page }) => {
    const response = await page.request.get(
      'http://localhost:9333/api/v1/health'
    );
    expect(response.ok()).toBeTruthy();
  });

  test('should register and login to server', async ({ browser }) => {
    // Create a fresh context to ensure no state leakage
    const context = await browser.newContext();
    const page = await context.newPage();

    const testUsername = `e2etest-${Date.now()}`;
    const testPassword = 'TestPassword123!';

    // Set server mode with serverUrl
    await page.addInitScript(() => {
      // Clear all localStorage first
      localStorage.clear();

      // Set server mode with serverUrl pointing to test backend
      localStorage.setItem(
        'inkweld-app-config',
        JSON.stringify({
          mode: 'server',
          serverUrl: 'http://localhost:9333',
        })
      );
    });

    // Navigate to app
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // We're on the landing page - click the Register button
    const registerButton = page.getByRole('button', { name: /^register$/i });
    await registerButton.waitFor({ state: 'visible', timeout: 10000 });
    await registerButton.click();

    // Wait for register page
    await page.waitForURL(/register/i, { timeout: 10000 });

    // Register new user
    await page.getByLabel(/^username/i).fill(testUsername);
    await page.getByLabel(/^password$/i).fill(testPassword);
    await page.getByLabel(/confirm password/i).fill(testPassword);

    // Click register and wait for navigation
    await page.getByRole('button', { name: /register|sign up/i }).click();

    // Registration should succeed and show success message or redirect to home
    // The register page calls loadCurrentUser() which should auto-login
    await page.waitForURL('/', { timeout: 10000 });

    // Verify we can access the app
    await expect(page).toHaveTitle(/Home|Inkweld/i);

    // Cleanup
    await context.close();
  });
});
