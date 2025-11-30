import { CdkContextMenuTrigger, CdkMenu, CdkMenuItem } from '@angular/cdk/menu';
import {
  ChangeDetectorRef,
  Component,
  effect,
  EventEmitter,
  inject,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTabNav, MatTabsModule } from '@angular/material/tabs';
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

@Component({
  selector: 'app-tab-interface',
  templateUrl: './tab-interface.component.html',
  styleUrls: ['./tab-interface.component.scss'],
  standalone: true,
  imports: [
    MatTabsModule,
    MatIconModule,
    MatButtonModule,
    RouterModule,
    MatMenuModule,
    CdkContextMenuTrigger,
    CdkMenu,
    CdkMenuItem,
  ],
})
export class TabInterfaceComponent implements OnInit, OnDestroy {
  @Output() importRequested = new EventEmitter<void>();

  @ViewChild('tabNav') tabNav!: MatTabNav;

  protected readonly projectState = inject(ProjectStateService);
  protected readonly documentService = inject(DocumentService);
  protected readonly router = inject(Router);
  protected readonly route = inject(ActivatedRoute);
  protected readonly dialog = inject(MatDialog);
  private readonly cdr = inject(ChangeDetectorRef);
  protected readonly dialogGateway = inject(DialogGatewayService);

  private destroy$ = new Subject<void>();
  private routerSubscription: Subscription | null = null;
  private initialSyncDone = false; // Flag to ensure initial sync runs only once
  private lastProjectId: string | undefined; // Track project changes

  // Context menu tracking
  contextTabIndex: number | null = null;
  contextTab: AppTab | null = null;

  get currentTabIndex(): number {
    return this.projectState.selectedTabIndex();
  }
  constructor() {
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

      // Navigate based on the tab index
      if (tabIndex === 0) {
        // Home tab
        void this.router.navigate(['/', project.username, project.slug]);
      } else if (tabIndex > 0 && tabs.length >= tabIndex) {
        // Get the tab info
        const tab = tabs[tabIndex - 1]; // -1 to account for home tab

        // Handle different tab types
        if (tab.type === 'system') {
          // System tab (documents list or project files)
          void this.router.navigate([
            '/',
            project.username,
            project.slug,
            tab.systemType, // 'documents-list' or 'project-files'
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

  ngOnInit(): void {
    // Subscribe to router events to update the tab selection on subsequent navigations
    this.routerSubscription = this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        // No need to skip initial NavigationEnd, effect handles initial load
        takeUntil(this.destroy$)
      )
      .subscribe(event => {
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

  updateSelectedTabFromUrl(): void {
    // Get current route URL
    let currentRoute = this.route.root;
    let tabId: string | null = null;
    let systemRoute: string | null = null;

    // First check if we're on a system route
    const url = this.router.url;
    const project = this.projectState.project();
    if (project) {
      const projectBaseUrl = `/${project.username}/${project.slug}`;
      if (url === `${projectBaseUrl}/documents-list`) {
        systemRoute = 'documents-list';
      } else if (url === `${projectBaseUrl}/project-files`) {
        systemRoute = 'project-files';
      } else if (url === `${projectBaseUrl}/templates-list`) {
        systemRoute = 'templates-list';
      }
    }

    // If not a system route, check for tabId param
    if (!systemRoute) {
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
    if (!tabId && !systemRoute) {
      this.projectState.selectTab(0);
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
          systemRoute as 'documents-list' | 'project-files' | 'templates-list'
        );
        // Re-find the tab index after creating
        tabIndex = this.projectState
          .openTabs()
          .findIndex(
            tab => tab.type === 'system' && tab.systemType === systemRoute
          );
      }
    } else if (tabId) {
      // Find tab with the specific ID
      tabIndex = this.projectState
        .openTabs()
        .findIndex(tab => tab.id === tabId);
    }
    if (tabIndex !== -1) {
      const newIndex = tabIndex + 1; // +1 to account for home tab
      this.projectState.selectTab(newIndex);
    }
  }

  onTabChange(index: number): void {
    // Update the project state - navigation will be handled by the effect
    this.projectState.selectTab(index);

    // Trigger change detection
    this.cdr.detectChanges();

    // Navigation is now handled by the effect that watches projectState.selectedTabIndex
  }

  closeTab(index: number, event?: MouseEvent): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    // Don't close the home tab
    if (index === 0) return;

    // If closing the current tab, navigate to the previous tab first
    if (this.currentTabIndex === index) {
      const newIndex = Math.max(0, index - 1);
      this.onTabChange(newIndex);
    }

    // Close the tab in the state service
    this.projectState.closeTab(index - 1);
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
   * Opens a system tab for documents-list, project-files, or templates-list
   * @param type The type of system tab to open
   */
  openSystemTab(
    type: 'documents-list' | 'project-files' | 'templates-list'
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
      if (tab.systemType === 'documents-list') {
        return 'list';
      } else if (tab.systemType === 'project-files') {
        return 'attach_file';
      } else if (tab.systemType === 'templates-list') {
        return 'description';
      }
      return 'article';
    }

    if (tab.type === 'folder') {
      return 'folder';
    }

    if (tab.type === 'worldbuilding' && tab.elementType) {
      const iconMap: Record<string, string> = {
        ['CHARACTER']: 'person',
        ['LOCATION']: 'place',
        ['WB_ITEM']: 'category',
        ['MAP']: 'map',
        ['RELATIONSHIP']: 'diversity_1',
        ['PHILOSOPHY']: 'auto_stories',
        ['CULTURE']: 'groups',
        ['SPECIES']: 'pets',
        ['SYSTEMS']: 'settings',
      };

      // Check if it's a built-in type
      if (iconMap[tab.elementType]) {
        return iconMap[tab.elementType];
      }

      // For custom types, try to load from cached metadata or fallback
      // Note: We can't use async here, so we'll need to cache icons in the tab metadata
      if (tab.element?.metadata && tab.element.metadata['icon']) {
        return tab.element.metadata['icon'];
      }

      return 'description';
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
