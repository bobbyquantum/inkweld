import { Routes } from '@angular/router';

import { authGuard } from './guards/auth.guard';
import { HomeComponent } from './pages/home/home.component';
import { NotFoundComponent } from './pages/not-found/not-found.component';
import { ProjectComponent } from './pages/project/project.component';
import { RegisterComponent } from './pages/register/register.component';
import { UnavailableComponent } from './pages/unavailable/unavailable.component';
import { WelcomeComponent } from './pages/welcome/welcome.component';

export const routes: Routes = [
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
    component: NotFoundComponent,
    title: '404 - Page Not Found',
  },
];
