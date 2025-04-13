import { CommonModule } from '@angular/common';
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
import { ProjectElementDto } from '@inkweld/index';
import { DocumentService } from '@services/document.service';
import { ProjectStateService } from '@services/project-state.service';
import { format } from 'date-fns';
import { Subject, take } from 'rxjs';

import { DocumentSyncState } from '../../../../models/document-sync-state';

@Component({
  selector: 'app-documents-list-tab',
  templateUrl: './documents-list-tab.component.html',
  styleUrls: ['./documents-list-tab.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
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

  private destroy$ = new Subject<void>();

  // Use signals for reactive updates
  documents = signal<ProjectElementDto[]>([]);
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
    this.documents.set(elements.filter(element => element.type === 'ITEM'));
    this.isLoading.set(false);
  });

  ngOnInit(): void {
    // Keep the loadDocuments method for initial loading
    this.loadDocuments();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.elementsEffect.destroy();
  }

  loadDocuments(): void {
    this.isLoading.set(true);
    this.error.set(null);

    // Initial loading of documents
    const elements = this.projectState.elements();
    this.documents.set(elements.filter(element => element.type === 'ITEM'));
    this.isLoading.set(false);
  }

  formatDate(date: string | undefined): string {
    if (!date) return 'N/A';
    try {
      return format(new Date(date), 'MMM d, yyyy h:mm a');
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_) {
      return 'Invalid date';
    }
  }

  getSyncStatusIcon(documentId: string): string {
    const project = this.projectState.project();
    if (!project) return 'sync_disabled';

    const fullDocId = `${project.username}:${project.slug}:${documentId}`;
    let iconName = 'sync_disabled';

    this.documentService
      .getSyncStatus(fullDocId)
      .pipe(take(1))
      .subscribe(status => {
        switch (status) {
          case DocumentSyncState.Synced:
            iconName = 'cloud_done';
            break;
          case DocumentSyncState.Syncing:
            iconName = 'sync';
            break;
          case DocumentSyncState.Offline:
            iconName = 'cloud_off';
            break;
          case DocumentSyncState.Unavailable:
          default:
            iconName = 'sync_disabled';
        }
      });

    return iconName;
  }

  getSyncStatusTooltip(documentId: string): string {
    const project = this.projectState.project();
    if (!project) return 'Status unavailable';

    const fullDocId = `${project.username}:${project.slug}:${documentId}`;
    let tooltipText = 'Synchronization unavailable';

    this.documentService
      .getSyncStatus(fullDocId)
      .pipe(take(1))
      .subscribe(status => {
        switch (status) {
          case DocumentSyncState.Synced:
            tooltipText = 'Synchronized with cloud';
            break;
          case DocumentSyncState.Syncing:
            tooltipText = 'Synchronizing...';
            break;
          case DocumentSyncState.Offline:
            tooltipText = 'Working offline';
            break;
          case DocumentSyncState.Unavailable:
          default:
            tooltipText = 'Synchronization unavailable';
        }
      });

    return tooltipText;
  }

  openDocumentAsHtml(document: ProjectElementDto): void {
    // Implement HTML preview functionality
    console.log('Opening document as HTML:', document);
  }

  openDocument(document: ProjectElementDto): void {
    this.projectState.openDocument(document);
  }

  createNewDocument(): void {
    const newDocument: ProjectElementDto = {
      id: 'new',
      name: 'New Document',
      type: ProjectElementDto.TypeEnum.Item,
      level: 0,
      position: 0,
      expandable: false,
      version: 0,
      metadata: {},
    };

    this.openDocument(newDocument);
  }
}
