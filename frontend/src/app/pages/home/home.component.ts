import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import {
  Component,
  computed,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterModule } from '@angular/router';
import { ProjectCardComponent } from '@components/project-card/project-card.component';
import { UserMenuComponent } from '@components/user-menu/user-menu.component';
import { NewProjectDialogComponent } from '@dialogs/new-project-dialog/new-project-dialog.component';
import { ProjectDto } from '@inkweld/index';
import { ProjectService } from '@services/project.service';
import { UserService } from '@services/user.service';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';

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
    ReactiveFormsModule,
  ],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent implements OnInit, OnDestroy {
  // Component state
  loadError = false;
  selectedProject: ProjectDto | null = null;
  isMobile = false;
  searchControl = new FormControl('');

  // Injected services
  dialog = inject(MatDialog);
  protected router = inject(Router);
  protected userService = inject(UserService);
  protected projectService = inject(ProjectService);
  protected breakpointObserver = inject(BreakpointObserver);

  protected user = this.userService.currentUser;
  protected isLoading = this.projectService.isLoading;
  protected destroy$ = new Subject<void>();

  // Computed state
  protected filteredProjects = computed(() => {
    const term = this.searchTerm().toLowerCase();
    if (!term) {
      return this.projectService.projects();
    }

    return this.projectService.projects().filter(project => {
      return (
        project.title.toLowerCase().includes(term) ||
        project.slug.toLowerCase().includes(term) ||
        project.description?.toLowerCase().includes(term) ||
        project.user?.username?.toLowerCase().includes(term)
      );
    });
  });

  // Private state
  private searchTerm = signal('');

  ngOnInit() {
    void this.loadProjects();
    this.setupBreakpointObserver();
    this.setupSearchObserver();
  }

  setupSearchObserver() {
    this.searchControl.valueChanges
      .pipe(debounceTime(300), takeUntil(this.destroy$))
      .subscribe(value => {
        this.searchTerm.set(value || '');
      });
  }

  async loadProjects() {
    this.loadError = false;
    try {
      await this.projectService.loadAllProjects();
    } catch (error) {
      this.loadError = true;
      console.error('Failed to load projects:', error);
    }
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
    // Navigate directly to the project instead of showing a preview
    void this.router.navigate([
      project.user?.username || '',
      project.slug || '',
    ]);
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
        void this.loadProjects();
      }
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
