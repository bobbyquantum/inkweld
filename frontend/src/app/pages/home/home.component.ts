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
import { BookshelfComponent } from '@components/bookshelf/bookshelf.component';
import { UserMenuComponent } from '@components/user-menu/user-menu.component';
import { ProjectDto } from '@inkweld/index';
import { ProjectServiceError } from '@services/project.service';
import { UnifiedProjectService } from '@services/unified-project.service';
import { UnifiedUserService } from '@services/unified-user.service';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-home',
  imports: [
    UserMenuComponent,
    BookshelfComponent,
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
  dialog = inject(MatDialog);
  protected router = inject(Router);
  protected userService = inject(UnifiedUserService);
  protected projectService = inject(UnifiedProjectService);
  protected breakpointObserver = inject(BreakpointObserver);

  // Component state
  loadError = false;
  selectedProject: ProjectDto | null = null;
  isMobile = false;
  searchControl = new FormControl('');

  protected user = this.userService.currentUser;
  protected isLoading = this.projectService.isLoading;
  protected isAuthenticated = this.userService.isAuthenticated;
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
        project.username.toLowerCase().includes(term)
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
    // Only load projects if user is authenticated
    if (!this.isAuthenticated()) {
      return;
    }

    this.loadError = false;
    try {
      await this.projectService.loadProjects();
    } catch (error: unknown) {
      // Check if this is a session expired error
      if (
        error instanceof ProjectServiceError &&
        error.code === 'SESSION_EXPIRED'
      ) {
        // Don't set loadError for session expired errors
        // The auth interceptor will handle the redirect to welcome page
        console.warn(
          'Session expired while loading projects, user will be redirected'
        );
        return;
      }

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
    // Add logging to debug project navigation
    console.log('Navigating to project:', project.username, project.slug);

    // Force complete route reload by using onSameUrlNavigation: 'reload' option
    // and ensuring we're navigating with a unique navigationId
    void this.router.navigate([project.username || '', project.slug || ''], {
      onSameUrlNavigation: 'reload',
      skipLocationChange: false,
      replaceUrl: false,
    });
  }

  openNewProjectDialog(): void {
    void this.router.navigate(['/create-project']);
  }

  navigateToLogin(): void {
    void this.router.navigate(['/welcome']);
  }

  navigateToRegister(): void {
    void this.router.navigate(['/register']);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
