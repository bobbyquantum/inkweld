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

    // Create IndexedDB provider BEFORE writing data
    // This ensures the provider observes the document changes
    const provider = new IndexeddbPersistence(documentId, ydoc);
    await provider.whenSynced;

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

    // Give IndexedDB time to flush the transaction
    await this.waitForSync(provider, 200);

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
    // Key format must match worldbuilding.service.ts setupCollaboration()
    // Include project key to prevent cross-project data collisions
    const docId = `worldbuilding:${username}:${slug}:${wb.elementId}`;

    try {
      // Create a Yjs document for the worldbuilding data
      const ydoc = new Y.Doc();

      // Create IndexedDB provider BEFORE writing data
      // This ensures the provider observes the document changes
      const provider = new IndexeddbPersistence(docId, ydoc);

      // Wait for provider to be ready (loads any existing data)
      await provider.whenSynced;

      // Map name must match worldbuilding.service.ts ('worldbuilding', not 'data')
      const dataMap = ydoc.getMap<unknown>('worldbuilding');

      // Copy all data fields to the Yjs map
      // Handle dot-notation keys (e.g., "appearance.height") by setting them
      // into nested Y.Map structures
      ydoc.transact(() => {
        // First pass: create nested Y.Map for dot-notation parent keys
        const nestedMaps = new Map<string, Y.Map<unknown>>();
        for (const key of Object.keys(wb.data)) {
          if (key.includes('.')) {
            const parentKey = key.split('.')[0];
            if (!nestedMaps.has(parentKey)) {
              const nestedMap = new Y.Map<unknown>();
              nestedMaps.set(parentKey, nestedMap);
              dataMap.set(parentKey, nestedMap);
            }
          }
        }

        // Second pass: set all values
        for (const [key, value] of Object.entries(wb.data)) {
          if (key.includes('.')) {
            // Dot-notation key: set into nested map
            const [parentKey, childKey] = key.split('.');
            const nestedMap = nestedMaps.get(parentKey);
            if (nestedMap) {
              // Convert arrays to Y.Array for proper Yjs handling
              if (Array.isArray(value)) {
                const yArray = new Y.Array<unknown>();
                yArray.push(value);
                nestedMap.set(childKey, yArray);
              } else {
                nestedMap.set(childKey, value);
              }
            }
          } else {
            // Simple key: set directly on dataMap
            if (Array.isArray(value)) {
              const yArray = new Y.Array<unknown>();
              yArray.push(value);
              dataMap.set(key, yArray);
            } else if (typeof value === 'object' && value !== null) {
              // Skip nested objects - they're created from dot-notation keys
              // or not used in new format
            } else {
              dataMap.set(key, value);
            }
          }
        }

        // Also store the schema ID
        dataMap.set('schemaId', wb.schemaId);

        // Copy identity fields (description, image) to the identity map
        // These are stored separately for the identity panel
        const identityMap = ydoc.getMap<unknown>('identity');
        if (wb.data['description']) {
          identityMap.set('description', wb.data['description']);
        }
        if (wb.data['image']) {
          identityMap.set('image', wb.data['image']);
        }
      });

      // Wait for IndexedDB persistence to sync the changes
      await this.waitForSync(provider, 500);

      // Cleanup
      await provider.destroy();
      ydoc.destroy();

      this.logger.debug(
        'DocumentImport',
        `Wrote worldbuilding data for ${wb.elementId} (${username}/${slug})`
      );
    } catch (error) {
      console.error(
        `[DocumentImport] ERROR writing worldbuilding data for ${wb.elementId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Wait for the IndexedDB provider to be synced.
   * @param provider - The IndexedDB provider
   * @param timeoutMs - Timeout in milliseconds
   */
  private async waitForSync(
    provider: IndexeddbPersistence,
    timeoutMs: number
  ): Promise<void> {
    if (provider.synced) {
      return;
    }

    return new Promise<void>(resolve => {
      const handler = () => {
        clearTimeout(timeout);
        provider.off('synced', handler);
        resolve();
      };

      const timeout = setTimeout(handler, timeoutMs);
      provider.on('synced', handler);
    });
  }
}
