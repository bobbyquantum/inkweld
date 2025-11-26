import {
  BrowserContext,
  expect as baseExpect,
  Page,
  test as base,
} from '@playwright/test';

/**
 * Offline Test Fixtures
 *
 * These fixtures are for testing the app in OFFLINE mode only.
 * Any network request to the API should FAIL the test immediately,
 * as offline mode should never contact a server.
 */

export type OfflineTestFixtures = {
  /**
   * Offline page with a test user profile configured.
   * Network requests to the API are blocked and will fail the test.
   */
  offlinePage: Page;

  /**
   * Offline page with a project already created.
   * Useful for tests that need an existing project to work with.
   */
  offlinePageWithProject: Page;

  /**
   * Offline browser context for creating multiple isolated pages.
   */
  offlineContext: BrowserContext;
};

/**
 * Extended test with offline fixtures.
 * CRITICAL: Any API request will fail the test.
 */
export const test = base.extend<OfflineTestFixtures>({
  // Offline page with user configured (no project)
  offlinePage: async ({ page }, use) => {
    // Track API requests - any API call should fail the test
    const apiRequests: string[] = [];

    // Block ALL API requests and record them for failure reporting
    await page.route('**/api/**', async route => {
      const url = route.request().url();
      apiRequests.push(url);
      console.error(`[OFFLINE TEST FAILURE] Unexpected API request: ${url}`);
      await route.abort('failed');
    });

    // Also block WebSocket connections to the server
    await page.route('**/ws/**', async route => {
      const url = route.request().url();
      apiRequests.push(url);
      console.error(
        `[OFFLINE TEST FAILURE] Unexpected WebSocket request: ${url}`
      );
      await route.abort('failed');
    });

    // Set up app configuration for offline mode
    await page.addInitScript(() => {
      const userProfile = {
        id: 'offline-test-user',
        username: 'testuser',
        name: 'Test User',
        enabled: true,
      };

      localStorage.setItem(
        'inkweld-app-config',
        JSON.stringify({
          mode: 'offline',
          userProfile,
        })
      );

      // Also set the offline user directly so OfflineUserService recognizes authentication
      localStorage.setItem('inkweld-offline-user', JSON.stringify(userProfile));
    });

    console.log('Setting up page for OFFLINE mode (API requests will fail)');

    // Navigate to home
    await page.goto('/');

    await use(page);

    // After test: fail if any API requests were made
    if (apiRequests.length > 0) {
      throw new Error(
        `OFFLINE TEST FAILURE: ${apiRequests.length} API request(s) were made, but offline mode should not contact the server:\n` +
          apiRequests.map(url => `  - ${url}`).join('\n')
      );
    }
  },

  // Offline page with a project already created
  offlinePageWithProject: async ({ page }, use) => {
    // Track API requests
    const apiRequests: string[] = [];

    // Block ALL API requests
    await page.route('**/api/**', async route => {
      const url = route.request().url();
      apiRequests.push(url);
      console.error(`[OFFLINE TEST FAILURE] Unexpected API request: ${url}`);
      await route.abort('failed');
    });

    await page.route('**/ws/**', async route => {
      const url = route.request().url();
      apiRequests.push(url);
      console.error(
        `[OFFLINE TEST FAILURE] Unexpected WebSocket request: ${url}`
      );
      await route.abort('failed');
    });

    // Set up app configuration for offline mode
    await page.addInitScript(() => {
      const userProfile = {
        id: 'offline-test-user',
        username: 'testuser',
        name: 'Test User',
        enabled: true,
      };

      localStorage.setItem(
        'inkweld-app-config',
        JSON.stringify({
          mode: 'offline',
          userProfile,
        })
      );

      localStorage.setItem('inkweld-offline-user', JSON.stringify(userProfile));
    });

    console.log('Setting up page for OFFLINE mode with test project');

    // Navigate to home
    await page.goto('/');

    // Create a test project
    await page.getByRole('button', { name: /create project/i }).click();

    // Fill in project details in the dialog
    await page.getByLabel(/project title/i).fill('Test Project');
    await page.getByLabel(/project slug/i).fill('test-project');

    // Submit the form
    await page.getByRole('button', { name: /create/i }).click();

    // Wait for navigation to project page
    await page.waitForURL(/.*testuser.*test-project.*/);

    // Navigate back to home to see the project card
    await page.goto('/');

    // Wait for the project card to appear
    await page.waitForSelector('[data-testid="project-card"]', {
      state: 'visible',
      timeout: 10000,
    });

    await use(page);

    // After test: fail if any API requests were made
    if (apiRequests.length > 0) {
      throw new Error(
        `OFFLINE TEST FAILURE: ${apiRequests.length} API request(s) were made, but offline mode should not contact the server:\n` +
          apiRequests.map(url => `  - ${url}`).join('\n')
      );
    }
  },

  // Offline browser context
  offlineContext: async ({ browser }, use) => {
    const context = await browser.newContext();

    // Set up offline mode for all pages in this context
    await context.addInitScript(() => {
      const userProfile = {
        id: 'offline-test-user',
        username: 'testuser',
        name: 'Test User',
        enabled: true,
      };

      localStorage.setItem(
        'inkweld-app-config',
        JSON.stringify({
          mode: 'offline',
          userProfile,
        })
      );

      localStorage.setItem('inkweld-offline-user', JSON.stringify(userProfile));
    });

    await use(context);
    await context.close();
  },
});

/**
 * Helper function to create an offline project
 * @param page Playwright page (must be in offline mode)
 * @param title Project title
 * @param slug Project slug
 * @param description Optional project description
 */
export async function createOfflineProject(
  page: Page,
  title: string,
  slug: string,
  description?: string
): Promise<void> {
  // Navigate to create project page
  await page.goto('/create-project');
  await page.waitForLoadState('domcontentloaded');

  // Fill project form
  await page.locator('[data-testid="project-title-input"]').fill(title);
  await page.locator('[data-testid="project-slug-input"]').fill(slug);

  if (description) {
    await page
      .locator('[data-testid="project-description-input"]')
      .fill(description);
  }

  // Submit form
  await page.locator('[data-testid="create-project-button"]').click();

  // Wait for project to be created
  await page.waitForURL(new RegExp(`.*${slug}.*`), { timeout: 5000 });

  // Wait for localStorage to be updated
  await page.waitForFunction(
    expectedSlug => {
      const stored = localStorage.getItem('inkweld-offline-projects');
      if (!stored) return false;
      try {
        const projects = JSON.parse(stored) as Array<{ slug: string }>;
        return (
          Array.isArray(projects) && projects.some(p => p.slug === expectedSlug)
        );
      } catch {
        return false;
      }
    },
    slug,
    { timeout: 5000 }
  );
}

/**
 * Helper function to open user settings
 * @param page Playwright page
 */
export async function openUserSettings(page: Page): Promise<void> {
  // Click the user menu button
  const userMenuButton = page.locator('[data-testid="user-menu-button"]');
  await userMenuButton.waitFor({ state: 'visible', timeout: 10000 });
  await userMenuButton.click();

  // Click settings option
  const settingsOption = page.getByRole('menuitem', { name: /settings/i });
  await settingsOption.waitFor({ state: 'visible', timeout: 10000 });
  await settingsOption.click();
}

// Re-export expect for convenience
export { baseExpect as expect };

// Re-export common helpers
export * from '../common';
