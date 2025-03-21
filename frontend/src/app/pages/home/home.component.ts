import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterModule } from '@angular/router';
import { ProjectCardComponent } from '@components/project-card/project-card.component';
import { UserMenuComponent } from '@components/user-menu/user-menu.component';
import { NewProjectDialogComponent } from '@dialogs/new-project-dialog/new-project-dialog.component';
import { ProjectAPIService, ProjectDto } from '@inkweld/index';
import { UserService } from '@services/user.service';
import { EMPTY, Subject } from 'rxjs';
import { catchError, retry, takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-home',
  imports: [
    UserMenuComponent,
    ProjectCardComponent,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    RouterModule,
    MatDialogModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent implements OnInit, OnDestroy {
  projects: ProjectDto[] = [];
  isLoading = true;
  loadError = false;
  selectedProject: ProjectDto | null = null;
  isMobile = false;
  dialog = inject(MatDialog);
  protected userService = inject(UserService);
  protected projectAPIService = inject(ProjectAPIService);
  protected breakpointObserver = inject(BreakpointObserver);

  protected user = this.userService.currentUser;

  protected destroy$ = new Subject<void>();
  private maxRetries = 2;

  ngOnInit() {
    this.loadProjects();
    this.setupBreakpointObserver();
  }

  loadProjects() {
    this.isLoading = true;
    this.loadError = false;

    this.projectAPIService
      .projectControllerGetAllProjects('body', true, { transferCache: true })
      .pipe(
        takeUntil(this.destroy$),
        retry(this.maxRetries),
        catchError(() => {
          this.loadError = true;
          this.isLoading = false;
          return EMPTY;
        })
      )
      .subscribe(projects => {
        this.projects = projects;
        this.isLoading = false;
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

  openNewProjectDialog(): void {
    const dialogRef = this.dialog.open(NewProjectDialogComponent, {
      width: '500px',
      disableClose: true,
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadProjects();
      }
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
