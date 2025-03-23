import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router } from '@angular/router';
import { RouterModule } from '@angular/router';
import { firstValueFrom, Subject, takeUntil } from 'rxjs';

import { DocumentAPIService } from '../../../../api-client/api/document-api.service';
import { DocumentDto } from '../../../../api-client/model/document-dto';
import { DocumentSyncState } from '../../../models/document-sync-state';
import { DocumentService } from '../../../services/document.service';

@Component({
  selector: 'app-documents',
  standalone: true,
  imports: [
    MatTableModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatCardModule,
    RouterModule,
    MatTooltipModule,
  ],
  templateUrl: './documents.component.html',
  styleUrl: './documents.component.scss',
})
export class DocumentsComponent implements OnInit, OnDestroy {
  documents: DocumentDto[] = [];
  isLoading = true;
  error: string | null = null;
  username: string = '';
  projectSlug: string = '';
  displayedColumns: string[] = [
    'name',
    'lastModified',
    'syncStatus',
    'actions',
  ];
  documentSyncStates = new Map<string, DocumentSyncState>();
  private router = inject(Router);
  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private documentApiService: DocumentAPIService,
    private documentService: DocumentService
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.username = params['username'] as string;
      this.projectSlug = params['slug'] as string;
      void this.loadDocuments();
    });
  }
  navigateToProject(): void {
    void this.router.navigate([this.username, this.projectSlug]);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async loadDocuments(): Promise<void> {
    this.isLoading = true;
    this.error = null;

    try {
      this.documents = await firstValueFrom(
        this.documentApiService.documentControllerListDocuments(
          this.username,
          this.projectSlug
        )
      );

      this.isLoading = false;
      console.log('Documents loaded:', this.documents);

      // Subscribe to sync status for each document
      this.documents.forEach(doc => {
        this.documentService
          .getSyncStatus(doc.id)
          .pipe(takeUntil(this.destroy$))
          .subscribe(status => {
            this.documentSyncStates.set(doc.id, status);
          });
      });
    } catch (err) {
      console.error('Error loading documents:', err);
      this.error = 'Failed to load documents. Please try again later.';
      this.isLoading = false;
    }
  }

  getSyncStatusIcon(docId: string): string {
    const status =
      this.documentSyncStates.get(docId) || DocumentSyncState.Unavailable;
    switch (status) {
      case DocumentSyncState.Synced:
        return 'cloud_done';
      case DocumentSyncState.Syncing:
        return 'sync';
      case DocumentSyncState.Offline:
        return 'cloud_off';
      case DocumentSyncState.Unavailable:
      default:
        return 'help_outline';
    }
  }

  getSyncStatusTooltip(docId: string): string {
    const status =
      this.documentSyncStates.get(docId) || DocumentSyncState.Unavailable;
    switch (status) {
      case DocumentSyncState.Synced:
        return 'Document is synchronized with the server';
      case DocumentSyncState.Syncing:
        return 'Synchronizing with server...';
      case DocumentSyncState.Offline:
        return 'Document is available offline only';
      case DocumentSyncState.Unavailable:
      default:
        return 'Document status unknown';
    }
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString();
  }
}
