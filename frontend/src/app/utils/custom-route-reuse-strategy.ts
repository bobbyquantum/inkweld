import {
  type ActivatedRouteSnapshot,
  type DetachedRouteHandle,
  type RouteReuseStrategy,
} from '@angular/router';

export class CustomRouteReuseStrategy implements RouteReuseStrategy {
  private readonly handlers: Map<string, DetachedRouteHandle> = new Map();

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
   * Determines if a route should be reused in place.
   *
   * `reuseComponent: false` normally means "do not reuse this component in
   * place either" (the tab routes set it so each tab activation gets a fresh
   * component — see app.routes). The single exception is the project parent
   * route (`:username/:slug`): it carries `reuseComponent: false` only so that
   * *leaving* the project destroys the component (isReusable → shouldDetach is
   * false, so the component is not cached and its ngOnDestroy tears down the
   * collaboration connections — the exit-leak fix). But the app also performs
   * in-place navigations to that same route (after project creation and on
   * internal URL normalisation); destroying+recreating the component there
   * would run that same ngOnDestroy teardown mid-render and drop the sync
   * providers, so the project tree / editor never stabilises. The project
   * parent must therefore reuse in place even though reuseComponent is false.
   */
  shouldReuseRoute(
    future: ActivatedRouteSnapshot,
    curr: ActivatedRouteSnapshot
  ): boolean {
    // Default behavior is to reuse the component if the two routes use the same
    // component and params.
    const defaultReuse = future.routeConfig === curr.routeConfig;

    // Honour reuseComponent:false (recreate instead of reuse in place) for
    // every route except the project parent, which is exempted for the reason
    // described above.
    if (
      defaultReuse &&
      future.routeConfig &&
      future.data['reuseComponent'] === false &&
      future.routeConfig.path !== ':username/:slug'
    ) {
      return false;
    }

    // Special handling for project routes: never reuse if username or slug
    // changes — a different project must get a fresh component (and, because
    // isReusable is false for reuseComponent:false, the old one is destroyed
    // rather than cached, so its connections are torn down).
    if (defaultReuse && future.routeConfig?.path === ':username/:slug') {
      if (
        future.params['username'] !== curr.params['username'] ||
        future.params['slug'] !== curr.params['slug']
      ) {
        this.clearStoredProject(
          curr.params['username'] as string,
          curr.params['slug'] as string
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
