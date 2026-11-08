import { describe, expect, it } from 'vitest';

import { projectTabRoutes, publicProjectTabRoutes } from './project-tab.routes';

describe('project tab routes', () => {
  const route = (routes: typeof projectTabRoutes, path: string) =>
    routes.find(r => r.path === path);

  it.each(['settings', 'templates-list', 'relationships-list', 'tags-list'])(
    'sends a reader who opens %s under a public link to the project home',
    path => {
      expect(route(publicProjectTabRoutes, path)).toEqual({
        path,
        redirectTo: '',
        pathMatch: 'full',
      });
    }
  );

  it('keeps every other tab route a public link shares', () => {
    for (const path of ['', 'document/:tabId', 'media', 'activity']) {
      expect(route(publicProjectTabRoutes, path)).toBe(
        route(projectTabRoutes, path)
      );
    }
    expect(publicProjectTabRoutes).toHaveLength(projectTabRoutes.length);
  });

  it('still opens Project Settings for members', () => {
    expect(route(projectTabRoutes, 'settings')?.loadComponent).toBeDefined();
  });
});
