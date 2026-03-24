import { Injectable } from '@angular/core';

@Injectable()
export class MockDocumentService {
  private readonly connectedDocuments = new Set<string>();

  setupCollaboration(editor: any, documentId: string): Promise<void> {
    if (this.connectedDocuments.has(documentId)) {
      return Promise.reject(new Error('Document already connected'));
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
