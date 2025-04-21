import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';
import { DocumentElementEditorComponent } from '@components/document-element-editor/document-element-editor.component';
import { DocumentService } from '@services/document.service';
import { ProjectStateService } from '@services/project-state.service';
import { SettingsService } from '@services/settings.service';
import { Subscription } from 'rxjs';

import { DocumentSyncState } from '../../../../models/document-sync-state';

@Component({
  selector: 'app-document-tab',
  templateUrl: './document-tab.component.html',
  styleUrls: ['./document-tab.component.scss'],
  standalone: true,
  imports: [DocumentElementEditorComponent, MatIconModule],
})
export class DocumentTabComponent implements OnInit, OnDestroy {
  private documentId: string = '';
  private paramSubscription: Subscription | null = null;

  // Exposed to template
  protected fullDocumentId: string = '';

  protected readonly projectState = inject(ProjectStateService);
  protected readonly documentService = inject(DocumentService);
  protected readonly route = inject(ActivatedRoute);
  protected readonly settingsService = inject(SettingsService);
  protected readonly DocumentSyncState = DocumentSyncState;

  ngOnInit(): void {
    // Subscribe to route param changes instead of using snapshot
    this.paramSubscription = this.route.paramMap.subscribe(params => {
      const newDocumentId = params.get('tabId') || '';

      console.log(
        `[DocumentTab] Document ID from route params: ${newDocumentId}` +
          (this.documentId !== newDocumentId
            ? ' (changed from ' + this.documentId + ')'
            : '')
      );

      // Update document ID and reinitialize
      this.documentId = newDocumentId;

      // Calculate the full document ID once and store it as a property
      this.fullDocumentId = this.calculateFullDocumentId();

      // When route changes, disconnect from old document and initialize the new one
      this.documentService.initializeSyncStatus(this.fullDocumentId);
    });
  }

  ngOnDestroy(): void {
    // Clean up subscription
    if (this.paramSubscription) {
      this.paramSubscription.unsubscribe();
      this.paramSubscription = null;
    }

    // Disconnect from document when component is destroyed
    if (this.documentId) {
      console.log(
        `[DocumentTab] Destroying component for document ID: ${this.documentId}`
      );
    }
  }

  /**
   * Calculates the full document ID only when needed
   * Not called during change detection cycles
   */
  private calculateFullDocumentId(): string {
    if (!this.documentId) {
      console.warn('[DocumentTab] No document ID available');
      return '';
    }

    // Check if the ID already contains project info (has colons)
    if (
      this.documentId.includes(':') &&
      this.documentId.split(':').length === 3
    ) {
      console.log(
        `[DocumentTab] ID already fully formatted: ${this.documentId}`
      );
      return this.documentId;
    }

    const project = this.projectState.project();
    if (!project) {
      console.warn(
        '[DocumentTab] Project not available when building document ID'
      );
      return this.documentId; // Fallback to partial ID
    }

    const fullId = `${project.username}:${project.slug}:${this.documentId}`;
    console.log(`[DocumentTab] Built full document ID: ${fullId}`);
    return fullId;
  }

  /**
   * Check if tabs are enabled in desktop mode
   */
  protected useTabsDesktop(): boolean {
    return this.settingsService.getSetting<boolean>('useTabsDesktop', true);
  }
}
