import { Component, inject, OnInit } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';
import { DocumentElementEditorComponent } from '@components/document-element-editor/document-element-editor.component';
import { DocumentService } from '@services/document.service';
import { ProjectStateService } from '@services/project-state.service';

import { DocumentSyncState } from '../../../../models/document-sync-state';

@Component({
  selector: 'app-document-tab',
  templateUrl: './document-tab.component.html',
  styleUrls: ['./document-tab.component.scss'],
  standalone: true,
  imports: [DocumentElementEditorComponent, MatIconModule],
})
export class DocumentTabComponent implements OnInit {
  private documentId: string = '';

  protected readonly projectState = inject(ProjectStateService);
  protected readonly documentService = inject(DocumentService);
  protected readonly route = inject(ActivatedRoute);
  protected readonly DocumentSyncState = DocumentSyncState;

  ngOnInit(): void {
    // Get the document ID from the route params
    this.documentId = this.route.snapshot.paramMap.get('tabId') || '';
  }

  getDocumentFullId(): string {
    if (!this.documentId) return '';

    const project = this.projectState.project();
    if (!project) return this.documentId;

    return `${project.username}:${project.slug}:${this.documentId}`;
  }
}
