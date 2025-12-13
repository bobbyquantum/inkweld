import { inject, Injectable } from '@angular/core';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';

import { ArchiveWorldbuildingData } from '../../models/project-archive';
import { LoggerService } from '../core/logger.service';

/**
 * Service for importing document content into Yjs/IndexedDB.
 *
 * Handles the low-level writing of ProseMirror JSON and worldbuilding
 * data into the Yjs-backed IndexedDB storage.
 */
@Injectable({
  providedIn: 'root',
})
export class DocumentImportService {
  private logger = inject(LoggerService);

  /**
   * Write document content to IndexedDB using Yjs.
   *
   * The content is stored in a format that will be loaded when
   * the document is opened in the editor. For imported documents,
   * we store the JSON content in a special 'importedContent' field
   * that the editor will use to initialize the document.
   *
   * @param documentId - Full document ID (username:slug:elementId)
   * @param content - ProseMirror JSON content (the content array)
   */
  async writeDocumentContent(
    documentId: string,
    content: unknown
  ): Promise<void> {
    // Create a Yjs document
    const ydoc = new Y.Doc();

    // Store the imported content as JSON in a map
    // The editor will need to be modified to check for this on load
    const importedContentMap = ydoc.getMap<unknown>('importedContent');
    ydoc.transact(() => {
      importedContentMap.set('content', content);
      importedContentMap.set('importedAt', new Date().toISOString());
    });

    // Also create an empty prosemirror fragment so the document is recognized
    // The editor will populate this from importedContent on first load
    ydoc.getXmlFragment('prosemirror');

    // Save to IndexedDB
    const provider = new IndexeddbPersistence(documentId, ydoc);
    await provider.whenSynced;

    // Give IndexedDB time to flush
    await new Promise<void>(resolve => setTimeout(resolve, 50));

    // Cleanup
    await provider.destroy();
    ydoc.destroy();

    this.logger.debug(
      'DocumentImport',
      `Wrote document content for ${documentId}`
    );
  }

  /**
   * Write worldbuilding data for an element.
   *
   * @param wb - The worldbuilding data from the archive
   * @param username - Project owner
   * @param slug - Project slug
   */
  async writeWorldbuildingData(
    wb: ArchiveWorldbuildingData,
    username: string,
    slug: string
  ): Promise<void> {
    const docId = `${username}:${slug}:wb:${wb.elementId}`;

    // Create a Yjs document for the worldbuilding data
    const ydoc = new Y.Doc();
    const dataMap = ydoc.getMap<unknown>('data');

    // Copy all data fields to the Yjs map
    ydoc.transact(() => {
      for (const [key, value] of Object.entries(wb.data)) {
        dataMap.set(key, value);
      }
      // Also store the schema type
      dataMap.set('schemaType', wb.schemaType);
    });

    // Save to IndexedDB
    const provider = new IndexeddbPersistence(docId, ydoc);
    await provider.whenSynced;

    // Give IndexedDB time to flush
    await new Promise<void>(resolve => setTimeout(resolve, 50));

    // Cleanup
    await provider.destroy();
    ydoc.destroy();

    this.logger.debug(
      'DocumentImport',
      `Wrote worldbuilding data for ${wb.elementId}`
    );
  }
}
