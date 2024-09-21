import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { NewProjectComponent } from './pages/new-project/new-project.component';

export const routes: Routes = [
  {
    path: '',
    component: HomeComponent,
    title: 'Home',
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
