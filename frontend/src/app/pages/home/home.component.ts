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
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterModule } from '@angular/router';
import { BookshelfComponent } from '@components/bookshelf/bookshelf.component';
import { SideNavComponent } from '@components/side-nav/side-nav.component';
import { UserMenuComponent } from '@components/user-menu/user-menu.component';
import { Project } from '@inkweld/index';
import { ProjectServiceError } from '@services/project/project.service';
import { UnifiedProjectService } from '@services/offline/unified-project.service';
import { UnifiedUserService } from '@services/user/unified-user.service';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';

type ViewMode = 'tiles' | 'bookshelf' | 'list';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    MatButtonToggleModule,
    ReactiveFormsModule,
    RouterModule,
    BookshelfComponent,
    UserMenuComponent,
    SideNavComponent,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit, OnDestroy {
  dialog = inject(MatDialog);
  protected router = inject(Router);
  protected userService = inject(UnifiedUserService);
  protected projectService = inject(UnifiedProjectService);
  protected breakpointObserver = inject(BreakpointObserver);

  // Component state
  loadError = false;
  selectedProject: Project | null = null;
  isMobile = false;
  searchControl = new FormControl('');
  sideNavOpen = signal(true); // Open by default on desktop
  mobileSearchActive = signal(false); // Track mobile search mode
  viewMode = signal<ViewMode>('bookshelf'); // Default to bookshelf view

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
        // Close side nav on mobile by default
        if (this.isMobile) {
          this.sideNavOpen.set(false);
        } else {
          this.sideNavOpen.set(true);
        }
      });
  }

  toggleSideNav(): void {
    this.sideNavOpen.set(!this.sideNavOpen());
  }

  toggleMobileSearch(): void {
    this.mobileSearchActive.set(!this.mobileSearchActive());
    // Clear search when closing
    if (!this.mobileSearchActive()) {
      this.searchControl.setValue('');
    }
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode.set(mode);
  }

  getCoverUrl(project: Project): string | null {
    // Check if project has a cover image set
    if (!project.coverImage) {
      return null;
    }

    const baseUrl =
      window.location.hostname === 'localhost'
        ? 'http://localhost:8333'
        : window.location.origin;
    return `${baseUrl}/api/v1/projects/${project.username}/${project.slug}/cover`;
  }

  selectProject(project: Project) {
    // Add logging to debug project navigation
    console.log('[HomeComponent] selectProject called with:', {
      project: {
        username: project.username,
        slug: project.slug,
        title: project.title,
      },
      fullProject: project,
    });

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
