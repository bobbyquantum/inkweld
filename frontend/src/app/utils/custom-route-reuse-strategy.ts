import {
  ActivatedRouteSnapshot,
  DetachedRouteHandle,
  RouteReuseStrategy,
} from '@angular/router';

export class CustomRouteReuseStrategy implements RouteReuseStrategy {
  private handlers: Map<string, DetachedRouteHandle> = new Map();

  /**
   * Determines if a route should be detached for later reuse
   */
  shouldDetach(route: ActivatedRouteSnapshot): boolean {
    return this.isReusable(route);
  }

  /**
   * Stores the detached route
   */
  store(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle): void {
    if (this.isReusable(route)) {
      this.handlers.set(this.getRouteKey(route), handle);
    }
  }

  /**
   * Determines if we should reattach a stored route
   */
  shouldAttach(route: ActivatedRouteSnapshot): boolean {
    return this.isReusable(route) && this.handlers.has(this.getRouteKey(route));
  }

  /**
   * Retrieves the stored route
   */
  retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    if (!this.isReusable(route)) {
      return null;
    }
    return this.handlers.get(this.getRouteKey(route)) || null;
  }

  /**
   * Determines if a route should be reused
   * Checks if the routes share the same configuration,
   * and respects reuseComponent flag in route data
   */
  shouldReuseRoute(
    future: ActivatedRouteSnapshot,
    curr: ActivatedRouteSnapshot
  ): boolean {
    // Default behavior is to reuse the component if the two routes use the same component and params
    const defaultReuse = future.routeConfig === curr.routeConfig;

    // If the future route explicitly specifies not to reuse, respect that
    if (
      defaultReuse &&
      future.routeConfig &&
      future.data['reuseComponent'] === false
    ) {
      // Don't reuse if reuseComponent is explicitly set to false
      console.log(
        `[RouteReuse] Preventing component reuse for route: ${future.routeConfig.path}`
      );
      return false;
    }

    // Special handling for project routes: never reuse if username or slug changes
    if (defaultReuse && future.routeConfig?.path === ':username/:slug') {
      // If username or slug has changed, create a fresh component
      if (
        future.params['username'] !== curr.params['username'] ||
        future.params['slug'] !== curr.params['slug']
      ) {
        console.log(
          `[RouteReuse] Project params changed from ${curr.params['username']}/${curr.params['slug']} to ${future.params['username']}/${future.params['slug']}, creating fresh component`
        );
        // Clear any stored handlers for the previous project
        this.clearStoredProject(
          curr.params['username'] as unknown as string,
          curr.params['slug'] as unknown as string
        );
        return false;
      }
    }

    return defaultReuse;
  }

  /**
   * Clears any stored route handles related to a specific project
   */
  private clearStoredProject(username: string, slug: string): void {
    // Find and remove any stored routes related to this project
    const projectPrefix = `:username-${JSON.stringify({ username, slug })}`;
    const keysToRemove: string[] = [];

    this.handlers.forEach((_, key) => {
      if (key.startsWith(projectPrefix)) {
        keysToRemove.push(key);
      }
    });

    keysToRemove.forEach(key => {
      this.handlers.delete(key);
    });
  }

  /**
   * Creates a key for storing/retrieving route handlers
   */
  private getRouteKey(route: ActivatedRouteSnapshot): string {
    // Include both the path and the params in the key to ensure uniqueness
    const path = route.routeConfig?.path || 'unknown';
    const params = JSON.stringify(route.params);
    return `${path}-${params}`;
  }

  /**
   * Checks if a route is reusable (can be stored/retrieved)
   */
  private isReusable(route: ActivatedRouteSnapshot): boolean {
    // Routes with explicit flag set to false are not reusable
    if (route.data['reuseComponent'] === false) {
      return false;
    }

    // Otherwise, reuse if the route has a defined path
    return !!route.routeConfig?.path;
  }
}




