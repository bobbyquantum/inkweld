import { Page, test as base } from '@playwright/test';

/**
 * Online Test Fixtures
 *
 * These fixtures work with the REAL backend server, not mocked APIs.
 * They provide utilities for setting up different user states and scenarios.
 *
 * The backend runs with an in-memory SQLite database for test isolation.
 */

/**
 * Get the API base URL from Playwright config or environment.
 * Defaults to http://localhost:9333 for online tests, but Docker tests use 8333.
 */
function getApiBaseUrl(): string {
  // Check for explicit API URL override
  if (process.env['API_BASE_URL']) {
    return process.env['API_BASE_URL'];
  }
  // Use PLAYWRIGHT_BASE_URL if set (used by Docker tests)
  if (process.env['PLAYWRIGHT_BASE_URL']) {
    return process.env['PLAYWRIGHT_BASE_URL'];
  }
  // Default for online tests (backend runs on port 9333)
  return 'http://localhost:9333';
}

/**
 * Default admin credentials (must match playwright.online.config.ts)
 */
export const DEFAULT_ADMIN = {
  username: 'e2e-admin',
  password: 'E2eAdminPassword123!',
};

export type OnlineTestFixtures = {
  /**
   * Anonymous page (no authentication).
   * Configured for server mode but not logged in.
   */
  anonymousPage: Page;

  /**
   * Authenticated user page.
   * Creates and logs in a unique test user via the real backend.
   */
  authenticatedPage: Page;

  /**
   * Admin user page.
   * Logs in the pre-seeded admin user (e2e-admin).
   * Use this for testing admin functionality.
   */
  adminPage: Page;

  /**
   * Offline mode page (configured for offline storage).
   * Used for testing migration scenarios where we switch between modes.
   */
  offlinePage: Page;
};

/**
 * Generate a unique test identifier
 */
function generateTestId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

/**
 * Extended test with online fixtures
 */
export const test = base.extend<OnlineTestFixtures>({
  // Anonymous page (no authentication)
  anonymousPage: async ({ browser }, use) => {
    // Create a new context for isolation
    const context = await browser.newContext();
    const page = await context.newPage();

    const apiUrl = getApiBaseUrl();

    // Set up app configuration for server mode
    await page.addInitScript((serverUrl: string) => {
      localStorage.setItem(
        'inkweld-app-config',
        JSON.stringify({
          mode: 'server',
          serverUrl,
        })
      );
    }, apiUrl);

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

    const apiUrl = getApiBaseUrl();

    // Set up app configuration with auth token in one addInitScript
    await page.addInitScript(
      ({ authToken, serverUrl }: { authToken: string; serverUrl: string }) => {
        localStorage.setItem(
          'inkweld-app-config',
          JSON.stringify({
            mode: 'server',
            serverUrl,
          })
        );

        localStorage.setItem('auth_token', authToken);
      },
      { authToken: token, serverUrl: apiUrl }
    );

    // Navigate to the app with both config and token already set
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for the app to fully initialize and cache the user
    // This ensures the auth guard will find a cached user on subsequent navigations
    await page.waitForFunction(
      () => {
        const path = window.location.pathname;
        // Check that we're not on a redirect page (setup/welcome/login/approval-pending)
        return (
          !path.includes('setup') &&
          !path.includes('welcome') &&
          !path.includes('login') &&
          !path.includes('approval-pending')
        );
      },
      { timeout: 10000 }
    );

    // Double-check we're not on an auth page (if waitForFunction passed but we're still redirected)
    const currentUrl = page.url();
    if (
      currentUrl.includes('/login') ||
      currentUrl.includes('/approval-pending')
    ) {
      throw new Error(
        `authenticatedPage fixture failed: landed on ${currentUrl} instead of authenticated page. ` +
          `Token may be invalid or user not approved.`
      );
    }

    // Store credentials for potential later use
    // @ts-expect-error - Dynamic property for test context
    page.testCredentials = { username, password };

    await use(page);

    // Cleanup
    await context.close();
  },

  // Admin user page (uses pre-seeded admin)
  adminPage: async ({ browser }, use) => {
    // Create a new context for isolation
    const context = await browser.newContext();
    const page = await context.newPage();

    // Login as the pre-seeded admin user (created by DEFAULT_ADMIN_USERNAME/PASSWORD env vars)
    const token = await authenticateUser(
      page,
      DEFAULT_ADMIN.username,
      DEFAULT_ADMIN.password,
      false // login, not register
    );

    const apiUrl = getApiBaseUrl();

    // Set up app configuration with auth token
    await page.addInitScript(
      ({ authToken, serverUrl }: { authToken: string; serverUrl: string }) => {
        localStorage.setItem(
          'inkweld-app-config',
          JSON.stringify({
            mode: 'server',
            serverUrl,
          })
        );

        localStorage.setItem('auth_token', authToken);
      },
      { authToken: token, serverUrl: apiUrl }
    );

    // Navigate to the app with config and token already set
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for the app to fully initialize
    await page.waitForFunction(
      () => {
        const path = window.location.pathname;
        return (
          !path.includes('setup') &&
          !path.includes('welcome') &&
          !path.includes('login') &&
          !path.includes('approval-pending')
        );
      },
      { timeout: 10000 }
    );

    // Double-check we're not on an auth page
    const currentUrl = page.url();
    if (
      currentUrl.includes('/login') ||
      currentUrl.includes('/approval-pending')
    ) {
      throw new Error(
        `adminPage fixture failed: landed on ${currentUrl} instead of authenticated page.`
      );
    }

    // Store admin credentials for potential later use
    // @ts-expect-error - Dynamic property for test context
    page.testCredentials = {
      username: DEFAULT_ADMIN.username,
      password: DEFAULT_ADMIN.password,
      isAdmin: true,
    };

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
    await page.evaluate(user => {
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
  const apiUrl = getApiBaseUrl();
  const maxRetries = 3;
  const retryDelay = 500;

  if (isRegister) {
    // Register via API with retry for transient approval-required errors
    // This can happen when another test temporarily toggles USER_APPROVAL_REQUIRED
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const usernameToTry =
        attempt > 1 ? `${username}-retry${attempt}` : username;
      const registerResponse = await page.request.post(
        `${apiUrl}/api/v1/auth/register`,
        {
          data: {
            username: usernameToTry,
            password,
          },
        }
      );

      if (!registerResponse.ok()) {
        throw new Error(
          `Registration failed: ${registerResponse.status()} ${await registerResponse.text()}`
        );
      }

      const registerData = (await registerResponse.json()) as {
        token?: string;
        requiresApproval?: boolean;
        message?: string;
      };

      if (registerData.requiresApproval) {
        if (attempt < maxRetries) {
          // Wait and retry - the admin test may be temporarily toggling the setting
          await new Promise(r => setTimeout(r, retryDelay * attempt));
          continue;
        }
        throw new Error(
          `Registration requires approval after ${maxRetries} attempts - ` +
            `USER_APPROVAL_REQUIRED may be incorrectly set. ` +
            `Message: ${registerData.message}`
        );
      }

      if (!registerData.token) {
        throw new Error(
          `Registration succeeded but no token returned. Response: ${JSON.stringify(registerData)}`
        );
      }

      return registerData.token;
    }

    throw new Error('Registration failed after max retries');
  } else {
    // Login via API
    const loginResponse = await page.request.post(
      `${apiUrl}/api/v1/auth/login`,
      {
        data: {
          username,
          password,
        },
      }
    );

    if (!loginResponse.ok()) {
      throw new Error(
        `Login failed: ${loginResponse.status()} ${await loginResponse.text()}`
      );
    }

    const loginData = (await loginResponse.json()) as { token: string };
    return loginData.token;
  }
}

/**
 * Helper to register a user via UI (for tests that need to go through the full flow)
 */
export async function registerUser(
  page: Page,
  username: string,
  password: string
): Promise<void> {
  await page.goto('/register');
  await page.waitForLoadState('domcontentloaded');

  await page.locator('[data-testid="username-input"]').fill(username);
  await page.locator('[data-testid="username-input"]').blur();
  await page.waitForTimeout(500); // Wait for username availability check

  await page.locator('[data-testid="password-input"]').fill(password);
  await page.locator('[data-testid="confirm-password-input"]').fill(password);

  // Wait for the register button to be enabled
  await page
    .locator('[data-testid="register-button"]')
    .waitFor({ state: 'visible' });

  // Click register and wait for navigation
  await Promise.all([
    page.waitForURL('/', { timeout: 15000 }),
    page.locator('[data-testid="register-button"]').click(),
  ]);

  // Wait for network to settle
  await page.waitForLoadState('networkidle');

  // Verify token was stored (registration should auto-login)
  const token = await page.evaluate(() => localStorage.getItem('auth_token'));
  if (!token) {
    throw new Error(
      'registerUser: Expected auth_token in localStorage after registration, but none found'
    );
  }

  // Wait for the user menu to appear (indicates successful authentication)
  try {
    await page.locator('[data-testid="user-menu-button"]').waitFor({
      state: 'visible',
      timeout: 10000,
    });
  } catch {
    // Log diagnostic info
    const url = page.url();
    const hasToken = await page.evaluate(
      () => !!localStorage.getItem('auth_token')
    );
    throw new Error(
      `registerUser: User menu not visible after registration. ` +
        `URL: ${url}, Has token: ${hasToken}`
    );
  }
}

/**
 * Helper to create a project via UI
 */
export async function createProject(
  page: Page,
  title: string,
  slug: string,
  description?: string
): Promise<void> {
  await page.goto('/create-project');
  await page.waitForLoadState('networkidle');

  // Verify we're on the create project page (not redirected to login)
  const url = page.url();
  if (url.includes('welcome') || url.includes('login')) {
    throw new Error(
      `createProject: Expected /create-project but landed on ${url}. ` +
        `Token in localStorage: ${await page.evaluate(() => localStorage.getItem('auth_token'))}`
    );
  }

  // Step 1: Template selection - default template is pre-selected
  // Click Next to proceed to step 2
  await page.getByRole('button', { name: /next/i }).click();
  await page.waitForTimeout(200);

  // Step 2: Fill in project details
  await page.locator('[data-testid="project-title-input"]').fill(title);
  await page.locator('[data-testid="project-slug-input"]').fill(slug);

  if (description) {
    await page
      .locator('[data-testid="project-description-input"]')
      .fill(description);
  }

  await page.locator('[data-testid="create-project-button"]').click();

  // Wait for navigation to project page
  await page.waitForURL(new RegExp(`.*${slug}.*`), { timeout: 10000 });
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

  // Step 1: Template selection - default template is pre-selected
  // Click Next to proceed to step 2
  await page.getByRole('button', { name: /next/i }).click();
  await page.waitForTimeout(200);

  // Step 2: Fill project form using data-testids
  await page.locator('[data-testid="project-title-input"]').fill(title);
  await page.locator('[data-testid="project-slug-input"]').fill(slug);

  if (description) {
    await page
      .locator('[data-testid="project-description-input"]')
      .fill(description);
  }

  // Submit form
  await page.locator('[data-testid="create-project-button"]').click();

  // Wait for project to be created (URL changes to project page)
  await page.waitForURL(new RegExp(`.*${slug}.*`), { timeout: 5000 });

  // Wait for localStorage to be updated by checking it directly
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
 * Helper to open user settings
 */
export async function openUserSettings(page: Page): Promise<void> {
  // Look for user menu button by data-testid only (no fallback)
  const userMenuButton = page.locator('[data-testid="user-menu-button"]');

  // Wait for button to be visible
  await userMenuButton.waitFor({ state: 'visible', timeout: 10000 });
  await userMenuButton.click();

  // Click settings option
  const settingsOption = page.getByRole('menuitem', { name: /settings/i });
  await settingsOption.waitFor({ state: 'visible', timeout: 10000 });
  await settingsOption.click();
}

/**
 * Helper to verify offline project exists in localStorage
 */
export async function getOfflineProjects(
  page: Page
): Promise<Array<{ slug: string }>> {
  return page.evaluate(() => {
    const stored = localStorage.getItem('inkweld-offline-projects');
    return stored ? (JSON.parse(stored) as Array<{ slug: string }>) : [];
  });
}

/**
 * Helper to verify app mode
 */
export async function getAppMode(page: Page): Promise<string> {
  return page.evaluate(() => {
    const config = localStorage.getItem('inkweld-app-config');
    if (!config) return 'unknown';
    const parsed = JSON.parse(config) as { mode?: string };
    return parsed.mode || 'unknown';
  });
}

// Re-export expect
export { expect } from '@playwright/test';

// Re-export common helpers
export * from '../common';
