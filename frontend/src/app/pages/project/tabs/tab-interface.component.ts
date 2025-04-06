import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  effect, // <-- Add effect here
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
import { ProjectStateService } from '@services/project-state.service';
import { filter, Subject, Subscription, takeUntil } from 'rxjs';

import { DocumentSyncState } from '../../../models/document-sync-state';

@Component({
  selector: 'app-tab-interface',
  templateUrl: './tab-interface.component.html',
  styleUrls: ['./tab-interface.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    MatTabsModule,
    MatIconModule,
    MatButtonModule,
    RouterModule,
    MatMenuModule,
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
  protected readonly DocumentSyncState = DocumentSyncState;

  private destroy$ = new Subject<void>();
  private routerSubscription: Subscription | null = null;
  private initialSyncDone = false; // Flag to ensure initial sync runs only once
  get currentTabIndex(): number {
    return this.projectState.selectedTabIndex();
  }
  constructor() {
    // Watch for changes to the selected tab index and navigate accordingly
    effect(() => {
      const tabIndex = this.projectState.selectedTabIndex();
      const openDocuments = this.projectState.openDocuments();
      const project = this.projectState.project();

      console.log('[TabInterface] Tab index changed to:', tabIndex);

      // Skip navigation during initial load
      if (!this.initialSyncDone || !project) return;

      // Navigate based on the tab index
      if (tabIndex === 0) {
        // Home tab
        console.log('[TabInterface] Effect: Navigating to home tab');
        void this.router.navigate(['/', project.username, project.slug]);
      } else if (tabIndex > 0 && openDocuments.length >= tabIndex) {
        // Document/folder tab
        const tabDocument = openDocuments[tabIndex - 1]; // -1 to account for home tab
        console.log(
          '[TabInterface] Effect: Navigating to tab document:',
          tabDocument
        );
        void this.router.navigate([
          '/',
          project.username,
          project.slug,
          tabDocument.type === 'FOLDER' ? 'folder' : 'document',
          tabDocument.id,
        ]);
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
    // Traverse the route tree to find the deepest activated route with a 'tabId' param
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

    // Check if we are at the project root (no tabId found in child routes)
    // Simplified check: if no tabId was found, assume home.
    // More robust check might involve verifying the exact URL pattern.
    console.log('[TabInterface] Extracted tabId from URL:', tabId);
    console.log(
      '[TabInterface] Current openDocuments:',
      this.projectState.openDocuments().map(d => `${d.name} (${d.id})`)
    );

    if (!tabId) {
      console.log('[TabInterface] No tabId found, setting index to 0 (Home)');
      this.projectState.selectedTabIndex.set(0);
      return;
    }

    if (tabId) {
      const tabIndex = this.projectState
        .openDocuments()
        .findIndex(doc => doc.id === tabId);
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

    const documents = this.projectState.openDocuments();
    const tabDocument = documents[index - 1]; // -1 to account for home tab

    if (tabDocument) {
      // If closing the current tab, navigate to the previous tab
      if (this.currentTabIndex === index) {
        const newIndex = Math.max(0, index - 1);
        this.onTabChange(newIndex);
      }

      // Close the tab in the state service
      this.projectState.closeDocument(index - 1);
    }
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
}
