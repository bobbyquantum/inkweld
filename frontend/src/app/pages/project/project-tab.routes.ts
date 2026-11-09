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

/**
 * Paths for the project's members only: Project Settings (directly or through
 * an old redirect) and the publishing pages, whose plans and export settings
 * are the writers' own.
 */
const MEMBER_ONLY_PATHS = new Set([
  'settings',
  'templates-list',
  'relationships-list',
  'tags-list',
  'publish-plans',
  'publish-plan/:tabId',
]);

/**
 * The tab routes under a public link. A reader who follows a URL for members
 * only gets the project home.
 */
export const publicProjectTabRoutes: Routes = projectTabRoutes.map(route =>
  MEMBER_ONLY_PATHS.has(route.path ?? '')
    ? { path: route.path, redirectTo: '', pathMatch: 'full' }
    : route
);
