import type { Injector } from '@angular/core';
import { YDocAccessService } from '@services/cloud-sync/ydoc-access.service';
import { SetupService } from '@services/core/setup.service';
import { DocumentService } from '@services/project/document.service';
import { LiveDocumentRegistryService } from '@services/project/live-document-registry.service';
import {
  applyXmlToFragment,
  xmlFragmentToXmlString,
} from '@utils/yjs-xml-serializer';
import type * as Y from 'yjs';

import { ToolError } from './tool';

const PROSEMIRROR_FRAGMENT = 'prosemirror';

/**
 * Reads and writes the prose of a document as Inkweld XML, the same way an
 * editor would see it, in every storage mode:
 *
 * - When an editor has the document open, its live Y.Doc is used, so the
 *   change shows up on screen and syncs through the open connection.
 * - Otherwise a headless copy is loaded from IndexedDB. On a server profile
 *   it is first brought up to date from the server (a replace on a stale
 *   copy would leave the server's newer paragraphs in place) and pushed back
 *   after a write.
 *
 * A headless write emits `localEdit$` itself, as the editor would, so Cloud
 * Sync and auto-snapshots pick it up.
 */
export class DocumentAccess {
  constructor(private readonly injector: Injector) {}

  private get liveDocs(): LiveDocumentRegistryService {
    return this.injector.get(LiveDocumentRegistryService);
  }

  private isServerMode(): boolean {
    return this.injector.get(SetupService).getMode() === 'server';
  }

  /** Pull (and push) a document that has no open editor. */
  private async syncWithServer(documentId: string): Promise<void> {
    if (!this.isServerMode()) return;
    try {
      await this.injector
        .get(DocumentService)
        .syncDocumentToServer(documentId, 20000);
    } catch (error) {
      // Offline or the server refused: fall back to the local copy, which is
      // what the editor would show too.
      console.warn(`[WebMCP] Could not sync ${documentId}`, error);
    }
  }

  /** The document as Inkweld XML; empty string for an empty document. */
  async readXml(documentId: string): Promise<string> {
    const live = this.liveDocs.getConnectedYDoc(documentId);
    if (live)
      return xmlFragmentToXmlString(live.getXmlFragment(PROSEMIRROR_FRAGMENT));

    await this.syncWithServer(documentId);
    const access = this.injector.get(YDocAccessService);
    if (!(await access.documentExists(documentId))) return '';
    const acquired = await access.acquireDocument(documentId);
    try {
      return this.serialize(acquired.doc);
    } finally {
      await acquired.release();
    }
  }

  private serialize(doc: Y.Doc): string {
    const fragment = doc.getXmlFragment(PROSEMIRROR_FRAGMENT);
    if (
      fragment.length === 0 &&
      doc.getMap<unknown>('importedContent').get('content')
    ) {
      throw new ToolError(
        'This document was imported and has not been opened yet. Call open_element on it once, then read it again.'
      );
    }
    return xmlFragmentToXmlString(fragment);
  }

  /** Replace the whole document with `xml`. */
  async writeXml(documentId: string, xml: string): Promise<void> {
    const live = this.liveDocs.getConnectedYDoc(documentId);
    if (live) {
      // The live doc's update listener reports this as a local edit.
      applyXmlToFragment(live, live.getXmlFragment(PROSEMIRROR_FRAGMENT), xml);
      return;
    }

    await this.syncWithServer(documentId);
    const acquired = await this.injector
      .get(YDocAccessService)
      .acquireDocument(documentId);
    try {
      const doc = acquired.doc;
      doc.transact(() => {
        applyXmlToFragment(doc, doc.getXmlFragment(PROSEMIRROR_FRAGMENT), xml);
        // Pending import content would otherwise be applied over this text
        // the first time the editor opens an empty document.
        const imported = doc.getMap<unknown>('importedContent');
        imported.delete('content');
        imported.delete('importedAt');
      });
      await acquired.flush();
    } finally {
      await acquired.release();
    }
    // An editor that opened the document meanwhile reports its own edits and
    // syncs through its own connection.
    if (acquired.live) return;
    this.liveDocs.localEdit$.next(documentId);
    await this.syncWithServer(documentId);
  }
}
