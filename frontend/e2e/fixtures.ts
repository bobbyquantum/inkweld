import { test as base, expect as baseExpect, Page } from '@playwright/test';
import { mockApi } from './mock-api';
import { setupAuthHandlers } from './mock-api/auth';
import { setupUserHandlers } from './mock-api/users';
import { setupConfigHandlers } from './mock-api/config';
import { setupProjectHandlers } from './mock-api/projects';

/**
 * Initialize all mock API handlers
 * This should be called only once
 */
function initializeMockApi(): void {
  setupAuthHandlers();
  setupUserHandlers();
  setupConfigHandlers();
  setupProjectHandlers();
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

  // Authenticated user state (server mode)
  authenticatedPage: Page;

  // Authenticated user state (offline mode)
  offlineAuthenticatedPage: Page;

  // Admin user state
  adminPage: Page;
};

/**
 * Extended test with our custom fixtures
 */
export const test = base.extend<TestFixtures>({
  // Base page setup (for anonymous user)
  anonymousPage: async ({ page }, use) => {
    // Block Service Worker to ensure API mocking works reliably
    await page.route('**/ngsw-worker.js', route => route.abort());

    // Set up mock API interception
    await mockApi.setupPageInterception(page);

    // Set up app configuration in localStorage
    await page.addInitScript(async () => {
      // Unregister any existing Service Workers
      if (window.navigator.serviceWorker) {
        const registrations = await window.navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      }

      localStorage.setItem('inkweld-app-config', JSON.stringify({
        mode: 'server',
        serverUrl: 'http://localhost:8333'
      }));
    });

    // No authentication state is set
    console.log('Setting up page for anonymous user');

    await use(page);
  },

  // Authenticated user (server mode)
  authenticatedPage: async ({ page }, use) => {
    // Block Service Worker to ensure API mocking works reliably
    await page.route('**/ngsw-worker.js', route => route.abort());

    // Set up mock API interception
    await mockApi.setupPageInterception(page);

    // Set up app configuration and auth token in localStorage
    await page.addInitScript(async () => {
      // Unregister any existing Service Workers
      if (window.navigator.serviceWorker) {
        const registrations = await window.navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      }

      localStorage.setItem('inkweld-app-config', JSON.stringify({
        mode: 'server',
        serverUrl: 'http://localhost:8333'
      }));
      // Set mock auth token for authenticated user
      localStorage.setItem('auth_token', 'mock-token-testuser');
    });

    console.log('Setting up page for authenticated user (server mode)');
    console.log('Mock auth token set for authenticated user');

    // Navigate to the base URL *after* setting the auth token
    await page.goto('/');
    
    // Wait for projects to be loaded (the loading state should appear and disappear)
    // Or wait for at least one project card to appear or the empty state
    await page.waitForFunction(() => {
      const loadingElement = document.querySelector('[data-testid="loading-projects"]');
      const projectCards = document.querySelectorAll('[data-testid="project-card"]');
      const emptyState = document.querySelector('.empty-state');
      // Either we have projects, we have empty state, or we're done loading
      return projectCards.length > 0 || emptyState !== null || loadingElement === null;
    }, { timeout: 10000 });

    await use(page);
  },

  // Authenticated user (offline mode - for tests that use Yjs without WebSocket)
  offlineAuthenticatedPage: async ({ page }, use) => {
    // We DO NOT block Service Worker here as offline mode might depend on it
    // Set up mock API interception
    await mockApi.setupPageInterception(page);

    // Set up app configuration and offline user in localStorage (OFFLINE MODE)
    await page.addInitScript(() => {
      // Offline mode configuration with user profile
      localStorage.setItem('inkweld-app-config', JSON.stringify({
        mode: 'offline',
        userProfile: {
          username: 'testuser',
          name: 'Test User'
        }
      }));
      
      // Set offline user data
      localStorage.setItem('inkweld-offline-user', JSON.stringify({
        id: '',
        username: 'testuser',
        name: 'Test User',
        enabled: true
      }));
    });

    console.log('Setting up page for authenticated user (offline mode)');
    console.log('Offline user profile configured');

    // Navigate to the base URL *after* setting the offline config
    await page.goto('/');
    
    // In offline mode, we need to create a project via UI since there's no API
    // Wait for the "Create Project" button to appear
    const createButton = page.getByText('Create Project');
    await createButton.waitFor({ state: 'visible', timeout: 10000 });
    
    // Click create project button
    await createButton.click();
    
    // Fill in project details using testids
    await page.getByTestId('project-title-input').fill('Test Project');
    await page.getByTestId('project-slug-input').fill('test-project');
    await page.getByTestId('project-description-input').fill('A test project for e2e tests');
    
    // Submit the form
    await page.getByTestId('create-project-button').click();
    
    // Wait for navigation to the project page
    await page.waitForURL(/.*\/testuser\/test-project/, { timeout: 10000 });
    
    // Navigate back to home page so project card is available for tests
    await page.goto('/');
    
    // Wait for project card to appear
    await page.waitForSelector('[data-testid="project-card"]', { timeout: 10000 });

    await use(page);
  },

  // Admin user
  adminPage: async ({ page }, use) => {
    // Block Service Worker to ensure API mocking works reliably
    await page.route('**/ngsw-worker.js', route => route.abort());

    // Set up mock API interception
    await mockApi.setupPageInterception(page);

    // Set up app configuration and auth token in localStorage
    await page.addInitScript(async () => {
      // Unregister any existing Service Workers
      if (window.navigator.serviceWorker) {
        const registrations = await window.navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      }

      localStorage.setItem('inkweld-app-config', JSON.stringify({
        mode: 'server',
        serverUrl: 'http://localhost:8333'
      }));
      // Set mock auth token for admin user
      localStorage.setItem('auth_token', 'mock-token-adminuser');
    });

    console.log('Setting up page for admin user');
    console.log('Mock auth token set for admin user');

    // Navigate to the base URL *after* setting the auth token
    await page.goto('/');

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
 * @param password Password for registration (defaults to 'ValidPass123!')
 */
export async function registerViaUI(
  page: Page,
  username: string,
  password = 'ValidPass123!'
): Promise<void> {
  await page.goto('/register');
  await page.getByTestId('username-input').fill(username);
  await page.getByTestId('password-input').fill(password);
  await page.getByTestId('confirm-password-input').fill(password);

  await page.getByTestId('register-button').click();

  // Wait for redirect to home page
  await page.waitForURL('/');
}

/**
 * Helper to create a project via UI interaction
 * @param page Playwright page
 * @param title Project title
 * @param slug Project slug
 * @param description Optional project description
 */
export async function createProjectViaUI(
  page: Page,
  title: string,
  slug: string,
  description?: string
): Promise<void> {
  await page.goto('/create-project');
  await page.getByTestId('project-title-input').fill(title);
  await page.getByTestId('project-slug-input').fill(slug);

  if (description) {
    await page.getByTestId('project-description-input').fill(description);
  }

  await page.getByTestId('create-project-button').click();

  // Wait for redirect to project page
  await page.waitForURL(/.*\/.*/);
}

// Re-export expect for convenience
export { baseExpect as expect };
