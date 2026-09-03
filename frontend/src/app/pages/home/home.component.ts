import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  type OnDestroy,
  type OnInit,
  signal,
} from '@angular/core';
import { debounce, form, FormField } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterModule } from '@angular/router';
import { AnnouncementFeedComponent } from '@components/announcement-feed/announcement-feed.component';
import { ProjectCardComponent } from '@components/project-card/project-card.component';
import { ServerInfoBubbleComponent } from '@components/server-info-bubble/server-info-bubble.component';
import { SideNavComponent } from '@components/side-nav/side-nav.component';
import { ThemeToggleComponent } from '@components/theme-toggle/theme-toggle.component';
import { UserMenuComponent } from '@components/user-menu/user-menu.component';
import {
  ConfirmationDialogComponent,
  type ConfirmationDialogData,
} from '@dialogs/confirmation-dialog/confirmation-dialog.component';
import { LoginDialogComponent } from '@dialogs/login-dialog/login-dialog.component';
import { RegisterDialogComponent } from '@dialogs/register-dialog/register-dialog.component';
import { CollaborationService as CollaborationApiService } from '@inkweld/api/collaboration.service';
import { ProjectsService } from '@inkweld/api/projects.service';
import { type Project } from '@inkweld/index';
import {
  type CollaboratedProject,
  type PendingInvitation,
} from '@inkweld/model/models';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { BackgroundService } from '@services/core/background.service';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { SetupService } from '@services/core/setup.service';
import { StorageContextService } from '@services/core/storage-context.service';
import { TutorialService } from '@services/core/tutorial.service';
import { LocalProjectElementsService } from '@services/local/local-project-elements.service';
import { LocalSnapshotService } from '@services/local/local-snapshot.service';
import { LocalStorageService } from '@services/local/local-storage.service';
import { ProjectActivationService } from '@services/local/project-activation.service';
import { ProjectSyncService } from '@services/local/project-sync.service';
import { UnifiedProjectService } from '@services/local/unified-project.service';
import { ProjectServiceError } from '@services/project/project.service';
import { CoverSyncService } from '@services/sync/cover-sync.service';
import { SyncQueueService } from '@services/sync/sync-queue.service';
import { UnifiedUserService } from '@services/user/unified-user.service';
import { formatBytes } from '@utils/format-bytes';
import { firstValueFrom, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

interface HomeSearchFormValue {
  search: string;
}

@Component({
  selector: 'app-home',
  imports: [
    FormField,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatMenuModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    RouterModule,
    TranslocoModule,
    AnnouncementFeedComponent,
    ProjectCardComponent,
    ServerInfoBubbleComponent,
    UserMenuComponent,
    SideNavComponent,
    ThemeToggleComponent,
  ],
  templateUrl: './home.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
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
  private readonly transloco = inject(TranslocoService);
  private readonly dialogGateway = inject(DialogGatewayService);
  private readonly setupService = inject(SetupService);
  readonly syncQueueService = inject(SyncQueueService);
  private readonly coverSyncService = inject(CoverSyncService);
  private readonly storageContext = inject(StorageContextService);
  private readonly projectsService = inject(ProjectsService);
  readonly activationService = inject(ProjectActivationService);
  private readonly projectSyncService = inject(ProjectSyncService);
  private readonly localStorageService = inject(LocalStorageService);
  private readonly localSnapshotService = inject(LocalSnapshotService);
  private readonly localElementsService = inject(LocalProjectElementsService);
  private readonly tutorialService = inject(TutorialService);
  private readonly backgroundService = inject(BackgroundService);

  /** True when the app is running in local-only mode (no backend). */
  protected readonly isLocalMode = this.storageContext.isLocalMode;

  // Component state
  loadError = false;
  selectedProject: Project | null = null;
  isMobile = signal(false);
  sideNavOpen = signal(true); // Open by default on desktop
  mobileSearchActive = signal(false); // Track mobile search mode
  isInitializing = signal(true); // Track if we're still initializing user state

  readonly searchModel = signal<HomeSearchFormValue>({ search: '' });

  readonly searchForm = form(this.searchModel, schemaPath => {
    debounce(schemaPath.search, 300);
  });

  // Collaboration state
  pendingInvitations = signal<PendingInvitation[]>([]);
  collaboratedProjects = signal<CollaboratedProject[]>([]);
  loadingInvitations = signal(false);

  protected user = this.userService.currentUser;
  protected isLoading = this.projectService.isLoading;
  protected isAuthenticated = this.userService.isAuthenticated;
  protected destroy$ = new Subject<void>();

  /** Whether we're in server mode (enables Sync All button) */
  protected isServerMode = computed(
    () => this.setupService.getMode() === 'server'
  );

  /** Whether Sync All button should be enabled */
  protected canSyncAll = computed(() => {
    // Read activation version to re-evaluate when activations change
    this.activationService.activationVersion();
    const hasActivated = this.getActivatedProjects().length > 0;
    return (
      this.isServerMode() &&
      this.isAuthenticated() &&
      navigator.onLine &&
      !this.syncQueueService.isSyncing() &&
      hasActivated
    );
  });

  /** Tooltip for Sync All button */
  protected syncAllTooltip = computed(() => {
    if (!this.isServerMode())
      return this.transloco.translate('home.tooltips.onlineOnly');
    if (!navigator.onLine)
      return this.transloco.translate('home.tooltips.offline');
    if (this.syncQueueService.isSyncing())
      return this.transloco.translate('home.tooltips.syncInProgress');
    const hasProjects =
      this.projectService.projects().length > 0 ||
      this.collaboratedProjects().length > 0;
    if (!hasProjects)
      return this.transloco.translate('home.tooltips.noProjectsToSync');
    const activatedCount = this.getActivatedProjects().length;
    if (activatedCount === 0)
      return this.transloco.translate('home.tooltips.noActivatedProjects');
    return this.transloco.translate('home.tooltips.syncCount', {
      count: activatedCount,
    });
  });

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
      },
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

  // Private state - debounced search term derived from the signal form field
  private readonly searchTerm = computed(() =>
    this.searchForm.search().value()
  );

  /** Latch so the home tour is offered at most once per visit. */
  private tutorialOffered = false;

  constructor() {
    // Offer the home tour once the user state has resolved on a desktop
    // viewport. Reactive rather than a one-shot check because auth state and
    // the breakpoint both settle asynchronously during boot.
    effect(() => {
      if (
        this.tutorialOffered ||
        this.isInitializing() ||
        !this.isAuthenticated() ||
        this.isMobile()
      ) {
        return;
      }
      // The signal can lag the real viewport briefly at startup; skip without
      // latching so the effect retries when the breakpoint signal updates.
      if (
        this.breakpointObserver.isMatched([
          Breakpoints.XSmall,
          Breakpoints.Small,
        ])
      ) {
        return;
      }
      this.tutorialOffered = true;
      this.tutorialService.maybeAutoStart('home', { isMobile: false });
    });

    // This one element hosts both the welcome/login view and the project grid,
    // so it is also where the background switches between the admin-only login
    // surface and the personalisable app surface.
    effect(() => {
      this.backgroundService.setSurface(
        this.isAuthenticated() ? 'app' : 'login'
      );
    });
  }

  ngOnInit() {
    void this.loadProjects();
    this.setupBreakpointObserver();
    this.activationService.initialize().catch(() => {});
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
      this.triggerCoverSync();
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
      this.triggerCoverSync();
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
        this.isMobile.set(result.matches);
        // Close side nav on mobile by default
        if (this.isMobile()) {
          this.sideNavOpen.set(false);
        } else {
          this.sideNavOpen.set(true);
        }
      });
  }

  toggleSideNav(): void {
    this.sideNavOpen.set(!this.sideNavOpen());
  }

  /** Start the home-screen tour (from the empty state's button). */
  protected startTutorial(): void {
    this.tutorialService.start('home');
  }

  toggleMobileSearch(): void {
    this.mobileSearchActive.set(!this.mobileSearchActive());
    // Clear search when closing
    if (!this.mobileSearchActive()) {
      this.searchForm.search().value.set('');
    }
  }

  /**
   * Trigger background sync of project cover images.
   * Only syncs covers that are not already cached in IndexedDB.
   */
  private triggerCoverSync(): void {
    if (this.isServerMode() && this.isAuthenticated()) {
      this.coverSyncService
        .syncCovers(this.projectService.projects())
        .catch(() => {});
    }
  }

  /**
   * Sync all activated projects (owned and shared) with the server.
   * Only projects that have been activated on this device are synced.
   */
  syncAllProjects(): void {
    const activated = this.getActivatedProjects();

    if (activated.length === 0) {
      this.snackBar.open(
        this.transloco.translate('home.snackbar.noActivatedToSync'),
        this.transloco.translate('dismiss'),
        {
          duration: 3000,
        }
      );
      return;
    }

    void this.syncQueueService.syncAllProjects(activated);
  }

  /**
   * Get all projects (owned + shared) that are activated on this device.
   */
  private getActivatedProjects(): Project[] {
    const ownProjects = this.projectService.projects();
    const sharedProjects = this.collaboratedProjects();

    const sharedAsProjects: Project[] = sharedProjects.map(cp => ({
      id: cp.projectId,
      slug: cp.projectSlug,
      title: cp.projectTitle,
      description: null,
      username: cp.ownerUsername,
      coverImage: null,
      createdDate: new Date(cp.acceptedAt).toISOString(),
      updatedDate: new Date(cp.acceptedAt).toISOString(),
    }));

    const all = [...ownProjects, ...sharedAsProjects];

    if (!this.activationService.isActivationRequired()) {
      return all;
    }

    return all.filter(p =>
      this.activationService.isActivated(`${p.username}/${p.slug}`)
    );
  }

  /**
   * Check whether a project is activated on this device.
   */
  isProjectActivated(project: Project): boolean {
    return this.activationService.isActivated(
      `${project.username}/${project.slug}`
    );
  }

  /**
   * Arrow-function version of the activation check, suitable for passing
   * as an input binding to child components (keeps `this` bound).
   */
  readonly isProjectKeyActivated = (projectKey: string): boolean =>
    this.activationService.isActivated(projectKey);

  /**
   * Handle project card click. If deactivated in server mode, prompt to activate.
   * Suppresses click if it was triggered by a long-press.
   */
  onProjectClick(
    project: Project,
    event: Event,
    card?: ProjectCardComponent
  ): void {
    if (card?.wasLongPress()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (this.isProjectActivated(project)) {
      this.selectProject(project);
      return;
    }

    // Deactivated project — show activation dialog
    event.preventDefault();
    event.stopPropagation();
    this.promptActivate(project);
  }

  /**
   * Handle long-press on an activated project — offer to deactivate.
   */
  onProjectLongPress(project: Project): void {
    if (!this.isProjectActivated(project)) {
      return;
    }
    this.promptDeactivate(project);
  }

  /**
   * Handle "Download to this device" chosen from a card/tile kebab menu.
   * If the project is already activated, this is a no-op.
   */
  onProjectActivateRequested(project: Project): void {
    if (this.isProjectActivated(project)) return;
    this.promptActivate(project);
  }

  /**
   * Handle "Deactivate on this device" chosen from a card/tile kebab menu.
   * If the project is not activated, this is a no-op.
   */
  onProjectDeactivateRequested(project: Project): void {
    if (!this.isProjectActivated(project)) return;
    this.promptDeactivate(project);
  }

  /**
   * Open the activation confirmation dialog and sync on confirm.
   */
  private promptActivate(project: Project): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: this.transloco.translate('home.dialogs.activateTitle'),
        message: this.transloco.translate('home.dialogs.activateMessage', {
          title: project.title,
        }),
        confirmText: this.transloco.translate('home.dialogs.activate'),
        cancelText: this.transloco.translate('cancel'),
      } satisfies ConfirmationDialogData,
    });

    // Show a "Calculating..." indicator immediately while the size is fetched
    // (only in server mode where the fetch actually runs).
    if (!this.isLocalMode()) {
      dialogRef.componentInstance?.setDetails?.([
        this.transloco.translate('home.dialogs.calculatingSize'),
      ]);
    }

    // Load the approximate size the project will occupy in local storage and
    // surface it in the dialog. On failure, show an error message.
    void this.fetchActivationSize(project).then(size => {
      if (size) {
        dialogRef.componentInstance?.setDetails?.([
          this.transloco.translate('home.dialogs.activateSize', {
            sizeText: formatBytes(size.totalBytes),
          }),
        ]);
      } else if (!this.isLocalMode()) {
        dialogRef.componentInstance?.setDetails?.([
          this.transloco.translate('home.dialogs.sizeUnavailable'),
        ]);
      }
    });

    dialogRef.afterClosed().subscribe((confirmed: boolean) => {
      if (confirmed) {
        void this.activateAndSync(project);
      }
    });
  }

  /**
   * Fetch the approximate server-side size (data + media) for a project so the
   * activation dialog can tell the user roughly how much local storage the
   * download will use. Returns null on any failure.
   */
  private async fetchActivationSize(
    project: Project
  ): Promise<{ totalBytes: number } | null> {
    if (this.isLocalMode()) return null;
    try {
      return await firstValueFrom(
        this.projectsService.getProjectStorageSize(
          project.username,
          project.slug
        )
      );
    } catch {
      return null;
    }
  }

  /**
   * Handle "Delete project" chosen from a card/tile kebab menu.

  /**
   * Open the deactivation confirmation dialog and purge on confirm.
   */
  private promptDeactivate(project: Project): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: this.transloco.translate('home.dialogs.deactivateTitle'),
        message: this.transloco.translate('home.dialogs.deactivateMessage', {
          title: project.title,
        }),
        confirmText: this.transloco.translate('home.dialogs.deactivate'),
        cancelText: this.transloco.translate('cancel'),
      } satisfies ConfirmationDialogData,
    });

    dialogRef.afterClosed().subscribe((confirmed: boolean) => {
      if (confirmed) {
        void this.deactivateProject(project);
      }
    });
  }

  /**
   * Activate a project and immediately sync it.
   */
  private async activateAndSync(project: Project): Promise<void> {
    const projectKey = `${project.username}/${project.slug}`;
    try {
      await this.activationService.activate(projectKey);
      this.syncQueueService.syncAllProjects([project]).catch(() => {});
      this.snackBar.open(
        this.transloco.translate('home.snackbar.activatedSyncing', {
          title: project.title,
        }),
        this.transloco.translate('dismiss'),
        { duration: 3000 }
      );
    } catch {
      this.snackBar.open(
        this.transloco.translate('home.snackbar.activateFailed'),
        this.transloco.translate('dismiss'),
        {
          duration: 3000,
        }
      );
    }
  }

  /**
   * Deactivate a project and purge its local data.
   */
  private async deactivateProject(project: Project): Promise<void> {
    const projectKey = `${project.username}/${project.slug}`;
    try {
      await this.activationService.deactivate(projectKey);
      await this.purgeProjectLocalData(project);
      this.snackBar.open(
        this.transloco.translate('home.snackbar.deactivated', {
          title: project.title,
        }),
        this.transloco.translate('dismiss'),
        { duration: 3000 }
      );
    } catch {
      this.snackBar.open(
        this.transloco.translate('home.snackbar.deactivateFailed'),
        this.transloco.translate('dismiss'),
        {
          duration: 3000,
        }
      );
    }
  }

  /**
   * Remove all local data for a project: Yjs IndexedDB databases (prefixed
   * elements + unprefixed prose documents + worldbuilding), media blobs, sync
   * state/tombstones, and snapshots. The cover and the project list entry are
   * intentionally left so the tile can still be rendered and re-activated.
   */
  private async purgeProjectLocalData(project: Project): Promise<void> {
    const username = project.username;
    const slug = project.slug;
    const prefix = this.storageContext.getPrefix();
    const projectKey = `${username}/${slug}`;

    // Close the in-memory elements Y.Doc/provider so its IndexedDB connection
    // doesn't block database deletion.
    await this.localElementsService
      .closeConnection(username, slug)
      .catch(() => {});

    // Delete every IndexedDB database that belongs to this project:
    //  - prefixed elements/metadata:       {prefix}username:slug:elements
    //  - unprefixed prose documents:       username:slug:{elementId}
    //  - unprefixed worldbuilding:         worldbuilding:username:slug:{id}
    //  - prefixed worldbuilding (legacy):  {prefix}worldbuilding:username:slug:{id}
    if ('databases' in indexedDB) {
      try {
        const allDbs = await indexedDB.databases();
        const matches = (name: string): boolean =>
          name.startsWith(`${prefix}${username}:${slug}:`) ||
          name.startsWith(`${username}:${slug}:`) ||
          name.startsWith(`worldbuilding:${username}:${slug}:`) ||
          name.startsWith(`${prefix}worldbuilding:${username}:${slug}:`);

        for (const db of allDbs) {
          if (db.name && matches(db.name)) {
            await new Promise<void>(resolve => {
              const req = indexedDB.deleteDatabase(db.name!);
              req.onsuccess = () => resolve();
              req.onerror = () => resolve();
              req.onblocked = () => resolve();
            });
          }
        }
      } catch {
        // Best effort
      }
    }

    // Media blobs (cover, images, published exports).
    await this.localStorageService
      .deleteProjectMedia(projectKey)
      .catch(() => {});

    // Sync state + tombstones.
    await this.projectSyncService.deleteSyncState(projectKey).catch(() => {});
    await this.projectSyncService.removeTombstone(projectKey).catch(() => {});

    // Snapshots.
    await this.localSnapshotService
      .deleteAllForProject(projectKey)
      .catch(() => {});
  }

  /**
   * Handle "Delete project" chosen from a card/tile kebab menu.
   * Opens a typed-confirmation dialog, then deletes the project
   * on the server (and purges local data + deactivates on success).
   */
  onProjectDeleteRequested(project: Project): void {
    void this.promptDeleteProject(project);
  }

  /**
   * Open the delete confirmation dialog and run the full delete on confirm.
   * Requires the user to type the project slug to confirm.
   */
  private async promptDeleteProject(project: Project): Promise<void> {
    const confirmed = await this.dialogGateway.openConfirmationDialog({
      title: this.transloco.translate('home.dialogs.deleteTitle'),
      message: this.transloco.translate('home.dialogs.deleteMessage', {
        title: project.title,
        slug: project.slug,
      }),
      confirmText: this.transloco.translate('home.dialogs.delete'),
      cancelText: this.transloco.translate('cancel'),
      requireConfirmationText: project.slug,
    });

    if (!confirmed) return;

    const projectKey = `${project.username}/${project.slug}`;
    try {
      await this.projectService.deleteProject(project.username, project.slug);

      // Best-effort: deactivate on this device and purge local data so
      // stale Yjs databases / sync state / media don't linger.
      await this.activationService.deactivate(projectKey).catch(() => {});
      await this.purgeProjectLocalData(project);

      this.snackBar.open(
        this.transloco.translate('home.snackbar.deleted', {
          title: project.title,
        }),
        this.transloco.translate('dismiss'),
        { duration: 3000 }
      );

      // Reload collaboration data to keep the project list consistent.
      await this.loadCollaborationData().catch(() => {});
    } catch {
      this.snackBar.open(
        this.transloco.translate('home.snackbar.deleteFailed'),
        this.transloco.translate('dismiss'),
        { duration: 5000 }
      );
    }
  }

  /**
   * Cancel the current sync operation
   */
  cancelSync(): void {
    this.syncQueueService.cancelSync();
    this.snackBar.open(
      this.transloco.translate('home.snackbar.syncCancelled'),
      this.transloco.translate('dismiss'),
      { duration: 3000 }
    );
  }

  selectProject(project: Project) {
    void this.router.navigate([project.username || '', project.slug || ''], {
      onSameUrlNavigation: 'reload',
      skipLocationChange: false,
      replaceUrl: false,
    });
  }

  openNewProjectDialog(): void {
    void this.router.navigate(['/create-project']);
  }

  importProject(): void {
    const user = this.userService.currentUser();
    void this.dialogGateway
      .openImportProjectDialog(user?.username)
      .then(result => {
        if (result?.success && result.slug) {
          this.snackBar
            .open(
              this.transloco.translate('home.snackbar.projectImported'),
              this.transloco.translate('home.snackbar.view'),
              {
                duration: 5000,
              }
            )
            .onAction()
            .subscribe(() => {
              const username = user?.username ?? 'offline';
              void this.router.navigate(['/', username, result.slug]);
            });
          // Reload project list
          void this.loadProjects();
        }
      });
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
        this.transloco.translate('home.snackbar.nowCollaborator', {
          title: invitation.projectTitle,
        }),
        this.transloco.translate('close'),
        { duration: 3000 }
      );
    } catch (error) {
      console.error('Failed to accept invitation:', error);
      this.snackBar.open(
        this.transloco.translate('home.snackbar.acceptInvitationFailed'),
        this.transloco.translate('close'),
        {
          duration: 3000,
        }
      );
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
      this.snackBar.open(
        this.transloco.translate('home.snackbar.invitationDeclined'),
        this.transloco.translate('close'),
        { duration: 3000 }
      );
    } catch (error) {
      console.error('Failed to decline invitation:', error);
      this.snackBar.open(
        this.transloco.translate('home.snackbar.declineInvitationFailed'),
        this.transloco.translate('close'),
        {
          duration: 3000,
        }
      );
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
