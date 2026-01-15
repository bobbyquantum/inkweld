import {
  Component,
  effect,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterModule } from '@angular/router';
import { Element, ElementType } from '@inkweld/index';
import { DocumentService } from '@services/project/document.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { format } from 'date-fns';

import { DocumentSyncState } from '../../../../models/document-sync-state';

@Component({
  selector: 'app-documents-list-tab',
  templateUrl: './documents-list-tab.component.html',
  styleUrls: ['./documents-list-tab.component.scss'],
  standalone: true,
  imports: [
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    RouterModule,
  ],
})
export class DocumentsListTabComponent implements OnInit, OnDestroy {
  protected readonly projectState = inject(ProjectStateService);
  protected readonly documentService = inject(DocumentService);
  protected readonly DocumentSyncState = DocumentSyncState;

  // Use signals for reactive updates
  documents = signal<Element[]>([]);
  isLoading = signal<boolean>(true);
  error = signal<string | null>(null);

  displayedColumns: string[] = [
    'name',
    'lastModified',
    'syncStatus',
    'actions',
  ];

  // Subscribe to elements changes using effect
  private readonly elementsEffect = effect(() => {
    // This will run whenever elements signal changes
    const elements = this.projectState.elements();
    this.documents.set(
      elements.filter(element => element.type === ElementType.Item)
    );
    this.isLoading.set(false);
  });

  ngOnInit(): void {
    // Keep the loadDocuments method for initial loading
    this.loadDocuments();
  }

  ngOnDestroy(): void {
    this.elementsEffect.destroy();
  }

  loadDocuments(): void {
    this.isLoading.set(true);
    this.error.set(null);

    // Initial loading of documents
    const elements = this.projectState.elements();
    this.documents.set(
      elements.filter(element => element.type === ElementType.Item)
    );
    this.isLoading.set(false);
  }

  formatDate(date: string | undefined): string {
    if (!date) return 'N/A';
    try {
      const dateObject = new Date(date);
      // Ensure it's a valid date
      if (isNaN(dateObject.getTime())) {
        return 'Invalid date';
      }
      return format(dateObject, 'MMM d, yyyy h:mm a');
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_) {
      return 'Invalid date';
    }
  }

  getSyncStatusIcon(documentId: string): string {
    const project = this.projectState.project();
    if (!project) return 'sync_disabled';

    const fullDocId = `${project.username}:${project.slug}:${documentId}`;
    const status = this.documentService.getSyncStatusSignal(fullDocId)();
    switch (status) {
      case DocumentSyncState.Synced:
        return 'cloud_done';
      case DocumentSyncState.Syncing:
        return 'sync';
      case DocumentSyncState.Local:
        return 'cloud_off';
      default:
        return 'sync_disabled';
    }
  }

  getSyncStatusTooltip(documentId: string): string {
    const project = this.projectState.project();
    if (!project) return 'Status unavailable';

    const fullDocId = `${project.username}:${project.slug}:${documentId}`;
    const status = this.documentService.getSyncStatusSignal(fullDocId)();
    switch (status) {
      case DocumentSyncState.Synced:
        return 'Synchronized with cloud';
      case DocumentSyncState.Syncing:
        return 'Synchronizing...';
      case DocumentSyncState.Local:
        return 'Working offline';
      default:
        return 'Synchronization unavailable';
    }
  }

  openDocumentAsHtml(document: Element): void {
    // Implement HTML preview functionality
    console.log('Opening document as HTML:', document);
  }

  openDocument(document: Element): void {
    this.projectState.openDocument(document);
  }

  createNewDocument(): void {
    const newDocument: Element = {
      id: 'new',
      name: 'New Document',
      type: ElementType.Item,
      parentId: null,
      level: 0,
      order: 0,
      expandable: false,
      version: 0,
      metadata: {},
    };

    this.openDocument(newDocument);
  }
}
