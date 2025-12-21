import { inject, Injectable, signal } from '@angular/core';
import { Element, ElementType } from '@inkweld/index';
import { nanoid } from 'nanoid';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';

import { DEFAULT_RELATIONSHIP_TYPE_DEFINITIONS } from '../../components/element-ref/default-relationship-types';
import {
  ElementRelationship,
  RelationshipTypeDefinition,
} from '../../components/element-ref/element-ref.model';
import { PublishPlan } from '../../models/publish-plan';
import { ElementTypeSchema } from '../../models/schema-types';
import { LoggerService } from '../core/logger.service';

const OFFLINE_ELEMENTS_STORAGE_KEY = 'inkweld-offline-elements';

interface StoredProjectElements {
  [projectKey: string]: Element[];
}

/**
 * Connection to a single Yjs document for a project.
 *
 * All project metadata (elements, publish plans, relationships, custom types, schemas)
 * is stored in the SAME Yjs document, matching the online YjsElementSyncProvider.
 */
interface YjsProjectConnection {
  doc: Y.Doc;
  provider: IndexeddbPersistence;
  elementsArray: Y.Array<Element>;
  publishPlansArray: Y.Array<PublishPlan>;
  relationshipsArray: Y.Array<ElementRelationship>;
  customTypesArray: Y.Array<RelationshipTypeDefinition>;
  schemasArray: Y.Array<ElementTypeSchema>;
}

/**
 * Manages offline project data using Yjs + IndexedDB
 *
 * This service provides CRDT-based storage for all project metadata in offline mode:
 * - Elements (folders, items)
 * - Publish plans
 * - Element relationships
 * - Custom relationship types
 * - Worldbuilding schemas
 *
 * All data is stored in a SINGLE Yjs document per project, matching the structure
 * used by YjsElementSyncProvider for online mode. This ensures seamless transition
 * between offline and online modes.
 *
 * Document ID format: `${username}:${slug}:elements`
 * Arrays in document:
 * - 'elements' - project tree structure
 * - 'publishPlans' - publishing configuration
 * - 'relationships' - element references
 * - 'customRelationshipTypes' - user-defined relationship types
 * - 'schemas' - worldbuilding template schemas
 */
@Injectable({
  providedIn: 'root',
})
export class OfflineProjectElementsService {
  private logger = inject(LoggerService);

  readonly elements = signal<Element[]>([]);
  readonly publishPlans = signal<PublishPlan[]>([]);
  readonly relationships = signal<ElementRelationship[]>([]);
  readonly customRelationshipTypes = signal<RelationshipTypeDefinition[]>([]);
  readonly schemas = signal<ElementTypeSchema[]>([]);
  readonly isLoading = signal(false);

  // Yjs connections per project (username:slug -> connection)
  private yjsConnections = new Map<string, YjsProjectConnection>();

  /**
   * Load elements for a specific project using Yjs + IndexedDB.
   * Also sets up observers for all project data arrays.
   */
  async loadElements(username: string, slug: string): Promise<void> {
    this.isLoading.set(true);
    try {
      const connection = await this.getOrCreateConnection(username, slug);

      // Load all data from the unified Yjs document
      this.elements.set(connection.elementsArray.toArray());
      this.publishPlans.set(connection.publishPlansArray.toArray());
      this.relationships.set(connection.relationshipsArray.toArray());
      this.customRelationshipTypes.set(connection.customTypesArray.toArray());
      this.schemas.set(connection.schemasArray.toArray());

      this.logger.debug(
        'OfflineProjectElements',
        `Loaded ${connection.elementsArray.length} elements, ` +
          `${connection.publishPlansArray.length} publish plans, ` +
          `${connection.relationshipsArray.length} relationships, ` +
          `${connection.schemasArray.length} schemas ` +
          `for ${username}/${slug}`
      );
    } catch (error) {
      this.logger.error(
        'OfflineProjectElements',
        'Failed to load elements',
        error
      );
      // Fall back to empty arrays on error
      this.elements.set([]);
      this.publishPlans.set([]);
      this.relationships.set([]);
      this.customRelationshipTypes.set([]);
      this.schemas.set([]);
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
    elements: Element[]
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

  // ─────────────────────────────────────────────────────────────────────────────
  // Publish Plans
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Save publish plans for a specific project using Yjs
   */
  async savePublishPlans(
    username: string,
    slug: string,
    plans: PublishPlan[]
  ): Promise<void> {
    try {
      const connection = await this.getOrCreateConnection(username, slug);

      connection.doc.transact(() => {
        connection.publishPlansArray.delete(
          0,
          connection.publishPlansArray.length
        );
        connection.publishPlansArray.insert(0, plans);
      });

      this.publishPlans.set(plans);
      this.logger.debug(
        'OfflineProjectElements',
        `Saved ${plans.length} publish plans for ${username}/${slug}`
      );
    } catch (error) {
      this.logger.error(
        'OfflineProjectElements',
        'Failed to save publish plans',
        error
      );
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Relationships
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Save relationships for a specific project using Yjs
   */
  async saveRelationships(
    username: string,
    slug: string,
    relationships: ElementRelationship[]
  ): Promise<void> {
    try {
      const connection = await this.getOrCreateConnection(username, slug);

      connection.doc.transact(() => {
        connection.relationshipsArray.delete(
          0,
          connection.relationshipsArray.length
        );
        connection.relationshipsArray.insert(0, relationships);
      });

      this.relationships.set(relationships);
      this.logger.debug(
        'OfflineProjectElements',
        `Saved ${relationships.length} relationships for ${username}/${slug}`
      );
    } catch (error) {
      this.logger.error(
        'OfflineProjectElements',
        'Failed to save relationships',
        error
      );
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Custom Relationship Types
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Save custom relationship types for a specific project using Yjs
   */
  async saveCustomRelationshipTypes(
    username: string,
    slug: string,
    types: RelationshipTypeDefinition[]
  ): Promise<void> {
    try {
      const connection = await this.getOrCreateConnection(username, slug);

      connection.doc.transact(() => {
        connection.customTypesArray.delete(
          0,
          connection.customTypesArray.length
        );
        connection.customTypesArray.insert(0, types);
      });

      this.customRelationshipTypes.set(types);
      this.logger.debug(
        'OfflineProjectElements',
        `Saved ${types.length} custom relationship types for ${username}/${slug}`
      );
    } catch (error) {
      this.logger.error(
        'OfflineProjectElements',
        'Failed to save custom relationship types',
        error
      );
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Worldbuilding Schemas
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Save schemas for a specific project using Yjs
   */
  async saveSchemas(
    username: string,
    slug: string,
    schemas: ElementTypeSchema[]
  ): Promise<void> {
    try {
      const connection = await this.getOrCreateConnection(username, slug);

      connection.doc.transact(() => {
        connection.schemasArray.delete(0, connection.schemasArray.length);
        connection.schemasArray.insert(0, schemas);
      });

      this.schemas.set(schemas);
      this.logger.debug(
        'OfflineProjectElements',
        `Saved ${schemas.length} schemas for ${username}/${slug}`
      );
    } catch (error) {
      this.logger.error(
        'OfflineProjectElements',
        'Failed to save schemas',
        error
      );
      throw error;
    }
  }

  /**
   * Get or create a Yjs connection for a project.
   * Creates a single Yjs document with all project metadata arrays.
   */
  private async getOrCreateConnection(
    username: string,
    slug: string
  ): Promise<YjsProjectConnection> {
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

    // Get all arrays from the unified document
    const elementsArray = doc.getArray<Element>('elements');
    const publishPlansArray = doc.getArray<PublishPlan>('publishPlans');
    const relationshipsArray =
      doc.getArray<ElementRelationship>('relationships');
    const customTypesArray = doc.getArray<RelationshipTypeDefinition>(
      'customRelationshipTypes'
    );
    const schemasArray = doc.getArray<ElementTypeSchema>('schemas');

    // Set up observers for all arrays
    elementsArray.observe(() => {
      this.elements.set(elementsArray.toArray());
    });

    publishPlansArray.observe(() => {
      this.publishPlans.set(publishPlansArray.toArray());
    });

    relationshipsArray.observe(() => {
      this.relationships.set(relationshipsArray.toArray());
    });

    customTypesArray.observe(() => {
      this.customRelationshipTypes.set(customTypesArray.toArray());
    });

    schemasArray.observe(() => {
      this.schemas.set(schemasArray.toArray());
    });

    // Check if we need to migrate from localStorage (elements only)
    if (elementsArray.length === 0) {
      this.migrateFromLocalStorage(projectKey, elementsArray, doc);
    }

    // Seed default relationship types if empty
    if (customTypesArray.length === 0) {
      this.logger.info(
        'OfflineProjectElements',
        `Seeding ${DEFAULT_RELATIONSHIP_TYPE_DEFINITIONS.length} default relationship types for ${projectKey}`
      );
      doc.transact(() => {
        customTypesArray.insert(
          0,
          DEFAULT_RELATIONSHIP_TYPE_DEFINITIONS.map(t => ({ ...t }))
        );
      });
    }

    const connection: YjsProjectConnection = {
      doc,
      provider,
      elementsArray,
      publishPlansArray,
      relationshipsArray,
      customTypesArray,
      schemasArray,
    };
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
    elementsArray: Y.Array<Element>,
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
  ): Promise<Element[]> {
    const defaultElements: Element[] = [
      {
        id: nanoid(),
        name: 'Chapters',
        type: ElementType.Folder,
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
        type: ElementType.Item,
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
        type: ElementType.Folder,
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
        type: ElementType.Item,
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
    elements: Element[]
  ): Promise<void> {
    await this.saveElements(username, slug, elements);
  }

  /**
   * Add element
   */
  async addElement(
    username: string,
    slug: string,
    type: Element['type'],
    name: string,
    parentId?: string,
    metadata: Record<string, string> = {}
  ): Promise<Element[]> {
    const elements = this.elements();
    const parentIndex = parentId
      ? elements.findIndex(e => e.id === parentId)
      : -1;
    const parentLevel = parentIndex >= 0 ? elements[parentIndex].level : -1;

    const newElement: Element = {
      id: nanoid(),
      name,
      type,
      level: parentLevel + 1,
      expandable: type === ElementType.Folder,
      order: elements.length,
      parentId: null,
      version: 0,
      metadata,
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
  ): Promise<Element[]> {
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
  ): Promise<Element[]> {
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
  ): Promise<Element[]> {
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

  private getSubtree(elements: Element[], startIndex: number): Element[] {
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

  private recomputePositions(elements: Element[]): Element[] {
    return elements.map((element, index) => ({
      ...element,
      order: index,
      parentId: null,
    }));
  }
}
