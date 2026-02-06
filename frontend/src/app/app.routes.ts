import { inject } from '@angular/core';
import { Routes } from '@angular/router';

import { adminGuard } from './guards/admin.guard';
import { authGuard } from './guards/auth.guard';
import { CanDeactivateProjectGuard } from './guards/can-deactivate-project.guard';
import type { ProjectComponent } from './pages/project/project.component';

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
    path: 'about',
    loadComponent: () =>
      import('./pages/about/about.component').then(m => m.AboutComponent),
    title: 'About Inkweld',
  },
  {
    path: 'about/changelog',
    loadComponent: () =>
      import('./pages/about/changelog/changelog.component').then(
        m => m.ChangelogComponent
      ),
    title: 'Changelog',
  },
  {
    path: 'oauth/authorize',
    loadComponent: () =>
      import('./pages/oauth-consent/oauth-consent.component').then(
        m => m.OAuthConsentComponent
      ),
    title: 'Authorize Application',
    canActivate: [authGuard],
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
        path: 'ai-providers',
        loadComponent: () =>
          import('./pages/admin/ai-providers/ai-providers.component').then(
            m => m.AdminAiProvidersComponent
          ),
        title: 'Admin - AI Providers',
      },
      {
        path: 'ai',
        loadComponent: () =>
          import('./pages/admin/ai-settings/ai-settings.component').then(
            m => m.AdminAiSettingsComponent
          ),
        title: 'Admin - AI Image Settings',
      },
      {
        path: 'ai-text',
        loadComponent: () =>
          import('./pages/admin/ai-text-settings/ai-text-settings.component').then(
            m => m.AdminAiTextSettingsComponent
          ),
        title: 'Admin - AI Text Settings',
      },
      {
        path: 'announcements',
        loadComponent: () =>
          import('./pages/admin/announcements/announcements.component').then(
            m => m.AdminAnnouncementsComponent
          ),
        title: 'Admin - Announcements',
      },
      {
        path: 'image-audits',
        loadComponent: () =>
          import('./pages/admin/image-audits/image-audits.component').then(
            m => m.AdminImageAuditsComponent
          ),
        title: 'Admin - Image Audits',
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
    path: 'settings',
    loadComponent: () =>
      import('./pages/account-settings/account-settings.component').then(
        m => m.AccountSettingsComponent
      ),
    title: 'Account Settings',
    canActivate: [authGuard],
  },
  {
    path: 'messages',
    loadComponent: () =>
      import('./pages/messages/messages.component').then(
        m => m.MessagesComponent
      ),
    title: 'Messages',
    canActivate: [authGuard],
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
        loadComponent: () =>
          import('./pages/project/tabs/home/home-tab.component').then(
            m => m.HomeTabComponent
          ),
      },
      {
        path: 'document/:tabId',
        loadComponent: () =>
          import('./pages/project/tabs/document/document-tab.component').then(
            m => m.DocumentTabComponent
          ),
        data: {
          reuseComponent: false, // Prevent component reuse
        },
      },
      {
        path: 'folder/:tabId',
        loadComponent: () =>
          import('./pages/project/tabs/folder/folder-tab.component').then(
            m => m.FolderTabComponent
          ),
        data: {
          reuseComponent: false, // Prevent component reuse
        },
      },
      {
        path: 'documents-list',
        loadComponent: () =>
          import('./pages/project/tabs/documents-list/documents-list-tab.component').then(
            m => m.DocumentsListTabComponent
          ),
        data: {
          reuseComponent: false,
        },
      },
      {
        path: 'media',
        loadComponent: () =>
          import('./pages/project/tabs/media/media-tab.component').then(
            m => m.MediaTabComponent
          ),
        data: {
          reuseComponent: false,
        },
      },
      {
        // Redirect old templates-list route to settings
        path: 'templates-list',
        redirectTo: 'settings',
        pathMatch: 'full',
      },
      {
        // Redirect old relationships-list route to settings
        path: 'relationships-list',
        redirectTo: 'settings',
        pathMatch: 'full',
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./pages/project/tabs/settings/settings-tab.component').then(
            m => m.SettingsTabComponent
          ),
        data: {
          reuseComponent: false,
        },
      },
      {
        // Redirect old tags-list route to settings
        path: 'tags-list',
        redirectTo: 'settings',
        pathMatch: 'full',
      },
      {
        path: 'worldbuilding/:tabId',
        loadComponent: () =>
          import('./pages/project/tabs/worldbuilding/worldbuilding-tab.component').then(
            m => m.WorldbuildingTabComponent
          ),
        data: {
          reuseComponent: false,
        },
      },
      {
        path: 'publish-plan/:tabId',
        loadComponent: () =>
          import('./pages/project/tabs/publish-plan/publish-plan-tab.component').then(
            m => m.PublishPlanTabComponent
          ),
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
