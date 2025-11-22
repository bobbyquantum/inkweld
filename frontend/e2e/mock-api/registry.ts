import { Route } from '@playwright/test';

/**
 * Registry for mock API handlers.
 * Manages the registration and lookup of route handlers for API mocking.
 */
export class MockApiRegistry {
  private handlers: Map<string, (route: Route) => Promise<void>> = new Map();

  /**
   * Add a handler for a specific route pattern
   * @param pattern - URL pattern as a regex string
   * @param handler - Route handler function
   */
  public addHandler(
    pattern: string,
    handler: (route: Route) => Promise<void>
  ): void {
    this.handlers.set(pattern, handler);
  }

  /**
   * Get all registered handlers
   * @returns Map of pattern to handler functions
   */
  public getHandlers(): Map<string, (route: Route) => Promise<void>> {
    return this.handlers;
  }

  /**
   * Try to handle a route with registered handlers
   * @param route - The Playwright route to handle
   * @returns boolean indicating if route was handled
   */
  public async tryHandleRoute(route: Route): Promise<boolean> {
    const url = route.request().url();

    // Try to find a handler that matches the URL
    for (const [pattern, handler] of this.handlers.entries()) {
      // Convert glob-style patterns to proper regex
      // First, preserve $ at the end as a placeholder
      const preservedPattern = pattern.replace(/\$$/, '__END_ANCHOR__');

      // Replace ** with a regex-safe placeholder (matches any characters including /)
      // Replace single * with another placeholder (matches any characters except /)
      const safePattern = preservedPattern
        .replace(/\*\*/g, '__DOUBLE_STAR__')
        .replace(/\*/g, '__SINGLE_STAR__')
        .replace(/[.+?^{}()|[\]\\]/g, '\\$&') // Escape regex special chars (but not * or $)
        .replace(/__DOUBLE_STAR__/g, '.*') // ** matches any characters including /
        .replace(/__SINGLE_STAR__/g, '[^/]*') // * matches any characters except /
        .replace(/__END_ANCHOR__/g, '$'); // Restore $ as regex anchor

      if (new RegExp(safePattern).test(url)) {
        await handler(route);
        return true;
      }
    }

    return false;
  }
}
