import { test as base, Page } from '@playwright/test';

/**
 * Full-stack test fixtures
 *
 * These fixtures work with the REAL backend server, not mocked APIs.
 * They provide utilities for setting up different user states and scenarios.
 */

export type FullStackFixtures = {
  // Anonymous page (no authentication)
  anonymousPage: Page;

  // Authenticated user page (creates and logs in a test user)
  authenticatedPage: Page;

  // Offline mode page (configured for offline storage)
  offlinePage: Page;
};

/**
 * Generate a unique test identifier
 */
function generateTestId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

/**
 * Extended test with full-stack fixtures
 */
export const test = base.extend<FullStackFixtures>({
  // Anonymous page (no authentication)
  anonymousPage: async ({ browser }, use) => {
    // Create a new context for isolation
    const context = await browser.newContext();
    const page = await context.newPage();

    // Set up app configuration for server mode
    await page.addInitScript(() => {
      localStorage.setItem(
        'inkweld-app-config',
        JSON.stringify({
          mode: 'server',
          serverUrl: 'http://localhost:8333',
        })
      );
    });

    await use(page);

    // Cleanup
    await context.close();
  },

  // Authenticated user page
  authenticatedPage: async ({ browser }, use) => {
    // Create a new context for isolation
    const context = await browser.newContext();
    const page = await context.newPage();

    const testId = generateTestId();
    const username = `testuser-${testId}`;
    const password = 'TestPassword123!';

    // Register and authenticate user via API (before any navigation)
    const token = await authenticateUser(page, username, password, true);

    // Set up app configuration with auth token in one addInitScript
    await page.addInitScript((authToken: string) => {
      localStorage.setItem(
        'inkweld-app-config',
        JSON.stringify({
          mode: 'server',
          serverUrl: 'http://localhost:8333',
        })
      );

      localStorage.setItem('auth_token', authToken);
    }, token);

    // Navigate to the app with both config and token already set
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Store credentials for potential later use
    (page as any).testCredentials = { username, password };

    await use(page);

    // Cleanup
    await context.close();
  },

  // Offline mode page
  offlinePage: async ({ browser }, use) => {
    // Create a new context for isolation
    const context = await browser.newContext();
    const page = await context.newPage();

    const testId = generateTestId();
    const username = `offline-user-${testId}`;

    // Navigate first
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Set up app configuration for offline mode (one-time, not on every navigation)
    await page.evaluate((user) => {
      const userProfile = {
        id: user,
        username: user,
        name: user,
        enabled: true,
      };

      localStorage.setItem(
        'inkweld-app-config',
        JSON.stringify({
          mode: 'offline',
          userProfile,
        })
      );

      // IMPORTANT: Also set the offline user directly so OfflineUserService recognizes authentication
      localStorage.setItem('inkweld-offline-user', JSON.stringify(userProfile));

      // Clear any existing offline projects
      localStorage.removeItem('inkweld-offline-projects');
    }, username);

    // Reload to apply the configuration
    await page.reload({ waitUntil: 'domcontentloaded' });

    await use(page);

    // Cleanup
    await context.close();
  },
});

/**
 * Helper to authenticate user and store token for API requests
 * @param page - Playwright page
 * @param username - Username
 * @param password - Password
 * @param isRegister - Whether to register (true) or login (false)
 */
export async function authenticateUser(
  page: Page,
  username: string,
  password: string,
  isRegister: boolean = true
): Promise<string> {
  const apiUrl = 'http://localhost:8333';

  if (isRegister) {
    // Register via API
    const registerResponse = await page.request.post(`${apiUrl}/api/v1/auth/register`, {
      data: {
        username,
        password,
      },
    });

    if (!registerResponse.ok()) {
      throw new Error(`Registration failed: ${registerResponse.status()} ${await registerResponse.text()}`);
    }

    const registerData: any = await registerResponse.json();
    return registerData.token;
  } else {
    // Login via API
    const loginResponse = await page.request.post(`${apiUrl}/api/v1/auth/login`, {
      data: {
        username,
        password,
      },
    });

    if (!loginResponse.ok()) {
      throw new Error(`Login failed: ${loginResponse.status()} ${await loginResponse.text()}`);
    }

    const loginData: any = await loginResponse.json();
    return loginData.token;
  }
}

/**
 * Helper to create an offline project
 */
export async function createOfflineProject(
  page: Page,
  title: string,
  slug: string,
  description?: string
): Promise<void> {
  // Navigate directly to create project page
  await page.goto('/create-project');
  await page.waitForLoadState('domcontentloaded');

  // Fill project form using data-testids
  await page.locator('[data-testid="project-title-input"]').fill(title);
  await page.locator('[data-testid="project-slug-input"]').fill(slug);

  if (description) {
    await page.locator('[data-testid="project-description-input"]').fill(description);
  }

  // Submit form
  await page.locator('[data-testid="create-project-button"]').click();

  // Wait for project to be created (URL changes to project page)
  await page.waitForURL(new RegExp(`.*${slug}.*`), { timeout: 5000 });

  // Wait for localStorage to be updated by checking it directly
  await page.waitForFunction(
    (expectedSlug) => {
      const stored = localStorage.getItem('inkweld-offline-projects');
      if (!stored) return false;
      try {
        const projects = JSON.parse(stored);
        return Array.isArray(projects) && projects.some((p: any) => p.slug === expectedSlug);
      } catch {
        return false;
      }
    },
    slug,
    { timeout: 5000 }
  );
}

/**
 * Helper to open user settings
 */
export async function openUserSettings(page: Page): Promise<void> {
  // Debug: Check localStorage and mode
  const appMode = await getAppMode(page);
  const offlineUser = await page.evaluate(() => {
    return localStorage.getItem('inkweld-offline-user');
  });
  console.log('[DEBUG] App mode:', appMode);
  console.log('[DEBUG] Offline user in localStorage:', offlineUser);

  // Check if user menu component is in the DOM at all
  const userMenuExists = await page.locator('app-user-menu').count();
  console.log('[DEBUG] User menu component count:', userMenuExists);

  // Check if the button with data-testid exists
  const testidButtonExists = await page.locator('[data-testid="user-menu-button"]').count();
  console.log('[DEBUG] Button with data-testid count:', testidButtonExists);

  // Check all buttons in the user menu component
  if (userMenuExists > 0) {
    const userMenuButtons = await page.locator('app-user-menu button').allTextContents();
    console.log('[DEBUG] Buttons inside user-menu component:', userMenuButtons);

    const userMenuHtml = await page.locator('app-user-menu').innerHTML();
    console.log('[DEBUG] User menu HTML:', userMenuHtml.substring(0, 500));
  }

  // Look for user menu button by data-testid only (no fallback)
  const userMenuButton = page.locator('[data-testid="user-menu-button"]');

  // Wait for button to be visible
  try {
    await userMenuButton.waitFor({ state: 'visible', timeout: 10000 });
  } catch (e) {
    // Debug: Take screenshot and log page state
    await page.screenshot({ path: 'test-results/debug-no-user-menu.png' });
    const buttons = await page.locator('button').allTextContents();
    console.log('[DEBUG] Available buttons:', buttons);

    throw new Error('User menu button not found. See debug screenshot.');
  }

  await userMenuButton.click();

  // Click settings option
  const settingsOption = page.getByRole('menuitem', { name: /settings/i });
  try {
    await settingsOption.waitFor({ state: 'visible', timeout: 10000 });
  } catch (e) {
    // Debug: Check if menu opened
    const menuItems = await page.locator('[role="menuitem"], [role="menu"] button').allTextContents();
    console.log('[DEBUG] Available menu items:', menuItems);
    await page.screenshot({ path: 'test-results/debug-no-settings-menuitem.png' });
    throw new Error('Settings menu item not found after clicking user menu. See debug screenshot.');
  }

  await settingsOption.click();
}

/**
 * Helper to verify offline project exists in localStorage
 */
export async function getOfflineProjects(page: Page): Promise<any[]> {
  return page.evaluate(() => {
    const stored = localStorage.getItem('inkweld-offline-projects');
    return stored ? JSON.parse(stored) : [];
  });
}

/**
 * Helper to verify app mode
 */
export async function getAppMode(page: Page): Promise<string> {
  return page.evaluate(() => {
    const config = localStorage.getItem('inkweld-app-config');
    if (!config) return 'unknown';
    const parsed = JSON.parse(config);
    return parsed.mode || 'unknown';
  });
}

// Re-export expect
export { expect } from '@playwright/test';
