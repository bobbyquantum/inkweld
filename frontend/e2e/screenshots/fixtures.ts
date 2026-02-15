/**
 * Screenshot test fixtures
 *
 * These fixtures are designed for generating promotional screenshots
 * and are separate from the main e2e test suite.
 */
import { expect as baseExpect, Page, test as base } from '@playwright/test';

import { mockApi } from './mock-api';
import { setupAiImageHandlers } from './mock-api/ai-image';
import { setupAuthHandlers } from './mock-api/auth';
import { setupConfigHandlers } from './mock-api/config';
import { mockProjects, setupProjectHandlers } from './mock-api/projects';
import { setupUserHandlers } from './mock-api/users';

/**
 * Initialize all mock API handlers
 */
function initializeMockApi(): void {
  // Reset the mock API to ensure clean state
  mockApi.resetHandlers();

  setupAuthHandlers();
  setupUserHandlers();
  setupConfigHandlers();
  setupProjectHandlers();
  setupAiImageHandlers();
}

async function initializeServerFixturePage(
  page: Page,
  includeDemoProjects = false
): Promise<void> {
  page.on('console', () => {});

  initializeMockApi();

  if (includeDemoProjects) {
    mockProjects.resetProjects();
    demoProjects.forEach(project => {
      mockProjects.addProject(project);
    });
  }

  await mockApi.setupPageInterception(page);

  await new Promise(resolve => setTimeout(resolve, 100));

  await page.addInitScript(() => {
    const now = Date.now();
    localStorage.setItem(
      'inkweld-app-config',
      JSON.stringify({
        version: 2,
        activeConfigId: 'screenshot-server',
        configurations: [
          {
            id: 'screenshot-server',
            type: 'server',
            displayName: 'Screenshot Test Server',
            serverUrl: 'http://localhost:8333',
            addedAt: new Date(now).toISOString(),
            lastUsedAt: new Date(now).toISOString(),
          },
        ],
      })
    );
    localStorage.setItem(
      'srv:screenshot-server:auth_token',
      'mock-token-testuser'
    );
  });
}

// Initialize handlers before each test
// Note: initializeMockApi is called per-fixture to ensure clean state

/**
 * Demo projects for screenshots
 */
const demoProjects = [
  {
    id: 'screenshot-1',
    title: 'The Worldbuilding Chronicles',
    slug: 'worldbuilding-chronicles',
    description: 'An epic fantasy world with detailed lore and characters',
    username: 'testuser',
    coverImage: '/assets/demo_covers/worldbuilding_cover_1.png',
    createdDate: new Date('2025-01-15').toISOString(),
    updatedDate: new Date('2025-10-20').toISOString(),
  },
  {
    id: 'screenshot-2',
    title: 'Inkweld Demo Project',
    slug: 'inkweld-demo',
    description: 'A sample project showcasing collaborative writing features',
    username: 'testuser',
    coverImage: '/assets/demo_covers/inkweld_cover_1.png',
    createdDate: new Date('2025-02-10').toISOString(),
    updatedDate: new Date('2025-10-18').toISOString(),
  },
  {
    id: 'screenshot-3',
    title: 'Mystery Novel Draft',
    slug: 'mystery-novel',
    description: 'A thrilling detective story set in Victorian London',
    username: 'testuser',
    coverImage: '/assets/demo_covers/demo_cover_1.png',
    createdDate: new Date('2025-03-05').toISOString(),
    updatedDate: new Date('2025-10-15').toISOString(),
  },
];

/**
 * Custom test fixtures for screenshot generation
 */
export type ScreenshotFixtures = {
  // Authenticated user with demo projects (server mode with mock API)
  authenticatedPage: Page;

  // Admin user page for admin settings screenshots
  adminPage: Page;

  // Offline mode page for editor screenshots
  offlinePage: Page;

  // Unconfigured page (shows setup screen)
  unconfiguredPage: Page;
};

/**
 * Extended test with screenshot fixtures
 */
export const test = base.extend<ScreenshotFixtures>({
  // Authenticated user with demo projects
  authenticatedPage: async ({ page }, use) => {
    await initializeServerFixturePage(page, true);

    // First, do a blank navigation to establish the page context with localStorage
    await page.goto('about:blank');

    // Now navigate to the app and wait for API responses
    const userApiPromise = page.waitForResponse(
      resp => resp.url().includes('/api/v1/users/me') && resp.status() === 200
    );

    // Navigate and wait for DOM to be ready
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Wait for user API to respond first

    await userApiPromise;

    // Now wait for projects API - it should be called after user is authenticated
    // But if isAuthenticated() was checked before user loaded, projects won't load
    // So we also set up a fallback: if no projects appear, reload the page
    try {
      await page.waitForSelector('.project-card', {
        state: 'visible',
      });
    } catch {
      // Projects didn't load - this means the race condition happened
      // Reload the page now that user is cached

      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.project-card', {
        state: 'visible',
      });
    }

    await use(page);
  },

  // Admin page fixture - ensures user is loaded before navigating to admin routes
  adminPage: async ({ page }, use) => {
    await initializeServerFixturePage(page);

    // First, navigate to home to establish user session
    await page.goto('about:blank');

    // Navigate to home and wait for user and features to be loaded
    const userApiPromise = page.waitForResponse(
      resp => resp.url().includes('/api/v1/users/me') && resp.status() === 200
    );
    const featuresApiPromise = page.waitForResponse(
      resp =>
        resp.url().includes('/api/v1/config/features') && resp.status() === 200
    );

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Wait for user API to respond

    await userApiPromise;

    // Also wait for features API (needed for AI kill switch state)

    try {
      await featuresApiPromise;
    } catch {
      // Ignore features API timeout
    }

    // Wait for the page to fully render and Angular to process the user
    await page.waitForLoadState('networkidle');

    // Wait for the user menu to appear (indicates user is authenticated)
    try {
      await page.waitForSelector(
        '[data-testid="user-menu-button"], .user-menu'
      );
    } catch {
      await page.waitForTimeout(2000);
    }

    // The adminPage fixture is ready - tests can navigate to admin routes

    await use(page);
  },

  // Offline mode page for editor screenshots
  offlinePage: async ({ page }, use) => {
    // Suppress console logs for cleaner test output
    page.on('console', () => {});

    // Configure offline mode with v2 config format
    await page.addInitScript(() => {
      const now = Date.now();
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
                name: 'Demo User',
                username: 'demouser',
              },
              addedAt: new Date(now).toISOString(),
              lastUsedAt: new Date(now).toISOString(),
            },
          ],
        })
      );
    });

    await use(page);
  },

  // Unconfigured page fixture - shows setup screen
  unconfiguredPage: async ({ page }, use) => {
    // Suppress console logs for cleaner test output
    page.on('console', () => {});

    // Ensure no config is set - clear any existing localStorage
    await page.addInitScript(() => {
      localStorage.removeItem('inkweld-app-config');
      localStorage.removeItem('auth_token');
    });

    // Navigate to about:blank first to ensure clean state
    await page.goto('about:blank');

    await use(page);
  },
});

// Re-export expect for convenience
export { baseExpect as expect };
