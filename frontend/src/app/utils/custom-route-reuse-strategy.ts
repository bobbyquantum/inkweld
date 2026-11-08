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
 * - the project route (`:username/:slug`) is reused within one project and
 *   recreated for another, whatever its data says;
 * - any other route with `data.reuseComponent === false` (the project tabs,
 *   the public project view, setup) gets a fresh component on every
 *   navigation, so it starts from its new params.
 */
export class CustomRouteReuseStrategy extends BaseRouteReuseStrategy {
  override shouldReuseRoute(
    future: ActivatedRouteSnapshot,
    curr: ActivatedRouteSnapshot
  ): boolean {
    if (future.routeConfig !== curr.routeConfig) {
      return false;
    }
    if (future.routeConfig?.path === ':username/:slug') {
      return (
        future.params['username'] === curr.params['username'] &&
        future.params['slug'] === curr.params['slug']
      );
    }
    return future.data['reuseComponent'] !== false;
  }
}
