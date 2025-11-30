import { Page, Route } from '@playwright/test';

import { MockApiRegistry } from './registry';

/**
 * Main Mock API class for handling API mocking in e2e tests.
 * Implements singleton pattern to ensure consistent API mocking across tests.
 */
export class MockApi {
  private static instance: MockApi;
  private registry: MockApiRegistry;

  private constructor() {
    this.registry = new MockApiRegistry();
  }

  /**
   * Get the singleton instance of MockApi
   */
  public static getInstance(): MockApi {
    if (!MockApi.instance) {
      MockApi.instance = new MockApi();
    }
    return MockApi.instance;
  }

  /**
   * Set up API request interception for a Playwright page
   * @param page - Playwright page to configure
   */
  public async setupPageInterception(page: Page): Promise<void> {
    console.log('Setting up API mocking for page');

    // Register default handlers
    await this.registerDefaultHandlers(page);

    // Register custom route handlers from registry
    for (const [pattern, handler] of this.registry.getHandlers()) {
      await page.route(pattern, handler);
    }
  }

  /**
   * Register default API handlers that will be used across most tests
   * @param page - Playwright page to configure
   */
  private async registerDefaultHandlers(page: Page): Promise<void> {
    // Default handler for all API requests that don't match specific handlers
    // Use regex to match localhost:8333 which is a different origin from the page
    await page.route(/localhost:8333.*\/api\//, async route => {
      const url = route.request().url();
      console.log(`Handling request: ${url}`);

      // Check if we have a specific handler for this route
      const handled = await this.registry.tryHandleRoute(route);
      if (!handled) {
        // Default behavior for unhandled requests is to return 404
        console.warn(`No handler found for ${url}, returning 404`);
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({
            message: 'Not Found',
            error: 'Not Found',
            statusCode: 404,
          }),
        });
      }
    });
  }

  /**
   * Add a mock handler to the registry
   * @param pattern - URL pattern as a regex string
   * @param handler - Route handler function
   */
  public addHandler(
    pattern: string,
    handler: (route: Route) => Promise<void>
  ): void {
    this.registry.addHandler(pattern, handler);
  }

  /**
   * Reset all handlers (useful between tests)
   */
  public resetHandlers(): void {
    this.registry = new MockApiRegistry();
  }
}

// Export a singleton instance for easy import
export const mockApi = MockApi.getInstance();
