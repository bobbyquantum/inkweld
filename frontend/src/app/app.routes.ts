import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { NewProjectComponent } from './pages/new-project/new-project.component';
import { RegisterComponent } from './pages/register/register.component';
import { authGuard } from './guards/auth.guard';
import { WelcomeComponent } from './pages/welcome/welcome.component';
import { ProjectComponent } from './pages/project/project.component';

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
];
