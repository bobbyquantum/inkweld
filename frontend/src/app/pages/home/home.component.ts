import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ThemeService } from '@themes/theme.service';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { UserMenuComponent } from '@components/user-menu/user-menu.component';
import { ProjectCardComponent } from '@components/project-card/project-card.component';
import { Project, ProjectAPIService, UserAPIService } from 'worm-api-client';
import { EMPTY, Subject, catchError, takeUntil } from 'rxjs';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { XsrfService } from '@services/xsrf.service';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-home',
  standalone: true,
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
  private userService = inject(UserAPIService);
  private projectService = inject(ProjectAPIService);
  private xsrfService = inject(XsrfService);
  private breakpointObserver = inject(BreakpointObserver);
  private themeService = inject(ThemeService);

  protected user = toSignal(
    this.userService.getCurrentUser('body', true, { transferCache: true })
  );
  projects: Project[] = [];
  selectedProject: Project | null = null;
  isMobile = false;
  private destroy$ = new Subject<void>();

  ngOnInit() {
    this.loadProjects();
    this.setupBreakpointObserver();
  }

  loadProjects() {
    this.projectService
      .getAllProjects('body', true, { transferCache: true })
      .pipe(
        takeUntil(this.destroy$),
        catchError(error => {
          console.error('Error loading projects', error);
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

  toggleTheme() {
    this.themeService.update(
      this.themeService.isDarkMode() ? 'light-theme' : 'dark-theme'
    );
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
