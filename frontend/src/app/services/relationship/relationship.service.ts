/**
 * Relationship Service
 *
 * Manages CRUD operations for element relationships using centralized
 * storage in the project elements Yjs document.
 *
 * Relationships are now stored centrally, enabling:
 * - Fast backlink queries without scanning all documents
 * - Relationships on worldbuilding elements (not just document references)
 * - Custom relationship types per project
 * - Real-time sync via Yjs
 */

import { computed, inject, Injectable, NgZone, signal } from '@angular/core';
import { nanoid } from 'nanoid';

import {
  ElementRelationship,
  ElementRelationshipView,
  getRelationshipLabel,
  RelationshipTypeDefinition,
  ResolvedRelationship,
} from '../../components/element-ref/element-ref.model';
import { LoggerService } from '../core/logger.service';
import { ProjectStateService } from '../project/project-state.service';
import { ElementSyncProviderFactory } from '../sync/element-sync-provider.factory';

@Injectable({
  providedIn: 'root',
})
export class RelationshipService {
  private logger = inject(LoggerService);
  private projectState = inject(ProjectStateService);
  private syncProviderFactory = inject(ElementSyncProviderFactory);
  private ngZone = inject(NgZone);

  /** Get the active sync provider */
  private get syncProvider() {
    return this.syncProviderFactory.getProvider();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Reactive Signals
  // ─────────────────────────────────────────────────────────────────────────

  /** All relationships in the project (reactive) */
  private relationshipsSignal = signal<ElementRelationship[]>([]);
  readonly relationships = this.relationshipsSignal.asReadonly();

  /** Custom relationship types from the project (new format) */
  private customTypesSignal = signal<RelationshipTypeDefinition[]>([]);
  readonly customTypes = this.customTypesSignal.asReadonly();

  /** Alias for backwards compatibility */
  readonly customRelationshipTypes = this.customTypes;

  /** All available relationship types stored in the project */
  readonly allTypes = computed(() => this.customTypesSignal());

  constructor() {
    // Subscribe to relationships from sync provider
    this.syncProvider.relationships$.subscribe(relationships => {
      this.ngZone.run(() => {
        this.relationshipsSignal.set(relationships);
      });
    });

    // Subscribe to custom types from sync provider
    this.syncProvider.customRelationshipTypes$.subscribe(types => {
      this.ngZone.run(() => {
        this.customTypesSignal.set(types);
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Relationship CRUD
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get all relationships in the project
   */
  getAllRelationships(): ElementRelationship[] {
    return this.syncProvider.getRelationships();
  }

  /**
   * Get all outgoing relationships from an element
   */
  getOutgoingRelationships(sourceElementId: string): ElementRelationship[] {
    return this.syncProvider
      .getRelationships()
      .filter(r => r.sourceElementId === sourceElementId);
  }

  /**
   * Get all incoming relationships (backlinks) to an element
   */
  getIncomingRelationships(targetElementId: string): ElementRelationship[] {
    return this.syncProvider
      .getRelationships()
      .filter(r => r.targetElementId === targetElementId);
  }

  /**
   * Get complete relationship view for an element (outgoing + incoming)
   */
  getRelationshipView(elementId: string): ElementRelationshipView {
    const allRelationships = this.syncProvider.getRelationships();

    return {
      outgoing: allRelationships.filter(r => r.sourceElementId === elementId),
      incoming: allRelationships.filter(r => r.targetElementId === elementId),
    };
  }

  /**
   * Add a new relationship
   */
  addRelationship(
    sourceElementId: string,
    targetElementId: string,
    relationshipTypeId: string,
    options?: {
      note?: string;
      displayText?: string;
      documentContext?: ElementRelationship['documentContext'];
    }
  ): ElementRelationship {
    const now = new Date().toISOString();
    const relationship: ElementRelationship = {
      id: nanoid(),
      sourceElementId,
      targetElementId,
      relationshipTypeId,
      note: options?.note,
      displayText: options?.displayText,
      documentContext: options?.documentContext,
      createdAt: now,
      updatedAt: now,
    };

    const relationships = [
      ...this.syncProvider.getRelationships(),
      relationship,
    ];
    this.syncProvider.updateRelationships(relationships);

    this.logger.debug(
      'RelationshipService',
      `Added relationship ${relationship.id}: ${sourceElementId} -> ${targetElementId} (${relationshipTypeId})`
    );

    return relationship;
  }

  /**
   * Update an existing relationship
   */
  updateRelationship(
    relationshipId: string,
    updates: Partial<
      Pick<ElementRelationship, 'note' | 'displayText' | 'relationshipTypeId'>
    >
  ): ElementRelationship | null {
    const relationships = this.syncProvider.getRelationships();
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

    const newRelationships = [...relationships];
    newRelationships[index] = updated;
    this.syncProvider.updateRelationships(newRelationships);

    this.logger.debug(
      'RelationshipService',
      `Updated relationship ${relationshipId}`
    );

    return updated;
  }

  /**
   * Remove a relationship by ID
   */
  removeRelationship(relationshipId: string): boolean {
    const relationships = this.syncProvider.getRelationships();
    const index = relationships.findIndex(r => r.id === relationshipId);

    if (index === -1) {
      this.logger.warn(
        'RelationshipService',
        `Relationship ${relationshipId} not found for removal`
      );
      return false;
    }

    const newRelationships = relationships.filter(r => r.id !== relationshipId);
    this.syncProvider.updateRelationships(newRelationships);

    this.logger.debug(
      'RelationshipService',
      `Removed relationship ${relationshipId}`
    );

    return true;
  }

  /**
   * Find a relationship by ID
   */
  findRelationship(relationshipId: string): ElementRelationship | null {
    return (
      this.syncProvider.getRelationships().find(r => r.id === relationshipId) ||
      null
    );
  }

  /**
   * Find relationships between two specific elements
   */
  findRelationshipsBetween(
    sourceElementId: string,
    targetElementId: string
  ): ElementRelationship[] {
    return this.syncProvider
      .getRelationships()
      .filter(
        r =>
          r.sourceElementId === sourceElementId &&
          r.targetElementId === targetElementId
      );
  }

  /**
   * Find relationships with a specific document context
   */
  findRelationshipsInDocument(documentId: string): ElementRelationship[] {
    return this.syncProvider
      .getRelationships()
      .filter(r => r.documentContext?.documentId === documentId);
  }

  /**
   * Remove all relationships originating from a document context
   * Called when an @ reference is deleted from a document
   */
  removeRelationshipsFromDocument(
    documentId: string,
    targetElementId?: string
  ): number {
    const relationships = this.syncProvider.getRelationships();
    const toRemove = relationships.filter(
      r =>
        r.documentContext?.documentId === documentId &&
        (targetElementId === undefined || r.targetElementId === targetElementId)
    );

    if (toRemove.length === 0) return 0;

    const newRelationships = relationships.filter(
      r => !toRemove.some(tr => tr.id === r.id)
    );
    this.syncProvider.updateRelationships(newRelationships);

    this.logger.debug(
      'RelationshipService',
      `Removed ${toRemove.length} relationships from document ${documentId}`
    );

    return toRemove.length;
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

    // Get relationship type from project storage
    const relationshipTypeDef = this.getTypeById(
      relationship.relationshipTypeId
    );

    if (!relationshipTypeDef) {
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
      relationshipType: relationshipTypeDef,
      isIncoming,
      displayLabel: getRelationshipLabel(relationshipTypeDef, isIncoming),
    };
  }

  /**
   * Get resolved relationship view with full metadata
   */
  getResolvedRelationshipView(elementId: string): {
    outgoing: ResolvedRelationship[];
    incoming: ResolvedRelationship[];
  } {
    const view = this.getRelationshipView(elementId);

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
    type: Omit<RelationshipTypeDefinition, 'id' | 'isBuiltIn'>
  ): RelationshipTypeDefinition {
    const newType: RelationshipTypeDefinition = {
      ...type,
      id: `custom-${nanoid(8)}`,
      isBuiltIn: false,
    };

    const types = [...this.syncProvider.getCustomRelationshipTypes(), newType];
    this.syncProvider.updateCustomRelationshipTypes(types);

    this.logger.debug(
      'RelationshipService',
      `Added custom relationship type: ${newType.name}`
    );

    return newType;
  }

  /**
   * Add a relationship type with a specific ID (e.g. well-known types like
   * "canvas-pin"). If a type with the same ID already exists, this is a no-op.
   */
  addRawType(type: RelationshipTypeDefinition): void {
    const existing = this.getTypeById(type.id);
    if (existing) return;

    const types = [...this.syncProvider.getCustomRelationshipTypes(), type];
    this.syncProvider.updateCustomRelationshipTypes(types);

    this.logger.debug(
      'RelationshipService',
      `Added raw relationship type: ${type.id} (${type.name})`
    );
  }

  /**
   * Update a relationship type (built-in or custom)
   * All types are now editable since they're stored per-project
   */
  updateCustomType(
    typeId: string,
    updates: Partial<Omit<RelationshipTypeDefinition, 'id' | 'isBuiltIn'>>
  ): boolean {
    const types = this.syncProvider.getCustomRelationshipTypes();
    const index = types.findIndex(t => t.id === typeId);

    if (index === -1) {
      this.logger.warn(
        'RelationshipService',
        `Cannot update type ${typeId}: not found`
      );
      return false;
    }

    const newTypes = types.map((t, i) =>
      i === index ? { ...t, ...updates } : t
    );
    this.syncProvider.updateCustomRelationshipTypes(newTypes);

    this.logger.debug(
      'RelationshipService',
      `Updated relationship type: ${typeId}`
    );

    return true;
  }

  /**
   * Remove a relationship type (built-in or custom)
   * All types are now deletable since they're stored per-project
   */
  removeCustomType(typeId: string): boolean {
    const types = this.syncProvider.getCustomRelationshipTypes();
    const type = types.find(t => t.id === typeId);

    if (!type) {
      this.logger.warn(
        'RelationshipService',
        `Cannot remove type ${typeId}: not found`
      );
      return false;
    }

    const newTypes = types.filter(t => t.id !== typeId);
    this.syncProvider.updateCustomRelationshipTypes(newTypes);

    this.logger.debug(
      'RelationshipService',
      `Removed relationship type: ${typeId}`
    );

    return true;
  }

  /**
   * Get all relationship types stored in the project
   * Types come from project templates at project creation
   */
  getAllTypes(): RelationshipTypeDefinition[] {
    return this.syncProvider.getCustomRelationshipTypes();
  }

  /**
   * Get a relationship type by ID from project storage
   */
  getTypeById(typeId: string): RelationshipTypeDefinition | undefined {
    return this.syncProvider
      .getCustomRelationshipTypes()
      .find(t => t.id === typeId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Utility Methods
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Check if an element has any relationships (outgoing or incoming)
   */
  hasRelationships(elementId: string): boolean {
    const view = this.getRelationshipView(elementId);
    return view.outgoing.length > 0 || view.incoming.length > 0;
  }

  /**
   * Get count of relationships for an element
   */
  getRelationshipCount(elementId: string): {
    outgoing: number;
    incoming: number;
    total: number;
  } {
    const view = this.getRelationshipView(elementId);
    return {
      outgoing: view.outgoing.length,
      incoming: view.incoming.length,
      total: view.outgoing.length + view.incoming.length,
    };
  }

  /**
   * Remove all relationships involving an element
   * Called when an element is deleted
   */
  removeAllRelationshipsForElement(elementId: string): number {
    const relationships = this.syncProvider.getRelationships();
    const toRemove = relationships.filter(
      r => r.sourceElementId === elementId || r.targetElementId === elementId
    );

    if (toRemove.length === 0) return 0;

    const newRelationships = relationships.filter(
      r => !toRemove.some(tr => tr.id === r.id)
    );
    this.syncProvider.updateRelationships(newRelationships);

    this.logger.debug(
      'RelationshipService',
      `Removed ${toRemove.length} relationships for element ${elementId}`
    );

    return toRemove.length;
  }

  /**
   * Observable stream of all relationships
   */
  get relationships$() {
    return this.syncProvider.relationships$;
  }

  /**
   * Observable stream of custom relationship types
   */
  get customRelationshipTypes$() {
    return this.syncProvider.customRelationshipTypes$;
  }
}
