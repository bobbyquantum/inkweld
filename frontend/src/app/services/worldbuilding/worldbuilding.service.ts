import { inject, Injectable } from '@angular/core';
import { Element, ElementType } from '@inkweld/index';
import { Subscription } from 'rxjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

import { ElementTypeSchema } from '../../models/schema-types';
import { isWorldbuildingType } from '../../utils/worldbuilding.utils';
import { SetupService } from '../core/setup.service';
import { ElementSyncProviderFactory } from '../sync/element-sync-provider.factory';
import { IElementSyncProvider } from '../sync/element-sync-provider.interface';

// Constants for timeouts and intervals
const INDEXEDDB_SYNC_TIMEOUT = 5000;
const WEBSOCKET_RESYNC_INTERVAL = 10000;

interface WorldbuildingConnection {
  ydoc: Y.Doc;
  dataMap: Y.Map<unknown>;
  identityMap: Y.Map<unknown>;
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
}

@Injectable({
  providedIn: 'root',
})
export class WorldbuildingService {
  private setupService = inject(SetupService);
  private syncProviderFactory = inject(ElementSyncProviderFactory);

  // Per-element worldbuilding data connections (each element has its own Yjs doc)
  private connections = new Map<string, WorldbuildingConnection>();

  // Pending connection promises to prevent race conditions
  private pendingConnections = new Map<string, Promise<Y.Map<unknown>>>();

  // Current sync provider (used for schema library access)
  private syncProvider: IElementSyncProvider | null = null;
  private schemasCache: ElementTypeSchema[] = [];
  private schemasSubscription: Subscription | null = null;

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
      // Subscribe to schema changes
      this.schemasSubscription = provider.schemas$.subscribe(schemas => {
        this.schemasCache = schemas;
      });
    } else {
      this.schemasCache = [];
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
   * Quick lookup for a schema by ID from the current cache.
   * This is a lightweight method for synchronous icon resolution.
   * @param schemaId - The schema ID to look up
   */
  getSchemaById(schemaId: string): ElementTypeSchema | null {
    return this.schemasCache.find(s => s.id === schemaId) ?? null;
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
    } catch {
      // Continue anyway - the document may be empty/new
    }

    // Setup WebSocket provider if not in offline mode
    const mode = this.setupService.getMode();
    const wsUrl = this.setupService.getWebSocketUrl();
    let provider: WebsocketProvider | undefined;

    if (mode !== 'offline' && wsUrl && username && slug) {
      // Build full document ID in format: username:slug:elementId
      const fullDocId = `${username}:${slug}:${elementId}`;
      const formattedId = fullDocId.replace(/^\/+/, '');

      // WebsocketProvider(url, roomName, doc, options)
      // The roomName parameter is appended to the URL, but we want documentId as a query param
      // So we include it in the URL and use an empty room name
      const fullWsUrl = `${wsUrl}/api/v1/ws/yjs?documentId=${formattedId}`;
      provider = new WebsocketProvider(
        fullWsUrl,
        '', // Empty room name - documentId is already in URL
        ydoc,
        {
          connect: true,
          resyncInterval: WEBSOCKET_RESYNC_INTERVAL,
        }
      );

      // Handle connection status
      provider.on('status', ({ status: _status }: { status: string }) => {
        // Connection status changes are handled internally
      });
    }

    const connection: WorldbuildingConnection = {
      ydoc,
      dataMap,
      identityMap,
      provider,
      indexeddbProvider,
    };

    this.connections.set(connectionKey, connection);

    return dataMap;
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
    const jsonData = dataMap.toJSON() as Record<string, unknown>;

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
      const jsonData = dataMap.toJSON() as Record<string, unknown>;
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
    };
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
      }
      if (data.description !== undefined) {
        identityMap.set('description', data.description);
      }
    });
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
      });
    };

    identityMap.observe(observer);
    return () => identityMap.unobserve(observer);
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
    console.log('[WorldbuildingService] saveWorldbuildingData called:', {
      elementId,
      data,
      username,
      slug,
    });
    const dataMap = await this.setupCollaboration(elementId, username, slug);
    const connectionKey = this.buildConnectionKey(elementId, username, slug);
    const connection = this.connections.get(connectionKey)!;

    // Perform transaction to update all fields
    connection.ydoc.transact(() => {
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined) {
          if (Array.isArray(value)) {
            // Handle arrays
            const yArray = new Y.Array();
            value.forEach(item => yArray.push([item]));
            dataMap.set(key, yArray);
          } else if (typeof value === 'object' && value !== null) {
            // For nested objects, check if it already exists as a Y.Map
            let nestedMap = dataMap.get(key) as Y.Map<unknown> | undefined;
            if (!(nestedMap instanceof Y.Map)) {
              // Create new Y.Map if it doesn't exist or isn't a Y.Map
              nestedMap = new Y.Map();
              dataMap.set(key, nestedMap);
            }
            // Update the nested map with new values
            Object.entries(value as Record<string, unknown>).forEach(
              ([nestedKey, nestedValue]) => {
                // Convert nested arrays to Y.Array
                if (Array.isArray(nestedValue)) {
                  const yArray = new Y.Array();
                  nestedValue.forEach(item => yArray.push([item]));
                  nestedMap.set(nestedKey, yArray);
                } else {
                  nestedMap.set(nestedKey, nestedValue);
                }
              }
            );
          } else {
            // Handle primitive values
            dataMap.set(key, value);
          }
        }
      });

      // Update lastModified timestamp
      dataMap.set('lastModified', new Date().toISOString());
    });
    // Data is automatically synced via WebSocket and IndexedDB
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
      console.log(
        `[WorldbuildingService] Element ${element.id} already initialized, skipping`
      );
      return;
    }

    console.log(
      `[WorldbuildingService] Initializing new WORLDBUILDING element ${element.id} with schemaId=${element.schemaId}`
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
      // Store the schema ID reference (not the full schema)
      if (schema) {
        // Initialize data based on schema's default values
        dataMap.set('schemaId', schema.id);
        if (schema.defaultValues) {
          Object.entries(schema.defaultValues).forEach(([key, value]) => {
            dataMap.set(key, value);
          });
        }

        // Initialize fields based on schema (including nested structures)
        schema.tabs.forEach(tab => {
          tab.fields?.forEach(field => {
            const fieldKey = field.key;

            // Handle nested fields (e.g., 'appearance.height')
            if (fieldKey.includes('.')) {
              const [parentKey, childKey] = fieldKey.split('.');

              // Get or create parent Y.Map
              let parentMap = dataMap.get(parentKey) as
                | Y.Map<unknown>
                | undefined;
              if (!(parentMap instanceof Y.Map)) {
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
            } else {
              // Handle top-level fields
              if (field.type === 'array') {
                dataMap.set(fieldKey, new Y.Array());
              } else if (!dataMap.has(fieldKey)) {
                // Only set if not already present
                dataMap.set(fieldKey, '');
              }
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
      throw new Error('Invalid JSON data');
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

    // Log available schema IDs for debugging
    const availableIds = schemas.map(s => s.id);
    console.log(
      `[SchemaLibrary] Looking for "${schemaId}" in available IDs:`,
      availableIds
    );

    const schema = schemas.find(s => s.id === schemaId);
    if (!schema) {
      console.warn(
        `[SchemaLibrary] No schema found for ID "${schemaId}". Available: ${availableIds.join(', ')}`
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

    // Clone the schema as a plain object
    const clonedSchema: ElementTypeSchema = {
      id: newId,
      name: newName,
      icon: sourceSchema.icon,
      description: newDescription || `Clone of ${sourceSchema.name}`,
      version: 1,
      isBuiltIn: false,
      tabs: sourceSchema.tabs, // Deep clone not needed as we're creating new objects
      defaultValues: sourceSchema.defaultValues,
      createdAt: now,
      updatedAt: now,
    };

    // Save via sync provider
    if (this.syncProvider) {
      const allSchemas = [...this.schemasCache, clonedSchema];
      this.syncProvider.updateSchemas(allSchemas);
      // Update local cache immediately
      this.schemasCache = allSchemas;
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
    const schema = this.schemasCache.find(s => s.id === schemaId);
    if (!schema) {
      throw new Error(`Template with ID ${schemaId} not found`);
    }

    // Remove from schemas and update via sync provider
    if (this.syncProvider) {
      const filteredSchemas = this.schemasCache.filter(s => s.id !== schemaId);
      this.syncProvider.updateSchemas(filteredSchemas);
      // Update local cache immediately
      this.schemasCache = filteredSchemas;
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
   * Get the full schema for a worldbuilding element from the project library.
   * Looks up the schema ID stored in the element and retrieves the schema from the library.
   * @param elementId - The element ID
   * @param username - Project username
   * @param slug - Project slug
   * @returns The full schema or null if not found
   */
  async getSchemaForElement(
    elementId: string,
    username: string,
    slug: string
  ): Promise<ElementTypeSchema | null> {
    const schemaId = await this.getElementSchemaId(elementId, username, slug);
    if (!schemaId) {
      console.warn(
        `[Worldbuilding] No schema ID found for element ${elementId}`
      );
      return null;
    }
    const projectKey = `${username}:${slug}`;
    const schema = this.getSchemaFromLibrary(
      projectKey,
      schemaId,
      username,
      slug
    );
    return schema;
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
