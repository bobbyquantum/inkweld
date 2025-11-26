/**
 * Screenshot test fixtures
 *
 * These fixtures are designed for generating promotional screenshots
 * and are separate from the main e2e test suite.
 */
import { expect as baseExpect, Page, test as base } from '@playwright/test';

import { mockApi } from '../mock-api';
import { setupAuthHandlers } from '../mock-api/auth';
import { setupConfigHandlers } from '../mock-api/config';
import { mockProjects, setupProjectHandlers } from '../mock-api/projects';
import { setupUserHandlers } from '../mock-api/users';

/**
 * Initialize all mock API handlers
 */
function initializeMockApi(): void {
  setupAuthHandlers();
  setupUserHandlers();
  setupConfigHandlers();
  setupProjectHandlers();
}

// Initialize only once
let initialized = false;
if (!initialized) {
  initializeMockApi();
  initialized = true;
}

/**
 * Demo projects for screenshots
 */
const demoProjects = [
  {
    id: 'screenshot-1',
    title: 'The Worldbuilding Chronicles',
    description: 'An epic fantasy world with detailed lore and characters',
    username: 'testuser',
    slug: 'worldbuilding-chronicles',
    coverImageUrl: '/assets/demo_covers/worldbuilding_cover_1.png',
    createdAt: new Date('2025-01-15').toISOString(),
    updatedAt: new Date('2025-10-20').toISOString(),
  },
  {
    id: 'screenshot-2',
    title: 'Inkweld Demo Project',
    description: 'A sample project showcasing collaborative writing features',
    username: 'testuser',
    slug: 'inkweld-demo',
    coverImageUrl: '/assets/demo_covers/inkweld_cover_1.png',
    createdAt: new Date('2025-02-10').toISOString(),
    updatedAt: new Date('2025-10-18').toISOString(),
  },
  {
    id: 'screenshot-3',
    title: 'Mystery Novel Draft',
    description: 'A thrilling detective story set in Victorian London',
    username: 'testuser',
    slug: 'mystery-novel',
    coverImageUrl: '/assets/demo_covers/demo_cover_1.png',
    createdAt: new Date('2025-03-05').toISOString(),
    updatedAt: new Date('2025-10-15').toISOString(),
  },
];

/**
 * Custom test fixtures for screenshot generation
 */
export type ScreenshotFixtures = {
  // Authenticated user with demo projects (server mode with mock API)
  authenticatedPage: Page;

  // Offline mode page for editor screenshots
  offlinePage: Page;
};

/**
 * Extended test with screenshot fixtures
 */
export const test = base.extend<ScreenshotFixtures>({
  // Authenticated user with demo projects
  authenticatedPage: async ({ page }, use) => {
    // Reset and add demo projects
    mockProjects.resetProjects();
    demoProjects.forEach(project => {
      mockProjects.addProject(project);
    });

    // Set up mock API interception
    await mockApi.setupPageInterception(page);

    // Set up app configuration and auth token in localStorage
    await page.addInitScript(() => {
      localStorage.setItem(
        'inkweld-app-config',
        JSON.stringify({
          mode: 'server',
          serverUrl: 'http://localhost:8333',
        })
      );
      // Set mock auth token for authenticated user
      localStorage.setItem('auth_token', 'mock-token-testuser');
    });

    console.log('Setting up screenshot page with demo projects');

    // Navigate to the base URL
    await page.goto('/', { waitUntil: 'networkidle' });

    // Wait for projects to be loaded
    await page.waitForFunction(
      () => {
        const loadingElement = document.querySelector(
          '[data-testid="loading-projects"]'
        );
        const projectCards = document.querySelectorAll(
          '[data-testid="project-card"]'
        );
        const emptyState = document.querySelector('.empty-state');
        return (
          projectCards.length > 0 ||
          emptyState !== null ||
          loadingElement === null
        );
      },
      { timeout: 10000 }
    );

    await use(page);
  },

  // Offline mode page for editor screenshots
  offlinePage: async ({ page }, use) => {
    // Configure offline mode to avoid WebSocket connection attempts
    await page.addInitScript(() => {
      localStorage.setItem(
        'inkweld-app-config',
        JSON.stringify({
          mode: 'offline',
          userProfile: {
            name: 'Demo User',
            username: 'demouser',
          },
        })
      );
    });

    console.log('Setting up offline page for editor screenshots');

    await use(page);
  },
});

// Re-export expect for convenience
export { baseExpect as expect };
