import {
  BrowserContext,
  expect as baseExpect,
  Page,
  test as base,
} from '@playwright/test';

/**
 * Local Test Fixtures
 *
 * These fixtures are for testing the app in LOCAL mode only.
 * Any network request to the API should FAIL the test immediately,
 * as local mode should never contact a server.
 */

export type LocalTestFixtures = {
  /**
   * Local page with a test user profile configured.
   * Network requests to the API are blocked and will fail the test.
   */
  localPage: Page;

  /**
   * Local page with a project already created.
   * Useful for tests that need an existing project to work with.
   */
  localPageWithProject: Page;

  /**
   * Local browser context for creating multiple isolated pages.
   */
  localContext: BrowserContext;
};

/**
 * Extended test with local fixtures.
 * CRITICAL: Any API request will fail the test.
 */
export const test = base.extend<LocalTestFixtures>({
  // Local page with user configured (no project)
  localPage: async ({ page }, use) => {
    // Suppress console logs for cleaner test output
    page.on('console', () => {});

    // Track API requests - any API call should fail the test
    const apiRequests: string[] = [];

    // Block ALL API requests and record them for failure reporting
    await page.route('**/api/**', async route => {
      const url = route.request().url();
      apiRequests.push(url);
      await route.abort('failed');
    });

    // Also block WebSocket connections to the server
    await page.route('**/ws/**', async route => {
      const url = route.request().url();
      apiRequests.push(url);
      await route.abort('failed');
    });

    // Set up app configuration for local mode
    await page.addInitScript(() => {
      const userProfile = {
        id: 'local-test-user',
        username: 'testuser',
        name: 'Test User',
        enabled: true,
      };

      const now = new Date().toISOString();

      // Use v2 config format with storage prefix support
      localStorage.setItem(
        'inkweld-app-config',
        JSON.stringify({
          version: 2,
          activeConfigId: 'local',
          configurations: [
            {
              id: 'local',
              type: 'local',
              displayName: 'Local Mode',
              userProfile: {
                name: userProfile.name,
                username: userProfile.username,
              },
              addedAt: now,
              lastUsedAt: now,
            },
          ],
        })
      );

      // Also set the local user directly with the prefixed key
      localStorage.setItem(
        'local:inkweld-local-user',
        JSON.stringify(userProfile)
      );
    });

    // Navigate to home
    await page.goto('/');

    await use(page);

    // After test: fail if any API requests were made
    if (apiRequests.length > 0) {
      throw new Error(
        `LOCAL TEST FAILURE: ${apiRequests.length} API request(s) were made, but local mode should not contact the server:\n` +
          apiRequests.map(url => `  - ${url}`).join('\n')
      );
    }
  },

  // Local page with a project already created
  localPageWithProject: async ({ page }, use) => {
    // Suppress console logs for cleaner test output
    page.on('console', () => {});

    // Track API requests
    const apiRequests: string[] = [];

    // Block ALL API requests
    await page.route('**/api/**', async route => {
      const url = route.request().url();
      apiRequests.push(url);
      await route.abort('failed');
    });

    await page.route('**/ws/**', async route => {
      const url = route.request().url();
      apiRequests.push(url);
      await route.abort('failed');
    });

    // Set up app configuration for local mode
    await page.addInitScript(() => {
      const userProfile = {
        id: 'local-test-user',
        username: 'testuser',
        name: 'Test User',
        enabled: true,
      };

      const now = new Date().toISOString();

      // Use v2 config format with storage prefix support
      localStorage.setItem(
        'inkweld-app-config',
        JSON.stringify({
          version: 2,
          activeConfigId: 'local',
          configurations: [
            {
              id: 'local',
              type: 'local',
              displayName: 'Local Mode',
              userProfile: {
                name: userProfile.name,
                username: userProfile.username,
              },
              addedAt: now,
              lastUsedAt: now,
            },
          ],
        })
      );

      // Also set the local user directly with the prefixed key
      localStorage.setItem(
        'local:inkweld-local-user',
        JSON.stringify(userProfile)
      );
    });

    // Navigate to home
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Create a test project
    const createButton = page.getByRole('button', { name: /create project/i });
    await createButton.waitFor();
    await createButton.click();

    // Step 1: Template Selection
    // Wait for template to be selected (defaults to 'empty')
    const nextButton = page.getByRole('button', { name: /next/i });
    await nextButton.waitFor();
    await nextButton.click();

    // Step 2: Fill in project details
    const titleInput = page.getByLabel(/project title/i);
    await titleInput.waitFor();
    await titleInput.fill('Test Project');

    const slugInput = page.getByLabel(/project slug/i);
    await slugInput.waitFor();
    await slugInput.fill('test-project');

    // Submit the form
    const submitButton = page.getByRole('button', { name: /create project/i });
    await submitButton.waitFor();
    await submitButton.click();

    // Wait for navigation to project page
    await page.waitForURL(/.*testuser.*test-project.*/);
    await page.waitForLoadState('domcontentloaded');

    // Navigate back to home to see the project card
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Wait for the project card to appear
    await page.locator('[data-testid="project-card"]').first().waitFor();

    await use(page);

    // After test: fail if any API requests were made
    if (apiRequests.length > 0) {
      throw new Error(
        `LOCAL TEST FAILURE: ${apiRequests.length} API request(s) were made, but local mode should not contact the server:\n` +
          apiRequests.map(url => `  - ${url}`).join('\n')
      );
    }
  },

  // Local browser context
  localContext: async ({ browser }, use) => {
    const context = await browser.newContext();

    // Set up local mode for all pages in this context
    await context.addInitScript(() => {
      const userProfile = {
        id: 'local-test-user',
        username: 'testuser',
        name: 'Test User',
        enabled: true,
      };

      const now = new Date().toISOString();

      // Use v2 config format with storage prefix support
      localStorage.setItem(
        'inkweld-app-config',
        JSON.stringify({
          version: 2,
          activeConfigId: 'local',
          configurations: [
            {
              id: 'local',
              type: 'local',
              displayName: 'Local Mode',
              userProfile: {
                name: userProfile.name,
                username: userProfile.username,
              },
              addedAt: now,
              lastUsedAt: now,
            },
          ],
        })
      );

      // Also set the local user directly with the prefixed key
      localStorage.setItem(
        'local:inkweld-local-user',
        JSON.stringify(userProfile)
      );
    });

    await use(context);
    await context.close();
  },
});

/**
 * Helper function to create a local project
 * @param page Playwright page (must be in local mode)
 * @param title Project title
 * @param slug Project slug
 * @param description Optional project description
 */
export async function createLocalProject(
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
  await page.waitForURL(new RegExp(`.*${slug}.*`));

  // Wait for localStorage to be updated (uses prefixed key in local mode)
  await page.waitForFunction(expectedSlug => {
    const stored = localStorage.getItem('local:inkweld-local-projects');
    if (!stored) return false;
    try {
      const projects = JSON.parse(stored) as Array<{ slug: string }>;
      return (
        Array.isArray(projects) && projects.some(p => p.slug === expectedSlug)
      );
    } catch {
      return false;
    }
  }, slug);
}

/**
 * Helper function to open user settings
 * @param page Playwright page
 */
export async function openUserSettings(page: Page): Promise<void> {
  // Click the user menu button
  const userMenuButton = page.locator('[data-testid="user-menu-button"]');
  await userMenuButton.waitFor();
  await userMenuButton.click();

  // Click settings option
  const settingsOption = page.getByRole('menuitem', { name: /settings/i });
  await settingsOption.waitFor();
  await settingsOption.click();
}

// Re-export expect for convenience
export { baseExpect as expect };

// Re-export common helpers
export * from '../common';
