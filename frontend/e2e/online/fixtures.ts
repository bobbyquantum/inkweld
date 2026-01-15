import { expect, Page, test as base } from '@playwright/test';
export type { Page };

/**
 * Interface for controlling server availability in tests.
 * Attached to serverUnavailablePage as page.serverControl
 */
export interface ServerControl {
  /** Restore server connectivity (stop blocking requests) */
  restore: () => Promise<void>;
  /** Block server again after restoring */
  block: () => Promise<void>;
  /** Block only specific API endpoints */
  blockEndpoints: (endpoints: string[]) => Promise<void>;
  /** Simulate slow/unreliable network (delays then fails) */
  simulateUnreliable: (delayMs?: number) => Promise<void>;
}

/**
 * Extended Page type with server control methods
 */
export type ServerUnavailablePage = Page & {
  serverControl: ServerControl;
  testCredentials: {
    username: string;
    password: string;
    isServerDown: boolean;
  };
};

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

  /**
   * Server unavailable page.
   * Configured for server mode but with API requests blocked.
   * Useful for testing local-first fallback behavior.
   */
  serverUnavailablePage: Page;
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

    // Suppress console logs for cleaner test output
    page.on('console', () => {});

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

    // Suppress console logs for cleaner test output
    page.on('console', () => {});

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

    // Wait for the user menu button to be visible - this is the most reliable
    // indicator that authentication succeeded and the app is fully initialized
    try {
      await page.locator('[data-testid="user-menu-button"]').waitFor();
    } catch {
      // If user menu didn't appear, check what state we're in for better error message
      const welcomeHeading = await page
        .locator('[data-testid="welcome-heading"]')
        .isVisible()
        .catch(() => false);
      const approvalPending = page.url().includes('approval-pending');
      const currentUrl = page.url();

      if (welcomeHeading) {
        throw new Error(
          `authenticatedPage fixture failed: app shows welcome/login screen instead of authenticated state. ` +
            `Token may be invalid or not being sent. URL: ${currentUrl}`
        );
      } else if (approvalPending) {
        throw new Error(
          `authenticatedPage fixture failed: user is pending approval. URL: ${currentUrl}`
        );
      } else {
        throw new Error(
          `authenticatedPage fixture failed: user menu not visible after 15s. URL: ${currentUrl}`
        );
      }
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

    // Suppress console logs for cleaner test output
    page.on('console', () => {});

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

    // Wait for the user menu button to be visible - this is the most reliable
    // indicator that authentication succeeded and the app is fully initialized
    try {
      await page.locator('[data-testid="user-menu-button"]').waitFor();
    } catch {
      // If user menu didn't appear, check what state we're in for better error message
      const welcomeHeading = await page
        .locator('[data-testid="welcome-heading"]')
        .isVisible()
        .catch(() => false);
      const approvalPending = page.url().includes('approval-pending');
      const currentUrl = page.url();

      if (welcomeHeading) {
        throw new Error(
          `adminPage fixture failed: app shows welcome/login screen instead of authenticated state. ` +
            `Token may be invalid or not being sent. URL: ${currentUrl}`
        );
      } else if (approvalPending) {
        throw new Error(
          `adminPage fixture failed: admin user is pending approval. URL: ${currentUrl}`
        );
      } else {
        throw new Error(
          `adminPage fixture failed: user menu not visible after 15s. URL: ${currentUrl}`
        );
      }
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

    // Suppress console logs for cleaner test output
    page.on('console', () => {});

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
          mode: 'local',
          userProfile,
        })
      );

      // IMPORTANT: Also set the offline user directly so OfflineUserService recognizes authentication
      localStorage.setItem('inkweld-local-user', JSON.stringify(userProfile));

      // Clear any existing offline projects
      localStorage.removeItem('inkweld-local-projects');
    }, username);

    // Reload to apply the configuration
    await page.reload({ waitUntil: 'domcontentloaded' });

    await use(page);

    // Cleanup
    await context.close();
  },

  // Server unavailable page - authenticated user but with API blocked
  serverUnavailablePage: async ({ browser }, use) => {
    // Create a new context for isolation
    const context = await browser.newContext();
    const page = await context.newPage();

    // Suppress console logs for cleaner test output
    page.on('console', () => {});

    const testId = generateTestId();
    const username = `server-unavail-${testId}`;
    const password = 'TestPassword123!';

    const apiUrl = getApiBaseUrl();

    // Step 1: Register and authenticate user FIRST (server must be up)
    const token = await authenticateUser(page, username, password, true);

    // Step 2: Set up app configuration with auth token
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

    // Step 3: Navigate to app and confirm auth works while server is up
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for auth to complete
    try {
      await page.locator('[data-testid="user-menu-button"]').waitFor();
    } catch {
      throw new Error(
        `serverUnavailablePage fixture failed: authentication did not complete. URL: ${page.url()}`
      );
    }

    // Step 4: NOW block the server to simulate it going down
    await page.route(`${apiUrl}/**`, async route => {
      await route.abort('connectionfailed');
    });

    // Also block WebSocket connections to simulate full server unavailability
    await page.route('ws://**', async route => {
      await route.abort('connectionfailed');
    });

    // Attach helper methods to the page for dynamic control
    // @ts-expect-error - Dynamic property for test context
    page.serverControl = {
      /**
       * Restore server connectivity (stop blocking requests)
       */
      restore: async () => {
        await page.unroute(`${apiUrl}/**`);
        await page.unroute('ws://**');
      },
      /**
       * Block server again after restoring
       */
      block: async () => {
        await page.route(`${apiUrl}/**`, async route => {
          await route.abort('connectionfailed');
        });
        await page.route('ws://**', async route => {
          await route.abort('connectionfailed');
        });
      },
      /**
       * Block only specific API endpoints
       */
      blockEndpoints: async (endpoints: string[]) => {
        for (const endpoint of endpoints) {
          await page.route(`${apiUrl}${endpoint}`, async route => {
            await route.abort('connectionfailed');
          });
        }
      },
      /**
       * Simulate slow/unreliable network (delays then fails)
       */
      simulateUnreliable: async (delayMs: number = 3000) => {
        await page.unroute(`${apiUrl}/**`);
        await page.route(`${apiUrl}/**`, async route => {
          await new Promise(resolve => setTimeout(resolve, delayMs));
          await route.abort('connectionfailed');
        });
      },
    };

    // Store test credentials for reference
    // @ts-expect-error - Dynamic property for test context
    page.testCredentials = {
      username,
      password,
      isServerDown: true,
    };

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
    // Register via API with retry for transient approval-required errors and network issues
    // This can happen when another test temporarily toggles USER_APPROVAL_REQUIRED
    // or when the server is under heavy load during parallel tests
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const usernameToTry =
        attempt > 1 ? `${username}-retry${attempt}` : username;

      let registerResponse;
      try {
        registerResponse = await page.request.post(
          `${apiUrl}/api/v1/auth/register`,
          {
            data: {
              username: usernameToTry,
              password,
            },
          }
        );
      } catch (networkError) {
        // Handle network errors (socket hang up, connection refused, etc.)
        if (attempt < maxRetries) {
          console.warn(
            `Network error during registration (attempt ${attempt}/${maxRetries}):`,
            networkError
          );
          await new Promise(r => setTimeout(r, retryDelay * attempt));
          continue;
        }
        throw new Error(
          `Registration failed after ${maxRetries} network error attempts: ${String(networkError)}`
        );
      }

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
  // Go to home page and open register dialog
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  // Click the register button on the welcome section to open the dialog
  await page.locator('[data-testid="welcome-register-button"]').click();

  // Wait for the dialog to appear
  await expect(page.getByTestId('register-dialog')).toBeVisible();

  // Wait for OAuth providers to load (which enables the register button once form is valid)
  // Register button remains disabled until providersLoaded is true
  const loadingSpinner = page.locator(
    'mat-dialog-container mat-progress-spinner'
  );
  if (await loadingSpinner.isVisible().catch(() => false)) {
    await loadingSpinner.waitFor({ state: 'hidden' });
  }

  await page.locator('[data-testid="username-input"]').fill(username);
  await page.locator('[data-testid="username-input"]').blur();

  // Wait for username availability check (async validation)
  await expect(
    page.locator('[data-testid="username-available-icon"]')
  ).toBeVisible();

  await page.locator('[data-testid="password-input"]').fill(password);
  await page.locator('[data-testid="confirm-password-input"]').fill(password);

  // Blur the last field to trigger validation
  await page.locator('[data-testid="confirm-password-input"]').blur();

  // Wait for the register button to be enabled (not just visible)
  const registerButton = page.locator(
    'mat-dialog-container [data-testid="register-button"]'
  );
  await expect(registerButton).toBeEnabled();

  // Click register and wait for dialog to close
  await registerButton.click();

  // Wait for network to settle
  await page.waitForLoadState('networkidle');

  // Wait for dialog to close (indicates success)
  await expect(page.getByTestId('register-dialog')).toBeHidden();

  // Verify token was stored (registration should auto-login)
  const token = await page.evaluate(() => localStorage.getItem('auth_token'));
  if (!token) {
    throw new Error(
      'registerUser: Expected auth_token in localStorage after registration, but none found'
    );
  }

  // Wait for the user menu to appear (indicates successful authentication)
  try {
    await expect(
      page.locator('[data-testid="user-menu-button"]')
    ).toBeVisible();
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

  // Wait for Step 2 elements to be visible
  await expect(
    page.locator('[data-testid="project-title-input"]')
  ).toBeVisible();

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
  await expect(page).toHaveURL(new RegExp(`.*${slug}.*`));
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

  // Wait for Step 2 elements to be visible
  await expect(
    page.locator('[data-testid="project-title-input"]')
  ).toBeVisible();

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
  await expect(page).toHaveURL(new RegExp(`.*${slug}.*`));

  // Wait for localStorage to be updated by checking it directly
  await page.waitForFunction(expectedSlug => {
    const stored = localStorage.getItem('inkweld-local-projects');
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
 * Helper to open user settings
 */
export async function openUserSettings(page: Page): Promise<void> {
  // Look for user menu button by data-testid only (no fallback)
  const userMenuButton = page.locator('[data-testid="user-menu-button"]');

  // Wait for button to be visible
  await userMenuButton.waitFor();
  await userMenuButton.click();

  // Click settings option
  const settingsOption = page.getByRole('menuitem', { name: /settings/i });
  await settingsOption.waitFor();
  await settingsOption.click();
}

/**
 * Helper to verify offline project exists in localStorage
 */
export async function getOfflineProjects(
  page: Page
): Promise<Array<{ slug: string }>> {
  return page.evaluate(() => {
    const stored = localStorage.getItem('inkweld-local-projects');
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
