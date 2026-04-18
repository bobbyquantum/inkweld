import { type Element } from '@inkweld/index';
import { type Observable } from 'rxjs';

import {
  type ElementRelationship,
  type RelationshipTypeDefinition,
} from '../../components/element-ref/element-ref.model';
import {
  type ElementTag,
  type TagDefinition,
} from '../../components/tags/tag.model';
import { type DocumentSyncState } from '../../models/document-sync-state';
import { type MediaProjectTag } from '../../models/media-project-tag.model';
import { type MediaTag } from '../../models/media-tag.model';
import { type PublishPlan } from '../../models/publish-plan';
import { type ElementTypeSchema } from '../../models/schema-types';
import { type TimeSystem } from '../../models/time-system';

/**
 * Snapshot of a single user's awareness state, as produced by the sync
 * provider. Used to power presence indicators across collaborative tabs
 * (timeline, canvas, etc.). The provider strips the local client from
 * `remotePresence$` so consumers only see other users.
 */
export interface PresenceUser {
  /** Yjs awareness clientID for the remote peer. */
  clientId: number;
  /** Display name for the user (typically the account username). */
  username: string;
  /** Stable hex color used for cursors / avatars. */
  color: string;
  /**
   * Optional location identifier set by the peer (e.g. `timeline:<elementId>`
   * or `canvas:<elementId>`) so consumers can show only users currently
   * focused on a specific tab.
   */
  location?: string;
}

/**
 * Local awareness fields that can be set on a sync provider. These are
 * broadcast to other peers via the underlying real-time protocol (Yjs
 * awareness). Providers without a real-time backend should treat
 * `setLocalAwareness` as a no-op.
 */
export interface LocalAwarenessFields {
  /** Identity of the local user. Set once per connection. */
  user?: { name: string; color: string } | null;
  /**
   * Current location of the local user inside the project (e.g. which tab
   * they have focused). Pass `null` to clear. Use a stable string key per
   * tab/element so consumers can filter.
   */
  location?: string | null;
}

/**
 * Project metadata stored in Yjs for offline-first sync.
 * This includes fields that need CRDT conflict resolution.
 */
export interface ProjectMeta {
  /** Project display name/title */
  name: string;
  /** Project description */
  description: string;
  /** Media ID of the cover image (stored in local IndexedDB media library) */
  coverMediaId?: string;
  /** Last update timestamp (ISO string) for debugging */
  updatedAt: string;
}

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

  /**
   * Observable of the last connection error message.
   * Useful for displaying in tooltips. Null when no error or after successful connection.
   */
  lastConnectionError$: Observable<string | null>;

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

  // ─────────────────────────────────────────────────────────────────────────────
  // Time Systems (project calendar / time system library)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get the current time systems installed in the project.
   * Returns an empty array if not connected.
   */
  getTimeSystems(): TimeSystem[];

  /**
   * Observable stream of time-system changes.
   * Emits whenever time systems are installed, removed, or modified.
   */
  timeSystems$: Observable<TimeSystem[]>;

  /**
   * Update the entire time-systems array.
   * The provider handles merging/conflict resolution.
   *
   * @param systems The new time systems array
   */
  updateTimeSystems(systems: TimeSystem[]): void;

  // ─────────────────────────────────────────────────────────────────────────────
  // Tags (element tagging system)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get the current element tags array.
   * Returns an empty array if not connected.
   */
  getElementTags(): ElementTag[];

  /**
   * Observable stream of element tag changes.
   * Emits whenever tags are added or removed from elements.
   */
  elementTags$: Observable<ElementTag[]>;

  /**
   * Update the entire element tags array.
   * The provider handles merging/conflict resolution.
   *
   * @param tags The new element tags array
   */
  updateElementTags(tags: ElementTag[]): void;

  /**
   * Get the current custom tag definitions array.
   * Returns an empty array if not connected.
   */
  getCustomTags(): TagDefinition[];

  /**
   * Observable stream of custom tag definition changes.
   */
  customTags$: Observable<TagDefinition[]>;

  /**
   * Update the entire custom tag definitions array.
   *
   * @param tags The new custom tag definitions array
   */
  updateCustomTags(tags: TagDefinition[]): void;

  // ─────────────────────────────────────────────────────────────────────────────
  // Media Tags (media-to-element associations)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get the current media tags array.
   * Returns an empty array if not connected.
   */
  getMediaTags(): MediaTag[];

  /**
   * Observable stream of media tag changes.
   * Emits whenever media items are tagged/untagged from elements.
   */
  mediaTags$: Observable<MediaTag[]>;

  /**
   * Update the entire media tags array.
   * The provider handles merging/conflict resolution.
   *
   * @param tags The new media tags array
   */
  updateMediaTags(tags: MediaTag[]): void;

  // ─────────────────────────────────────────────────────────────────────────────
  // Media Project Tags (media-to-project-tag associations)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get the current media project tags array.
   * Returns an empty array if not connected.
   */
  getMediaProjectTags(): MediaProjectTag[];

  /**
   * Observable stream of media project tag changes.
   * Emits whenever media items are tagged/untagged with project tags.
   */
  mediaProjectTags$: Observable<MediaProjectTag[]>;

  /**
   * Update the entire media project tags array.
   * The provider handles merging/conflict resolution.
   *
   * @param tags The new media project tags array
   */
  updateMediaProjectTags(tags: MediaProjectTag[]): void;

  // ─────────────────────────────────────────────────────────────────────────────
  // Project Metadata (name, description, cover - synced via Yjs for offline-first)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get the current project metadata.
   * Returns undefined if not connected or not yet loaded.
   */
  getProjectMeta(): ProjectMeta | undefined;

  /**
   * Observable stream of project metadata changes.
   * Emits whenever name, description, or cover changes.
   */
  projectMeta$: Observable<ProjectMeta | undefined>;

  /**
   * Update project metadata fields.
   * Only updates the fields provided (partial update).
   *
   * @param meta Partial metadata to update
   */
  updateProjectMeta(meta: Partial<ProjectMeta>): void;

  // ─────────────────────────────────────────────────────────────────────────────
  // Presence / awareness
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Set the local user's awareness fields. Broadcast to other peers via the
   * underlying real-time protocol so they can render presence (cursors,
   * avatars, "X is editing" indicators, etc.).
   *
   * Providers without a real-time backend MUST implement this as a no-op.
   *
   * @param fields Partial awareness fields to merge into the local state.
   */
  setLocalAwareness(fields: LocalAwarenessFields): void;

  /**
   * Observable stream of remote presence users, excluding the local client.
   * Emits whenever any remote peer joins, leaves, or updates their awareness
   * state. Providers without a real-time backend MUST emit an empty array.
   */
  remotePresence$: Observable<PresenceUser[]>;
}

/**
 * Injection token for the element sync provider.
 * Allows swapping implementations at runtime or in tests.
 */
export const ELEMENT_SYNC_PROVIDER = 'ELEMENT_SYNC_PROVIDER';
