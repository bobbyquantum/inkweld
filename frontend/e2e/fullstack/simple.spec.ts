import { expect, test } from './fixtures';

/**
 * Simple test to verify full-stack infrastructure is working
 */
test.describe('Full-Stack Infrastructure', () => {
  test('should load frontend and verify offline mode', async ({
    offlinePage,
  }) => {
    // Verify page loaded
    await expect(offlinePage).toHaveTitle(/Home|Inkweld/i);

    // Verify offline mode is configured
    await expect(offlinePage).toHaveURL(/\//);
    const mode = await offlinePage.evaluate(() => {
      const config = localStorage.getItem('inkweld-app-config');
      return config ? JSON.parse(config).mode : null;
    });
    expect(mode).toBe('offline');
  });

  test('should access backend health endpoint', async ({ page }) => {
    const response = await page.request.get(
      'http://localhost:8333/api/v1/health'
    );
    expect(response.ok()).toBeTruthy();
  });

  test('should register and login to server', async ({ browser }) => {
    // Create a fresh context to ensure no state leakage
    const context = await browser.newContext();
    const page = await context.newPage();

    const testUsername = `e2etest-${Date.now()}`;
    const testPassword = 'TestPassword123!';

    // Set server mode and clear any existing state
    await page.addInitScript(() => {
      // Clear all localStorage first
      localStorage.clear();

      // Set server mode but NO serverUrl - this should trigger setup
      localStorage.setItem(
        'inkweld-app-config',
        JSON.stringify({
          mode: 'server',
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

  test('should persist offline projects across page reload', async ({
    offlinePage,
  }) => {
    // Create a project through the UI
    await offlinePage.goto('/create-project');
    await offlinePage.waitForLoadState('domcontentloaded');

    await offlinePage
      .locator('[data-testid="project-title-input"]')
      .fill('Reload Test Project');
    await offlinePage
      .locator('[data-testid="project-slug-input"]')
      .fill('reload-test');
    await offlinePage
      .locator('[data-testid="project-description-input"]')
      .fill('Testing persistence across reload');
    await offlinePage.locator('[data-testid="create-project-button"]').click();

    // Wait for project page to load
    await expect(offlinePage).toHaveURL(/reload-test/, { timeout: 5000 });

    // Verify project is in localStorage before reload
    const projectsBeforeReload = await offlinePage.evaluate(() => {
      const stored = localStorage.getItem('inkweld-offline-projects');
      return stored ? JSON.parse(stored) : [];
    });
    expect(projectsBeforeReload).toHaveLength(1);
    expect(projectsBeforeReload[0].slug).toBe('reload-test');

    // Perform a full page reload (simulates F5 / browser refresh)
    await offlinePage.reload({ waitUntil: 'domcontentloaded' });

    // Verify project still exists in localStorage after reload
    const projectsAfterReload = await offlinePage.evaluate(() => {
      const stored = localStorage.getItem('inkweld-offline-projects');
      return stored ? JSON.parse(stored) : [];
    });
    expect(projectsAfterReload).toHaveLength(1);
    expect(projectsAfterReload[0].slug).toBe('reload-test');
    expect(projectsAfterReload[0].title).toBe('Reload Test Project');

    // Navigate to home and verify project is still visible in the UI
    await offlinePage.goto('/');
    await offlinePage.waitForLoadState('domcontentloaded');

    // Project should be visible in the project list
    // The project card button includes "cover" text, so we match the start of the text
    await expect(
      offlinePage.getByRole('button', { name: /Reload Test Project/i })
    ).toBeVisible({ timeout: 5000 });
  });
});
