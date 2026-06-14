import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import {
  type ActivatedRouteSnapshot,
  type Route,
  type RouterStateSnapshot,
  TitleStrategy,
} from '@angular/router';
import { type Project } from '@inkweld/index';
import { ProjectStateService } from '@services/project/project-state.service';
import { vi } from 'vitest';

import { InkweldTitleStrategy } from './title-strategy.service';

function createProject(title: string): Project {
  return {
    id: 'p1',
    title,
    username: 'alice',
    slug: 'my-novel',
    createdDate: new Date().toISOString(),
    updatedDate: new Date().toISOString(),
  };
}

function createRouteSnapshot(
  routeConfigPath: string,
  titleValue?: string,
  children: ActivatedRouteSnapshot[] = []
): ActivatedRouteSnapshot {
  const routeConfig: Route = { path: routeConfigPath };
  if (titleValue !== undefined) {
    routeConfig.title = titleValue;
  }

  const snapshot = {
    routeConfig,
    url: routeConfigPath
      ? routeConfigPath.split('/').map(p => ({ path: p }))
      : [],
    data: {},
    children,
    outlet: 'primary',
    params: {},
    queryParams: {},
    fragment: null,
    firstChild: children[0] ?? null,
    parent: null,
    pathFromRoot: [],
    paramMap: {
      get: () => null,
      getAll: () => [],
      has: () => false,
      keys: [],
    },
    queryParamMap: {
      get: () => null,
      getAll: () => [],
      has: () => false,
      keys: [],
    },
  } as unknown as ActivatedRouteSnapshot;

  (
    snapshot as unknown as { pathFromRoot: ActivatedRouteSnapshot[] }
  ).pathFromRoot = [snapshot];

  return snapshot;
}

function createRouterStateSnapshot(
  url: string,
  rootSnapshot: ActivatedRouteSnapshot
): RouterStateSnapshot {
  (rootSnapshot as unknown as { root: ActivatedRouteSnapshot }).root =
    rootSnapshot;
  return {
    root: rootSnapshot,
    url,
  };
}

describe('InkweldTitleStrategy', () => {
  let strategy: InkweldTitleStrategy;
  let title: Title;
  let projectState: Partial<ProjectStateService>;

  beforeEach(() => {
    title = { setTitle: vi.fn() } as unknown as Title;
    projectState = {
      project: signal<Project | undefined>(undefined),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: Title, useValue: title },
        { provide: ProjectStateService, useValue: projectState },
        { provide: TitleStrategy, useClass: InkweldTitleStrategy },
      ],
    });

    strategy = TestBed.inject(TitleStrategy) as InkweldTitleStrategy;
  });

  it('should delegate to buildTitle for non-project routes', () => {
    const root = createRouteSnapshot('', 'Home');
    const snapshot = createRouterStateSnapshot('/', root);
    vi.spyOn(strategy, 'buildTitle').mockReturnValue('Home');

    strategy.updateTitle(snapshot);

    expect(title.setTitle).toHaveBeenCalledWith('Home');
  });

  it('should set project title when on a project route', () => {
    projectState.project!.set(createProject('My Novel'));

    const child = createRouteSnapshot('', 'Project Home');
    const root = createRouteSnapshot(':username/:slug', undefined, [child]);
    const snapshot = createRouterStateSnapshot('alice/my-novel', root);

    strategy.updateTitle(snapshot);

    expect(title.setTitle).toHaveBeenCalledWith('Inkweld \u2013 My Novel');
  });

  it('should fall back to buildTitle when project is not loaded on a project route', () => {
    const child = createRouteSnapshot('', 'Project Home');
    const root = createRouteSnapshot(':username/:slug', undefined, [child]);
    const snapshot = createRouterStateSnapshot('alice/my-novel', root);
    vi.spyOn(strategy, 'buildTitle').mockReturnValue('Project Home');

    strategy.updateTitle(snapshot);

    expect(title.setTitle).toHaveBeenCalledWith('Project Home');
  });

  it('should update title when project changes while on a project route', () => {
    projectState.project!.set(createProject('Old Title'));

    const child = createRouteSnapshot('', 'Project Home');
    const root = createRouteSnapshot(':username/:slug', undefined, [child]);
    const snapshot = createRouterStateSnapshot('alice/my-novel', root);

    strategy.updateTitle(snapshot);
    expect(title.setTitle).toHaveBeenCalledWith('Inkweld \u2013 Old Title');

    projectState.project!.set(createProject('New Title'));

    // Effects run asynchronously; flush any pending microtasks.
    TestBed.flushEffects();

    expect(title.setTitle).toHaveBeenCalledWith('Inkweld \u2013 New Title');
  });

  it('should not apply project title changes after navigating away from project', () => {
    projectState.project!.set(createProject('My Novel'));

    // Start on project route.
    const child = createRouteSnapshot('', 'Project Home');
    const projectRoot = createRouteSnapshot(':username/:slug', undefined, [
      child,
    ]);
    strategy.updateTitle(
      createRouterStateSnapshot('alice/my-novel', projectRoot)
    );

    // Navigate away to home.
    const homeRoot = createRouteSnapshot('', 'Home');
    vi.spyOn(strategy, 'buildTitle').mockReturnValue('Home');
    strategy.updateTitle(createRouterStateSnapshot('/', homeRoot));

    expect(title.setTitle).toHaveBeenLastCalledWith('Home');

    // Change project while on home route - should not update title.
    vi.mocked(title.setTitle).mockClear();
    projectState.project!.set(createProject('Renamed Novel'));
    TestBed.flushEffects();

    expect(title.setTitle).not.toHaveBeenCalled();
  });
});
