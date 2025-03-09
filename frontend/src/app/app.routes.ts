import { inject } from '@angular/core';
import { Routes } from '@angular/router';

import { authGuard } from './guards/auth.guard';
import { CanDeactivateProjectGuard } from './guards/can-deactivate-project.guard';
import { ProjectComponent } from './pages/project/project.component';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/home/home.component').then(m => m.HomeComponent),
    title: 'Home',
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
  },
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
