import { Element } from '@inkweld/index';
import { Observable } from 'rxjs';

import { DocumentSyncState } from '../../models/document-sync-state';
import { PublishPlan } from '../../models/publish-plan';

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
}

/**
 * Injection token for the element sync provider.
 * Allows swapping implementations at runtime or in tests.
 */
export const ELEMENT_SYNC_PROVIDER = 'ELEMENT_SYNC_PROVIDER';
