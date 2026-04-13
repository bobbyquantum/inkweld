import { Tab, TabList, Tabs } from '@angular/aria/tabs';
import { CdkDrag, type CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import { CdkContextMenuTrigger, CdkMenu, CdkMenuItem } from '@angular/cdk/menu';
import {
  type AfterViewInit,
  ChangeDetectorRef,
  Component,
  effect,
  type ElementRef,
  EventEmitter,
  inject,
  type OnDestroy,
  type OnInit,
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
import { type Element, ElementType } from '@inkweld/index';
import { DocumentService } from '@services/project/document.service';
import {
  type AppTab,
  ProjectStateService,
} from '@services/project/project-state.service';
import { filter, Subject, type Subscription, takeUntil } from 'rxjs';

import { DialogGatewayService } from '../../../services/core/dialog-gateway.service';
import { WorldbuildingService } from '../../../services/worldbuilding/worldbuilding.service';

const SYSTEM_TAB_ICONS: Partial<
  Record<Exclude<AppTab['systemType'], undefined>, string>
> = {
  home: 'home',
  'documents-list': 'list',
  media: 'perm_media',
  'templates-list': 'description',
  settings: 'settings',
  'publish-plans': 'auto_stories',
};

const TAB_TYPE_ICONS: Partial<Record<AppTab['type'], string>> = {
  publishPlan: 'publish',
  folder: 'folder',
  'relationship-chart': 'hub',
  canvas: 'dashboard',
};

@Component({
  selector: 'app-tab-interface',
  templateUrl: './tab-interface.component.html',
  styleUrls: ['./tab-interface.component.scss'],
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

  private readonly destroy$ = new Subject<void>();
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
          tab.publishPlan?.id ||
            (tab.id.startsWith('publish-plan-')
              ? tab.id.slice('publish-plan-'.length)
              : tab.id),
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

      // Scroll to reveal the newly selected tab
      setTimeout(() => this.scrollToActiveTab(), 0);
    });

    // Effect to handle initial tab synchronization after project state is loaded
    effect(() => {
      const isLoading = this.projectState.isLoading();
      const project = this.projectState.project();
      const elements = this.projectState.elements();
      const currentUrl = this.router.url;

      // For document/folder tabs, we need elements to be loaded first
      // Check if the URL contains a document/folder path that needs elements
      const urlParts = currentUrl.split('/').filter(Boolean);
      const tabType = urlParts[2]; // 'document', 'folder', etc.
      const needsElements =
        tabType === 'document' ||
        tabType === 'folder' ||
        tabType === 'relationship-chart' ||
        tabType === 'canvas';

      // Wait for elements if we need them for this URL
      if (needsElements && elements.length === 0) {
        return; // Elements haven't loaded yet, effect will re-run when they do
      }

      if (!isLoading && !this.initialSyncDone && project) {
        // Verify the project matches the current URL before syncing
        const urlUsername = urlParts[0];
        const urlSlug = urlParts[1];

        if (urlUsername === project.username && urlSlug === project.slug) {
          this.updateSelectedTabFromUrl();
          this.initialSyncDone = true;
          this.cdr.detectChanges(); // Trigger change detection after initial sync
          // Scroll to reveal the active tab after sync
          setTimeout(() => this.scrollToActiveTab(), 0);
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
    const firstSegment = url.split('/').find(Boolean) ?? '';
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
        const urlParts = event.url.split('/').filter(Boolean);
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
    // Initial scroll state check and scroll to active tab
    this.updateScrollState();
    setTimeout(() => this.scrollToActiveTab(), 0);
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

  /** Scroll to make the active tab visible */
  scrollToActiveTab(): void {
    const container = this.tabNavBar?.nativeElement;
    if (!container) return;

    const tabs = this.projectState.openTabs();
    const currentIndex = this.currentTabIndex;
    if (currentIndex < 0 || currentIndex >= tabs.length) return;

    // Find the active tab button by index (nth child in the nav)
    const tabButtons = container.querySelectorAll('.tab-button');
    const activeTabButton = tabButtons[currentIndex] as HTMLElement;

    if (!activeTabButton) return;

    const containerRect = container.getBoundingClientRect();
    const tabRect = activeTabButton.getBoundingClientRect();

    // Check if tab is out of view on the left
    if (tabRect.left < containerRect.left) {
      const scrollAmount = tabRect.left - containerRect.left - 8; // 8px padding
      container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
    // Check if tab is out of view on the right
    else if (tabRect.right > containerRect.right) {
      const scrollAmount = tabRect.right - containerRect.right + 8; // 8px padding
      container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }

    // Update scroll state after scrolling
    setTimeout(() => this.updateScrollState(), 150);
  }

  updateSelectedTabFromUrl(): void {
    const { systemRoute, publishPlanId, tabId } = this.parseRouteInfo();

    // Check if we are at the project root (home tab)
    if (!tabId && !systemRoute && !publishPlanId) {
      this.selectOrOpenHomeTab();
      return;
    }

    const tabIndex = this.findOrCreateTab(systemRoute, publishPlanId, tabId);
    if (tabIndex !== -1) {
      this.projectState.selectTab(tabIndex);
    }
  }

  private parseRouteInfo(): {
    systemRoute: string | null;
    publishPlanId: string | null;
    tabId: string | null;
  } {
    const url = this.router.url;
    const project = this.projectState.project();

    if (project) {
      const projectBaseUrl = `/${project.username}/${project.slug}`;
      const systemRoutes = [
        'documents-list',
        'media',
        'templates-list',
        'relationships-list',
        'tags-list',
        'settings',
        'publish-plans',
      ];

      for (const route of systemRoutes) {
        if (url === `${projectBaseUrl}/${route}`) {
          return { systemRoute: route, publishPlanId: null, tabId: null };
        }
      }

      if (url.startsWith(`${projectBaseUrl}/publish-plan/`)) {
        let planId = url.split('/').at(-1) ?? null;
        if (planId?.includes('?')) {
          planId = planId.split('?')[0];
        }
        return { systemRoute: null, publishPlanId: planId, tabId: null };
      }
    }

    // Walk the route tree looking for a tabId param
    let currentRoute = this.route.root;
    let tabId: string | null = null;
    while (currentRoute.firstChild) {
      currentRoute = currentRoute.firstChild;
      if (
        currentRoute.outlet === PRIMARY_OUTLET &&
        currentRoute.snapshot.paramMap.has('tabId')
      ) {
        tabId = currentRoute.snapshot.paramMap.get('tabId');
      }
    }

    return { systemRoute: null, publishPlanId: null, tabId };
  }

  private selectOrOpenHomeTab(): void {
    const homeIndex = this.projectState
      .openTabs()
      .findIndex(tab => tab.systemType === 'home');
    if (homeIndex === -1) {
      this.projectState.openHomeTab();
    } else {
      this.projectState.selectTab(homeIndex);
    }
  }

  private findOrCreateTab(
    systemRoute: string | null,
    publishPlanId: string | null,
    tabId: string | null
  ): number {
    if (systemRoute) {
      return this.findOrCreateSystemTab(systemRoute);
    }
    if (publishPlanId) {
      return this.findOrCreatePublishPlanTab(publishPlanId);
    }
    if (tabId) {
      return this.findOrCreateDocumentTab(tabId);
    }
    return -1;
  }

  private findOrCreateSystemTab(systemRoute: string): number {
    let tabIndex = this.projectState
      .openTabs()
      .findIndex(
        tab => tab.type === 'system' && tab.systemType === systemRoute
      );

    if (tabIndex === -1) {
      this.projectState.openSystemTab(
        systemRoute as
          | 'documents-list'
          | 'media'
          | 'templates-list'
          | 'relationships-list'
          | 'tags-list'
          | 'publish-plans'
      );
      tabIndex = this.projectState
        .openTabs()
        .findIndex(
          tab => tab.type === 'system' && tab.systemType === systemRoute
        );
    }
    return tabIndex;
  }

  private findOrCreatePublishPlanTab(publishPlanId: string): number {
    let tabIndex = this.projectState
      .openTabs()
      .findIndex(
        tab =>
          tab.type === 'publishPlan' &&
          (tab.publishPlan?.id === publishPlanId ||
            tab.id === `publish-plan-${publishPlanId}`)
      );

    if (tabIndex === -1) {
      const plan = this.projectState.getPublishPlan(publishPlanId);
      if (plan) {
        this.projectState.openPublishPlan(plan);
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
    return tabIndex;
  }

  private findOrCreateDocumentTab(tabId: string): number {
    let tabIndex = this.projectState
      .openTabs()
      .findIndex(tab => tab.id === tabId);

    if (tabIndex === -1) {
      const elements = this.projectState.elements();
      const element = elements.find(el => el.id === tabId);
      if (element) {
        this.projectState.openDocument(element);
        tabIndex = this.projectState
          .openTabs()
          .findIndex(tab => tab.id === tabId);
      }
    }
    return tabIndex;
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
      return this.getSystemTabIcon(tab.systemType);
    }

    const staticIcon = TAB_TYPE_ICONS[tab.type];
    if (staticIcon) return staticIcon;

    if (tab.type === 'worldbuilding') {
      return this.getWorldbuildingTabIcon(tab);
    }

    return 'insert_drive_file';
  }

  private getSystemTabIcon(systemType: AppTab['systemType']): string {
    if (!systemType) return 'article';
    return SYSTEM_TAB_ICONS[systemType] ?? 'article';
  }

  private getWorldbuildingTabIcon(tab: AppTab): string {
    const schemaId = tab.element?.schemaId;
    if (schemaId) {
      const schema = this.worldbuildingService.getSchemaById(schemaId);
      if (schema?.icon) return schema.icon;
    }

    const metadataIcon = tab.element?.metadata?.['icon'];
    return metadataIcon || 'category';
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
