import type { Routes } from '@angular/router';

/** The same renderers and navigation for authenticated and anonymous projects. */
export const projectTabRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./tabs/home/home-tab.component').then(m => m.HomeTabComponent),
  },
  {
    path: 'document/:tabId',
    loadComponent: () =>
      import('./tabs/document/document-tab.component').then(
        m => m.DocumentTabComponent
      ),
    data: { reuseComponent: false },
  },
  {
    path: 'folder/:tabId',
    loadComponent: () =>
      import('./tabs/folder/folder-tab.component').then(
        m => m.FolderTabComponent
      ),
    data: { reuseComponent: false },
  },
  {
    path: 'media',
    loadComponent: () =>
      import('./tabs/media/media-tab.component').then(m => m.MediaTabComponent),
    data: { reuseComponent: false },
  },
  { path: 'templates-list', redirectTo: 'settings', pathMatch: 'full' },
  { path: 'relationships-list', redirectTo: 'settings', pathMatch: 'full' },
  {
    path: 'settings',
    loadComponent: () =>
      import('./tabs/settings/settings-tab.component').then(
        m => m.SettingsTabComponent
      ),
    data: { reuseComponent: false },
  },
  { path: 'tags-list', redirectTo: 'settings', pathMatch: 'full' },
  {
    path: 'worldbuilding/:tabId',
    loadComponent: () =>
      import('./tabs/worldbuilding/worldbuilding-tab.component').then(
        m => m.WorldbuildingTabComponent
      ),
    data: { reuseComponent: false },
  },
  {
    path: 'schema/:schemaId',
    loadComponent: () =>
      import('./tabs/schema-editor/schema-editor-tab.component').then(
        m => m.SchemaEditorTabComponent
      ),
    data: { reuseComponent: false },
  },
  {
    path: 'relationship-chart/:tabId',
    loadComponent: () =>
      import('./tabs/relationship-chart/relationship-chart-tab.component').then(
        m => m.RelationshipChartTabComponent
      ),
    data: { reuseComponent: false },
  },
  {
    path: 'canvas/:tabId',
    loadComponent: () =>
      import('./tabs/canvas/canvas-tab.component').then(
        m => m.CanvasTabComponent
      ),
    data: { reuseComponent: false },
  },
  {
    path: 'timeline/:tabId',
    loadComponent: () =>
      import('./tabs/timeline/timeline-tab.component').then(
        m => m.TimelineTabComponent
      ),
    data: { reuseComponent: false },
  },
  {
    path: 'publish-plan/:tabId',
    loadComponent: () =>
      import('./tabs/publish-plan/publish-plan-tab.component').then(
        m => m.PublishPlanTabComponent
      ),
    data: { reuseComponent: false },
  },
  {
    path: 'publish-plans',
    loadComponent: () =>
      import('./tabs/publish-plans-list/publish-plans-list-tab.component').then(
        m => m.PublishPlansListTabComponent
      ),
    data: { reuseComponent: false },
  },
  {
    path: 'activity',
    loadComponent: () =>
      import('./tabs/activity/activity-tab.component').then(
        m => m.ActivityTabComponent
      ),
    data: { reuseComponent: false },
  },
];

/** The publishing pages, which a public link doesn't show. */
const PUBLISHING_PATHS = new Set(['publish-plan/:tabId', 'publish-plans']);

/**
 * The pages a public link opens: the same, except that the publishing pages
 * (plans and their export settings are the writers' own) go to the
 * project's home.
 */
export const publicProjectTabRoutes: Routes = projectTabRoutes.map(route =>
  PUBLISHING_PATHS.has(route.path ?? '')
    ? { path: route.path, redirectTo: '', pathMatch: 'full' }
    : route
);
