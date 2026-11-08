import { type ActivatedRouteSnapshot, type Route } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { CustomRouteReuseStrategy } from './custom-route-reuse-strategy';

describe('CustomRouteReuseStrategy', () => {
  let strategy: CustomRouteReuseStrategy;

  beforeEach(() => {
    strategy = new CustomRouteReuseStrategy();
  });

  function snapshot(
    routeConfig: Route | null,
    params: Record<string, string> = {},
    data: Record<string, unknown> = routeConfig?.data ?? {}
  ): ActivatedRouteSnapshot {
    return { routeConfig, params, data } as unknown as ActivatedRouteSnapshot;
  }

  describe('leaving a page', () => {
    it('never keeps a page to show again on the next visit', () => {
      const route = snapshot({ path: 'forgot-password' });

      expect(strategy.shouldDetach(route)).toBe(false);
      strategy.store(route, {});
      expect(strategy.shouldAttach(route)).toBe(false);
      expect(strategy.retrieve(route)).toBeNull();
    });

    it('does not keep a project after leaving it', () => {
      const route = snapshot(
        { path: ':username/:slug', data: { reuseComponent: false } },
        { username: 'user', slug: 'project' }
      );

      expect(strategy.shouldDetach(route)).toBe(false);
    });
  });

  describe('moving within a route', () => {
    it('reuses the page in place', () => {
      const config: Route = { path: 'approval-pending' };

      expect(
        strategy.shouldReuseRoute(snapshot(config), snapshot(config))
      ).toBe(true);
    });

    it('does not reuse a different route', () => {
      expect(
        strategy.shouldReuseRoute(
          snapshot({ path: 'path1' }),
          snapshot({ path: 'path2' })
        )
      ).toBe(false);
    });

    it('reuses a route without config (the root) in place', () => {
      expect(strategy.shouldReuseRoute(snapshot(null), snapshot(null))).toBe(
        true
      );
    });

    it('recreates a reuseComponent:false route, e.g. a tab', () => {
      const config: Route = {
        path: 'document/:tabId',
        data: { reuseComponent: false },
      };

      expect(
        strategy.shouldReuseRoute(
          snapshot(config, { tabId: '2' }),
          snapshot(config, { tabId: '1' })
        )
      ).toBe(false);
    });

    it('recreates setup when only its query params change', () => {
      const config: Route = {
        path: 'setup',
        data: { reuseComponent: false },
      };

      expect(
        strategy.shouldReuseRoute(snapshot(config), snapshot(config))
      ).toBe(false);
    });
  });

  describe('the project route', () => {
    const config: Route = {
      path: ':username/:slug',
      data: { reuseComponent: false },
    };

    it('reuses the same project in place despite reuseComponent:false', () => {
      // Recreating it in place would run its ngOnDestroy teardown mid-render
      // and drop the sync providers.
      expect(
        strategy.shouldReuseRoute(
          snapshot(config, { username: 'user', slug: 'project' }),
          snapshot(config, { username: 'user', slug: 'project' })
        )
      ).toBe(true);
    });

    it('recreates it for another owner', () => {
      expect(
        strategy.shouldReuseRoute(
          snapshot(config, { username: 'user2', slug: 'project' }),
          snapshot(config, { username: 'user1', slug: 'project' })
        )
      ).toBe(false);
    });

    it('recreates it for another project', () => {
      expect(
        strategy.shouldReuseRoute(
          snapshot(config, { username: 'user', slug: 'project2' }),
          snapshot(config, { username: 'user', slug: 'project1' })
        )
      ).toBe(false);
    });
  });
});
