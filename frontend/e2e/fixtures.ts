import { test as base, expect as baseExpect, Page } from '@playwright/test';
import { mockApi } from './mock-api';
import { setupAuthHandlers } from './mock-api/auth';
import { setupUserHandlers } from './mock-api/users';

/**
 * Initialize all mock API handlers
 * This should be called only once
 */
function initializeMockApi(): void {
  setupAuthHandlers();
  setupUserHandlers();
  // Add other mock handlers initialization here
}

// Initialize only once
let initialized = false;
if (!initialized) {
  initializeMockApi();
  initialized = true;
}

/**
 * Auth state types for fixtures
 */
export type AuthState = 'anonymous' | 'authenticated' | 'admin';

/**
 * Custom test fixtures for authentication and API mocking
 */
export type TestFixtures = {
  // Anonymous state (default)
  anonymousPage: Page;

  // Authenticated user state
  authenticatedPage: Page;

  // Admin user state
  adminPage: Page;
};

/**
 * Extended test with our custom fixtures
 */
export const test = base.extend<TestFixtures>({
  // Base page setup (for anonymous user)
  anonymousPage: async ({ page }, use) => {
    // Set up mock API interception
    await mockApi.setupPageInterception(page);

    // No authentication state is set
    console.log('Setting up page for anonymous user');

    await use(page);
  },

  // Authenticated user
  authenticatedPage: async ({ page }, use) => {
    // Set up mock API interception
    await mockApi.setupPageInterception(page);

    console.log('Setting up page for authenticated user');

    // First navigate to the base URL
    await page.goto('/');

    // Set up auth state by storing auth token in localStorage
    try {
      await page.evaluate(() => {
        localStorage.setItem('authToken', 'mock-token-testuser-123');

        // Add auth headers to all future requests to ensure API calls work
        // This is a fallback in case localStorage access doesn't work for auth
        (window as any).testAuthToken = 'mock-token-testuser-123';
      });
      console.log('Auth token set for authenticated user');
    } catch (error) {
      console.warn('Failed to set localStorage auth token:', error);
      // We'll rely on API mocking directly instead
    }

    await use(page);
  },

  // Admin user
  adminPage: async ({ page }, use) => {
    // Set up mock API interception
    await mockApi.setupPageInterception(page);

    console.log('Setting up page for admin user');

    // First navigate to the base URL
    await page.goto('/');

    // Set up admin auth state
    try {
      await page.evaluate(() => {
        localStorage.setItem('authToken', 'mock-token-adminuser-123');

        // Add auth headers to all future requests to ensure API calls work
        // This is a fallback in case localStorage access doesn't work for auth
        (window as any).testAuthToken = 'mock-token-adminuser-123';
      });
      console.log('Auth token set for admin user');
    } catch (error) {
      console.warn('Failed to set localStorage auth token:', error);
      // We'll rely on API mocking directly instead
    }

    await use(page);
  },
});

/**
 * Helper function to log in a user through UI interaction
 * @param page Playwright page
 * @param username Username to log in with
 * @param password Password to log in with (defaults to 'correct-password')
 */
export async function loginViaUI(
  page: Page,
  username = 'testuser',
  password = 'correct-password'
): Promise<void> {
  await page.goto('/welcome');
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');

  await page.waitForURL('/');
}

/**
 * Helper to register a new user via UI interaction
 * @param page Playwright page
 * @param username Username for registration
 * @param password Password for registration
 * @param name Optional display name
 */
export async function registerViaUI(
  page: Page,
  username: string,
  password = 'correct-password',
  name?: string
): Promise<void> {
  await page.goto('/register');
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.fill('input[name="confirmPassword"]', password);

  if (name) {
    await page.fill('input[name="name"]', name);
  }

  await page.click('button[type="submit"]');

  // Wait for redirect to home page
  await page.waitForURL('/');
}

// Re-export expect for convenience
export { baseExpect as expect };
