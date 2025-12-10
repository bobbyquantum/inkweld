import { Element } from '@inkweld/index';
import { Observable } from 'rxjs';

import {
  ElementRelationship,
  RelationshipTypeDefinition,
} from '../../components/element-ref/element-ref.model';
import { DocumentSyncState } from '../../models/document-sync-state';
import { PublishPlan } from '../../models/publish-plan';
import { ElementTypeSchema } from '../../models/schema-types';

/**
 * Configuration for connecting to a sync provider
 */
export interface SyncConnectionConfig {
  /** Project owner's username */
  username: string;
  /** Project slug */
  slug: string;
  /** WebSocket URL for server connections (optional for offline mode) */
  webSocketUrl?: string;
}

/**
 * Result of a sync connection attempt
 */
export interface SyncConnectionResult {
  success: boolean;
  error?: string;
}

/**
 * Abstraction for element synchronization.
 *
 * This interface allows swapping between different sync backends:
 * - YjsElementSyncProvider: Real-time sync via Yjs + WebSocket + IndexedDB
 * - OfflineElementSyncProvider: Local-only storage via IndexedDB
 * - MockElementSyncProvider: For testing
 *
 * The provider handles all the complexity of:
 * - Connection management (WebSocket, reconnection logic)
 * - Local persistence (IndexedDB)
 * - Conflict resolution (Yjs CRDTs)
 * - Sync state tracking
 */
export interface IElementSyncProvider {
  /**
   * Connect to the sync backend for a specific project.
   * Must be called before any read/write operations.
   *
   * @param config Connection configuration
   * @returns Promise resolving when initial sync is complete
   */
  connect(config: SyncConnectionConfig): Promise<SyncConnectionResult>;

  /**
   * Disconnect from the current sync session.
   * Cleans up all resources (WebSocket, IndexedDB handles, etc.)
   */
  disconnect(): void;

  /**
   * Check if currently connected to a sync session.
   */
  isConnected(): boolean;

  /**
   * Get the current sync state.
   */
  getSyncState(): DocumentSyncState;

  /**
   * Observable stream of sync state changes.
   */
  syncState$: Observable<DocumentSyncState>;

  /**
   * Get the current elements array.
   * Returns an empty array if not connected.
   */
  getElements(): Element[];

  /**
   * Observable stream of element changes.
   * Emits whenever elements are added, removed, or modified
   * (either locally or from remote sync).
   */
  elements$: Observable<Element[]>;

  /**
   * Update the entire elements array.
   * The provider handles merging/conflict resolution.
   *
   * @param elements The new elements array
   */
  updateElements(elements: Element[]): void;

  /**
   * Observable stream of errors.
   * Emits connection errors, sync errors, etc.
   */
  errors$: Observable<string>;

  // ─────────────────────────────────────────────────────────────────────────────
  // Publish Plans
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get the current publish plans array.
   * Returns an empty array if not connected.
   */
  getPublishPlans(): PublishPlan[];

  /**
   * Observable stream of publish plan changes.
   * Emits whenever plans are added, removed, or modified
   * (either locally or from remote sync).
   */
  publishPlans$: Observable<PublishPlan[]>;

  /**
   * Update the entire publish plans array.
   * The provider handles merging/conflict resolution.
   *
   * @param plans The new publish plans array
   */
  updatePublishPlans(plans: PublishPlan[]): void;

  // ─────────────────────────────────────────────────────────────────────────────
  // Relationships (stored centrally in project elements doc)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get the current relationships array.
   * Returns an empty array if not connected.
   */
  getRelationships(): ElementRelationship[];

  /**
   * Observable stream of relationship changes.
   * Emits whenever relationships are added, removed, or modified.
   */
  relationships$: Observable<ElementRelationship[]>;

  /**
   * Update the entire relationships array.
   * The provider handles merging/conflict resolution.
   *
   * @param relationships The new relationships array
   */
  updateRelationships(relationships: ElementRelationship[]): void;

  // ─────────────────────────────────────────────────────────────────────────────
  // Custom Relationship Types (project-specific)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get the current custom relationship types array.
   * Returns an empty array if not connected.
   */
  getCustomRelationshipTypes(): RelationshipTypeDefinition[];

  /**
   * Observable stream of custom relationship type changes.
   */
  customRelationshipTypes$: Observable<RelationshipTypeDefinition[]>;

  /**
   * Update the entire custom relationship types array.
   *
   * @param types The new custom relationship types array
   */
  updateCustomRelationshipTypes(types: RelationshipTypeDefinition[]): void;

  // ─────────────────────────────────────────────────────────────────────────────
  // Worldbuilding Schemas (project template library)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get the current worldbuilding schemas array.
   * Returns an empty array if not connected.
   */
  getSchemas(): ElementTypeSchema[];

  /**
   * Observable stream of schema changes.
   * Emits whenever schemas are added, removed, or modified.
   */
  schemas$: Observable<ElementTypeSchema[]>;

  /**
   * Update the entire schemas array.
   * The provider handles merging/conflict resolution.
   *
   * @param schemas The new schemas array
   */
  updateSchemas(schemas: ElementTypeSchema[]): void;
}

/**
 * Injection token for the element sync provider.
 * Allows swapping implementations at runtime or in tests.
 */
export const ELEMENT_SYNC_PROVIDER = 'ELEMENT_SYNC_PROVIDER';
