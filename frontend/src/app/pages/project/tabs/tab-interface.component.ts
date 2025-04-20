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
import { ProjectElementDto } from '@inkweld/index';
import { DocumentService } from '@services/document.service';
import { AppTab, ProjectStateService } from '@services/project-state.service';
import { filter, Subject, Subscription, takeUntil } from 'rxjs';

import { DialogGatewayService } from '../../../services/dialog-gateway.service';

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

  // Context menu tracking
  contextTabIndex: number | null = null;
  contextTab: AppTab | null = null;

  get currentTabIndex(): number {
    return this.projectState.selectedTabIndex();
  }
  constructor() {
    // Watch for changes to the selected tab index and navigate accordingly
    effect(() => {
      const tabIndex = this.projectState.selectedTabIndex();
      const project = this.projectState.project();

      console.log('[TabInterface] Tab index changed to:', tabIndex);

      // Skip navigation during initial load
      if (!this.initialSyncDone || !project) return;

      // Get available tabs
      const tabs = this.projectState.openTabs();

      // Navigate based on the tab index
      if (tabIndex === 0) {
        // Home tab
        console.log('[TabInterface] Effect: Navigating to home tab');
        void this.router.navigate(['/', project.username, project.slug]);
      } else if (tabIndex > 0 && tabs.length >= tabIndex) {
        // Get the tab info
        const tab = tabs[tabIndex - 1]; // -1 to account for home tab
        console.log('[TabInterface] Effect: Navigating to tab:', tab);

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
      console.log(
        '[TabInterface] isLoading effect triggered. isLoading:',
        isLoading,
        'InitialSyncDone:',
        this.initialSyncDone
      );
      if (!isLoading && !this.initialSyncDone) {
        console.log(
          '[TabInterface] Project loaded, performing initial tab sync.'
        );
        this.updateSelectedTabFromUrl();
        this.initialSyncDone = true;
        this.cdr.detectChanges(); // Trigger change detection after initial sync
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
        console.log('[TabInterface] NavigationEnd event:', event);
        // Avoid redundant sync if initial sync is happening via effect
        if (this.initialSyncDone) {
          console.log('[TabInterface] Handling tab update from NavigationEnd.');
          this.updateSelectedTabFromUrl();
          this.cdr.detectChanges(); // Trigger change detection after URL update
        } else {
          console.log(
            '[TabInterface] Skipping NavigationEnd update, waiting for initial load effect.'
          );
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
    console.log('[TabInterface] updateSelectedTabFromUrl called');
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

    console.log('[TabInterface] URL analysis:', { tabId, systemRoute, url });
    console.log(
      '[TabInterface] Current openTabs:',
      this.projectState.openTabs().map(t => `${t.name} (${t.id}) - ${t.type}`)
    );

    // Check if we are at the project root (home tab)
    if (!tabId && !systemRoute) {
      console.log(
        '[TabInterface] No tab identifiers found, setting index to 0 (Home)'
      );
      this.projectState.selectedTabIndex.set(0);
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
          systemRoute as 'documents-list' | 'project-files'
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
      console.log(
        `[TabInterface] Found tabId ${tabId} at index ${tabIndex}, setting selectedTabIndex to ${newIndex}`
      );
      this.projectState.selectedTabIndex.set(newIndex);
    } else {
      console.warn(
        `[TabInterface] Tab ID ${tabId} found in URL, but not in open documents. Current index: ${this.projectState.selectedTabIndex()}`
      );
      // Optional: Consider if fallback is needed here, or if state should remain unchanged
      // this.projectState.selectedTabIndex.set(0);
    }
  }

  onTabChange(index: number): void {
    console.log(`[TabInterface] Tab change requested to index ${index}`);

    // Update the project state - navigation will be handled by the effect
    this.projectState.selectedTabIndex.set(index);

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

  openDocument(document: ProjectElementDto): void {
    console.log(
      `[TabInterface] Opening document: ${document.name} (${document.id})`
    );

    const project = this.projectState.project();
    if (!project) return;

    // Initialize sync status for the document to ensure the indicator is displayed
    const fullDocId = `${project.username}:${project.slug}:${document.id}`;
    this.documentService.initializeSyncStatus(fullDocId);

    // Open the document in the state service - this will trigger the effect to handle navigation
    this.projectState.openDocument(document);

    console.log(
      `[TabInterface] Current selected tab index: ${this.projectState.selectedTabIndex()}`
    );
    console.log(
      `[TabInterface] Open documents: ${this.projectState
        .openDocuments()
        .map(d => d.name)
        .join(', ')}`
    );

    // Force synchronous change detection to update the view
    this.cdr.detectChanges();
  }

  onImportRequested(): void {
    this.importRequested.emit();
  }

  /**
   * Opens a system tab for documents-list or project-files
   * @param type The type of system tab to open
   */
  openSystemTab(type: 'documents-list' | 'project-files'): void {
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
   * Handles the rename action from the context menu
   * @param tab The tab to rename
   */
  async onRenameTabElement(tab: AppTab): Promise<void> {
    // Only proceed if this is a document or folder tab with an element
    if (!tab || tab.type === 'system' || !tab.element) return;

    const newName = await this.dialogGateway.openRenameDialog({
      currentName: tab.element.name,
      title: `Rename ${tab.element.type === 'FOLDER' ? 'Folder' : 'Document'}`,
    });

    if (newName) {
      // Use the project state service to rename the element
      this.projectState.renameNode(tab.element, newName);
    }
  }
}
