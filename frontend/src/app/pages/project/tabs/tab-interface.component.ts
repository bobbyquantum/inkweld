import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
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

  get currentTabIndex(): number {
    return this.projectState.selectedTabIndex();
  }

  ngOnInit(): void {
    // Subscribe to router events to update the tab selection on navigation
    this.routerSubscription = this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.updateSelectedTabFromUrl();
        this.cdr.detectChanges(); // Trigger change detection after URL update
      });

    // Initial selection
    this.updateSelectedTabFromUrl();
    this.cdr.detectChanges(); // Trigger change detection after initial update
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
    }
  }

  updateSelectedTabFromUrl(): void {
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
    if (!tabId) {
      this.projectState.selectedTabIndex.set(0);
      return;
    }

    if (tabId) {
      const tabIndex = this.projectState
        .openDocuments()
        .findIndex(doc => doc.id === tabId);
      if (tabIndex !== -1) {
        this.projectState.selectedTabIndex.set(tabIndex + 1); // +1 to account for home tab
      } else {
        console.warn(
          `Tab ID ${tabId} found in URL, but not in open documents.`
        );
        // Optional: Fallback to home tab if the document isn't open
        // this.projectState.selectedTabIndex.set(0);
      }
    }
  }

  onTabChange(index: number): void {
    console.log(`Tab change requested to index ${index}`);

    // Update the project state first
    this.projectState.selectedTabIndex.set(index);

    // Trigger change detection
    this.cdr.detectChanges();

    const project = this.projectState.project();
    if (!project) return;

    if (index === 0) {
      // Navigate to project root for home tab
      console.log('Navigating to project root');
      void this.router.navigate(['/', project.username, project.slug]);
    } else {
      // For document/folder tabs
      const documents = this.projectState.openDocuments();
      const tabDocument = documents[index - 1]; // -1 to account for home tab

      if (tabDocument) {
        console.log(
          `Navigating to ${tabDocument.type} ${tabDocument.name} (${tabDocument.id})`
        );
        void this.router.navigate([
          '/',
          project.username,
          project.slug,
          tabDocument.type === 'FOLDER' ? 'folder' : 'document',
          tabDocument.id,
        ]);
      }
    }
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
    console.log(`Opening document: ${document.name} (${document.id})`);

    const project = this.projectState.project();
    if (!project) return;

    // Initialize sync status for the document to ensure the indicator is displayed
    const fullDocId = `${project.username}:${project.slug}:${document.id}`;
    this.documentService.initializeSyncStatus(fullDocId);

    // First open the document in the state service
    this.projectState.openDocument(document);

    console.log(
      `Current selected tab index: ${this.projectState.selectedTabIndex()}`
    );
    console.log(
      `Open documents: ${this.projectState
        .openDocuments()
        .map(d => d.name)
        .join(', ')}`
    );

    // Force synchronous change detection to update the view
    this.cdr.detectChanges();

    // Navigate to the document route
    void this.router
      .navigate([
        '/',
        project.username,
        project.slug,
        document.type === 'FOLDER' ? 'folder' : 'document',
        document.id,
      ])
      .then(() => {
        // After navigation completes, ensure tab is selected and trigger change detection
        console.log('Navigation completed to document page');

        // Ensure the correct tab is selected
        const documents = this.projectState.openDocuments();
        const index = documents.findIndex(d => d.id === document.id);
        if (index !== -1) {
          this.projectState.selectedTabIndex.set(index + 1); // +1 to account for home tab
          this.cdr.detectChanges();
        }
      });
  }

  onImportRequested(): void {
    this.importRequested.emit();
  }
}
