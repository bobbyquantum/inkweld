import { inject } from '@angular/core';
import { Routes } from '@angular/router';

import { adminGuard } from './guards/admin.guard';
import { authGuard } from './guards/auth.guard';
import { CanDeactivateProjectGuard } from './guards/can-deactivate-project.guard';
import { ProjectComponent } from './pages/project/project.component';
import { DocumentTabComponent } from './pages/project/tabs/document/document-tab.component';
import { DocumentsListTabComponent } from './pages/project/tabs/documents-list/documents-list-tab.component';
import { FolderTabComponent } from './pages/project/tabs/folder/folder-tab.component';
import { HomeTabComponent } from './pages/project/tabs/home/home-tab.component';
import { MediaTabComponent } from './pages/project/tabs/media/media-tab.component';
import { PublishPlanTabComponent } from './pages/project/tabs/publish-plan/publish-plan-tab.component';
import { RelationshipsTabComponent } from './pages/project/tabs/relationships/relationships-tab.component';
import { TemplatesTabComponent } from './pages/project/tabs/templates/templates-tab.component';
import { WorldbuildingTabComponent } from './pages/project/tabs/worldbuilding/worldbuilding-tab.component';

export const routes: Routes = [
  {
    path: 'setup',
    loadComponent: () =>
      import('./pages/setup/setup.component').then(m => m.SetupComponent),
    title: 'Setup',
  },
  {
    path: 'reset',
    loadComponent: () =>
      import('./pages/reset/reset.component').then(m => m.ResetComponent),
    title: 'Reset Data',
  },
  {
    path: '',
    loadComponent: () =>
      import('./pages/home/home.component').then(m => m.HomeComponent),
    title: 'Home',
  },
  {
    path: 'admin',
    loadComponent: () =>
      import('./pages/admin/admin.component').then(m => m.AdminComponent),
    title: 'Admin Dashboard',
    canActivate: [adminGuard],
    children: [
      {
        path: '',
        redirectTo: 'users',
        pathMatch: 'full',
      },
      {
        path: 'users',
        loadComponent: () =>
          import('./pages/admin/users/users.component').then(
            m => m.AdminUsersComponent
          ),
        title: 'Admin - Users',
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./pages/admin/settings/settings.component').then(
            m => m.AdminSettingsComponent
          ),
        title: 'Admin - Settings',
      },
      {
        path: 'ai',
        loadComponent: () =>
          import('./pages/admin/ai-settings/ai-settings.component').then(
            m => m.AdminAiSettingsComponent
          ),
        title: 'Admin - AI Settings',
      },
    ],
  },
  {
    path: 'create-project',
    loadComponent: () =>
      import('./pages/create-project/create-project.component').then(
        m => m.CreateProjectComponent
      ),
    title: 'Create New Project',
    canActivate: [authGuard],
  },
  {
    path: 'welcome',
    loadComponent: () =>
      import('./pages/welcome/welcome.component').then(m => m.WelcomeComponent),
    title: 'Welcome',
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./pages/register/register.component').then(
        m => m.RegisterComponent
      ),
    title: 'Register',
  },
  {
    path: 'approval-pending',
    loadComponent: () =>
      import('./pages/approval-pending/approval-pending.component').then(
        m => m.ApprovalPendingComponent
      ),
    title: 'Approval Pending',
  },
  {
    path: 'unavailable',
    loadComponent: () =>
      import('./pages/unavailable/unavailable.component').then(
        m => m.UnavailableComponent
      ),
    title: 'Service Unavailable',
  },
  // Project route (GitHub style: /:username/:slug)
  {
    path: ':username/:slug',
    loadComponent: () =>
      import('./pages/project/project.component').then(m => m.ProjectComponent),
    title: 'Project',
    canActivate: [authGuard],
    canDeactivate: [
      (component: ProjectComponent) =>
        inject(CanDeactivateProjectGuard).canDeactivate(component),
    ],
    data: {
      reuseComponent: true,
    },
    children: [
      {
        path: '',
        component: HomeTabComponent,
      },
      {
        path: 'document/:tabId',
        component: DocumentTabComponent,
        data: {
          reuseComponent: false, // Prevent component reuse
        },
      },
      {
        path: 'folder/:tabId',
        component: FolderTabComponent,
        data: {
          reuseComponent: false, // Prevent component reuse
        },
      },
      {
        path: 'documents-list',
        component: DocumentsListTabComponent,
        data: {
          reuseComponent: false,
        },
      },
      {
        path: 'media',
        component: MediaTabComponent,
        data: {
          reuseComponent: false,
        },
      },
      {
        path: 'templates-list',
        component: TemplatesTabComponent,
        data: {
          reuseComponent: false,
        },
      },
      {
        path: 'relationships-list',
        component: RelationshipsTabComponent,
        data: {
          reuseComponent: false,
        },
      },
      {
        path: 'worldbuilding/:tabId',
        component: WorldbuildingTabComponent,
        data: {
          reuseComponent: false,
        },
      },
      {
        path: 'publish-plan/:tabId',
        component: PublishPlanTabComponent,
        data: {
          reuseComponent: false,
        },
      },
    ],
  },
  // Old routes for files and documents have been replaced by tab components
  // User profile route
  {
    path: ':username',
    loadComponent: () =>
      import('./pages/user-profile/user-profile.component').then(
        m => m.UserProfileComponent
      ),
    title: 'User Profile',
    canActivate: [authGuard],
  },
  {
    matcher: url => {
      if (
        url.length > 0 &&
        (url[0].path.startsWith('oauth2') ||
          url[0].path.startsWith('login/oauth2'))
      ) {
        return null;
      }
      return { consumed: [] };
    },
    children: [],
  },
  {
    path: '**',
    loadComponent: () =>
      import('./pages/not-found/not-found.component').then(
        m => m.NotFoundComponent
      ),
    title: '404 - Page Not Found',
  },
];
