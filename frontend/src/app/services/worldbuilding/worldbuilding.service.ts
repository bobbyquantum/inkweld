import { inject, Injectable, signal } from '@angular/core';
import { type Element, ElementType } from '@inkweld/index';
import {
  APPEARANCE_DELETE,
  type BackgroundMode,
  type BackgroundType,
  type ElementAppearance,
} from '@models/element-appearance';
import { schemaContentHash } from '@utils/schema-hash';
import { isWorldbuildingType } from '@utils/worldbuilding.utils';
import { nanoid } from 'nanoid';
import { Subject, type Subscription } from 'rxjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { type WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

import { type ElementTypeSchema } from '../../models/schema-types';
import { AuthTokenService } from '../auth/auth-token.service';
import { LoggerService } from '../core/logger.service';
import { SetupService } from '../core/setup.service';
import { VersionCompatibilityService } from '../core/version-compatibility.service';
import { createAuthenticatedWebsocketProvider } from '../sync/authenticated-websocket-provider';
import { ElementSyncProviderFactory } from '../sync/element-sync-provider.factory';
import { type IElementSyncProvider } from '../sync/element-sync-provider.interface';
import { mergeElementSchema } from './schema-merge';

// Constants for timeouts and intervals
const INDEXEDDB_SYNC_TIMEOUT = 5000;

interface WorldbuildingConnection {
  ydoc: Y.Doc;
  dataMap: Y.Map<unknown>;
  identityMap: Y.Map<unknown>;
  /** The element's own copy of its schema plus drift bookkeeping. */
  schemaMap: Y.Map<unknown>;
  provider?: WebsocketProvider;
  indexeddbProvider: IndexeddbPersistence;
}

/**
 * Common identity data for all worldbuilding elements.
 * This is stored separately from schema-specific data.
 */
export interface WorldbuildingIdentity {
  /** Image URL or asset reference */
  image?: string;
  /** Short description for tooltips and previews */
  description?: string;
  /** Per-element background appearance (menu / content regions) */
  appearance?: ElementAppearance;
}

/**
 * Resolved schema for an element together with how it relates to the shared
 * project schema it was copied from.
 */
export interface ElementSchemaState {
  /** The element's own schema copy (what the editor renders) */
  schema: ElementTypeSchema;
  /** Content hash of the shared schema at copy / last sync time */
  baseHash: string;
  /** The shared project schema, or null if it has since been deleted */
  sharedSchema: ElementTypeSchema | null;
  /** True when the element copy differs from the shared schema it came from */
  isCustom: boolean;
  /** True when the shared schema has changed since the element last synced */
  sharedUpdated: boolean;
}

/** Keys of the per-element `schema` Yjs map. */
const SCHEMA_SNAPSHOT_KEY = 'snapshot';
const SCHEMA_BASE_HASH_KEY = 'baseHash';
const SCHEMA_BASE_ID_KEY = 'baseSchemaId';

@Injectable({
  providedIn: 'root',
})
export class WorldbuildingService {
  private readonly setupService = inject(SetupService);
  private readonly syncProviderFactory = inject(ElementSyncProviderFactory);
  private readonly authTokenService = inject(AuthTokenService);
  private readonly versionCompatibility = inject(VersionCompatibilityService);
  private readonly logger = inject(LoggerService);

  // Per-element worldbuilding data connections (each element has its own Yjs doc)
  private readonly connections = new Map<string, WorldbuildingConnection>();

  /**
   * Emits the connection key (username:slug:elementId) whenever a local edit
   * is applied to a worldbuilding element. Used by AutoSnapshotService to track
   * which elements were modified during a session.
   */
  readonly localEdit$ = new Subject<string>();

  // Pending connection promises to prevent race conditions
  private readonly pendingConnections = new Map<
    string,
    Promise<Y.Map<unknown>>
  >();

  // Current sync provider (used for schema library access)
  private syncProvider: IElementSyncProvider | null = null;
  private schemasCache: ElementTypeSchema[] = [];
  private schemasSubscription: Subscription | null = null;

  /** Reactive schema signal, updated whenever the sync provider emits */
  private readonly schemasCacheSignal = signal<ElementTypeSchema[]>([]);
  /** Exposed as readonly for reactive consumers */
  readonly schemas = this.schemasCacheSignal.asReadonly();

  /**
   * Set the sync provider for schema library access.
   * Called by ProjectStateService when a project is loaded.
   */
  setSyncProvider(provider: IElementSyncProvider | null): void {
    // Clean up existing subscription
    if (this.schemasSubscription) {
      this.schemasSubscription.unsubscribe();
      this.schemasSubscription = null;
    }

    this.syncProvider = provider;
    if (provider) {
      this.schemasCache = provider.getSchemas();
      this.schemasCacheSignal.set(provider.getSchemas());
      // Subscribe to schema changes
      this.schemasSubscription = provider.schemas$.subscribe(schemas => {
        this.schemasCache = schemas;
        this.schemasCacheSignal.set(schemas);
      });
    } else {
      this.schemasCache = [];
      this.schemasCacheSignal.set([]);
    }
  }

  /**
   * Get the sync provider (for internal use)
   */
  private getSyncProvider(): IElementSyncProvider | null {
    return this.syncProvider;
  }

  /**
   * Build a connection key for the connections map.
   * Includes project context to prevent cross-project collisions.
   */
  private buildConnectionKey(
    elementId: string,
    username: string,
    slug: string
  ): string {
    return `${username}:${slug}:${elementId}`;
  }

  /**
   * Return all schemas currently loaded for the active project.
   * Useful for populating filter dropdowns, schema pickers, etc.
   */
  getSchemas(): ElementTypeSchema[] {
    return this.schemas();
  }

  /**
   * Quick lookup for a schema by ID from the current cache.
   * This is a lightweight method for synchronous icon resolution.
   * @param schemaId - The schema ID to look up
   */
  getSchemaById(schemaId: string): ElementTypeSchema | null {
    return this.schemasCache.find(s => s.id === schemaId) ?? null;
  }

  /**
   * Resolve the Material icon for a worldbuilding schema, falling back to
   * the generic `category` icon for unknown or missing schema IDs.
   * @param schemaId - The schema ID to resolve (e.g. 'character-v1')
   */
  getSchemaIcon(schemaId: string | undefined): string {
    if (!schemaId) return 'category';
    return this.getSchemaById(schemaId)?.icon ?? 'category';
  }

  /**
   * Set up real-time collaboration for a worldbuilding element
   * @param elementId - The element ID
   * @param username - Project username
   * @param slug - Project slug
   */
  private async setupCollaboration(
    elementId: string,
    username: string,
    slug: string
  ): Promise<Y.Map<unknown>> {
    // Create a unique connection key that includes project context
    const connectionKey = `${username}:${slug}:${elementId}`;

    // Check for existing connection first (fast path)
    const existingConnection = this.connections.get(connectionKey);
    if (existingConnection) {
      return existingConnection.dataMap;
    }

    // Check for pending connection setup (race condition prevention)
    const pendingPromise = this.pendingConnections.get(connectionKey);
    if (pendingPromise) {
      return pendingPromise;
    }

    // Create the connection setup promise
    const setupPromise = this.createConnection(
      connectionKey,
      elementId,
      username,
      slug
    );
    this.pendingConnections.set(connectionKey, setupPromise);

    try {
      const dataMap = await setupPromise;
      return dataMap;
    } finally {
      // Clean up pending promise after it resolves
      this.pendingConnections.delete(connectionKey);
    }
  }

  private async createConnection(
    connectionKey: string,
    elementId: string,
    username: string,
    slug: string
  ): Promise<Y.Map<unknown>> {
    const ydoc = new Y.Doc();
    const dataMap = ydoc.getMap('worldbuilding');
    const identityMap = ydoc.getMap('identity');
    const schemaMap = ydoc.getMap('schema');

    // Initialize IndexedDB provider for offline persistence
    // Include project key to prevent cross-project data collisions
    const dbKey = `worldbuilding:${username}:${slug}:${elementId}`;
    const indexeddbProvider = new IndexeddbPersistence(dbKey, ydoc);

    // Wait for IndexedDB sync with timeout
    const syncPromise = indexeddbProvider.whenSynced;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('IndexedDB sync timeout')),
        INDEXEDDB_SYNC_TIMEOUT
      )
    );

    try {
      await Promise.race([syncPromise, timeoutPromise]);
      this.logger.debug(
        'WorldbuildingService',
        `IndexedDB synced for ${elementId}`
      );
    } catch {
      this.logger.debug(
        'WorldbuildingService',
        `IndexedDB timeout for ${elementId}`
      );
      // Continue anyway - the document may be empty/new
    }

    // Setup WebSocket provider if not in offline mode
    const provider = await this.tryCreateWebSocketProvider(
      elementId,
      username,
      slug,
      ydoc,
      dataMap
    );

    // Wait for WebSocket sync to complete before returning, so callers
    // don't read an empty dataMap and overwrite server data with defaults.
    if (provider && !provider.synced) {
      await new Promise<void>(resolve => {
        const onSync = (isSynced: boolean) => {
          if (isSynced) {
            provider.off('sync', onSync);
            clearTimeout(timeoutId);
            resolve();
          }
        };
        provider.on('sync', onSync);
        // Safety timeout — don't block forever if server is unreachable
        const timeoutId = setTimeout(() => {
          provider.off('sync', onSync);
          resolve();
        }, 10000);
      });
    }

    const connection: WorldbuildingConnection = {
      ydoc,
      dataMap,
      identityMap,
      schemaMap,
      provider,
      indexeddbProvider,
    };

    // Track local edits for auto-snapshots (same pattern as DocumentService)
    ydoc.on('update', (_update: Uint8Array, origin: unknown) => {
      // Skip updates from IndexedDB (loading persisted state)
      // or from the WebSocket provider (remote edits).
      // Everything else is a local edit.
      if (origin !== indexeddbProvider && origin !== connection.provider) {
        this.localEdit$.next(connectionKey);
      }
    });

    this.connections.set(connectionKey, connection);

    return dataMap;
  }

  private async tryCreateWebSocketProvider(
    elementId: string,
    username: string,
    slug: string,
    ydoc: Y.Doc,
    _dataMap: Y.Map<unknown>
  ): Promise<WebsocketProvider | undefined> {
    const mode = this.setupService.getMode();
    const wsUrl = this.setupService.getWebSocketUrl();
    if (mode === 'local' || !wsUrl || !username || !slug) {
      return undefined;
    }

    const authToken = this.authTokenService.getToken();
    const syncBlocked = this.versionCompatibility.syncBlocked();
    if (!authToken || syncBlocked) {
      return undefined;
    }

    // Build full document ID in format: username:slug:elementId/
    // Note: trailing slash is required to match backend document ID format
    const formattedId = `${username}:${slug}:${elementId}/`.replace(/^\/+/, '');
    const fullWsUrl = `${wsUrl}/api/v1/ws/yjs?documentId=${formattedId}`;

    try {
      const provider = await createAuthenticatedWebsocketProvider(
        fullWsUrl,
        '', // Empty room name - documentId is already in URL
        ydoc,
        authToken,
        {}
      );

      return provider;
    } catch (error) {
      console.error(
        '[WorldbuildingService] Failed to create authenticated WebSocket:',
        error
      );
      return undefined;
    }
  }

  /**
   * Get the Yjs document for a worldbuilding element.
   *
   * Returns the active connection's ydoc if connected, or null if not connected.
   * Unlike prose documents, worldbuilding docs are always loaded via setupCollaboration.
   *
   * @param elementId - The element ID
   * @param username - Project username
   * @param slug - Project slug
   * @returns The Yjs document or null if not connected
   */
  getYDoc(elementId: string, username: string, slug: string): Y.Doc | null {
    const connectionKey = this.buildConnectionKey(elementId, username, slug);
    const connection = this.connections.get(connectionKey);
    if (connection) {
      return connection.ydoc;
    }
    return null;
  }

  /**
   * Get the worldbuilding data for an element from its YJS document
   */
  async getWorldbuildingData(
    elementId: string,
    username: string,
    slug: string
  ): Promise<Record<string, unknown> | null> {
    const dataMap = await this.setupCollaboration(elementId, username, slug);
    const jsonData = dataMap.toJSON();

    return jsonData || null;
  }

  /**
   * Observe changes to a worldbuilding element's Yjs data
   * @param elementId - The element ID to observe
   * @param callback - Function called when data changes
   * @returns Cleanup function to stop observing
   */
  async observeChanges(
    elementId: string,
    callback: (data: Record<string, unknown>) => void,
    username: string,
    slug: string
  ): Promise<() => void> {
    const dataMap = await this.setupCollaboration(elementId, username, slug);

    const observer = () => {
      const jsonData = dataMap.toJSON();
      callback(jsonData);
    };

    dataMap.observe(observer);

    // Return cleanup function
    return () => {
      dataMap.unobserve(observer);
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Identity Data (common fields for all worldbuilding elements)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get the identity data for a worldbuilding element
   */
  async getIdentityData(
    elementId: string,
    username: string,
    slug: string
  ): Promise<WorldbuildingIdentity> {
    await this.setupCollaboration(elementId, username, slug);
    const connectionKey = this.buildConnectionKey(elementId, username, slug);
    const connection = this.connections.get(connectionKey);
    if (!connection) {
      return {};
    }

    const identityMap = connection.identityMap;
    return {
      image: identityMap.get('image') as string | undefined,
      description: identityMap.get('description') as string | undefined,
      appearance: this.readAppearance(identityMap),
    };
  }

  private readAppearance(map: Y.Map<unknown>): ElementAppearance | undefined {
    const raw = map.get('appearance');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    // The appearance is stored as a nested Y.Map; normalise to a plain
    // object so we can read each region.
    const source =
      raw instanceof Y.Map
        ? (raw.toJSON() as Record<string, unknown>)
        : (raw as Record<string, unknown>);
    const result: ElementAppearance = {};
    for (const region of ['menu', 'content'] as const) {
      const setting = source[region];
      if (setting && typeof setting === 'object' && !Array.isArray(setting)) {
        const s = setting as Record<string, unknown>;
        const type = s['type'] as BackgroundType;
        const mode = s['mode'] as BackgroundMode;
        if (
          (type === 'color' || type === 'gradient' || type === 'image') &&
          (mode === 'auto' || mode === 'manual')
        ) {
          result[region] = {
            type,
            mode,
            value: s['value'] as string | undefined,
            light: s['light'] as string | undefined,
            dark: s['dark'] as string | undefined,
            intensity:
              typeof s['intensity'] === 'number' ? s['intensity'] : undefined,
          };
        }
      }
    }
    return result.menu || result.content ? result : undefined;
  }

  /**
   * Save identity data for a worldbuilding element
   */
  async saveIdentityData(
    elementId: string,
    data: Partial<WorldbuildingIdentity>,
    username: string,
    slug: string
  ): Promise<void> {
    await this.setupCollaboration(elementId, username, slug);
    const connectionKey = this.buildConnectionKey(elementId, username, slug);
    const connection = this.connections.get(connectionKey);
    if (!connection) {
      return;
    }

    const identityMap = connection.identityMap;
    connection.ydoc.transact(() => {
      if (data.image !== undefined) {
        identityMap.set('image', data.image);
      } else if ('image' in data) {
        // An explicit `image: undefined` clears the identity image.
        identityMap.delete('image');
      }
      if (data.description !== undefined) {
        identityMap.set('description', data.description);
      }
      if (data.appearance !== undefined) {
        this.setNestedYjsMap(
          identityMap,
          'appearance',
          data.appearance as unknown as Record<string, unknown>
        );
      }
    });
  }

  /**
   * Store a nested object on a Y.Map as a nested Y.Map so each field syncs
   * individually (rather than the whole object being replaced).
   *
   * Missing keys are left untouched so a partial update (e.g. saving only
   * the `menu` region) does not wipe sibling data (e.g. `content`). The
   * identity panel is responsible for passing the full region object it
   * intends to write, including an empty region object to clear it.
   */
  private setNestedYjsMap(
    map: Y.Map<unknown>,
    key: string,
    value: Record<string, unknown>
  ): void {
    const existing = map.get(key);
    let nested: Y.Map<unknown>;
    if (existing instanceof Y.Map) {
      nested = existing;
    } else {
      nested = new Y.Map();
      map.set(key, nested);
    }
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined || v === null || v === APPEARANCE_DELETE) {
        nested.delete(k);
      } else if (v && typeof v === 'object' && !Array.isArray(v)) {
        this.setNestedYjsMap(nested, k, v as Record<string, unknown>);
      } else {
        nested.set(k, v);
      }
    }
  }

  /**
   * Observe changes to identity data
   */
  async observeIdentityChanges(
    elementId: string,
    callback: (data: WorldbuildingIdentity) => void,
    username: string,
    slug: string
  ): Promise<() => void> {
    await this.setupCollaboration(elementId, username, slug);
    const connectionKey = this.buildConnectionKey(elementId, username, slug);
    const connection = this.connections.get(connectionKey);
    if (!connection) {
      return () => {};
    }

    const identityMap = connection.identityMap;
    const observer = () => {
      callback({
        image: identityMap.get('image') as string | undefined,
        description: identityMap.get('description') as string | undefined,
        appearance: this.readAppearance(identityMap),
      });
    };

    identityMap.observeDeep(observer);
    return () => identityMap.unobserveDeep(observer);
  }

  /**
   * Save worldbuilding data to a YJS document
   */
  async saveWorldbuildingData(
    elementId: string,
    data: Record<string, unknown>,
    username: string,
    slug: string
  ): Promise<void> {
    const dataMap = await this.setupCollaboration(elementId, username, slug);
    const connectionKey = this.buildConnectionKey(elementId, username, slug);
    const connection = this.connections.get(connectionKey)!;

    // Perform transaction to update all fields
    connection.ydoc.transact(() => {
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined) {
          this.setYjsValue(dataMap, key, value);
        }
      }

      // Update lastModified timestamp
      dataMap.set('lastModified', new Date().toISOString());
    });
    // Data is automatically synced via WebSocket and IndexedDB
  }

  private setYjsValue(
    dataMap: Y.Map<unknown>,
    key: string,
    value: unknown
  ): void {
    if (Array.isArray(value)) {
      const yArray = new Y.Array();
      value.forEach(item => yArray.push([item]));
      dataMap.set(key, yArray);
      return;
    }

    if (typeof value === 'object' && value !== null) {
      this.setYjsNestedObject(dataMap, key, value as Record<string, unknown>);
      return;
    }

    dataMap.set(key, value);
  }

  private setYjsNestedObject(
    dataMap: Y.Map<unknown>,
    key: string,
    obj: Record<string, unknown>
  ): void {
    const existingMap = dataMap.get(key);
    let nestedMap: Y.Map<unknown>;
    if (existingMap instanceof Y.Map) {
      nestedMap = existingMap;
    } else {
      nestedMap = new Y.Map();
      dataMap.set(key, nestedMap);
    }
    for (const [nestedKey, nestedValue] of Object.entries(obj)) {
      if (Array.isArray(nestedValue)) {
        const yArray = new Y.Array();
        nestedValue.forEach(item => yArray.push([item]));
        nestedMap.set(nestedKey, yArray);
      } else {
        nestedMap.set(nestedKey, nestedValue);
      }
    }
  }

  /**
   * Initialize a new worldbuilding element with default data
   * Uses the project's schema library to get the template
   */
  async initializeWorldbuildingElement(
    element: Element,
    username: string,
    slug: string
  ): Promise<void> {
    if (!element.id || !isWorldbuildingType(element.type)) {
      return;
    }

    const dataMap = await this.setupCollaboration(element.id, username, slug);

    // Check if already initialized (has a 'schemaId' field)
    if (dataMap.has('schemaId')) {
      this.logger.debug(
        'WorldbuildingService',
        `Element ${element.id} already initialized, skipping`
      );
      return;
    }

    this.logger.debug(
      'WorldbuildingService',
      `Initializing element ${element.id}`
    );

    // Get the schema from the project's template library
    const projectKey = username && slug ? `${username}:${slug}` : 'default';
    const schemaId = element.schemaId;

    if (!schemaId) {
      return;
    }

    // Check if schema library is empty and auto-load defaults if needed
    const schema = this.getSchemaFromLibrary(
      projectKey,
      schemaId,
      username,
      slug
    );

    const connectionKey = this.buildConnectionKey(element.id, username, slug);
    const connection = this.connections.get(connectionKey)!;

    connection.ydoc.transact(() => {
      if (schema) {
        // Store the schema ID reference and the element's own schema copy
        dataMap.set('schemaId', schema.id);
        this.writeSchemaCopy(connection.schemaMap, schema);
        if (schema.defaultValues) {
          Object.entries(schema.defaultValues).forEach(([key, value]) => {
            dataMap.set(key, value);
          });
        }

        // Copy the schema's default appearance into the element's identity so
        // new elements start themed; it can be overridden per element later.
        if (schema.defaultAppearance) {
          this.setNestedYjsMap(
            connection.identityMap,
            'appearance',
            schema.defaultAppearance as unknown as Record<string, unknown>
          );
        }

        // Copy the schema's default identity image so new elements start with it.
        if (schema.defaultImage) {
          connection.identityMap.set('image', schema.defaultImage);
        }

        // Initialize fields based on schema (including nested structures)
        schema.tabs.forEach(tab => {
          tab.fields?.forEach(field => {
            const fieldKey = field.key;

            // Relationship fields live in the central relationships store,
            // never in the element data map.
            if (field.type === 'relationship') {
              return;
            }

            // Handle nested fields (e.g., 'appearance.height')
            if (fieldKey.includes('.')) {
              const [parentKey, childKey] = fieldKey.split('.');

              // Get or create parent Y.Map
              const existingParent = dataMap.get(parentKey);
              let parentMap: Y.Map<unknown>;
              if (existingParent instanceof Y.Map) {
                parentMap = existingParent;
              } else {
                parentMap = new Y.Map();
                dataMap.set(parentKey, parentMap);
              }

              // Initialize the child field
              if (field.type === 'array') {
                parentMap.set(childKey, new Y.Array());
              } else if (!parentMap.has(childKey)) {
                // Only set if not already present
                parentMap.set(childKey, '');
              }
            } else if (
              field.type === 'array' &&
              (!dataMap.has(fieldKey) || dataMap.get(fieldKey) == null)
            ) {
              // Handle top-level array fields without overriding schema defaults
              dataMap.set(fieldKey, new Y.Array());
            } else if (!dataMap.has(fieldKey)) {
              // Handle top-level non-array fields (only set if not already present)
              dataMap.set(fieldKey, '');
            }
          });
        });
      }

      // Set common fields
      dataMap.set('id', element.id);
      dataMap.set('name', element.name);
      dataMap.set('createdDate', new Date().toISOString());
      dataMap.set('lastModified', new Date().toISOString());
    });
  }

  /**
   * Get a list of all elements of a specific worldbuilding type
   */
  getElementsOfType(_type: ElementType): Promise<Element[]> {
    // This would typically query from the project state service
    // For now, returning empty array as placeholder
    return Promise.resolve([]);
  }

  /**
   * Search for related elements (for linking)
   */
  searchRelatedElements(
    _query: string,
    _types?: ElementType[]
  ): Promise<Element[]> {
    // This would typically perform a search across elements
    // For now, returning empty array as placeholder
    return Promise.resolve([]);
  }

  /**
   * Export worldbuilding data to JSON
   */
  async exportToJSON(
    elementId: string,
    username: string,
    slug: string
  ): Promise<string> {
    const data = await this.getWorldbuildingData(elementId, username, slug);
    return JSON.stringify(data, null, 2);
  }

  /**
   * Import worldbuilding data from JSON
   */
  async importFromJSON(
    elementId: string,
    jsonData: string,
    username: string,
    slug: string
  ): Promise<void> {
    try {
      const data = JSON.parse(jsonData) as Record<string, unknown>;
      await this.saveWorldbuildingData(elementId, data, username, slug);
    } catch (error) {
      console.error('Error importing worldbuilding data:', error);
      throw new Error('Invalid JSON data', { cause: error });
    }
  }

  /**
   * Get a schema from the project's library by element type.
   * Uses the sync provider's schema cache.
   */
  getSchemaFromLibrary(
    _projectKey: string,
    schemaId: string,
    _username?: string,
    _slug?: string
  ): ElementTypeSchema | null {
    // Use the sync provider's schema cache
    const schemas = this.schemasCache;

    if (schemas.length === 0) {
      console.warn('[SchemaLibrary] No schemas found in library');
      return null;
    }

    const schema = schemas.find(s => s.id === schemaId);
    if (!schema) {
      console.warn(
        `[SchemaLibrary] No schema found for ID "${schemaId}". Available: ${schemas.map(s => s.id).join(', ')}`
      );
      return null;
    }

    return schema;
  }

  /**
   * Check if the schema library is empty.
   * Uses the sync provider's schema cache.
   */
  isSchemaLibraryEmpty(): boolean {
    return this.schemasCache.length === 0;
  }

  /**
   * Clone a template in the project's schema library
   * Creates a new custom template based on an existing one
   */
  cloneTemplate(
    sourceSchemaId: string,
    newName: string,
    newDescription?: string
  ): ElementTypeSchema {
    // Find source schema from cache by ID
    const sourceSchema = this.schemasCache.find(s => s.id === sourceSchemaId);
    if (!sourceSchema) {
      throw new Error(`Template with ID ${sourceSchemaId} not found`);
    }

    // Create a new unique ID for the cloned template
    const timestamp = Date.now();
    const newId = `custom-${timestamp}`;
    const now = new Date().toISOString();

    // Deep-clone the tabs so the copy never mutates the source template.
    // Relationship fields get fresh backing-type ids so the clone manages its
    // own relationship types instead of sharing the source's.
    const clonedTabs = structuredClone(sourceSchema.tabs);
    for (const tab of clonedTabs) {
      for (const field of tab.fields ?? []) {
        if (field.type === 'relationship' && field.relationshipTypeId) {
          field.relationshipTypeId = `fieldrel-${nanoid(10)}`;
        }
      }
    }

    // Clone the schema as a plain object
    const clonedSchema: ElementTypeSchema = {
      id: newId,
      name: newName,
      icon: sourceSchema.icon,
      description: newDescription || `Clone of ${sourceSchema.name}`,
      version: 1,
      tabs: clonedTabs,
      defaultValues: sourceSchema.defaultValues
        ? structuredClone(sourceSchema.defaultValues)
        : undefined,
      defaultAppearance: sourceSchema.defaultAppearance
        ? structuredClone(sourceSchema.defaultAppearance)
        : undefined,
      defaultImage: sourceSchema.defaultImage,
      createdAt: now,
      updatedAt: now,
    };

    // Save via sync provider
    if (this.syncProvider) {
      const allSchemas = [...this.schemasCache, clonedSchema];
      this.syncProvider.updateSchemas(allSchemas);
      // Update local cache immediately
      this.schemasCache = allSchemas;
      this.schemasCacheSignal.set(allSchemas);
    } else {
      throw new Error('No sync provider available');
    }

    return clonedSchema;
  }

  /**
   * Delete a template from the library.
   * All templates are now deletable since they're stored per-project.
   */
  deleteTemplate(schemaId: string): void {
    const schemaExists = this.schemasCache.some(s => s.id === schemaId);
    if (!schemaExists) {
      throw new Error(`Template with ID ${schemaId} not found`);
    }

    // Remove from schemas and update via sync provider
    if (this.syncProvider) {
      const filteredSchemas = this.schemasCache.filter(s => s.id !== schemaId);
      this.syncProvider.updateSchemas(filteredSchemas);
      // Update local cache immediately
      this.schemasCache = filteredSchemas;
      this.schemasCacheSignal.set(filteredSchemas);
    } else {
      throw new Error('No sync provider available');
    }
  }

  /**
   * Update a template in the library.
   * All templates are now editable since they're stored per-project.
   */
  updateTemplate(
    schemaId: string,
    updates: Partial<ElementTypeSchema>
  ): ElementTypeSchema {
    const schemaIndex = this.schemasCache.findIndex(s => s.id === schemaId);
    if (schemaIndex === -1) {
      throw new Error(`Template with ID ${schemaId} not found`);
    }

    const existingSchema = this.schemasCache[schemaIndex];

    // Create updated schema
    const updatedSchema: ElementTypeSchema = {
      ...existingSchema,
      ...updates,
      // Preserve immutable fields
      id: existingSchema.id,
      createdAt: existingSchema.createdAt,
      // Increment version
      version: (existingSchema.version || 1) + 1,
      updatedAt: new Date().toISOString(),
    };

    // Update via sync provider
    if (this.syncProvider) {
      const allSchemas = [...this.schemasCache];
      allSchemas[schemaIndex] = updatedSchema;
      this.syncProvider.updateSchemas(allSchemas);
      // Update local cache immediately
      this.schemasCache = allSchemas;
      this.schemasCacheSignal.set(allSchemas);
    } else {
      throw new Error('No sync provider available');
    }

    return updatedSchema;
  }

  /**
   * Get the icon for an element type (built-in or custom)
   * For custom types, looks up the icon from the schema library
   * For built-in types, returns the default icon
   */
  getIconForType(
    elementType: string,
    username?: string,
    slug?: string
  ): string {
    // Default icons for built-in types
    const builtInIcons: Record<string, string> = {
      CHARACTER: 'person',
      LOCATION: 'place',
      WB_ITEM: 'category',
      MAP: 'map',
      RELATIONSHIP: 'diversity_1',
      PHILOSOPHY: 'auto_stories',
      CULTURE: 'groups',
      SPECIES: 'pets',
      SYSTEMS: 'settings',
      [ElementType.Item]: 'description',
      [ElementType.Folder]: 'folder',
      [ElementType.RelationshipChart]: 'hub',
      [ElementType.Canvas]: 'dashboard',
      [ElementType.Timeline]: 'timeline',
    };

    // Check if it's a built-in type
    if (builtInIcons[elementType]) {
      return builtInIcons[elementType];
    }

    // For custom types, look up in schema library
    if (elementType.startsWith('CUSTOM_') && username && slug) {
      try {
        const projectKey = `${username}:${slug}`;
        const schema = this.getSchemaFromLibrary(
          projectKey,
          elementType,
          username,
          slug
        );
        if (schema?.icon) {
          return schema.icon;
        }
      } catch {
        // Fallback to default icon on error
      }
    }

    // Fallback to default icon
    return 'description';
  }

  // ============================================================================
  // PUBLIC ABSTRACTION LAYER - Hide Yjs types from consumers
  // ============================================================================

  /**
   * Get the schema ID stored in a worldbuilding element.
   * Returns the schema ID reference, not the full schema.
   * Use getSchemaForElement() to get the full schema from the project library.
   * @param elementId - The element ID
   * @param username - Project username
   * @param slug - Project slug
   * @returns The schema ID string or null if not found
   */
  async getElementSchemaId(
    elementId: string,
    username: string,
    slug: string
  ): Promise<string | null> {
    try {
      await this.setupCollaboration(elementId, username, slug);
      const connectionKey = this.buildConnectionKey(elementId, username, slug);
      const connection = this.connections.get(connectionKey);
      if (!connection?.ydoc) {
        console.warn(`[Worldbuilding] No connection for element ${elementId}`);
        return null;
      }
      const dataMap = connection.ydoc.getMap('worldbuilding');
      const schemaId = (dataMap.get('schemaId') as string) || null;
      return schemaId;
    } catch {
      return null;
    }
  }

  /**
   * Get the schema a worldbuilding element should render: its own copy.
   * Elements without a copy yet (created before per-element schemas, or after
   * a revert) get the shared project schema copied in on the spot.
   */
  async getSchemaForElement(
    elementId: string,
    username: string,
    slug: string
  ): Promise<ElementTypeSchema | null> {
    const state = await this.getElementSchemaState(elementId, username, slug);
    return state?.schema ?? null;
  }

  /**
   * Resolve the element's schema copy and how it relates to the shared
   * project schema. Performs the recovery path when no copy exists: the
   * shared schema (by the element's `schemaId`) is copied into the element
   * doc and becomes the base. Returns null when the element has no schemaId
   * or the shared schema cannot be found and there is no copy to fall back on.
   */
  async getElementSchemaState(
    elementId: string,
    username: string,
    slug: string
  ): Promise<ElementSchemaState | null> {
    await this.setupCollaboration(elementId, username, slug);
    const connectionKey = this.buildConnectionKey(elementId, username, slug);
    const connection = this.connections.get(connectionKey);
    if (!connection) return null;

    const schemaId = (connection.dataMap.get('schemaId') as string) || null;
    if (!schemaId) {
      console.warn(
        `[Worldbuilding] No schema ID found for element ${elementId}`
      );
      return null;
    }

    const shared = this.getSchemaById(schemaId);
    let copy = this.readSchemaCopy(connection.schemaMap);

    if (!copy) {
      if (!shared) {
        console.warn(
          `[Worldbuilding] Shared schema ${schemaId} not found and element ${elementId} has no schema copy`
        );
        return null;
      }
      connection.ydoc.transact(() => {
        this.writeSchemaCopy(connection.schemaMap, shared);
      });
      copy = this.readSchemaCopy(connection.schemaMap)!;
    }

    return this.buildSchemaState(copy, shared, connection.schemaMap);
  }

  /**
   * Persist an edited schema copy for an element. The base hash is left
   * untouched so the element reads as "custom" until it is next synced.
   */
  async saveElementSchema(
    elementId: string,
    schema: ElementTypeSchema,
    username: string,
    slug: string
  ): Promise<ElementSchemaState | null> {
    const connection = await this.requireConnection(elementId, username, slug);
    if (!connection) return null;
    connection.ydoc.transact(() => {
      connection.schemaMap.set(SCHEMA_SNAPSHOT_KEY, structuredClone(schema));
    });
    connection.dataMap.set('lastModified', new Date().toISOString());
    return this.buildSchemaState(
      schema,
      this.getSchemaById(connection.dataMap.get('schemaId') as string),
      connection.schemaMap
    );
  }

  /**
   * Update an element's schema copy from the shared project schema. Shared
   * definitions win for tabs and fields present in both; local-only tabs and
   * fields are kept. The base hash is reset to the shared schema, so the
   * element reads as "shared" again unless it had local additions.
   */
  async syncElementSchema(
    elementId: string,
    username: string,
    slug: string
  ): Promise<ElementSchemaState | null> {
    const connection = await this.requireConnection(elementId, username, slug);
    if (!connection) return null;
    const shared = this.getSchemaById(
      connection.dataMap.get('schemaId') as string
    );
    const copy = this.readSchemaCopy(connection.schemaMap);
    if (!shared || !copy) return null;

    const state = this.buildSchemaState(copy, shared, connection.schemaMap);
    const merged = state.isCustom
      ? mergeElementSchema(copy, shared)
      : structuredClone(shared);

    connection.ydoc.transact(() => {
      connection.schemaMap.set(SCHEMA_SNAPSHOT_KEY, merged);
      connection.schemaMap.set(SCHEMA_BASE_HASH_KEY, schemaContentHash(shared));
      connection.schemaMap.set(SCHEMA_BASE_ID_KEY, shared.id);
    });
    return this.buildSchemaState(merged, shared, connection.schemaMap);
  }

  /**
   * Discard the element's schema copy so it follows the shared schema again.
   * The copy is re-created from the shared schema immediately.
   */
  async revertElementSchema(
    elementId: string,
    username: string,
    slug: string
  ): Promise<ElementSchemaState | null> {
    const connection = await this.requireConnection(elementId, username, slug);
    if (!connection) return null;
    connection.ydoc.transact(() => {
      connection.schemaMap.delete(SCHEMA_SNAPSHOT_KEY);
      connection.schemaMap.delete(SCHEMA_BASE_HASH_KEY);
      connection.schemaMap.delete(SCHEMA_BASE_ID_KEY);
    });
    return this.getElementSchemaState(elementId, username, slug);
  }

  /**
   * Observe changes to the element's schema copy (e.g. a collaborator editing
   * the element schema). Returns an unsubscribe function.
   */
  async observeElementSchema(
    elementId: string,
    callback: (schema: ElementTypeSchema | null) => void,
    username: string,
    slug: string
  ): Promise<() => void> {
    const connection = await this.requireConnection(elementId, username, slug);
    if (!connection) return () => {};
    const observer = () => {
      callback(this.readSchemaCopy(connection.schemaMap));
    };
    connection.schemaMap.observe(observer);
    return () => connection.schemaMap.unobserve(observer);
  }

  /** Read the raw schema map for archive export. */
  async getElementSchemaCopy(
    elementId: string,
    username: string,
    slug: string
  ): Promise<{ schema: ElementTypeSchema; baseHash: string } | null> {
    const connection = await this.requireConnection(elementId, username, slug);
    if (!connection) return null;
    const schema = this.readSchemaCopy(connection.schemaMap);
    if (!schema) return null;
    return {
      schema,
      baseHash:
        (connection.schemaMap.get(SCHEMA_BASE_HASH_KEY) as string) ?? '',
    };
  }

  private async requireConnection(
    elementId: string,
    username: string,
    slug: string
  ): Promise<WorldbuildingConnection | null> {
    await this.setupCollaboration(elementId, username, slug);
    return (
      this.connections.get(
        this.buildConnectionKey(elementId, username, slug)
      ) ?? null
    );
  }

  /** Write a shared schema into an element's schema map as its new base. */
  private writeSchemaCopy(
    schemaMap: Y.Map<unknown>,
    shared: ElementTypeSchema
  ): void {
    schemaMap.set(SCHEMA_SNAPSHOT_KEY, structuredClone(shared));
    schemaMap.set(SCHEMA_BASE_HASH_KEY, schemaContentHash(shared));
    schemaMap.set(SCHEMA_BASE_ID_KEY, shared.id);
  }

  private readSchemaCopy(schemaMap: Y.Map<unknown>): ElementTypeSchema | null {
    const raw = schemaMap.get(SCHEMA_SNAPSHOT_KEY);
    if (!raw || typeof raw !== 'object') return null;
    const copy = raw as ElementTypeSchema;
    return Array.isArray(copy.tabs) ? structuredClone(copy) : null;
  }

  private buildSchemaState(
    copy: ElementTypeSchema,
    shared: ElementTypeSchema | null,
    schemaMap: Y.Map<unknown>
  ): ElementSchemaState {
    const copyHash = schemaContentHash(copy);
    const base =
      (schemaMap.get(SCHEMA_BASE_HASH_KEY) as string | undefined) ?? copyHash;
    return {
      schema: copy,
      baseHash: base,
      sharedSchema: shared,
      isCustom: copyHash !== base,
      sharedUpdated: shared ? schemaContentHash(shared) !== base : false,
    };
  }

  /**
   * Get all schemas from the project's schema library as plain objects.
   * Uses the sync provider's schema cache.
   * @returns Array of all schemas in the library
   */
  getAllSchemas(): ElementTypeSchema[] {
    return [...this.schemasCache];
  }

  /**
   * Save a schema to the project's schema library.
   * Creates or updates the schema in the library via sync provider.
   * @param schema - The schema to save
   */
  saveSchemaToLibrary(schema: ElementTypeSchema): void {
    if (!this.syncProvider) {
      throw new Error('No sync provider available');
    }

    // Find existing or add new
    const existingIndex = this.schemasCache.findIndex(s => s.id === schema.id);
    const allSchemas = [...this.schemasCache];

    if (existingIndex >= 0) {
      allSchemas[existingIndex] = schema;
    } else {
      allSchemas.push(schema);
    }

    this.syncProvider.updateSchemas(allSchemas);
    // Update local cache immediately
    this.schemasCache = allSchemas;
    this.schemasCacheSignal.set(allSchemas);
  }

  /**
   * Save multiple schemas to the project's schema library.
   * Updates via sync provider.
   * @param schemas - Array of schemas to save
   */
  saveSchemasToLibrary(schemas: ElementTypeSchema[]): void {
    if (!this.syncProvider) {
      throw new Error('No sync provider available');
    }

    // Merge: update existing schemas and add new ones
    const schemaMap = new Map(this.schemasCache.map(s => [s.id, s]));
    for (const schema of schemas) {
      schemaMap.set(schema.id, schema);
    }

    const updatedSchemas = Array.from(schemaMap.values());
    this.syncProvider.updateSchemas(updatedSchemas);
    // Update local cache immediately
    this.schemasCache = updatedSchemas;
    this.schemasCacheSignal.set(updatedSchemas);
  }

  /**
   * Get a single schema from the library by ID.
   * Returns a plain object, not a Yjs type.
   * @param schemaId - The schema ID to retrieve
   * @returns The schema or null if not found
   */
  getSchema(schemaId: string): ElementTypeSchema | null {
    return this.schemasCache.find(s => s.id === schemaId) ?? null;
  }

  /**
   * Check if the schema library has any schemas.
   * @returns true if the library is empty
   */
  hasNoSchemas(): boolean {
    return this.schemasCache.length === 0;
  }
}
