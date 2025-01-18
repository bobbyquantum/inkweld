import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';

@Injectable()
export class MockDocumentService {
  private connectedDocuments = new Set<string>();

  setupCollaboration(editor: any, documentId: string): Promise<void> {
    if (this.connectedDocuments.has(documentId)) {
      return Promise.reject('Document already connected');
    }
    this.connectedDocuments.add(documentId);
    return Promise.resolve();
  }

  disconnect(documentId: string): void {
    this.connectedDocuments.delete(documentId);
  }

  isConnected(documentId: string): boolean {
    return this.connectedDocuments.has(documentId);
  }
}
