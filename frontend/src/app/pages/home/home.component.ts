import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterModule } from '@angular/router';
import { ProjectCardComponent } from '@components/project-card/project-card.component';
import { UserMenuComponent } from '@components/user-menu/user-menu.component';
import { ProjectAPIService, ProjectDto } from '@worm/index';
import { catchError, EMPTY, Subject, takeUntil } from 'rxjs';

import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-home',
  imports: [
    CommonModule,
    UserMenuComponent,
    ProjectCardComponent,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    RouterModule,
  ],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent implements OnInit, OnDestroy {
  projects: ProjectDto[] = [];
  selectedProject: ProjectDto | null = null;
  isMobile = false;

  protected userService = inject(UserService);
  protected projectAPIService = inject(ProjectAPIService);
  protected breakpointObserver = inject(BreakpointObserver);
  protected user = this.userService.currentUser;

  protected destroy$ = new Subject<void>();
  ngOnInit() {
    this.loadProjects();
    this.setupBreakpointObserver();
  }

  loadProjects() {
    this.projectAPIService
      .projectControllerGetAllProjects('body', true, { transferCache: true })
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => {
          return EMPTY;
        })
      )
      .subscribe(projects => {
        this.projects = projects;
      });
  }

  setupBreakpointObserver() {
    this.breakpointObserver
      .observe([Breakpoints.XSmall, Breakpoints.Small])
      .pipe(takeUntil(this.destroy$))
      .subscribe(result => {
        this.isMobile = result.matches;
      });
  }

  selectProject(project: ProjectDto) {
    this.selectedProject = project;
  }

  backToList() {
    this.selectedProject = null;
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
