/**
 * Relationship Service
 *
 * Manages CRUD operations for element relationships and provides
 * methods for querying the relationship graph.
 */

import { computed, inject, Injectable, signal } from '@angular/core';
import { nanoid } from 'nanoid';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

import {
  getAllRelationshipTypes,
  getRelationshipLabel,
  getRelationshipTypeById,
} from '../../components/element-ref/default-relationship-types';
import {
  ElementRelationship,
  ElementRelationshipView,
  RelationshipType,
  ResolvedRelationship,
} from '../../components/element-ref/element-ref.model';
import { LoggerService } from '../core/logger.service';
import { SetupService } from '../core/setup.service';
import { ProjectStateService } from '../project/project-state.service';

/**
 * Connection to a relationship Y.Doc for an element
 */
interface RelationshipConnection {
  ydoc: Y.Doc;
  relationshipsArray: Y.Array<ElementRelationship>;
  provider?: WebsocketProvider;
  indexeddbProvider: IndexeddbPersistence;
}

@Injectable({
  providedIn: 'root',
})
export class RelationshipService {
  private logger = inject(LoggerService);
  private setupService = inject(SetupService);
  private projectState = inject(ProjectStateService);

  /** Active connections to element relationship documents */
  private connections = new Map<string, RelationshipConnection>();

  /** Project-level custom relationship types */
  private customTypesSignal = signal<RelationshipType[]>([]);
  readonly customTypes = this.customTypesSignal.asReadonly();

  /** All available relationship types (built-in + custom) */
  readonly allTypes = computed(() =>
    getAllRelationshipTypes(this.customTypesSignal())
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Connection Management
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get or create a connection to an element's relationship data
   */
  private async getConnection(
    elementId: string,
    username?: string,
    slug?: string
  ): Promise<RelationshipConnection> {
    const docId = this.buildDocId(elementId, username, slug);

    if (this.connections.has(docId)) {
      return this.connections.get(docId)!;
    }

    this.logger.debug(
      'RelationshipService',
      `Creating connection for ${docId}`
    );

    const ydoc = new Y.Doc();
    const relationshipsArray =
      ydoc.getArray<ElementRelationship>('__relationships__');

    // Set up IndexedDB persistence
    const indexeddbProvider = new IndexeddbPersistence(
      `inkweld-rel-${docId}`,
      ydoc
    );
    await indexeddbProvider.whenSynced;

    // Set up WebSocket provider if in server mode
    let provider: WebsocketProvider | undefined;
    const wsUrl = this.setupService.getWebSocketUrl();
    if (wsUrl && username && slug) {
      const roomName = `rel:${username}:${slug}:${elementId}`;
      provider = new WebsocketProvider(wsUrl, roomName, ydoc);
    }

    const connection: RelationshipConnection = {
      ydoc,
      relationshipsArray,
      provider,
      indexeddbProvider,
    };

    this.connections.set(docId, connection);
    return connection;
  }

  /**
   * Build a document ID for relationship storage
   */
  private buildDocId(
    elementId: string,
    username?: string,
    slug?: string
  ): string {
    if (username && slug) {
      return `${username}:${slug}:${elementId}`;
    }
    return elementId;
  }

  /**
   * Disconnect from an element's relationship data
   */
  async disconnect(
    elementId: string,
    username?: string,
    slug?: string
  ): Promise<void> {
    const docId = this.buildDocId(elementId, username, slug);
    const connection = this.connections.get(docId);

    if (connection) {
      connection.provider?.disconnect();
      await connection.indexeddbProvider.destroy();
      connection.ydoc.destroy();
      this.connections.delete(docId);

      this.logger.debug('RelationshipService', `Disconnected from ${docId}`);
    }
  }

  /**
   * Disconnect all connections
   */
  async disconnectAll(): Promise<void> {
    const docIds = Array.from(this.connections.keys());
    for (const docId of docIds) {
      const parts = docId.split(':');
      if (parts.length === 3) {
        await this.disconnect(parts[2], parts[0], parts[1]);
      } else {
        await this.disconnect(docId);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Relationship CRUD
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get all outgoing relationships from an element
   */
  async getOutgoingRelationships(
    elementId: string,
    username?: string,
    slug?: string
  ): Promise<ElementRelationship[]> {
    const connection = await this.getConnection(elementId, username, slug);
    return connection.relationshipsArray.toArray();
  }

  /**
   * Add a new relationship from an element
   */
  async addRelationship(
    sourceElementId: string,
    targetElementId: string,
    relationshipTypeId: string,
    options?: {
      note?: string;
      displayText?: string;
      documentContext?: ElementRelationship['documentContext'];
      username?: string;
      slug?: string;
    }
  ): Promise<ElementRelationship> {
    const { username, slug, ...relationshipOptions } = options || {};
    const connection = await this.getConnection(
      sourceElementId,
      username,
      slug
    );

    const now = new Date().toISOString();
    const relationship: ElementRelationship = {
      id: nanoid(),
      sourceElementId,
      targetElementId,
      relationshipTypeId,
      note: relationshipOptions.note,
      displayText: relationshipOptions.displayText,
      documentContext: relationshipOptions.documentContext,
      createdAt: now,
      updatedAt: now,
    };

    connection.ydoc.transact(() => {
      connection.relationshipsArray.push([relationship]);
    });

    this.logger.debug(
      'RelationshipService',
      `Added relationship ${relationship.id}: ${sourceElementId} -> ${targetElementId} (${relationshipTypeId})`
    );

    return relationship;
  }

  /**
   * Update an existing relationship
   */
  async updateRelationship(
    sourceElementId: string,
    relationshipId: string,
    updates: Partial<
      Pick<ElementRelationship, 'note' | 'displayText' | 'relationshipTypeId'>
    >,
    username?: string,
    slug?: string
  ): Promise<ElementRelationship | null> {
    const connection = await this.getConnection(
      sourceElementId,
      username,
      slug
    );

    const relationships = connection.relationshipsArray.toArray();
    const index = relationships.findIndex(r => r.id === relationshipId);

    if (index === -1) {
      this.logger.warn(
        'RelationshipService',
        `Relationship ${relationshipId} not found`
      );
      return null;
    }

    const existing = relationships[index];
    const updated: ElementRelationship = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    connection.ydoc.transact(() => {
      connection.relationshipsArray.delete(index, 1);
      connection.relationshipsArray.insert(index, [updated]);
    });

    this.logger.debug(
      'RelationshipService',
      `Updated relationship ${relationshipId}`
    );

    return updated;
  }

  /**
   * Remove a relationship
   */
  async removeRelationship(
    sourceElementId: string,
    relationshipId: string,
    username?: string,
    slug?: string
  ): Promise<boolean> {
    const connection = await this.getConnection(
      sourceElementId,
      username,
      slug
    );

    const relationships = connection.relationshipsArray.toArray();
    const index = relationships.findIndex(r => r.id === relationshipId);

    if (index === -1) {
      this.logger.warn(
        'RelationshipService',
        `Relationship ${relationshipId} not found for removal`
      );
      return false;
    }

    connection.ydoc.transact(() => {
      connection.relationshipsArray.delete(index, 1);
    });

    this.logger.debug(
      'RelationshipService',
      `Removed relationship ${relationshipId}`
    );

    return true;
  }

  /**
   * Find a relationship by ID within an element's relationships
   */
  async findRelationship(
    sourceElementId: string,
    relationshipId: string,
    username?: string,
    slug?: string
  ): Promise<ElementRelationship | null> {
    const relationships = await this.getOutgoingRelationships(
      sourceElementId,
      username,
      slug
    );
    return relationships.find(r => r.id === relationshipId) || null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Backlink / Incoming Relationship Queries
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Find all incoming relationships (backlinks) to an element
   *
   * This scans all elements in the project to find relationships
   * pointing to the target element. For large projects, consider
   * implementing a relationship index.
   */
  async getIncomingRelationships(
    targetElementId: string,
    username?: string,
    slug?: string
  ): Promise<ElementRelationship[]> {
    const elements = this.projectState.elements();
    const incoming: ElementRelationship[] = [];

    // Scan each element's outgoing relationships
    for (const element of elements) {
      if (element.id === targetElementId) continue;

      try {
        const outgoing = await this.getOutgoingRelationships(
          element.id,
          username,
          slug
        );

        const pointingToTarget = outgoing.filter(
          r => r.targetElementId === targetElementId
        );

        incoming.push(...pointingToTarget);
      } catch {
        // Element may not have relationships initialized yet
        this.logger.debug(
          'RelationshipService',
          `No relationships for element ${element.id}`
        );
      }
    }

    return incoming;
  }

  /**
   * Get complete relationship view for an element (outgoing + incoming)
   */
  async getRelationshipView(
    elementId: string,
    username?: string,
    slug?: string
  ): Promise<ElementRelationshipView> {
    const [outgoing, incoming] = await Promise.all([
      this.getOutgoingRelationships(elementId, username, slug),
      this.getIncomingRelationships(elementId, username, slug),
    ]);

    return { outgoing, incoming };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Resolved Relationships (with element metadata)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Resolve a relationship with full element and type metadata
   */
  resolveRelationship(
    relationship: ElementRelationship,
    isIncoming: boolean
  ): ResolvedRelationship | null {
    const elements = this.projectState.elements();

    // Find the related element (target for outgoing, source for incoming)
    const relatedElementId = isIncoming
      ? relationship.sourceElementId
      : relationship.targetElementId;

    const relatedElement = elements.find(e => e.id === relatedElementId);

    if (!relatedElement) {
      this.logger.warn(
        'RelationshipService',
        `Could not resolve element ${relatedElementId}`
      );
      return null;
    }

    // Get relationship type
    const relationshipType = getRelationshipTypeById(
      relationship.relationshipTypeId,
      this.customTypesSignal()
    );

    if (!relationshipType) {
      this.logger.warn(
        'RelationshipService',
        `Unknown relationship type ${relationship.relationshipTypeId}`
      );
      return null;
    }

    return {
      ...relationship,
      relatedElement: {
        id: relatedElement.id,
        name: relatedElement.name,
        type: relatedElement.type,
        icon: relatedElement.metadata?.['icon'],
      },
      relationshipType,
      isIncoming,
      displayLabel: getRelationshipLabel(relationshipType, isIncoming),
    };
  }

  /**
   * Get resolved relationship view with full metadata
   */
  async getResolvedRelationshipView(
    elementId: string,
    username?: string,
    slug?: string
  ): Promise<{
    outgoing: ResolvedRelationship[];
    incoming: ResolvedRelationship[];
  }> {
    const view = await this.getRelationshipView(elementId, username, slug);

    const outgoing = view.outgoing
      .map(r => this.resolveRelationship(r, false))
      .filter((r): r is ResolvedRelationship => r !== null);

    const incoming = view.incoming
      .map(r => this.resolveRelationship(r, true))
      .filter((r): r is ResolvedRelationship => r !== null);

    return { outgoing, incoming };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Custom Relationship Types
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Add a custom relationship type to the project
   */
  addCustomType(
    type: Omit<RelationshipType, 'id' | 'isBuiltIn'>
  ): RelationshipType {
    const newType: RelationshipType = {
      ...type,
      id: `custom-${nanoid(8)}`,
      isBuiltIn: false,
    };

    this.customTypesSignal.update(types => [...types, newType]);

    this.logger.debug(
      'RelationshipService',
      `Added custom relationship type: ${newType.label}`
    );

    return newType;
  }

  /**
   * Update a custom relationship type
   */
  updateCustomType(
    typeId: string,
    updates: Partial<Omit<RelationshipType, 'id' | 'isBuiltIn'>>
  ): boolean {
    const types = this.customTypesSignal();
    const index = types.findIndex(t => t.id === typeId);

    if (index === -1 || types[index].isBuiltIn) {
      this.logger.warn(
        'RelationshipService',
        `Cannot update type ${typeId}: not found or is built-in`
      );
      return false;
    }

    this.customTypesSignal.update(types =>
      types.map((t, i) => (i === index ? { ...t, ...updates } : t))
    );

    return true;
  }

  /**
   * Remove a custom relationship type
   */
  removeCustomType(typeId: string): boolean {
    const types = this.customTypesSignal();
    const type = types.find(t => t.id === typeId);

    if (!type || type.isBuiltIn) {
      this.logger.warn(
        'RelationshipService',
        `Cannot remove type ${typeId}: not found or is built-in`
      );
      return false;
    }

    this.customTypesSignal.update(types => types.filter(t => t.id !== typeId));

    return true;
  }

  /**
   * Load custom types from project storage
   * Called when a project is loaded
   */
  loadCustomTypes(types: RelationshipType[]): void {
    this.customTypesSignal.set(types.filter(t => !t.isBuiltIn));
  }

  /**
   * Get all relationship types (for UI)
   */
  getAllTypes(): RelationshipType[] {
    return getAllRelationshipTypes(this.customTypesSignal());
  }

  /**
   * Get a relationship type by ID
   */
  getTypeById(typeId: string): RelationshipType | undefined {
    return getRelationshipTypeById(typeId, this.customTypesSignal());
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Utility Methods
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Check if an element has any relationships (outgoing or incoming)
   */
  async hasRelationships(
    elementId: string,
    username?: string,
    slug?: string
  ): Promise<boolean> {
    const view = await this.getRelationshipView(elementId, username, slug);
    return view.outgoing.length > 0 || view.incoming.length > 0;
  }

  /**
   * Get count of relationships for an element
   */
  async getRelationshipCount(
    elementId: string,
    username?: string,
    slug?: string
  ): Promise<{ outgoing: number; incoming: number; total: number }> {
    const view = await this.getRelationshipView(elementId, username, slug);
    return {
      outgoing: view.outgoing.length,
      incoming: view.incoming.length,
      total: view.outgoing.length + view.incoming.length,
    };
  }
}
