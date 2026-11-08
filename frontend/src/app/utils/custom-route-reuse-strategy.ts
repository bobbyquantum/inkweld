import {
  type ActivatedRouteSnapshot,
  BaseRouteReuseStrategy,
} from '@angular/router';

/**
 * Decides when a navigation keeps the current page's component.
 *
 * Leaving a page always destroys it: like Angular's default, nothing is
 * detached and kept for a later visit (the base class's `shouldDetach` is
 * false). This app used to keep every page with a path, and a kept page came
 * back exactly as it was left, because pages read their query params and
 * reset their forms in `ngOnInit`, which a reattached page skips: the setup
 * page reopened the Browser form instead of the step "Connect to sync" asked
 * for, the forgot-password page still said "check your email", and the
 * approval page named the previous account. Leaving a project must also run
 * `ngOnDestroy`, which closes its collaboration connections.
 *
 * Moving within the same route reuses the component in place, except:
 * - a project route (`:username/:slug`, or `public/:username/:slug` for a
 *   public link) is reused within one project and recreated for another,
 *   whatever its data says. Recreating it on every tab change would reload
 *   the project, reconnect its documents and lose the tab just opened;
 * - any other route with `data.reuseComponent === false` (the project tabs,
 *   setup) gets a fresh component on every navigation, so it starts from its
 *   new params.
 */
const PROJECT_ROUTE_PATHS = new Set([
  ':username/:slug',
  'public/:username/:slug',
]);

export class CustomRouteReuseStrategy extends BaseRouteReuseStrategy {
  override shouldReuseRoute(
    future: ActivatedRouteSnapshot,
    curr: ActivatedRouteSnapshot
  ): boolean {
    if (future.routeConfig !== curr.routeConfig) {
      return false;
    }
    if (PROJECT_ROUTE_PATHS.has(future.routeConfig?.path ?? '')) {
      return (
        future.params['username'] === curr.params['username'] &&
        future.params['slug'] === curr.params['slug']
      );
    }
    return future.data['reuseComponent'] !== false;
  }
}
