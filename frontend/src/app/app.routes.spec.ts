import { TestBed } from '@angular/core/testing';
import {
  type CanDeactivateFn,
  type Route,
  UrlSegment,
  UrlSegmentGroup,
} from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { routes } from './app.routes';
import { CanDeactivateProjectGuard } from './guards/can-deactivate-project.guard';
import type { ProjectComponent } from './pages/project/project.component';

function flattenRoutes(routeList: Route[]): Route[] {
  return routeList.flatMap(route => [
    route,
    ...(route.children ? flattenRoutes(route.children) : []),
  ]);
}

describe('app.routes', () => {
  const flatRoutes = flattenRoutes(routes);

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CanDeactivateProjectGuard,
          useValue: {
            canDeactivate: vi.fn().mockReturnValue(true),
          },
        },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defines the expected top-level application routes', () => {
    expect(routes.map(route => route.path)).toContain('setup');
    expect(routes.map(route => route.path)).toContain('admin');
    expect(routes.map(route => route.path)).toContain(':username/:slug');
    expect(routes.at(-1)?.path).toBe('**');
  });

  it('resolves every lazy loadComponent route', async () => {
    const lazyRoutes = flatRoutes.filter(route => route.loadComponent);

    expect(lazyRoutes.length).toBeGreaterThan(20);
    expect(
      lazyRoutes.every(route => typeof route.loadComponent === 'function')
    ).toBe(true);

    const resolvedComponents = await Promise.all(
      lazyRoutes.map(async route => route.loadComponent?.())
    );

    for (const component of resolvedComponents) {
      expect(component).toBeTypeOf('function');
    }
  }, 60000);

  it('configures project child routes with reuse metadata and redirects', () => {
    const projectRoute = flatRoutes.find(
      route => route.path === ':username/:slug'
    );
    const childPaths = projectRoute?.children?.map(route => route.path) ?? [];

    expect(projectRoute?.data).toEqual({ reuseComponent: true });
    expect(childPaths).toContain('document/:tabId');
    expect(childPaths).toContain('canvas/:tabId');
    expect(childPaths).toContain('publish-plan/:tabId');

    const redirectRoutes =
      projectRoute?.children?.filter(route => route.redirectTo) ?? [];
    expect(redirectRoutes.map(route => route.path)).toEqual([
      'templates-list',
      'relationships-list',
      'tags-list',
    ]);
  });

  it('delegates project canDeactivate checks through the injected guard', () => {
    const projectRoute = flatRoutes.find(
      route => route.path === ':username/:slug'
    );
    const guard = TestBed.inject(CanDeactivateProjectGuard);
    const component = {} as ProjectComponent;
    const canDeactivate = projectRoute
      ?.canDeactivate?.[0] as CanDeactivateFn<ProjectComponent>;

    const result = TestBed.runInInjectionContext(() =>
      canDeactivate(component, null!, null!, null!)
    );

    expect(result).toBe(true);
    expect(guard.canDeactivate).toHaveBeenCalledWith(component);
  });

  it('uses the oauth exclusion matcher and falls back for non-oauth paths', () => {
    const matcherRoute = flatRoutes.find(route => route.matcher);
    const matcher = matcherRoute?.matcher;
    const emptyGroup = new UrlSegmentGroup([], {});

    if (!matcher || !matcherRoute) {
      throw new Error('Expected matcher route to be defined');
    }

    expect(
      matcher([new UrlSegment('oauth2/callback', {})], emptyGroup, matcherRoute)
    ).toBeNull();
    expect(
      matcher(
        [new UrlSegment('login/oauth2/github', {})],
        emptyGroup,
        matcherRoute
      )
    ).toBeNull();
    expect(
      matcher([new UrlSegment('projects', {})], emptyGroup, matcherRoute)
    ).toEqual({ consumed: [] });
  });
});
