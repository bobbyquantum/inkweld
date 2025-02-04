import { Routes } from '@angular/router';

import { authGuard } from './guards/auth.guard';
import { HomeComponent } from './pages/home/home.component';
import { NewProjectComponent } from './pages/new-project/new-project.component';
import { NotFoundComponent } from './pages/not-found/not-found.component';
import { ProjectComponent } from './pages/project/project.component';
import { RegisterComponent } from './pages/register/register.component';
import { UnavailableComponent } from './pages/unavailable/unavailable.component';
import { WelcomeComponent } from './pages/welcome/welcome.component';

export const routes: Routes = [
  // Skip routing for OAuth-related paths to allow backend handling
  {
    matcher: url => {
      if (
        url.length > 0 &&
        (url[0].path.startsWith('oauth2') ||
          url[0].path.startsWith('login/oauth2'))
      ) {
        return null; // Return null to skip Angular routing
      }
      return { consumed: [] }; // Continue with normal routing
    },
    children: [],
  },
  {
    path: '',
    component: HomeComponent,
    title: 'Home',
    canActivate: [authGuard],
  },
  {
    path: 'welcome',
    component: WelcomeComponent,
    title: 'Welcome',
  },
  {
    path: 'register',
    component: RegisterComponent,
    title: 'Register',
  },
  {
    path: 'new-project',
    component: NewProjectComponent,
    title: 'New Project',
    canActivate: [authGuard],
  },
  {
    path: 'project/:username/:slug',
    component: ProjectComponent,
    title: 'Project',
    canActivate: [authGuard],
  },
  {
    path: 'unavailable',
    component: UnavailableComponent,
    title: 'Service Unavailable',
  },
  {
    path: '**',
    component: NotFoundComponent,
    title: '404 - Page Not Found',
  },
];
