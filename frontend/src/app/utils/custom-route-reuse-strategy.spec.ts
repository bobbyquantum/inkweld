import { ActivatedRouteSnapshot, DetachedRouteHandle } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { CustomRouteReuseStrategy } from './custom-route-reuse-strategy';

describe('CustomRouteReuseStrategy', () => {
  let strategy: CustomRouteReuseStrategy;

  beforeEach(() => {
    strategy = new CustomRouteReuseStrategy();
  });

  function createRoute(
    path: string,
    params: Record<string, string> = {},
    data: Record<string, unknown> = {}
  ): ActivatedRouteSnapshot {
    return {
      routeConfig: { path },
      params,
      data,
    } as unknown as ActivatedRouteSnapshot;
  }

  it('should be created', () => {
    expect(strategy).toBeTruthy();
  });

  describe('shouldDetach', () => {
    it('should return true for routes with path', () => {
      const route = createRoute('test-path');
      expect(strategy.shouldDetach(route)).toBe(true);
    });

    it('should return false for routes with reuseComponent = false', () => {
      const route = createRoute('test-path', {}, { reuseComponent: false });
      expect(strategy.shouldDetach(route)).toBe(false);
    });
  });

  describe('store and retrieve', () => {
    it('should store and retrieve detached route', () => {
      const route = createRoute('test-path');
      const handle = {} as DetachedRouteHandle;

      strategy.store(route, handle);
      const retrieved = strategy.retrieve(route);

      expect(retrieved).toBe(handle);
    });

    it('should not store route with reuseComponent = false', () => {
      const route = createRoute('test-path', {}, { reuseComponent: false });
      const handle = {} as DetachedRouteHandle;

      strategy.store(route, handle);
      const retrieved = strategy.retrieve(route);

      expect(retrieved).toBeNull();
    });

    it('should return null for non-existent route', () => {
      const route = createRoute('non-existent');
      expect(strategy.retrieve(route)).toBeNull();
    });

    it('should differentiate routes by params', () => {
      const route1 = createRoute('test', { id: '1' });
      const route2 = createRoute('test', { id: '2' });
      const handle1 = { component: 'A' } as unknown as DetachedRouteHandle;
      const handle2 = { component: 'B' } as unknown as DetachedRouteHandle;

      strategy.store(route1, handle1);
      strategy.store(route2, handle2);

      expect(strategy.retrieve(route1)).toBe(handle1);
      expect(strategy.retrieve(route2)).toBe(handle2);
    });
  });

  describe('shouldAttach', () => {
    it('should return true for stored route', () => {
      const route = createRoute('test-path');
      const handle = {} as DetachedRouteHandle;

      strategy.store(route, handle);
      expect(strategy.shouldAttach(route)).toBe(true);
    });

    it('should return false for non-stored route', () => {
      const route = createRoute('test-path');
      expect(strategy.shouldAttach(route)).toBe(false);
    });

    it('should return false for route with reuseComponent = false', () => {
      const route = createRoute('test-path', {}, { reuseComponent: false });
      expect(strategy.shouldAttach(route)).toBe(false);
    });
  });

  describe('shouldReuseRoute', () => {
    it('should reuse route with same config', () => {
      const config = { path: 'test-path' };
      const future = {
        routeConfig: config,
        data: {},
      } as unknown as ActivatedRouteSnapshot;
      const curr = {
        routeConfig: config,
        data: {},
      } as unknown as ActivatedRouteSnapshot;

      expect(strategy.shouldReuseRoute(future, curr)).toBe(true);
    });

    it('should not reuse route with different config', () => {
      const future = createRoute('path1');
      const curr = createRoute('path2');

      expect(strategy.shouldReuseRoute(future, curr)).toBe(false);
    });

    it('should not reuse route when reuseComponent is false', () => {
      const config = { path: 'test-path' };
      const future = {
        routeConfig: config,
        data: { reuseComponent: false },
      } as unknown as ActivatedRouteSnapshot;
      const curr = {
        routeConfig: config,
        data: {},
      } as unknown as ActivatedRouteSnapshot;

      expect(strategy.shouldReuseRoute(future, curr)).toBe(false);
    });

    it('should not reuse project route when username changes', () => {
      const config = { path: ':username/:slug' };
      const future = {
        routeConfig: config,
        params: { username: 'user2', slug: 'project' },
        data: {},
      } as unknown as ActivatedRouteSnapshot;
      const curr = {
        routeConfig: config,
        params: { username: 'user1', slug: 'project' },
        data: {},
      } as unknown as ActivatedRouteSnapshot;

      expect(strategy.shouldReuseRoute(future, curr)).toBe(false);
    });

    it('should not reuse project route when slug changes', () => {
      const config = { path: ':username/:slug' };
      const future = {
        routeConfig: config,
        params: { username: 'user', slug: 'project2' },
        data: {},
      } as unknown as ActivatedRouteSnapshot;
      const curr = {
        routeConfig: config,
        params: { username: 'user', slug: 'project1' },
        data: {},
      } as unknown as ActivatedRouteSnapshot;

      expect(strategy.shouldReuseRoute(future, curr)).toBe(false);
    });

    it('should reuse project route when params are same', () => {
      const config = { path: ':username/:slug' };
      const future = {
        routeConfig: config,
        params: { username: 'user', slug: 'project' },
        data: {},
      } as unknown as ActivatedRouteSnapshot;
      const curr = {
        routeConfig: config,
        params: { username: 'user', slug: 'project' },
        data: {},
      } as unknown as ActivatedRouteSnapshot;

      expect(strategy.shouldReuseRoute(future, curr)).toBe(true);
    });
  });
});
