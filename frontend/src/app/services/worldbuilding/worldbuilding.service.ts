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
    let connection = this.connections.get(connectionKey);

    if (!connection) {
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
        setTimeout(() => reject(new Error('IndexedDB sync timeout')), 5000)
      );

      try {
        await Promise.race([syncPromise, timeoutPromise]);
      } catch (error) {
        console.warn(
          `[Worldbuilding] IndexedDB sync timeout for ${elementId}, continuing anyway:`,
          error
        );
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
            resyncInterval: 10000,
          }
        );

        // Handle connection status
        provider.on('status', ({ status }: { status: string }) => {
          console.log(
            `[Worldbuilding] WebSocket status for ${elementId}: ${status}`
          );
        });
      }

      connection = {
        ydoc,
        dataMap,
        identityMap,
        provider,
        indexeddbProvider,
      };

      this.connections.set(connectionKey, connection);
    }

    return connection.dataMap;
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
    return () => dataMap.unobserve(observer);
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
        console.log(
          `[WorldbuildingService] Setting key="${key}", value=`,
          value,
          `type=${typeof value}`
        );
        if (value !== undefined) {
          if (Array.isArray(value)) {
            // Handle arrays
            const yArray = new Y.Array();
            value.forEach(item => yArray.push([item]));
            dataMap.set(key, yArray);
            console.log(
              `[WorldbuildingService] Set array key="${key}" with ${value.length} items`
            );
          } else if (typeof value === 'object' && value !== null) {
            // For nested objects, check if it already exists as a Y.Map
            let nestedMap = dataMap.get(key) as Y.Map<unknown> | undefined;
            if (!(nestedMap instanceof Y.Map)) {
              // Create new Y.Map if it doesn't exist or isn't a Y.Map
              nestedMap = new Y.Map();
              dataMap.set(key, nestedMap);
              console.log(
                `[WorldbuildingService] Created new Y.Map for key="${key}"`
              );
            }
            // Update the nested map with new values
            Object.entries(value as Record<string, unknown>).forEach(
              ([nestedKey, nestedValue]) => {
                console.log(
                  `[WorldbuildingService]   Setting nested "${key}.${nestedKey}" = `,
                  nestedValue
                );
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
            console.log(
              `[WorldbuildingService] Set primitive key="${key}"`,
              value
            );
          }
        }
      });

      // Update lastModified timestamp
      dataMap.set('lastModified', new Date().toISOString());
      console.log(
        '[WorldbuildingService] Transaction complete, data:',
        dataMap.toJSON()
      );
    });
    console.log(
      '[WorldbuildingService] Data saved to Y.Doc, will sync automatically'
    );
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
      console.warn(
        `[WorldbuildingService] Element ${element.id} is WORLDBUILDING but has no schemaId`
      );
      return;
    }

    console.log(
      `[WorldbuildingService] Looking for schema: projectKey="${projectKey}", schemaId="${schemaId}"`
    );

    // Check if schema library is empty and auto-load defaults if needed
    const schema = this.getSchemaFromLibrary(
      projectKey,
      schemaId,
      username,
      slug
    );

    console.log(
      `[WorldbuildingService] Schema lookup result:`,
      schema ? `Found ${schema.name} (v${schema.version})` : 'NOT FOUND'
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
      } else {
        // Fallback to old hard-coded defaults if no schema found
        console.warn(
          `[WorldbuildingService] No schema found for ${element.type}, using fallback initialization`
        );
        this.initializeFallbackDefaults(element.type, dataMap);
      }

      // Set common fields
      dataMap.set('id', element.id);
      dataMap.set('name', element.name);
      dataMap.set('createdDate', new Date().toISOString());
      dataMap.set('lastModified', new Date().toISOString());
    });

    console.log(
      `[WorldbuildingService] Initialized ${element.type} element ${element.id} with schema-based data`
    );
  }

  /**
   * Fallback initialization if schema is not available
   */
  private initializeFallbackDefaults(
    elementType: string,
    dataMap: Y.Map<unknown>
  ): void {
    dataMap.set('type', elementType);

    // Initialize type-specific default fields (old hard-coded approach)
    switch (elementType) {
      case 'CHARACTER':
        this.initializeCharacterDefaults(dataMap);
        break;
      case 'LOCATION':
        this.initializeLocationDefaults(dataMap);
        break;
      case 'WB_ITEM':
        this.initializeItemDefaults(dataMap);
        break;
      case 'MAP':
        this.initializeMapDefaults(dataMap);
        break;
      case 'RELATIONSHIP':
        this.initializeRelationshipDefaults(dataMap);
        break;
      case 'PHILOSOPHY':
        this.initializePhilosophyDefaults(dataMap);
        break;
      case 'CULTURE':
        this.initializeCultureDefaults(dataMap);
        break;
      case 'SPECIES':
        this.initializeSpeciesDefaults(dataMap);
        break;
      case 'SYSTEMS':
        this.initializeSystemsDefaults(dataMap);
        break;
    }
  }

  // Initialize default fields for each worldbuilding type

  private initializeCharacterDefaults(dataMap: Y.Map<unknown>): void {
    dataMap.set('fullName', '');
    dataMap.set('summary', '');
    dataMap.set('tags', new Y.Array());

    const appearance = new Y.Map();
    dataMap.set('appearance', appearance);

    const personality = new Y.Map();
    personality.set('traits', new Y.Array());
    personality.set('strengths', new Y.Array());
    personality.set('weaknesses', new Y.Array());
    dataMap.set('personality', personality);

    const background = new Y.Map();
    dataMap.set('background', background);

    const abilities = new Y.Map();
    abilities.set('skills', new Y.Array());
    dataMap.set('abilities', abilities);

    dataMap.set('relationships', new Y.Array());
  }

  private initializeLocationDefaults(dataMap: Y.Map<unknown>): void {
    dataMap.set('summary', '');
    dataMap.set('locationType', '');
    dataMap.set('tags', new Y.Array());

    const geography = new Y.Map();
    geography.set('landmarks', new Y.Array());
    geography.set('resources', new Y.Array());
    dataMap.set('geography', geography);

    const society = new Y.Map();
    society.set('languages', new Y.Array());
    society.set('customs', new Y.Array());
    dataMap.set('society', society);

    const history = new Y.Map();
    history.set('majorEvents', new Y.Array());
    dataMap.set('history', history);

    dataMap.set('notableLocations', new Y.Array());
  }

  private initializeItemDefaults(dataMap: Y.Map<unknown>): void {
    dataMap.set('summary', '');
    dataMap.set('itemType', '');
    dataMap.set('tags', new Y.Array());

    const properties = new Y.Map();
    properties.set('magical', false);
    properties.set('powers', new Y.Array());
    dataMap.set('properties', properties);

    const origin = new Y.Map();
    dataMap.set('origin', origin);
  }

  private initializeMapDefaults(dataMap: Y.Map<unknown>): void {
    dataMap.set('summary', '');
    dataMap.set('mapType', '');
    dataMap.set('tags', new Y.Array());
    dataMap.set('markers', new Y.Array());
    dataMap.set('legend', new Y.Array());
    dataMap.set('locations', new Y.Array());
  }

  private initializeRelationshipDefaults(dataMap: Y.Map<unknown>): void {
    dataMap.set('summary', '');
    dataMap.set('relationshipType', '');
    dataMap.set('tags', new Y.Array());
    dataMap.set('participants', new Y.Array());

    const timeline = new Y.Map();
    timeline.set('milestones', new Y.Array());
    dataMap.set('timeline', timeline);

    const dynamics = new Y.Map();
    dynamics.set('conflicts', new Y.Array());
    dynamics.set('bonds', new Y.Array());
    dataMap.set('dynamics', dynamics);
  }

  private initializePhilosophyDefaults(dataMap: Y.Map<unknown>): void {
    dataMap.set('summary', '');
    dataMap.set('tags', new Y.Array());
    dataMap.set('coreBeliefs', new Y.Array());
    dataMap.set('principles', new Y.Array());
    dataMap.set('values', new Y.Array());

    const practices = new Y.Map();
    practices.set('rituals', new Y.Array());
    practices.set('teachings', new Y.Array());
    dataMap.set('practices', practices);

    const followers = new Y.Map();
    dataMap.set('followers', followers);
  }

  private initializeCultureDefaults(dataMap: Y.Map<unknown>): void {
    dataMap.set('summary', '');
    dataMap.set('tags', new Y.Array());
    dataMap.set('languages', new Y.Array());

    const socialStructure = new Y.Map();
    socialStructure.set('classes', new Y.Array());
    socialStructure.set('roles', new Y.Array());
    dataMap.set('socialStructure', socialStructure);

    const traditions = new Y.Map();
    traditions.set('customs', new Y.Array());
    traditions.set('holidays', new Y.Array());
    traditions.set('taboos', new Y.Array());
    dataMap.set('traditions', traditions);

    const arts = new Y.Map();
    arts.set('music', new Y.Array());
    arts.set('cuisine', new Y.Array());
    dataMap.set('arts', arts);

    dataMap.set('territories', new Y.Array());
  }

  private initializeSpeciesDefaults(dataMap: Y.Map<unknown>): void {
    dataMap.set('summary', '');
    dataMap.set('tags', new Y.Array());

    const biology = new Y.Map();
    biology.set('habitat', new Y.Array());
    dataMap.set('biology', biology);

    const physicalTraits = new Y.Map();
    physicalTraits.set('distinctiveFeatures', new Y.Array());
    physicalTraits.set('variations', new Y.Array());
    dataMap.set('physicalTraits', physicalTraits);

    const abilities = new Y.Map();
    abilities.set('natural', new Y.Array());
    abilities.set('learned', new Y.Array());
    abilities.set('weaknesses', new Y.Array());
    dataMap.set('abilities', abilities);

    const relations = new Y.Map();
    relations.set('allies', new Y.Array());
    relations.set('enemies', new Y.Array());
    dataMap.set('relations', relations);

    dataMap.set('colonies', new Y.Array());
  }

  private initializeSystemsDefaults(dataMap: Y.Map<unknown>): void {
    dataMap.set('summary', '');
    dataMap.set('systemType', '');
    dataMap.set('tags', new Y.Array());

    const mechanics = new Y.Map();
    mechanics.set('fundamentalLaws', new Y.Array());
    mechanics.set('sources', new Y.Array());
    mechanics.set('limitations', new Y.Array());
    dataMap.set('mechanics', mechanics);

    const components = new Y.Map();
    components.set('elements', new Y.Array());
    components.set('tools', new Y.Array());
    components.set('techniques', new Y.Array());
    dataMap.set('components', components);

    const usage = new Y.Map();
    usage.set('requirements', new Y.Array());
    dataMap.set('usage', usage);

    const effects = new Y.Map();
    effects.set('capabilities', new Y.Array());
    effects.set('restrictions', new Y.Array());
    dataMap.set('effects', effects);

    const history = new Y.Map();
    history.set('majorEvents', new Y.Array());
    dataMap.set('history', history);
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
  isSchemaLibraryEmpty(
    _projectKey: string,
    _username?: string,
    _slug?: string
  ): boolean {
    return this.schemasCache.length === 0;
  }

  /**
   * Clone a template in the project's schema library
   * Creates a new custom template based on an existing one
   */
  cloneTemplate(
    projectKey: string,
    sourceSchemaId: string,
    newName: string,
    newDescription?: string,
    _username?: string,
    _slug?: string
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

    console.log(
      `[WorldbuildingService] Cloned template ${sourceSchemaId} to ${newId}: "${newName}"`
    );

    return clonedSchema;
  }

  /**
   * Delete a template from the library.
   * All templates are now deletable since they're stored per-project.
   */
  deleteTemplate(
    _projectKey: string,
    schemaId: string,
    _username?: string,
    _slug?: string
  ): void {
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

    console.log(`[WorldbuildingService] Deleted template: ${schemaId}`);
  }

  /**
   * Update a template in the library.
   * All templates are now editable since they're stored per-project.
   */
  updateTemplate(
    _projectKey: string,
    schemaId: string,
    updates: Partial<ElementTypeSchema>,
    _username?: string,
    _slug?: string
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

    console.log(
      `[WorldbuildingService] Updated template ${schemaId} to v${updatedSchema.version}`
    );

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
      } catch (error) {
        console.warn(
          `[WorldbuildingService] Could not load icon for custom type ${elementType}:`,
          error
        );
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
      const allData = dataMap.toJSON();
      console.log(
        `[Worldbuilding] Element ${elementId} has schemaId: ${schemaId || 'none'}, all keys:`,
        Object.keys(allData),
        'first few values:',
        Object.fromEntries(Object.entries(allData).slice(0, 3))
      );
      return schemaId;
    } catch (error) {
      console.error(
        `[Worldbuilding] Error getting schema ID for ${elementId}:`,
        error
      );
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
    console.log(
      `[Worldbuilding] Getting schema for element ${elementId} (${username}/${slug})`
    );
    console.log(
      `[Worldbuilding] Current schemas cache has ${this.schemasCache.length} schemas:`,
      this.schemasCache.map(s => s.id)
    );

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
    console.log(
      `[Worldbuilding] Retrieved schema for element ${elementId}:`,
      schema ? schema.id : 'not found'
    );
    return schema;
  }

  /**
   * Get all schemas from the project's schema library as plain objects.
   * Uses the sync provider's schema cache.
   * @param _username - Project username (unused, kept for API compatibility)
   * @param _slug - Project slug (unused, kept for API compatibility)
   * @returns Array of all schemas in the library
   */
  getAllSchemas(_username: string, _slug: string): ElementTypeSchema[] {
    return [...this.schemasCache];
  }

  /**
   * Save a schema to the project's schema library.
   * Creates or updates the schema in the library via sync provider.
   * @param _username - Project username (unused, kept for API compatibility)
   * @param _slug - Project slug (unused, kept for API compatibility)
   * @param schema - The schema to save
   */
  saveSchemaToLibrary(
    _username: string,
    _slug: string,
    schema: ElementTypeSchema
  ): void {
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
   * @param _username - Project username (unused, kept for API compatibility)
   * @param _slug - Project slug (unused, kept for API compatibility)
   * @param schemas - Array of schemas to save
   */
  saveSchemasToLibrary(
    _username: string,
    _slug: string,
    schemas: ElementTypeSchema[]
  ): void {
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
   * @param _username - Project username (unused, kept for API compatibility)
   * @param _slug - Project slug (unused, kept for API compatibility)
   * @param schemaId - The schema ID to retrieve
   * @returns The schema or null if not found
   */
  getSchema(
    _username: string,
    _slug: string,
    schemaId: string
  ): ElementTypeSchema | null {
    return this.schemasCache.find(s => s.id === schemaId) ?? null;
  }

  /**
   * Check if the schema library has any schemas.
   * @param _username - Project username (unused, kept for API compatibility)
   * @param _slug - Project slug (unused, kept for API compatibility)
   * @returns true if the library is empty
   */
  hasNoSchemas(_username: string, _slug: string): boolean {
    return this.schemasCache.length === 0;
  }
}
