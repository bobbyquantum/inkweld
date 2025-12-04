import { Page, test as base } from '@playwright/test';

/**
 * Docker E2E Test Fixtures
 *
 * These fixtures work with the Docker container which serves
 * both frontend and API from the same port (8333).
 *
 * The container runs with a SQLite database for test isolation.
 */

export type DockerTestFixtures = {
  /**
   * Anonymous page (no authentication).
   * Configured for server mode but not logged in.
   */
  anonymousPage: Page;

  /**
   * Authenticated user page.
   * Creates and logs in a unique test user via the containerized backend.
   */
  authenticatedPage: Page;

  /**
   * Offline mode page (configured for offline storage).
   * Used for testing migration scenarios where we switch between modes.
   */
  offlinePage: Page;
};

// Docker serves everything on port 8333
const DOCKER_URL = 'http://localhost:8333';

/**
 * Generate a unique test identifier
 */
function generateTestId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

/**
 * Extended test with Docker fixtures
 */
export const test = base.extend<DockerTestFixtures>({
  // Anonymous page (no authentication)
  anonymousPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Set up app configuration for server mode (Docker serves on 8333)
    await page.addInitScript((serverUrl: string) => {
      localStorage.setItem(
        'inkweld-app-config',
        JSON.stringify({
          mode: 'server',
          serverUrl: serverUrl,
        })
      );
    }, DOCKER_URL);

    await use(page);
    await context.close();
  },

  // Authenticated user page
  authenticatedPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    const testId = generateTestId();
    const username = `testuser-${testId}`;
    const password = 'TestPassword123!';

    // Register and authenticate user via API
    const token = await authenticateUser(page, username, password, true);

    // Set up app configuration with auth token
    await page.addInitScript(
      ({ authToken, serverUrl }: { authToken: string; serverUrl: string }) => {
        localStorage.setItem(
          'inkweld-app-config',
          JSON.stringify({
            mode: 'server',
            serverUrl: serverUrl,
          })
        );
        localStorage.setItem('auth_token', authToken);
      },
      { authToken: token, serverUrl: DOCKER_URL }
    );

    // Navigate to the app
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for the app to fully initialize
    await page.waitForFunction(
      () => {
        return (
          !window.location.pathname.includes('setup') &&
          !window.location.pathname.includes('welcome')
        );
      },
      { timeout: 15000 }
    );

    // Store credentials for potential later use
    // @ts-expect-error - Dynamic property for test context
    page.testCredentials = { username, password };

    await use(page);
    await context.close();
  },

  // Offline mode page
  offlinePage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    const testId = generateTestId();
    const username = `offline-user-${testId}`;

    // Navigate first
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Set up app configuration for offline mode
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

      localStorage.setItem('inkweld-offline-user', JSON.stringify(userProfile));
      localStorage.removeItem('inkweld-offline-projects');
    }, username);

    // Reload to apply the configuration
    await page.reload({ waitUntil: 'domcontentloaded' });

    await use(page);
    await context.close();
  },
});

/**
 * Helper to authenticate user via Docker container API
 */
export async function authenticateUser(
  page: Page,
  username: string,
  password: string,
  isRegister: boolean = true
): Promise<string> {
  const apiUrl = DOCKER_URL;

  if (isRegister) {
    const registerResponse = await page.request.post(
      `${apiUrl}/api/v1/auth/register`,
      {
        data: { username, password },
      }
    );

    if (!registerResponse.ok()) {
      throw new Error(
        `Registration failed: ${registerResponse.status()} ${await registerResponse.text()}`
      );
    }

    const registerData = (await registerResponse.json()) as { token: string };
    return registerData.token;
  } else {
    const loginResponse = await page.request.post(
      `${apiUrl}/api/v1/auth/login`,
      {
        data: { username, password },
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

// Re-export expect for convenience
export { expect } from '@playwright/test';
