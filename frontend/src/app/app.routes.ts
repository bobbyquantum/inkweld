import { Routes } from '@angular/router';

import { authGuard } from './guards/auth.guard';
import { HomeComponent } from './pages/home/home.component';
import { NewProjectComponent } from './pages/new-project/new-project.component';
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
];
