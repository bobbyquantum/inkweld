import { BreakpointObserver } from '@angular/cdk/layout';
import {
  AfterViewInit,
  Component,
  effect,
  HostListener,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Title } from '@angular/platform-browser';
import {
  ActivatedRoute,
  Router,
  RouterModule,
  RouterOutlet,
} from '@angular/router';
import { ConnectionStatusComponent } from '@components/connection-status/connection-status.component';
import { PresenceIndicatorComponent } from '@components/presence-indicator/presence-indicator.component';
import { ProjectTreeComponent } from '@components/project-tree/project-tree.component';
import { UserMenuComponent } from '@components/user-menu/user-menu.component';
import { Element, ElementType, Project } from '@inkweld/index';
import { SettingsService } from '@services/core/settings.service';
import { UnifiedProjectService } from '@services/local/unified-project.service';
import { DocumentService } from '@services/project/document.service';
import { ProjectExportService } from '@services/project/project-export.service';
import { ProjectStateService } from '@services/project/project-state.service';
import {
  AngularSplitModule,
  SplitGutterDirective,
  SplitGutterInteractionEvent,
} from 'angular-split';
import { Subject, Subscription, takeUntil } from 'rxjs';

import { DocumentElementEditorComponent } from '../../components/document-element-editor/document-element-editor.component';
import { DocumentSyncState } from '../../models/document-sync-state';
import {
  createDefaultPublishPlan,
  PublishPlan,
} from '../../models/publish-plan';
import { DialogGatewayService } from '../../services/core/dialog-gateway.service';
import { QuickOpenService } from '../../services/core/quick-open.service';
import { StorageContextService } from '../../services/core/storage-context.service';
import { RecentFilesService } from '../../services/project/recent-files.service';
import { TabInterfaceComponent } from './tabs/tab-interface.component';

@Component({
  selector: 'app-project',
  templateUrl: './project.component.html',
  styleUrls: ['./project.component.scss'],
  imports: [
    MatButtonModule,
    MatSidenavModule,
    MatTabsModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatToolbarModule,
    MatMenuModule,
    MatTooltipModule,
    ConnectionStatusComponent,
    PresenceIndicatorComponent,
    ProjectTreeComponent,
    DocumentElementEditorComponent,
    RouterModule,
    UserMenuComponent,
    RouterOutlet,
    TabInterfaceComponent,
    AngularSplitModule,
    SplitGutterDirective,
  ],
  standalone: true,
})
export class ProjectComponent implements OnInit, OnDestroy, AfterViewInit {
  protected readonly projectState = inject(ProjectStateService);
  protected readonly documentService = inject(DocumentService);
  protected readonly recentFilesService = inject(RecentFilesService);
  protected readonly breakpointObserver = inject(BreakpointObserver);
  protected readonly snackBar = inject(MatSnackBar);
  protected readonly route = inject(ActivatedRoute);
  protected readonly title = inject(Title);
  protected readonly router = inject(Router);
  protected readonly exportService = inject(ProjectExportService);
  protected readonly projectService = inject(UnifiedProjectService);
  private readonly dialogGateway = inject(DialogGatewayService);
  private readonly settingsService = inject(SettingsService);
  private readonly quickOpenService = inject(QuickOpenService);
  private readonly storageContext = inject(StorageContextService);

  @ViewChild(MatSidenav) sidenav!: MatSidenav;

  public readonly isMobile = signal(false);
  public readonly isZenMode = signal(false);
  public readonly showSidebar = signal(true);
  public readonly sidebarCollapsed = signal(false);
  public readonly isDeleting = signal(false);

  /** Current project sync state - exposed for connection status display */
  protected readonly projectSyncState = this.projectState.getSyncState;
  /** Last connection error - shown in tooltip when sync fails */
  protected readonly lastConnectionError =
    this.projectState.getLastConnectionError;
  /** Whether we're in local-only mode (no server configured) */
  protected readonly isLocalMode = this.storageContext.isLocalMode;

  // Define a consistent breakpoint value for the application
  private readonly MOBILE_BREAKPOINT = '(max-width: 759px)';

  protected destroy$ = new Subject<void>();
  protected readonly errorEffect = effect(() => {
    const error = this.projectState.error();
    if (error) {
      this.snackBar.open(error, 'Close', { duration: 5000 });
    }
  });
  protected readonly DocumentSyncState = DocumentSyncState;
  private paramsSubscription?: Subscription;
  private hasUnsavedChanges = false;
  private fullscreenListener?: () => void;

  // Split size for desktop layout
  protected splitSize = 25; // Default split size as percentage
  protected splitSizeInPixels = 300; // Default split size in pixels

  constructor() {
    // Load saved split size and sidebar collapsed state early in initialization
    if (!this.isMobile()) {
      const storedSplitSize = localStorage.getItem('splitSize');
      if (storedSplitSize) {
        this.splitSize = parseInt(storedSplitSize, 10);
      }
      const storedCollapsed = localStorage.getItem('sidebarCollapsed');
      if (storedCollapsed === 'true') {
        this.sidebarCollapsed.set(true);
      }
    }

    effect(() => {
      const project = this.projectState.project() as Project | null;
      if (project) {
        this.title.setTitle(`${project.title}`);
      }
    });

    effect(() => {
      const tabs = this.projectState.openTabs();
      const currentTabIndex = this.projectState.selectedTabIndex();
      let currentDocId: string | null = null;

      // Get the current document ID if we're looking at a document tab
      if (currentTabIndex > 0 && tabs.length >= currentTabIndex) {
        const currentTab = tabs[currentTabIndex - 1]; // -1 for home tab
        if (currentTab.type === 'document' && currentTab.element) {
          currentDocId = currentTab.element.id;
        }
      }

      if (currentDocId) {
        const status = this.documentService.getSyncStatusSignal(currentDocId)();
        this.hasUnsavedChanges =
          status === DocumentSyncState.Local &&
          this.documentService.hasUnsyncedChanges(currentDocId);
      } else {
        this.hasUnsavedChanges = false;
      }
    });

    // Disable zen mode when switching tabs or closing tabs
    effect(() => {
      // Check if current tab can support zen mode
      if (this.isZenMode() && !this.canEnableZenMode()) {
        this.isZenMode.set(false);
      }

      // Trigger on tab changes - access to watch for changes
      this.projectState.selectedTabIndex();
      // Trigger on tab count changes - access to watch for changes
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      this.projectState.openTabs().length;
    });
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent) {
    if (this.hasUnsavedChanges) {
      event.preventDefault();
      event.returnValue = '';
      return '';
    }
    return true;
  }

  async canDeactivate(): Promise<boolean> {
    console.log('Checking project de-activation guard');
    if (!this.hasUnsavedChanges) {
      return true;
    }

    const confirmed = await this.dialogGateway.openConfirmationDialog({
      title: 'Unsynced Changes',
      message:
        "You have changes that haven't been synced to the server yet. Are you sure you want to leave?",
      confirmText: 'Leave',
      cancelText: 'Stay',
    });

    return confirmed;
  }

  ngOnInit() {
    console.log('ProjectComponent init');
    this.paramsSubscription = this.route.params.subscribe(params => {
      const username = params['username'] as string;
      const slug = params['slug'] as string;
      if (username && slug) {
        console.log(`Loading project ${username}/${slug}`);
        void this.projectState.loadProject(username, slug);

        // Ensure we're starting with tab index 0 (home tab)
        this.projectState.selectTab(0);
      }
    });

    // Add fullscreenchange event listener to handle when user presses Escape to exit fullscreen
    this.fullscreenListener = () => {
      // If fullscreen was exited and we're in zen mode, also exit zen mode
      if (!document.fullscreenElement && this.isZenMode()) {
        this.isZenMode.set(false);
      }
    };
    document.addEventListener('fullscreenchange', this.fullscreenListener);

    // Initialize quick file open (Cmd/Ctrl + P)
    this.quickOpenService.initialize();
  }

  ngAfterViewInit() {
    this.setupBreakpointObserver();
  }

  setupBreakpointObserver() {
    this.breakpointObserver
      .observe(this.MOBILE_BREAKPOINT)
      .pipe(takeUntil(this.destroy$))
      .subscribe(result => {
        this.isMobile.set(result.matches);
        if (this.sidenav) {
          if (!result.matches) {
            this.sidenav.mode = 'side';
            void this.sidenav.open();
          } else {
            this.sidenav.mode = 'over';
            void this.sidenav.close();
          }
        }
      });
  }

  ngOnDestroy() {
    this.paramsSubscription?.unsubscribe();
    this.errorEffect.destroy();
    this.destroy$.next();
    this.destroy$.complete();

    // Remove fullscreenchange event listener
    if (this.fullscreenListener) {
      document.removeEventListener('fullscreenchange', this.fullscreenListener);
    }

    // Clean up quick open service
    this.quickOpenService.destroy();
  }

  isLoading = () => this.projectState.isLoading();

  async toggleSidenav() {
    await this.sidenav.toggle();
  }

  public toggleSidebar(): void {
    if (this.isMobile()) {
      void this.sidenav.toggle();
    } else {
      this.showSidebar.update(v => !v);
    }
  }

  /** Toggle sidebar collapsed state (desktop only) */
  public toggleSidebarCollapsed(): void {
    if (!this.isMobile()) {
      const newValue = !this.sidebarCollapsed();
      this.sidebarCollapsed.set(newValue);
      localStorage.setItem('sidebarCollapsed', String(newValue));
    }
  }

  // Handle split drag end event
  onSplitDragEnd(event: SplitGutterInteractionEvent) {
    if (this.isMobile()) return;

    // Extract the first size which should be the sidebar
    const sizeValue = event.sizes[0];

    // Convert to number regardless of whether it's a string or number
    this.splitSize =
      typeof sizeValue === 'string' ? parseFloat(sizeValue) : Number(sizeValue);

    // Save to localStorage for persistence
    localStorage.setItem('splitSize', this.splitSize.toString());
  }

  onDocumentOpened = (element: Element) => {
    this.projectState.openDocument(element);
    if (this.isMobile()) {
      void this.sidenav.close();
    }
    // Navigate to document/folder route on mobile
    const project = this.projectState.project();
    if (project) {
      const typeRoute =
        element.type === ElementType.Folder ? 'folder' : 'document';
      void this.router.navigate([
        '/',
        project.username,
        project.slug,
        typeRoute,
        element.id,
      ]);
    }
  };

  closeTab = (index: number, event?: MouseEvent) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const tabs = this.projectState.openTabs();
    // Don't allow closing the last tab
    if (tabs.length <= 1) return;

    // If closing the current tab, navigate to an adjacent tab first
    if (this.projectState.selectedTabIndex() === index) {
      const newIndex = index > 0 ? index - 1 : 1;
      this.setSelectedTabIndex(newIndex);
    }
    this.projectState.closeTab(index);
  };

  setSelectedTabIndex(index: number): void {
    this.projectState.selectTab(index);
  }

  onImportClicked = (): void => {
    const project = this.projectState.project();
    void this.dialogGateway
      .openImportProjectDialog(project?.username)
      .then(result => {
        if (result?.success && result.slug) {
          this.snackBar
            .open('Project imported successfully!', 'View', {
              duration: 5000,
            })
            .onAction()
            .subscribe(() => {
              // Navigate to the imported project
              const username = project?.username ?? 'offline';
              void this.router.navigate(['/', username, result.slug]);
            });
        }
      });
  };

  async onExportClicked(): Promise<void> {
    try {
      await this.exportService.exportProject();
      this.snackBar.open('Project exported successfully', 'Close', {
        duration: 3000,
      });
    } catch (error) {
      console.error('Export failed:', error);
      this.snackBar.open('Failed to export project', 'Close', {
        duration: 5000,
      });
    }
  }

  exitProject() {
    void this.router.navigate(['/']);
  }

  /** Open the quick open dialog */
  openQuickOpen(): void {
    this.quickOpenService.open();
  }

  onRecentDocumentClick(documentId: string): void {
    const elements = this.projectState.elements();
    const element = elements.find(e => e.id === documentId);
    if (element) {
      this.projectState.openDocument(element);
    }
  }

  onRecentDocumentKeydown(event: KeyboardEvent, documentId: string): void {
    if (event.key === 'Enter' || event.key === ' ') {
      this.onRecentDocumentClick(documentId);
    }
  }

  public onPublishClick(): void {
    const project = this.projectState.project();
    if (!project) return;

    // Get existing plans or create a default one
    const plans = this.projectState.getPublishPlans();
    let plan: PublishPlan;

    if (plans.length > 0) {
      // Open the first/default plan
      plan = plans[0];
    } else {
      // Create a default publish plan
      plan = createDefaultPublishPlan(
        project.title,
        project.username // Author name defaults to username
      );
      this.projectState.createPublishPlan(plan);
    }

    // Open the publish plan tab
    this.projectState.openPublishPlan(plan);

    // Navigate to the publish plan
    void this.router.navigate([
      '/',
      project.username,
      project.slug,
      'publish-plan',
      plan.id,
    ]);
  }

  public onShowDocumentList(): void {
    const result = this.projectState.openSystemTab('documents-list');
    this.projectState.selectTab(result.index);
    const project = this.projectState.project();
    if (project) {
      void this.router.navigate([
        '/',
        project.username,
        project.slug,
        'documents-list',
      ]);
    }
  }

  public onShowMediaLibrary(): void {
    const result = this.projectState.openSystemTab('media');
    // Ensure the tab is selected
    this.projectState.selectTab(result.index);
    const project = this.projectState.project();
    if (project) {
      void this.router.navigate(['/', project.username, project.slug, 'media']);
    }
  }

  public onShowSettings(): void {
    const result = this.projectState.openSystemTab('settings');
    // Ensure the tab is selected
    this.projectState.selectTab(result.index);
    const project = this.projectState.project();
    if (project) {
      void this.router.navigate([
        '/',
        project.username,
        project.slug,
        'settings',
      ]);
    }
  }

  openEditDialog() {
    void this.dialogGateway.openEditProjectDialog(this.projectState.project()!);
  }

  toggleZenMode(): void {
    if (!this.canEnableZenMode() && !this.isZenMode()) {
      return;
    }

    this.isZenMode.update(current => {
      const newValue = !current;

      const fullscreenEnabled = this.settingsService.getSetting<boolean>(
        'zenModeFullscreen',
        true
      );

      if (newValue && fullscreenEnabled) {
        document.documentElement.requestFullscreen().catch(err => {
          console.warn('Error attempting to enable fullscreen:', err);
        });
      } else if (!newValue && document.fullscreenElement) {
        document.exitFullscreen().catch(err => {
          console.warn('Error attempting to exit fullscreen:', err);
        });
      }

      return newValue;
    });
  }

  canEnableZenMode(): boolean {
    const currentTabIndex = this.projectState.selectedTabIndex();
    const tabs = this.projectState.openTabs();

    if (currentTabIndex === 0 || tabs.length === 0) {
      return false;
    }

    const currentTab = tabs[currentTabIndex - 1];

    return (
      currentTab && currentTab.type === 'document' && currentTab.element != null
    );
  }

  getCurrentDocumentId(): string | null {
    const url = this.router.url;
    if (!url.includes('/document/')) {
      return null;
    }

    const currentTabIndex = this.projectState.selectedTabIndex();
    const tabs = this.projectState.openTabs();

    if (currentTabIndex === 0 || tabs.length === 0) {
      return null;
    }

    const currentTab = tabs[currentTabIndex - 1];

    if (currentTab && currentTab.type === 'document' && currentTab.element) {
      return `${this.projectState.project()!.username}:${this.projectState.project()!.slug}:${currentTab.id}`;
    }

    return null;
  }

  getGutterSize(): number {
    return this.isMobile() ? 0 : 8;
  }

  public useTabsDesktop(): boolean {
    return this.settingsService.getSetting<boolean>('useTabsDesktop', true);
  }

  public onDeleteProjectClick(): void {
    const project = this.projectState.project();
    if (!project) return;

    void this.dialogGateway
      .openConfirmationDialog({
        title: 'Delete Project',
        message: `To confirm deletion, please type the project slug "${project.slug}" below. This action cannot be undone.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        requireConfirmationText: project.slug,
      })
      .then(confirmed => {
        if (confirmed) {
          this.isDeleting.set(true);

          void this.projectService
            .deleteProject(project.username, project.slug)
            .then(() => {
              this.snackBar.open('Project deleted successfully', 'Close', {
                duration: 3000,
              });
              void this.router.navigate(['/']);
            })
            .catch(error => {
              console.error('Error deleting project:', error);
              this.snackBar.open('Failed to delete project', 'Close', {
                duration: 5000,
              });
            })
            .finally(() => {
              this.isDeleting.set(false);
            });
        }
      });
  }

  // Navigate to home tab
  goHome(): void {
    const project = this.projectState.project();
    if (project) {
      this.projectState.selectTab(0);
      void this.router.navigate(['/', project.username, project.slug]);
    }
  }

  // Create a new document at the root level (used from collapsed sidebar)
  onCreateNewDocument(): void {
    this.projectState.showNewElementDialog(undefined);
  }

  // Check if a system tab is currently selected
  isSystemTabSelected(systemType: string): boolean {
    const tabs = this.projectState.openTabs();
    const currentTabIndex = this.projectState.selectedTabIndex();
    if (currentTabIndex === 0 || tabs.length === 0) {
      return false;
    }
    const currentTab = tabs[currentTabIndex];
    return currentTab?.systemType === systemType;
  }

  /**
   * Retry connection to the server.
   * Reloads the current project to re-establish sync.
   */
  async onRetrySyncConnection(): Promise<void> {
    const project = this.projectState.project();
    if (!project) return;

    this.snackBar.open('Reconnecting...', undefined, { duration: 2000 });

    try {
      // Reload the project to re-establish sync provider
      await this.projectState.loadProject(project.username, project.slug);
      this.snackBar.open('Reconnected successfully', 'Close', {
        duration: 3000,
      });
    } catch (error) {
      console.error('Failed to reconnect:', error);
      this.snackBar.open('Failed to reconnect to server', 'Close', {
        duration: 5000,
      });
    }
  }
}
