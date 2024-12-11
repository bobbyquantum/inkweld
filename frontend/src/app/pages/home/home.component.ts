import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterModule } from '@angular/router';
import { ProjectCardComponent } from '@components/project-card/project-card.component';
import { UserMenuComponent } from '@components/user-menu/user-menu.component';
import { catchError, EMPTY, Subject, takeUntil } from 'rxjs';
import {
  Project,
  ProjectAPIService,
  UserAPIService,
} from 'worm-api-angular-client';

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
  projects: Project[] = [];
  selectedProject: Project | null = null;
  isMobile = false;

  protected userService = inject(UserAPIService);
  protected projectService = inject(ProjectAPIService);
  protected breakpointObserver = inject(BreakpointObserver);

  protected destroy$ = new Subject<void>();
  protected user = toSignal(
    this.userService.getCurrentUser('body', true, { transferCache: true })
  );
  ngOnInit() {
    this.loadProjects();
    this.setupBreakpointObserver();
  }

  loadProjects() {
    this.projectService
      .getAllProjects('body', true, { transferCache: true })
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

  selectProject(project: Project) {
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
