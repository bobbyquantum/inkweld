import { Tab, TabList, Tabs } from '@angular/aria/tabs';
import { CdkDrag, CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import { CdkContextMenuTrigger, CdkMenu, CdkMenuItem } from '@angular/cdk/menu';
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  effect,
  ElementRef,
  EventEmitter,
  inject,
  OnDestroy,
  OnInit,
  Output,
  signal,
  ViewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import {
  ActivatedRoute,
  NavigationEnd,
  PRIMARY_OUTLET,
  Router,
  RouterModule,
} from '@angular/router';
import { Element, ElementType } from '@inkweld/index';
import { DocumentService } from '@services/project/document.service';
import {
  AppTab,
  ProjectStateService,
} from '@services/project/project-state.service';
import { filter, Subject, Subscription, takeUntil } from 'rxjs';

import { DialogGatewayService } from '../../../services/core/dialog-gateway.service';
import { WorldbuildingService } from '../../../services/worldbuilding/worldbuilding.service';

@Component({
  selector: 'app-tab-interface',
  templateUrl: './tab-interface.component.html',
  styleUrls: ['./tab-interface.component.scss'],
  standalone: true,
  imports: [
    Tabs,
    TabList,
    Tab,
    MatIconModule,
    MatButtonModule,
    RouterModule,
    MatMenuModule,
    CdkContextMenuTrigger,
    CdkMenu,
    CdkMenuItem,
    CdkDropList,
    CdkDrag,
  ],
})
export class TabInterfaceComponent implements OnInit, OnDestroy, AfterViewInit {
  @Output() importRequested = new EventEmitter<void>();
  @ViewChild('tabNavBar') tabNavBar!: ElementRef<HTMLElement>;

  protected readonly projectState = inject(ProjectStateService);
  protected readonly documentService = inject(DocumentService);
  protected readonly router = inject(Router);
  protected readonly route = inject(ActivatedRoute);
  protected readonly dialog = inject(MatDialog);
  private readonly cdr = inject(ChangeDetectorRef);
  protected readonly dialogGateway = inject(DialogGatewayService);
  private readonly worldbuildingService = inject(WorldbuildingService);

  private destroy$ = new Subject<void>();
  private routerSubscription: Subscription | null = null;
  private initialSyncDone = false; // Flag to ensure initial sync runs only once
  private lastProjectId: string | undefined; // Track project changes

  // Scroll state for arrow visibility
  canScrollLeft = signal(false);
  canScrollRight = signal(false);

  // Context menu tracking
  contextTabIndex: number | null = null;
  contextTab: AppTab | null = null;

  get currentTabIndex(): number {
    return this.projectState.selectedTabIndex();
  }
  constructor() {
    // Watch for tabs changes and update scroll state
    effect(() => {
      // Track openTabs to trigger when tabs change
      this.projectState.openTabs();
      // Use setTimeout to wait for DOM update after tabs render
      setTimeout(() => this.updateScrollState(), 0);
    });

    // Watch for project changes and reset sync flag
    effect(() => {
      const project = this.projectState.project();
      const isLoading = this.projectState.isLoading();

      // Detect project change by comparing IDs
      const currentProjectId = project?.id;
      if (currentProjectId !== this.lastProjectId) {
        this.initialSyncDone = false;
        this.lastProjectId = currentProjectId;
      }

      // Also reset when loading starts
      if (isLoading && this.initialSyncDone) {
        this.initialSyncDone = false;
      }
    });

    // Watch for changes to the selected tab index and navigate accordingly
    effect(() => {
      const tabIndex = this.projectState.selectedTabIndex();
      const project = this.projectState.project();
      const isLoading = this.projectState.isLoading();

      // Skip navigation during initial load OR while loading
      if (!this.initialSyncDone || !project || isLoading) {
        return;
      }

      // Get available tabs
      const tabs = this.projectState.openTabs();

      // Validate tab index
      if (tabIndex < 0 || tabIndex >= tabs.length) {
        return;
      }

      // Get the tab info
      const tab = tabs[tabIndex];

      // Handle different tab types
      if (tab.type === 'system') {
        if (tab.systemType === 'home') {
          // Home tab - navigate to project root
          void this.router.navigate(['/', project.username, project.slug]);
        } else {
          // Other system tabs (documents list, media, etc.)
          void this.router.navigate([
            '/',
            project.username,
            project.slug,
            tab.systemType, // 'documents-list' or 'media'
          ]);
        }
      } else if (tab.type === 'publishPlan') {
        // Publish plan tab
        void this.router.navigate([
          '/',
          project.username,
          project.slug,
          'publish-plan',
          tab.publishPlan?.id || tab.id.replace('publishPlan-', ''),
        ]);
      } else {
        // Document or folder tab
        void this.router.navigate([
          '/',
          project.username,
          project.slug,
          tab.type, // 'document' or 'folder'
          tab.id,
        ]);
      }
    });

    // Effect to handle initial tab synchronization after project state is loaded
    effect(() => {
      const isLoading = this.projectState.isLoading();
      const project = this.projectState.project();
      const currentUrl = this.router.url;

      if (!isLoading && !this.initialSyncDone && project) {
        // Verify the project matches the current URL before syncing
        const urlParts = currentUrl.split('/').filter(p => p);
        const urlUsername = urlParts[0];
        const urlSlug = urlParts[1];

        if (urlUsername === project.username && urlSlug === project.slug) {
          this.updateSelectedTabFromUrl();
          this.initialSyncDone = true;
          this.cdr.detectChanges(); // Trigger change detection after initial sync
        }
      }
    });
  }

  // Reserved paths that are not project routes (first URL segment)
  // Must match RESERVED_USERNAMES in backend/src/schemas/auth.schemas.ts
  private readonly reservedPaths = new Set([
    'admin',
    'setup',
    'reset',
    'create-project',
    'welcome',
    'register',
    'approval-pending',
    'unavailable',
    'api',
    'assets',
    'static',
    '_next',
    'health',
    'ws',
    '',
  ]);

  /** Check if a URL path is a project route (not a reserved path) */
  private isProjectRoute(url: string): boolean {
    const urlParts = url.split('/').filter(p => p);
    const firstSegment = urlParts[0] || '';
    return !this.reservedPaths.has(firstSegment);
  }

  ngOnInit(): void {
    // Subscribe to router events to update the tab selection on subsequent navigations
    this.routerSubscription = this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        // No need to skip initial NavigationEnd, effect handles initial load
        takeUntil(this.destroy$)
      )
      .subscribe(event => {
        // Skip non-project routes (admin, setup, etc.)
        if (!this.isProjectRoute(event.url)) {
          return;
        }

        // Extract project info from URL to detect project changes
        const urlParts = event.url.split('/').filter(p => p);
        const urlUsername = urlParts[0];
        const urlSlug = urlParts[1];
        const currentProject = this.projectState.project();
        const isLoading = this.projectState.isLoading();

        // Reset sync flag if project is loading OR URL doesn't match current project
        if (isLoading) {
          this.initialSyncDone = false;
        } else if (
          currentProject &&
          urlUsername &&
          urlSlug &&
          (urlUsername !== currentProject.username ||
            urlSlug !== currentProject.slug)
        ) {
          console.warn(
            '[TabInterface] URL/Project mismatch - forcing reload',
            `URL: ${urlUsername}/${urlSlug}`,
            `Project: ${currentProject.username}/${currentProject.slug}`
          );
          this.initialSyncDone = false;

          // Force reload the correct project from the URL
          void this.projectState.loadProject(urlUsername, urlSlug);
        }

        // Avoid redundant sync if initial sync is happening via effect
        if (this.initialSyncDone) {
          this.updateSelectedTabFromUrl();
          this.cdr.detectChanges(); // Trigger change detection after URL update
        }
      });

    // Initial selection is now handled by the effect
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
    }
  }

  ngAfterViewInit(): void {
    // Initial scroll state check
    this.updateScrollState();
  }

  /** Check if scroll arrows should be visible */
  updateScrollState(): void {
    const el = this.tabNavBar?.nativeElement;
    if (!el) return;

    const canLeft = el.scrollLeft > 0;
    const canRight = el.scrollLeft < el.scrollWidth - el.clientWidth - 1;

    this.canScrollLeft.set(canLeft);
    this.canScrollRight.set(canRight);
  }

  /** Handle scroll event on the tab nav bar */
  onTabsScroll(): void {
    this.updateScrollState();
  }

  /** Scroll tabs left */
  scrollLeft(): void {
    const el = this.tabNavBar?.nativeElement;
    if (!el) return;
    el.scrollBy({ left: -150, behavior: 'smooth' });
  }

  /** Scroll tabs right */
  scrollRight(): void {
    const el = this.tabNavBar?.nativeElement;
    if (!el) return;
    el.scrollBy({ left: 150, behavior: 'smooth' });
  }

  updateSelectedTabFromUrl(): void {
    // Get current route URL
    let currentRoute = this.route.root;
    let tabId: string | null = null;
    let systemRoute: string | null = null;
    let publishPlanId: string | null = null;

    // First check if we're on a system route or publish-plan route
    const url = this.router.url;
    const project = this.projectState.project();
    if (project) {
      const projectBaseUrl = `/${project.username}/${project.slug}`;
      if (url === `${projectBaseUrl}/documents-list`) {
        systemRoute = 'documents-list';
      } else if (url === `${projectBaseUrl}/media`) {
        systemRoute = 'media';
      } else if (url === `${projectBaseUrl}/templates-list`) {
        systemRoute = 'templates-list';
      } else if (url === `${projectBaseUrl}/relationships-list`) {
        systemRoute = 'relationships-list';
      } else if (url === `${projectBaseUrl}/tags-list`) {
        systemRoute = 'tags-list';
      } else if (url.startsWith(`${projectBaseUrl}/publish-plan/`)) {
        // Extract publish plan ID from URL
        const urlParts = url.split('/');
        publishPlanId = urlParts[urlParts.length - 1];
        // Remove any query params
        if (publishPlanId.includes('?')) {
          publishPlanId = publishPlanId.split('?')[0];
        }
      }
    }

    // If not a system route or publish-plan route, check for tabId param
    if (!systemRoute && !publishPlanId) {
      while (currentRoute.firstChild) {
        currentRoute = currentRoute.firstChild;
        if (
          currentRoute.outlet === PRIMARY_OUTLET &&
          currentRoute.snapshot.paramMap.has('tabId')
        ) {
          tabId = currentRoute.snapshot.paramMap.get('tabId');
        }
      }
    }

    // Check if we are at the project root (home tab)
    if (!tabId && !systemRoute && !publishPlanId) {
      // Find home tab index
      const homeIndex = this.projectState
        .openTabs()
        .findIndex(tab => tab.systemType === 'home');
      if (homeIndex !== -1) {
        this.projectState.selectTab(homeIndex);
      } else {
        // No home tab, open it
        this.projectState.openHomeTab();
      }
      return;
    }

    // Find the tab index
    let tabIndex = -1;

    if (systemRoute) {
      // Find the system tab
      tabIndex = this.projectState
        .openTabs()
        .findIndex(
          tab => tab.type === 'system' && tab.systemType === systemRoute
        );

      // If system tab not found in the existing tabs, create it
      if (tabIndex === -1) {
        this.projectState.openSystemTab(
          systemRoute as
            | 'documents-list'
            | 'media'
            | 'templates-list'
            | 'relationships-list'
            | 'tags-list'
        );
        // Re-find the tab index after creating
        tabIndex = this.projectState
          .openTabs()
          .findIndex(
            tab => tab.type === 'system' && tab.systemType === systemRoute
          );
      }
    } else if (publishPlanId) {
      // Find the publish plan tab by plan ID
      tabIndex = this.projectState
        .openTabs()
        .findIndex(
          tab =>
            tab.type === 'publishPlan' &&
            (tab.publishPlan?.id === publishPlanId ||
              tab.id === `publish-plan-${publishPlanId}`)
        );

      // If publish plan tab not found, try to create it
      if (tabIndex === -1) {
        const plan = this.projectState.getPublishPlan(publishPlanId);
        if (plan) {
          this.projectState.openPublishPlan(plan);
          // Re-find the tab index after creating
          tabIndex = this.projectState
            .openTabs()
            .findIndex(
              tab =>
                tab.type === 'publishPlan' &&
                (tab.publishPlan?.id === publishPlanId ||
                  tab.id === `publish-plan-${publishPlanId}`)
            );
        }
      }
    } else if (tabId) {
      // Find tab with the specific ID (for document/folder tabs)
      tabIndex = this.projectState
        .openTabs()
        .findIndex(tab => tab.id === tabId);
    }
    if (tabIndex !== -1) {
      this.projectState.selectTab(tabIndex);
    }
  }

  onTabChange(index: number): void {
    // Update the project state - navigation will be handled by the effect
    this.projectState.selectTab(index);

    // Trigger change detection
    this.cdr.detectChanges();

    // Navigation is now handled by the effect that watches projectState.selectedTabIndex
  }

  onTabDrop(event: CdkDragDrop<AppTab[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    this.projectState.reorderTabs(event.previousIndex, event.currentIndex);
  }

  closeTab(index: number, event?: MouseEvent): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const tabs = this.projectState.openTabs();

    // Don't allow closing the last tab
    if (tabs.length <= 1) return;

    // If closing the current tab, navigate to an adjacent tab first
    if (this.currentTabIndex === index) {
      const newIndex = index > 0 ? index - 1 : 1;
      this.onTabChange(newIndex);
    }

    // Close the tab in the state service
    this.projectState.closeTab(index);
  }

  /** Close all tabs except the home tab (or first tab if no home) */
  closeAllTabs(): void {
    const tabs = this.projectState.openTabs();
    // Find home tab index
    const homeIndex = tabs.findIndex(t => t.systemType === 'home');

    // Close all tabs from the end to avoid index shifting issues, except home
    for (let i = tabs.length - 1; i >= 0; i--) {
      if (i !== homeIndex) {
        this.projectState.closeTab(i);
      }
    }
    // Navigate to home (which is now index 0 after others are closed)
    this.onTabChange(0);
  }

  /** Close tabs to the right of the context menu tab */
  closeTabsToRight(): void {
    if (this.contextTabIndex === null) return;

    const tabs = this.projectState.openTabs();

    // Close tabs from the end down to (but not including) the context tab
    for (let i = tabs.length - 1; i > this.contextTabIndex; i--) {
      this.projectState.closeTab(i);
    }

    // If current tab was closed, navigate to context tab
    if (this.currentTabIndex > this.contextTabIndex) {
      this.onTabChange(this.contextTabIndex);
    }
  }

  /** Close all tabs except the context menu tab and home */
  closeOtherTabs(): void {
    if (this.contextTabIndex === null) return;

    const tabs = this.projectState.openTabs();
    const contextTab = tabs[this.contextTabIndex];
    const homeIndex = tabs.findIndex(t => t.systemType === 'home');

    // Close all tabs from end to start, skipping the context tab and home
    for (let i = tabs.length - 1; i >= 0; i--) {
      if (i !== this.contextTabIndex && i !== homeIndex) {
        this.projectState.closeTab(i);
      }
    }

    // Navigate to the kept tab (recalculate index after closures)
    const newTabs = this.projectState.openTabs();
    const newIndex = newTabs.findIndex(t => t.id === contextTab.id);
    if (newIndex !== -1) {
      this.onTabChange(newIndex);
    }
  }

  /** Check if there are tabs to the right of context tab */
  hasTabsToRight(): boolean {
    if (this.contextTabIndex === null) return false;
    const tabs = this.projectState.openTabs();
    return this.contextTabIndex < tabs.length - 1;
  }

  /** Check if there are other tabs besides the context tab and home */
  hasOtherTabs(): boolean {
    const tabs = this.projectState.openTabs();
    // More than 2 tabs means there are others besides home and context
    return tabs.length > 2;
  }

  openDocument(document: Element): void {
    const project = this.projectState.project();
    if (!project) return;

    // Initialize sync status for the document to ensure the indicator is displayed
    const fullDocId = `${project.username}:${project.slug}:${document.id}`;
    this.documentService.initializeSyncStatus(fullDocId);

    // Open the document in the state service - this will trigger the effect to handle navigation
    this.projectState.openDocument(document);

    // Force synchronous change detection to update the view
    this.cdr.detectChanges();
  }

  onImportRequested(): void {
    this.importRequested.emit();
  }

  /**
   * Opens a system tab for documents-list, media, templates-list, or settings
   * @param type The type of system tab to open
   */
  openSystemTab(
    type: 'documents-list' | 'media' | 'templates-list' | 'settings'
  ): void {
    console.log(`[TabInterface] Opening system tab: ${type}`);
    this.projectState.openSystemTab(type);
  }

  /**
   * Opens the tab context menu
   * @param tabIndex The index of the tab that was right-clicked
   * @param tab The tab that was right-clicked
   */
  onTabContextMenu(tabIndex: number, tab: AppTab): void {
    this.contextTabIndex = tabIndex;
    this.contextTab = tab;
  }

  /**
   * Closes the tab context menu
   */
  onContextMenuClose(): void {
    this.contextTabIndex = null;
    this.contextTab = null;
  }

  /**
   * Get the Material icon name for a tab based on its type
   */
  getTabIcon(tab: AppTab): string {
    if (tab.type === 'system') {
      if (tab.systemType === 'home') {
        return 'home';
      } else if (tab.systemType === 'documents-list') {
        return 'list';
      } else if (tab.systemType === 'media') {
        return 'perm_media';
      } else if (tab.systemType === 'templates-list') {
        return 'description';
      } else if (tab.systemType === 'settings') {
        return 'settings';
      }
      return 'article';
    }

    if (tab.type === 'publishPlan') {
      return 'publish';
    }

    if (tab.type === 'folder') {
      return 'folder';
    }

    if (tab.type === 'worldbuilding') {
      // For worldbuilding elements, look up the icon from the schema
      if (tab.element?.schemaId) {
        const schema = this.worldbuildingService.getSchemaById(
          tab.element.schemaId
        );
        if (schema?.icon) {
          return schema.icon;
        }
      }

      // Fallback to metadata icon if available
      if (tab.element?.metadata && tab.element.metadata['icon']) {
        return tab.element.metadata['icon'];
      }

      return 'category';
    }

    return 'insert_drive_file';
  }

  /**
   * Handles the rename action from the context menu
   * @param tab The tab to rename
   */
  async onRenameTabElement(tab: AppTab): Promise<void> {
    // Only proceed if this is a document or folder tab with an element
    if (!tab || tab.type === 'system' || !tab.element) return;

    const newName = await this.dialogGateway.openRenameDialog({
      currentName: tab.element.name,
      title: `Rename ${tab.element.type === ElementType.Folder ? 'Folder' : 'Document'}`,
    });

    if (newName) {
      // Use the project state service to rename the element
      void this.projectState.renameNode(tab.element, newName);
    }
  }
}
