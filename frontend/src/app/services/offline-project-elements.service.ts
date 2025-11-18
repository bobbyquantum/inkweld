import { inject, Injectable, signal } from '@angular/core';
import {
  GetApiV1ProjectsUsernameSlugElements200ResponseInner,
  GetApiV1ProjectsUsernameSlugElements200ResponseInnerType,
} from '@inkweld/index';
import { nanoid } from 'nanoid';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';

import { LoggerService } from './logger.service';

const OFFLINE_ELEMENTS_STORAGE_KEY = 'inkweld-offline-elements';

interface StoredProjectElements {
  [projectKey: string]: GetApiV1ProjectsUsernameSlugElements200ResponseInner[];
}

/**
 * Manages offline project elements using Yjs + IndexedDB
 *
 * This service provides CRDT-based storage for project elements in offline mode,
 * matching the pattern used by DocumentService and ProjectStateService.
 * When switching to online mode, the Yjs document automatically syncs via WebSocket.
 */
@Injectable({
  providedIn: 'root',
})
export class OfflineProjectElementsService {
  private logger = inject(LoggerService);

  readonly elements = signal<
    GetApiV1ProjectsUsernameSlugElements200ResponseInner[]
  >([]);
  readonly isLoading = signal(false);

  // Yjs connections per project (username:slug -> connection)
  private yjsConnections = new Map<
    string,
    {
      doc: Y.Doc;
      provider: IndexeddbPersistence;
      elementsArray: Y.Array<GetApiV1ProjectsUsernameSlugElements200ResponseInner>;
    }
  >();

  /**
   * Load elements for a specific project using Yjs + IndexedDB
   */
  async loadElements(username: string, slug: string): Promise<void> {
    this.isLoading.set(true);
    try {
      const connection = await this.getOrCreateConnection(username, slug);
      const elements = connection.elementsArray.toArray();
      this.elements.set(elements);
      this.logger.debug(
        'OfflineProjectElements',
        `Loaded ${elements.length} elements for ${username}/${slug}`
      );
    } catch (error) {
      this.logger.error(
        'OfflineProjectElements',
        'Failed to load elements',
        error
      );
      // Fall back to empty array on error
      this.elements.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Save elements for a specific project using Yjs
   */
  async saveElements(
    username: string,
    slug: string,
    elements: GetApiV1ProjectsUsernameSlugElements200ResponseInner[]
  ): Promise<void> {
    try {
      const connection = await this.getOrCreateConnection(username, slug);

      // Update Yjs array transactionally
      connection.doc.transact(() => {
        connection.elementsArray.delete(0, connection.elementsArray.length);
        connection.elementsArray.insert(0, elements);
      });

      this.elements.set(elements);
      this.logger.debug(
        'OfflineProjectElements',
        `Saved ${elements.length} elements for ${username}/${slug}`
      );
    } catch (error) {
      this.logger.error(
        'OfflineProjectElements',
        'Failed to save elements',
        error
      );
      throw error;
    }
  }

  /**
   * Get or create a Yjs connection for a project
   */
  private async getOrCreateConnection(
    username: string,
    slug: string
  ): Promise<{
    doc: Y.Doc;
    provider: IndexeddbPersistence;
    elementsArray: Y.Array<GetApiV1ProjectsUsernameSlugElements200ResponseInner>;
  }> {
    const projectKey = `${username}:${slug}`;
    const docId = `${username}:${slug}:elements`;

    // Return existing connection if available
    const existing = this.yjsConnections.get(projectKey);
    if (existing) {
      return existing;
    }

    // Create new Yjs document and IndexedDB provider
    const doc = new Y.Doc();
    const provider = new IndexeddbPersistence(docId, doc);

    // Wait for IndexedDB to sync before proceeding
    await provider.whenSynced;

    const elementsArray =
      doc.getArray<GetApiV1ProjectsUsernameSlugElements200ResponseInner>(
        'elements'
      );

    // Check if we need to migrate from localStorage
    if (elementsArray.length === 0) {
      this.migrateFromLocalStorage(projectKey, elementsArray, doc);
    }

    const connection = { doc, provider, elementsArray };
    this.yjsConnections.set(projectKey, connection);

    this.logger.debug(
      'OfflineProjectElements',
      `Created Yjs connection for ${docId}`
    );

    return connection;
  }

  /**
   * Migrate elements from localStorage to Yjs (one-time migration)
   */
  /**
   * Migrate elements from localStorage to Yjs (one-time migration)
   */
  private migrateFromLocalStorage(
    projectKey: string,
    elementsArray: Y.Array<GetApiV1ProjectsUsernameSlugElements200ResponseInner>,
    doc: Y.Doc
  ): void {
    try {
      const storedElements = this.getStoredElementsFromLocalStorage();
      const elements = storedElements[projectKey];

      if (elements && elements.length > 0) {
        this.logger.info(
          'OfflineProjectElements',
          `Migrating ${elements.length} elements from localStorage to Yjs for ${projectKey}`
        );

        // Insert elements into Yjs array
        doc.transact(() => {
          elementsArray.insert(0, elements);
        });

        // Clean up localStorage entry for this project after successful migration
        delete storedElements[projectKey];
        this.saveStoredElementsToLocalStorage(storedElements);

        this.logger.info(
          'OfflineProjectElements',
          `Successfully migrated elements for ${projectKey}`
        );
      }
    } catch (error) {
      this.logger.error(
        'OfflineProjectElements',
        'Failed to migrate from localStorage',
        error
      );
      // Continue anyway - empty elements is acceptable
    }
  }

  /**
   * Create default project structure
   */
  async createDefaultStructure(
    username: string,
    slug: string
  ): Promise<GetApiV1ProjectsUsernameSlugElements200ResponseInner[]> {
    const defaultElements: GetApiV1ProjectsUsernameSlugElements200ResponseInner[] =
      [
        {
          id: nanoid(),
          name: 'Chapters',
          type: GetApiV1ProjectsUsernameSlugElements200ResponseInnerType.Folder,
          level: 0,
          expandable: true,
          order: 0,
          parentId: null,
          version: 0,
          metadata: {},
        },
        {
          id: nanoid(),
          name: 'Chapter 1',
          type: GetApiV1ProjectsUsernameSlugElements200ResponseInnerType.Item,
          level: 1,
          expandable: false,
          order: 1,
          parentId: null,
          version: 0,
          metadata: {},
        },
        {
          id: nanoid(),
          name: 'Notes',
          type: GetApiV1ProjectsUsernameSlugElements200ResponseInnerType.Folder,
          level: 0,
          expandable: true,
          order: 2,
          parentId: null,
          version: 0,
          metadata: {},
        },
        {
          id: nanoid(),
          name: 'Research',
          type: GetApiV1ProjectsUsernameSlugElements200ResponseInnerType.Item,
          level: 1,
          expandable: false,
          order: 3,
          parentId: null,
          version: 0,
          metadata: {},
        },
      ];

    await this.saveElements(username, slug, defaultElements);
    return defaultElements;
  }

  /**
   * Update elements
   */
  async updateElements(
    username: string,
    slug: string,
    elements: GetApiV1ProjectsUsernameSlugElements200ResponseInner[]
  ): Promise<void> {
    await this.saveElements(username, slug, elements);
  }

  /**
   * Add element
   */
  async addElement(
    username: string,
    slug: string,
    type: GetApiV1ProjectsUsernameSlugElements200ResponseInner['type'],
    name: string,
    parentId?: string
  ): Promise<GetApiV1ProjectsUsernameSlugElements200ResponseInner[]> {
    const elements = this.elements();
    const parentIndex = parentId
      ? elements.findIndex(e => e.id === parentId)
      : -1;
    const parentLevel = parentIndex >= 0 ? elements[parentIndex].level : -1;

    const newElement: GetApiV1ProjectsUsernameSlugElements200ResponseInner = {
      id: nanoid(),
      name,
      type,
      level: parentLevel + 1,
      expandable:
        type ===
        GetApiV1ProjectsUsernameSlugElements200ResponseInnerType.Folder,
      order: elements.length,
      parentId: null,
      version: 0,
      metadata: {},
    };

    const newElements = [...elements];
    newElements.splice(parentIndex + 1, 0, newElement);
    const recomputedElements = this.recomputePositions(newElements);

    await this.saveElements(username, slug, recomputedElements);
    return recomputedElements;
  }

  /**
   * Delete element
   */
  async deleteElement(
    username: string,
    slug: string,
    elementId: string
  ): Promise<GetApiV1ProjectsUsernameSlugElements200ResponseInner[]> {
    const elements = this.elements();
    const index = elements.findIndex(e => e.id === elementId);
    if (index === -1) return elements;

    const subtree = this.getSubtree(elements, index);
    const newElements = elements.filter(e => !subtree.includes(e));
    const recomputedElements = this.recomputePositions(newElements);

    await this.saveElements(username, slug, recomputedElements);
    return recomputedElements;
  }

  /**
   * Move element
   */
  async moveElement(
    username: string,
    slug: string,
    elementId: string,
    targetIndex: number,
    newLevel: number
  ): Promise<GetApiV1ProjectsUsernameSlugElements200ResponseInner[]> {
    const elements = this.elements();
    const elementIndex = elements.findIndex(e => e.id === elementId);
    if (elementIndex === -1) return elements;

    const element = elements[elementIndex];
    const subtree = this.getSubtree(elements, elementIndex);
    const levelDiff = newLevel - element.level;

    // Remove subtree from current position
    const newElements = elements.filter(e => !subtree.includes(e));

    // Update levels in subtree
    subtree.forEach(e => (e.level += levelDiff));

    // Insert at new position
    newElements.splice(targetIndex, 0, ...subtree);
    const recomputedElements = this.recomputePositions(newElements);

    await this.saveElements(username, slug, recomputedElements);
    return recomputedElements;
  }

  /**
   * Rename element
   */
  async renameElement(
    username: string,
    slug: string,
    elementId: string,
    newName: string
  ): Promise<GetApiV1ProjectsUsernameSlugElements200ResponseInner[]> {
    const elements = this.elements();
    const index = elements.findIndex(e => e.id === elementId);
    if (index === -1) return elements;

    const newElements = [...elements];
    newElements[index] = { ...newElements[index], name: newName };

    await this.saveElements(username, slug, newElements);
    return newElements;
  }

  /**
   * Clean up Yjs connection for a project (call when project is closed)
   */
  async closeConnection(username: string, slug: string): Promise<void> {
    const projectKey = `${username}:${slug}`;
    const connection = this.yjsConnections.get(projectKey);

    if (connection) {
      try {
        await connection.provider.destroy();
        connection.doc.destroy();
        this.yjsConnections.delete(projectKey);
        this.logger.debug(
          'OfflineProjectElements',
          `Closed connection for ${projectKey}`
        );
      } catch (error) {
        this.logger.error(
          'OfflineProjectElements',
          'Failed to close connection',
          error
        );
      }
    }
  }

  /**
   * Get Yjs document for a project (for integration with online mode)
   */
  async getYjsDocument(username: string, slug: string): Promise<Y.Doc> {
    const connection = await this.getOrCreateConnection(username, slug);
    return connection.doc;
  }

  // Legacy localStorage methods for migration
  private getStoredElementsFromLocalStorage(): StoredProjectElements {
    try {
      const stored = localStorage.getItem(OFFLINE_ELEMENTS_STORAGE_KEY);
      return stored ? (JSON.parse(stored) as StoredProjectElements) : {};
    } catch (error) {
      this.logger.error(
        'OfflineProjectElements',
        'Failed to load offline elements from localStorage',
        error
      );
      return {};
    }
  }

  private saveStoredElementsToLocalStorage(
    elements: StoredProjectElements
  ): void {
    try {
      localStorage.setItem(
        OFFLINE_ELEMENTS_STORAGE_KEY,
        JSON.stringify(elements)
      );
    } catch (error) {
      this.logger.error(
        'OfflineProjectElements',
        'Failed to save offline elements to localStorage',
        error
      );
      throw error;
    }
  }

  private getSubtree(
    elements: GetApiV1ProjectsUsernameSlugElements200ResponseInner[],
    startIndex: number
  ): GetApiV1ProjectsUsernameSlugElements200ResponseInner[] {
    const startLevel = elements[startIndex].level;
    const subtree = [elements[startIndex]];

    for (let i = startIndex + 1; i < elements.length; i++) {
      if (elements[i].level > startLevel) {
        subtree.push(elements[i]);
      } else {
        break;
      }
    }

    return subtree;
  }

  private recomputePositions(
    elements: GetApiV1ProjectsUsernameSlugElements200ResponseInner[]
  ): GetApiV1ProjectsUsernameSlugElements200ResponseInner[] {
    return elements.map((element, index) => ({
      ...element,
      order: index,
      parentId: null,
    }));
  }
}
