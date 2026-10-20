import { inject, Injectable } from '@angular/core';
import { type ArchiveWorldbuildingData } from '@models/project-archive';
import { LoggerService } from '@services/core/logger.service';
import { StorageContextService } from '@services/core/storage-context.service';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';

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
  private readonly logger = inject(LoggerService);
  private readonly storageContext = inject(StorageContextService);

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
    // This ensures the provider observes the document changes.
    // The database name is profile-scoped, like DocumentService's.
    const provider = new IndexeddbPersistence(
      this.storageContext.prefixDocumentId(documentId),
      ydoc
    );
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
    // Database name must match worldbuilding.service.ts createConnection():
    // the project-scoped doc id under the active profile's prefix
    const docId = this.storageContext.prefixDocumentId(
      `worldbuilding:${username}:${slug}:${wb.elementId}`
    );

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

      // Copy all data fields to the Yjs map. Grouped fields (e.g. a
      // Character's Appearance group) are stored as nested Y.Maps, the way
      // the editor writes them. Archives carry them as nested objects
      // (`{"appearance": {"height": ...}}`); built-in templates and older
      // archives use dot-notation keys (`"appearance.height"`). Both land in
      // the same nested map.
      ydoc.transact(() => {
        for (const [key, value] of Object.entries(wb.data)) {
          this.setWorldbuildingValue(dataMap, key, value);
        }

        // Also store the schema ID
        dataMap.set('schemaId', wb.schemaId);

        // Copy identity fields (description, image) to the identity map
        const identityMap = ydoc.getMap<unknown>('identity');
        if (wb.data['description']) {
          identityMap.set('description', wb.data['description']);
        }
        if (wb.data['image']) {
          identityMap.set('image', wb.data['image']);
        }
        if (wb.appearance && typeof wb.appearance === 'object') {
          identityMap.set(
            'appearance',
            this.toNestedYMap(
              wb.appearance as unknown as Record<string, unknown>
            )
          );
        }

        // Restore the element's own schema copy when the archive carries one.
        // Without one, the shared schema is copied in on first open.
        if (wb.schema) {
          const schemaMap = ydoc.getMap<unknown>('schema');
          schemaMap.set('snapshot', wb.schema);
          schemaMap.set('baseSchemaId', wb.schema.id);
          if (wb.schemaBaseHash) {
            schemaMap.set('baseHash', wb.schemaBaseHash);
          }
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

  private setWorldbuildingValue(
    dataMap: Y.Map<unknown>,
    key: string,
    value: unknown
  ): void {
    const dot = key.indexOf('.');
    if (dot > 0 && dot < key.length - 1) {
      const group = this.getOrCreateGroup(dataMap, key.slice(0, dot));
      group.set(key.slice(dot + 1), this.toYjsFieldValue(value));
    } else if (this.isPlainObject(value)) {
      const group = this.getOrCreateGroup(dataMap, key);
      for (const [childKey, childValue] of Object.entries(value)) {
        group.set(childKey, this.toYjsFieldValue(childValue));
      }
    } else {
      dataMap.set(key, this.toYjsFieldValue(value));
    }
  }

  /** The nested Y.Map holding a field group, created on first use. */
  private getOrCreateGroup(
    dataMap: Y.Map<unknown>,
    key: string
  ): Y.Map<unknown> {
    const existing = dataMap.get(key);
    if (existing instanceof Y.Map) return existing as Y.Map<unknown>;
    const group = new Y.Map<unknown>();
    dataMap.set(key, group);
    return group;
  }

  /**
   * A field value as the editor stores it: arrays become Y.Arrays, anything
   * else (including an object inside a group) is kept as plain JSON.
   */
  private toYjsFieldValue(value: unknown): unknown {
    if (!Array.isArray(value)) return value;
    const yArray = new Y.Array<unknown>();
    yArray.push(value);
    return yArray;
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  /**
   * Convert a plain nested object into nested Y.Maps so it matches the shape
   * `WorldbuildingService.readAppearance` expects for the identity map.
   * `undefined`/`null` leaves are skipped.
   */
  private toNestedYMap(value: Record<string, unknown>): Y.Map<unknown> {
    const map = new Y.Map<unknown>();
    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined || entry === null) continue;
      if (typeof entry === 'object' && !Array.isArray(entry)) {
        map.set(key, this.toNestedYMap(entry as Record<string, unknown>));
      } else {
        map.set(key, entry);
      }
    }
    return map;
  }

  /**
   * Wait for the IndexedDB provider to be synced.
   * @param provider - The IndexedDB provider
   * @param timeoutMs - Timeout in milliseconds
   */
  private waitForSync(
    provider: IndexeddbPersistence,
    timeoutMs: number
  ): Promise<void> {
    if (provider.synced) {
      return Promise.resolve();
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
