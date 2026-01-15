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
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterModule } from '@angular/router';
import { AnnouncementFeedComponent } from '@components/announcement-feed/announcement-feed.component';
import { ProjectCardComponent } from '@components/project-card/project-card.component';
import { SideNavComponent } from '@components/side-nav/side-nav.component';
import { ThemeToggleComponent } from '@components/theme-toggle/theme-toggle.component';
import { UserMenuComponent } from '@components/user-menu/user-menu.component';
import { LoginDialogComponent } from '@dialogs/login-dialog/login-dialog.component';
import { RegisterDialogComponent } from '@dialogs/register-dialog/register-dialog.component';
import { CollaborationService as CollaborationApiService } from '@inkweld/api/collaboration.service';
import { Project } from '@inkweld/index';
import { CollaboratedProject, PendingInvitation } from '@inkweld/model/models';
import { SetupService } from '@services/core/setup.service';
import { UnifiedProjectService } from '@services/local/unified-project.service';
import { ProjectServiceError } from '@services/project/project.service';
import { UnifiedUserService } from '@services/user/unified-user.service';
import { firstValueFrom, Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule,
    RouterModule,
    AnnouncementFeedComponent,
    ProjectCardComponent,
    UserMenuComponent,
    SideNavComponent,
    ThemeToggleComponent,
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
  private readonly collaborationApiService = inject(CollaborationApiService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly setupService = inject(SetupService);

  // Component state
  loadError = false;
  selectedProject: Project | null = null;
  isMobile = false;
  searchControl = new FormControl('');
  sideNavOpen = signal(true); // Open by default on desktop
  mobileSearchActive = signal(false); // Track mobile search mode
  isInitializing = signal(true); // Track if we're still initializing user state

  // Collaboration state
  pendingInvitations = signal<PendingInvitation[]>([]);
  collaboratedProjects = signal<CollaboratedProject[]>([]);
  loadingInvitations = signal(false);

  protected user = this.userService.currentUser;
  protected isLoading = this.projectService.isLoading;
  protected isAuthenticated = this.userService.isAuthenticated;
  protected destroy$ = new Subject<void>();

  // Computed state - unified project list combining owned and shared projects
  protected allProjects = computed(() => {
    const term = this.searchTerm().toLowerCase();
    const ownProjects = this.projectService.projects();
    const sharedProjects = this.collaboratedProjects();

    // Convert shared projects to unified format
    const unifiedOwn = ownProjects.map(p => ({
      project: p,
      isShared: false as const,
      sharedByUsername: undefined as string | undefined,
    }));

    const unifiedShared = sharedProjects.map(cp => ({
      project: {
        id: cp.projectId,
        slug: cp.projectSlug,
        title: cp.projectTitle,
        description: null,
        username: cp.ownerUsername,
        coverImage: null,
        createdDate: new Date(cp.acceptedAt).toISOString(),
        updatedDate: new Date(cp.acceptedAt).toISOString(),
      } as Project,
      isShared: true as const,
      sharedByUsername: cp.ownerUsername,
    }));

    // Combine both lists
    const combined = [...unifiedOwn, ...unifiedShared];

    // Apply search filter if there's a search term
    if (!term) {
      return combined;
    }

    return combined.filter(item => {
      const p = item.project;
      return (
        p.title.toLowerCase().includes(term) ||
        p.slug.toLowerCase().includes(term) ||
        p.description?.toLowerCase().includes(term) ||
        p.username.toLowerCase().includes(term)
      );
    });
  });

  // Keep filteredProjects for side-nav compatibility (owned projects only)
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
    // If we already have projects and are initialized, just refresh collaboration data
    if (
      this.projectService.initialized() &&
      this.projectService.projects().length > 0
    ) {
      this.isInitializing.set(false);
      // Always reload collaboration data when returning to home
      await this.loadCollaborationData();
      return;
    }

    // Initialize user state from cache/server first
    // This ensures isAuthenticated() is accurate after a fresh page load
    try {
      await this.userService.initialize();
    } catch {
      // Initialization failed (e.g., session expired) - user will see welcome content
      this.isInitializing.set(false);
      return;
    } finally {
      // User initialization is complete, we can now show the appropriate content
      this.isInitializing.set(false);
    }

    // Only load projects if user is authenticated
    if (!this.isAuthenticated()) {
      return;
    }

    this.loadError = false;
    try {
      await this.projectService.loadProjects();
      // Also load collaboration data
      await this.loadCollaborationData();
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

  selectProject(project: Project) {
    console.log('[HomeComponent] selectProject called with:', {
      project: {
        username: project.username,
        slug: project.slug,
        title: project.title,
      },
    });

    void this.router.navigate([project.username || '', project.slug || ''], {
      onSameUrlNavigation: 'reload',
      skipLocationChange: false,
      replaceUrl: false,
    });
  }

  openNewProjectDialog(): void {
    void this.router.navigate(['/create-project']);
  }

  openLoginDialog(): void {
    const dialogRef = this.dialog.open(LoginDialogComponent, {
      autoFocus: true,
      disableClose: false,
      panelClass: 'login-dialog-panel',
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result === 'register') {
        // User wants to switch to register dialog
        this.openRegisterDialog();
      } else if (result === true) {
        // Login successful - reload projects
        void this.loadProjects();
      }
    });
  }

  openRegisterDialog(): void {
    const dialogRef = this.dialog.open(RegisterDialogComponent, {
      autoFocus: true,
      disableClose: false,
      panelClass: 'register-dialog-panel',
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result === 'login') {
        // User wants to switch to login dialog
        this.openLoginDialog();
      } else if (result === true) {
        // Registration successful - reload projects
        void this.loadProjects();
      }
    });
  }

  navigateToLogin(): void {
    this.openLoginDialog();
  }

  navigateToRegister(): void {
    this.openRegisterDialog();
  }

  /**
   * Load pending invitations and collaborated projects.
   * Skipped in offline mode since collaboration requires a server.
   */
  async loadCollaborationData(): Promise<void> {
    // Skip collaboration API calls in offline mode
    if (this.setupService.getMode() === 'local') {
      return;
    }

    if (!this.isAuthenticated()) {
      return;
    }

    this.loadingInvitations.set(true);
    try {
      const [invitations, collaborated] = await Promise.all([
        firstValueFrom(this.collaborationApiService.getPendingInvitations()),
        firstValueFrom(this.collaborationApiService.getCollaboratedProjects()),
      ]);
      this.pendingInvitations.set(invitations);
      this.collaboratedProjects.set(collaborated);
    } catch (error) {
      console.error('Failed to load collaboration data:', error);
    } finally {
      this.loadingInvitations.set(false);
    }
  }

  /**
   * Accept a project invitation
   */
  async acceptInvitation(invitation: PendingInvitation): Promise<void> {
    try {
      await firstValueFrom(
        this.collaborationApiService.acceptInvitation(invitation.projectId)
      );
      // Remove from pending invitations
      this.pendingInvitations.update(invitations =>
        invitations.filter(i => i.projectId !== invitation.projectId)
      );
      // Reload collaborated projects
      const collaborated = await firstValueFrom(
        this.collaborationApiService.getCollaboratedProjects()
      );
      this.collaboratedProjects.set(collaborated);
      this.snackBar.open(
        `You are now a collaborator on "${invitation.projectTitle}"`,
        'Close',
        { duration: 3000 }
      );
    } catch (error) {
      console.error('Failed to accept invitation:', error);
      this.snackBar.open('Failed to accept invitation', 'Close', {
        duration: 3000,
      });
    }
  }

  /**
   * Decline a project invitation
   */
  async declineInvitation(invitation: PendingInvitation): Promise<void> {
    try {
      await firstValueFrom(
        this.collaborationApiService.declineInvitation(invitation.projectId)
      );
      // Remove from pending invitations
      this.pendingInvitations.update(invitations =>
        invitations.filter(i => i.projectId !== invitation.projectId)
      );
      this.snackBar.open('Invitation declined', 'Close', { duration: 3000 });
    } catch (error) {
      console.error('Failed to decline invitation:', error);
      this.snackBar.open('Failed to decline invitation', 'Close', {
        duration: 3000,
      });
    }
  }

  /**
   * Navigate to a collaborated project
   */
  openCollaboratedProject(project: CollaboratedProject): void {
    void this.router.navigate([project.ownerUsername, project.projectSlug]);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
