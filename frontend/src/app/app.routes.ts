import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { NewProjectComponent } from './pages/new-project/new-project.component';
import { RegisterComponent } from './pages/register/register.component';

export const routes: Routes = [
  {
    path: '',
    component: HomeComponent,
    title: 'Home',
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
  },
  {
    path: 'project/:id',
    component: HomeComponent,
    title: 'Project',
  },
];
