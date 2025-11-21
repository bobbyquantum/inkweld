import { inject, Injectable } from '@angular/core';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

import {
  GetApiV1ProjectsUsernameSlugElements200ResponseInner,
  GetApiV1ProjectsUsernameSlugElements200ResponseInnerType,
} from '../../api-client';
import { ElementTypeSchema } from '../models/schema-types';
import {
  isWorldbuildingType,
  WorldbuildingSchema,
} from '../models/worldbuilding-schemas';
import { DefaultTemplatesService } from './default-templates.service';
import { SetupService } from './setup.service';

interface WorldbuildingConnection {
  ydoc: Y.Doc;
  dataMap: Y.Map<unknown>;
  provider?: WebsocketProvider;
  indexeddbProvider: IndexeddbPersistence;
}

interface SchemaLibraryConnection {
  ydoc: Y.Doc;
  schemaMap: Y.Map<unknown>;
  provider?: WebsocketProvider;
  indexeddbProvider: IndexeddbPersistence;
}

@Injectable({
  providedIn: 'root',
})
export class WorldbuildingService {
  private setupService = inject(SetupService);
  private defaultTemplatesService = inject(DefaultTemplatesService);
  private connections = new Map<string, WorldbuildingConnection>();
  private schemaLibraryConnections = new Map<string, SchemaLibraryConnection>();

  // Schema library document ID (matches backend)
  private readonly SCHEMA_DOC_ID = '__schemas__';

  /**
   * Set up real-time collaboration for a worldbuilding element
   * @param elementId - The element ID
   * @param username - Project username (optional, for WebSocket sync)
   * @param slug - Project slug (optional, for WebSocket sync)
   */
  async setupCollaboration(
    elementId: string,
    username?: string,
    slug?: string
  ): Promise<Y.Map<unknown>> {
    let connection = this.connections.get(elementId);

    if (!connection) {
      const ydoc = new Y.Doc();
      const dataMap = ydoc.getMap('worldbuilding');

      // Initialize IndexedDB provider for offline persistence
      const indexeddbProvider = new IndexeddbPersistence(
        `worldbuilding:${elementId}`,
        ydoc
      );

      // Wait for IndexedDB sync
      await indexeddbProvider.whenSynced;

      // Setup WebSocket provider if not in offline mode
      const mode = this.setupService.getMode();
      const wsUrl = this.setupService.getWebSocketUrl();
      let provider: WebsocketProvider | undefined;

      console.log(
        `[Worldbuilding] Setup check - mode: ${mode}, wsUrl: ${wsUrl}, username: ${username}, slug: ${slug}`
      );

      if (mode !== 'offline' && wsUrl && username && slug) {
        // Build full document ID in format: username:slug:elementId
        const fullDocId = `${username}:${slug}:${elementId}`;
        const formattedId = fullDocId.replace(/^\/+/, '');

        console.log(`[Worldbuilding] Connecting WebSocket for ${formattedId}`);

        // WebsocketProvider(url, roomName, doc, options)
        // The roomName parameter is appended to the URL, but we want documentId as a query param
        // So we include it in the URL and use an empty room name
        const fullWsUrl = `${wsUrl}/ws/yjs?documentId=${formattedId}`;
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
      } else {
        console.log('[Worldbuilding] WebSocket NOT created - missing params');
      }

      connection = {
        ydoc,
        dataMap,
        provider,
        indexeddbProvider,
      };

      this.connections.set(elementId, connection);
    }

    return connection.dataMap;
  }

  /**
   * Get the worldbuilding data for an element from its YJS document
   */
  async getWorldbuildingData(
    elementId: string,
    username?: string,
    slug?: string
  ): Promise<WorldbuildingSchema | null> {
    const dataMap = await this.setupCollaboration(elementId, username, slug);
    const jsonData = dataMap.toJSON() as Record<string, unknown>;

    return (jsonData as unknown as WorldbuildingSchema) || null;
  }

  /**
   * Observe changes to a worldbuilding element's Yjs data
   * @param elementId - The element ID to observe
   * @param callback - Function called when data changes
   * @returns Cleanup function to stop observing
   */
  async observeChanges(
    elementId: string,
    callback: (data: WorldbuildingSchema) => void,
    username?: string,
    slug?: string
  ): Promise<() => void> {
    const dataMap = await this.setupCollaboration(elementId, username, slug);

    const observer = () => {
      const jsonData = dataMap.toJSON() as Record<string, unknown>;
      callback(jsonData as unknown as WorldbuildingSchema);
    };

    dataMap.observe(observer);

    // Return cleanup function
    return () => dataMap.unobserve(observer);
  }

  /**
   * Save worldbuilding data to a YJS document
   */
  async saveWorldbuildingData(
    elementId: string,
    data: Partial<WorldbuildingSchema>,
    username?: string,
    slug?: string
  ): Promise<void> {
    console.log('[WorldbuildingService] saveWorldbuildingData called:', {
      elementId,
      data,
      username,
      slug,
    });
    const dataMap = await this.setupCollaboration(elementId, username, slug);
    const connection = this.connections.get(elementId)!;

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
              `[WorldbuildingService] Set primitive key="${key}" value="${value}"`
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
    element: GetApiV1ProjectsUsernameSlugElements200ResponseInner,
    username?: string,
    slug?: string
  ): Promise<void> {
    if (!element.id || !isWorldbuildingType(element.type)) {
      return;
    }

    const dataMap = await this.setupCollaboration(element.id, username, slug);

    // Check if already initialized (has a 'type' field)
    if (dataMap.has('type')) {
      console.log(
        `[WorldbuildingService] Element ${element.id} already initialized, skipping`
      );
      return;
    }

    console.log(
      `[WorldbuildingService] Initializing new ${element.type} element ${element.id}`
    );

    // Get the schema from the project's template library
    const projectKey = username && slug ? `${username}:${slug}` : 'default';
    console.log(
      `[WorldbuildingService] Looking for schema: projectKey="${projectKey}", elementType="${element.type}"`
    );

    // Check if schema library is empty and auto-load defaults if needed
    let schema = await this.getSchemaFromLibrary(
      projectKey,
      element.type,
      username,
      slug
    );

    // If schema not found, check if library is empty and auto-initialize
    if (!schema && username && slug) {
      const libraryIsEmpty = await this.isSchemaLibraryEmpty(
        projectKey,
        username,
        slug
      );

      if (libraryIsEmpty) {
        console.log(
          `[WorldbuildingService] Schema library is empty, auto-loading default templates`
        );
        await this.autoLoadDefaultTemplates(projectKey, username, slug);

        // Try to get schema again after loading defaults
        schema = await this.getSchemaFromLibrary(
          projectKey,
          element.type,
          username,
          slug
        );
      }
    }

    console.log(
      `[WorldbuildingService] Schema lookup result:`,
      schema ? `Found ${schema.name} (v${schema.version})` : 'NOT FOUND'
    );

    const connection = this.connections.get(element.id)!;

    connection.ydoc.transact(() => {
      // Embed the schema snapshot in the element's Y.Doc
      if (schema) {
        this.embedSchemaInElement(connection.ydoc, schema);

        // Initialize data based on schema's default values
        dataMap.set('type', schema.type);
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
  getElementsOfType(
    _type: GetApiV1ProjectsUsernameSlugElements200ResponseInnerType
  ): Promise<GetApiV1ProjectsUsernameSlugElements200ResponseInner[]> {
    // This would typically query from the project state service
    // For now, returning empty array as placeholder
    return Promise.resolve([]);
  }

  /**
   * Search for related elements (for linking)
   */
  searchRelatedElements(
    _query: string,
    _types?: GetApiV1ProjectsUsernameSlugElements200ResponseInnerType[]
  ): Promise<GetApiV1ProjectsUsernameSlugElements200ResponseInner[]> {
    // This would typically perform a search across elements
    // For now, returning empty array as placeholder
    return Promise.resolve([]);
  }

  /**
   * Export worldbuilding data to JSON
   */
  async exportToJSON(elementId: string): Promise<string> {
    const data = await this.getWorldbuildingData(elementId);
    return JSON.stringify(data, null, 2);
  }

  /**
   * Import worldbuilding data from JSON
   */
  async importFromJSON(elementId: string, jsonData: string): Promise<void> {
    try {
      const data = JSON.parse(jsonData) as WorldbuildingSchema;
      await this.saveWorldbuildingData(elementId, data);
    } catch (error) {
      console.error('Error importing worldbuilding data:', error);
      throw new Error('Invalid JSON data');
    }
  }

  /**
   * Load the project's schema library (collaborative)
   * This contains all the template schemas for the project
   */
  async loadSchemaLibrary(
    projectKey: string,
    username?: string,
    slug?: string
  ): Promise<Y.Map<unknown>> {
    let connection = this.schemaLibraryConnections.get(projectKey);

    if (!connection) {
      const ydoc = new Y.Doc();
      const schemaMap = ydoc.getMap('schemaLibrary');

      // Initialize IndexedDB provider for offline persistence
      const indexeddbProvider = new IndexeddbPersistence(
        `schema-library:${projectKey}`,
        ydoc
      );

      await indexeddbProvider.whenSynced;

      // Setup WebSocket provider if not in offline mode
      const mode = this.setupService.getMode();
      const wsUrl = this.setupService.getWebSocketUrl();
      let provider: WebsocketProvider | undefined;

      if (mode !== 'offline' && wsUrl && username && slug) {
        const fullDocId = `${username}:${slug}:${this.SCHEMA_DOC_ID}`;
        const formattedId = fullDocId.replace(/^\/+/, '');

        console.log(`[SchemaLibrary] Connecting to ${formattedId}`);

        // WebsocketProvider(url, roomName, doc, options)
        // The roomName parameter is appended to the URL, but we want documentId as a query param
        // So we include it in the URL and use an empty room name
        const fullWsUrl = `${wsUrl}/ws/yjs?documentId=${formattedId}`;
        provider = new WebsocketProvider(
          fullWsUrl,
          '', // Empty room name - documentId is already in URL
          ydoc,
          {
            connect: true,
            resyncInterval: 10000,
          }
        );

        provider.on('status', ({ status }: { status: string }) => {
          console.log(`[SchemaLibrary] WebSocket status: ${status}`);
        });
      }

      connection = {
        ydoc,
        schemaMap,
        provider,
        indexeddbProvider,
      };

      this.schemaLibraryConnections.set(projectKey, connection);
    }

    return connection.schemaMap;
  }

  /**
   * Get a schema from the project's library by element type
   */
  async getSchemaFromLibrary(
    projectKey: string,
    elementType: string,
    username?: string,
    slug?: string
  ): Promise<ElementTypeSchema | null> {
    const library = await this.loadSchemaLibrary(projectKey, username, slug);
    const schemasMap = library.get('schemas') as Y.Map<unknown>;

    if (!schemasMap) {
      console.warn('[SchemaLibrary] No schemas found in library');
      return null;
    }

    // Log available schema types for debugging
    const availableTypes: string[] = [];
    schemasMap.forEach((_value: unknown, key: string) => {
      availableTypes.push(key);
    });
    console.log(
      `[SchemaLibrary] Looking for "${elementType}" in available types:`,
      availableTypes
    );

    const schemaData = schemasMap.get(elementType) as Y.Map<unknown>;
    if (!schemaData) {
      console.warn(
        `[SchemaLibrary] No schema found for type "${elementType}". Available: ${availableTypes.join(', ')}`
      );
      return null;
    }

    // Convert Y.Map to plain object
    return {
      id: schemaData.get('id') as string,
      type: schemaData.get('type') as string,
      name: schemaData.get('name') as string,
      icon: schemaData.get('icon') as string,
      description: schemaData.get('description') as string,
      version: schemaData.get('version') as number,
      isBuiltIn: schemaData.get('isBuiltIn') as boolean,
      tabs: JSON.parse(
        schemaData.get('tabs') as string
      ) as ElementTypeSchema['tabs'],
      defaultValues: schemaData.has('defaultValues')
        ? (JSON.parse(schemaData.get('defaultValues') as string) as Record<
            string,
            unknown
          >)
        : undefined,
    };
  }

  /**
   * Check if the schema library is empty
   */
  async isSchemaLibraryEmpty(
    projectKey: string,
    username?: string,
    slug?: string
  ): Promise<boolean> {
    const library = await this.loadSchemaLibrary(projectKey, username, slug);
    const schemasMap = library.get('schemas') as Y.Map<unknown>;

    if (!schemasMap) {
      return true;
    }

    return schemasMap.size === 0;
  }

  /**
   * Auto-load default templates from client-side assets into the project's schema library
   * This is called automatically when the schema library is empty
   */
  async autoLoadDefaultTemplates(
    projectKey: string,
    username?: string,
    slug?: string
  ): Promise<void> {
    try {
      console.log(
        `[WorldbuildingService] Auto-loading default templates for ${projectKey}`
      );

      // Load default templates from assets
      const defaultTemplates: Record<string, ElementTypeSchema> =
        await this.defaultTemplatesService.loadDefaultTemplates();

      const library = await this.loadSchemaLibrary(projectKey, username, slug);

      // Get or create schemas map in the library
      let schemasMap = library.get('schemas') as Y.Map<unknown>;
      if (!schemasMap) {
        schemasMap = new Y.Map();
        library.set('schemas', schemasMap);
      }

      // Save each template to the schema library
      const templateArray = Object.values(defaultTemplates);
      for (const schema of templateArray) {
        const schemaYMap = new Y.Map<unknown>();
        schemaYMap.set('id', schema.id);
        schemaYMap.set('type', schema.type);
        schemaYMap.set('name', schema.name);
        schemaYMap.set('icon', schema.icon);
        schemaYMap.set('description', schema.description);
        schemaYMap.set('version', schema.version);
        schemaYMap.set('isBuiltIn', schema.isBuiltIn);
        schemaYMap.set('tabs', JSON.stringify(schema.tabs));
        if (schema.defaultValues) {
          schemaYMap.set('defaultValues', JSON.stringify(schema.defaultValues));
        }

        schemasMap.set(schema.type, schemaYMap);
      }

      console.log(
        `[WorldbuildingService] Auto-loaded ${templateArray.length} default templates`
      );
    } catch (error) {
      console.error(
        '[WorldbuildingService] Failed to auto-load default templates:',
        error
      );
      // Don't throw - fallback to hard-coded defaults will be used
    }
  }

  /**
   * Embed a schema snapshot into a worldbuilding element's Y.Doc
   * Called when initializing a new element
   */
  embedSchemaInElement(ydoc: Y.Doc, schema: ElementTypeSchema): void {
    const schemaMap = ydoc.getMap('__schema__');

    ydoc.transact(() => {
      schemaMap.set('id', schema.id);
      schemaMap.set('type', schema.type);
      schemaMap.set('name', schema.name);
      schemaMap.set('icon', schema.icon);
      schemaMap.set('description', schema.description);
      schemaMap.set('version', schema.version);
      schemaMap.set('isBuiltIn', schema.isBuiltIn || false);
      schemaMap.set('tabs', JSON.stringify(schema.tabs));
      if (schema.defaultValues) {
        schemaMap.set('defaultValues', JSON.stringify(schema.defaultValues));
      }
    });

    console.log(
      `[WorldbuildingService] Embedded schema v${schema.version} for ${schema.type}`
    );
  }

  /**
   * Load schema from an element's Y.Doc
   */
  loadSchemaFromElement(ydoc: Y.Doc): ElementTypeSchema | null {
    const schemaMap = ydoc.getMap('__schema__');

    if (!schemaMap.has('type')) {
      return null;
    }

    return {
      id: schemaMap.get('id') as string,
      type: schemaMap.get('type') as string,
      name: schemaMap.get('name') as string,
      icon: schemaMap.get('icon') as string,
      description: schemaMap.get('description') as string,
      version: schemaMap.get('version') as number,
      isBuiltIn: schemaMap.get('isBuiltIn') as boolean,
      tabs: JSON.parse(
        schemaMap.get('tabs') as string
      ) as ElementTypeSchema['tabs'],
      defaultValues: schemaMap.has('defaultValues')
        ? (JSON.parse(schemaMap.get('defaultValues') as string) as Record<
            string,
            unknown
          >)
        : undefined,
    };
  }

  /**
   * Clone a template in the project's schema library
   * Creates a new custom template based on an existing one
   */
  async cloneTemplate(
    projectKey: string,
    sourceType: string,
    newName: string,
    newDescription?: string,
    username?: string,
    slug?: string
  ): Promise<ElementTypeSchema> {
    const library = await this.loadSchemaLibrary(projectKey, username, slug);
    const schemasMap = library.get('schemas') as Y.Map<unknown>;

    if (!schemasMap) {
      throw new Error('Schema library not found');
    }

    const sourceSchema = schemasMap.get(sourceType) as Y.Map<unknown>;
    if (!sourceSchema) {
      throw new Error(`Template ${sourceType} not found`);
    }

    // Create a new unique type ID for the cloned template
    const timestamp = Date.now();
    const newType = `CUSTOM_${timestamp}`;
    const newId = `custom-${timestamp}`;

    // Create a new Y.Map for the cloned schema
    const clonedSchema = new Y.Map<unknown>();

    // Copy all fields from source
    sourceSchema.forEach((value, key) => {
      if (key === 'id') {
        clonedSchema.set(key, newId);
      } else if (key === 'type') {
        clonedSchema.set(key, newType);
      } else if (key === 'name') {
        clonedSchema.set(key, newName);
      } else if (key === 'description') {
        const sourceName = sourceSchema.get('name') as string;
        clonedSchema.set(key, newDescription || `Clone of ${sourceName}`);
      } else if (key === 'isBuiltIn') {
        clonedSchema.set(key, false); // Custom templates are not built-in
      } else if (key === 'version') {
        clonedSchema.set(key, 1); // Reset version for cloned template
      } else {
        // Copy other fields as-is (tabs, icon, etc.)
        clonedSchema.set(key, value);
      }
    });

    // Set timestamps
    const now = new Date().toISOString();
    clonedSchema.set('createdAt', now);
    clonedSchema.set('updatedAt', now);

    // Add to schemas map - Yjs will automatically sync this change!
    schemasMap.set(newType, clonedSchema);

    console.log(
      `[WorldbuildingService] Cloned template ${sourceType} to ${newType}: "${newName}"`
    );

    // Convert back to plain object for return
    return this.convertYMapToSchema(clonedSchema);
  }

  /**
   * Delete a custom template from the library
   * Cannot delete built-in templates
   */
  async deleteTemplate(
    projectKey: string,
    templateType: string,
    username?: string,
    slug?: string
  ): Promise<void> {
    const library = await this.loadSchemaLibrary(projectKey, username, slug);
    const schemasMap = library.get('schemas') as Y.Map<unknown>;

    if (!schemasMap) {
      throw new Error('Schema library not found');
    }

    const schema = schemasMap.get(templateType) as Y.Map<unknown>;
    if (!schema) {
      throw new Error(`Template ${templateType} not found`);
    }

    // Check if it's built-in (prevent deletion)
    const isBuiltIn = schema.get('isBuiltIn');
    if (isBuiltIn) {
      throw new Error('Cannot delete built-in templates');
    }

    // Remove from map - Yjs syncs the deletion automatically!
    schemasMap.delete(templateType);

    console.log(
      `[WorldbuildingService] Deleted custom template: ${templateType}`
    );
  }

  /**
   * Update a template in the library
   */
  async updateTemplate(
    projectKey: string,
    templateType: string,
    updates: Partial<ElementTypeSchema>,
    username?: string,
    slug?: string
  ): Promise<ElementTypeSchema> {
    const library = await this.loadSchemaLibrary(projectKey, username, slug);
    const schemasMap = library.get('schemas') as Y.Map<unknown>;

    if (!schemasMap) {
      throw new Error('Schema library not found');
    }

    const schema = schemasMap.get(templateType) as Y.Map<unknown>;
    if (!schema) {
      throw new Error(`Template ${templateType} not found`);
    }

    // Check if it's built-in (optionally prevent edits, or create a clone first)
    const isBuiltIn = schema.get('isBuiltIn');
    if (isBuiltIn) {
      console.warn(
        `[WorldbuildingService] Editing built-in template ${templateType}. Consider cloning first.`
      );
    }

    // Apply updates
    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'tabs') {
        // Tabs are stored as JSON string in Y.Map
        schema.set(key, JSON.stringify(value));
      } else if (key === 'defaultValues') {
        schema.set(key, JSON.stringify(value));
      } else if (
        key !== 'id' &&
        key !== 'type' &&
        key !== 'createdAt' &&
        value !== undefined
      ) {
        schema.set(key, value);
      }
    });

    // Increment version
    const currentVersion = (schema.get('version') as number) || 1;
    schema.set('version', currentVersion + 1);
    schema.set('updatedAt', new Date().toISOString());

    console.log(
      `[WorldbuildingService] Updated template ${templateType} to v${currentVersion + 1}`
    );

    // Yjs syncs automatically!
    return this.convertYMapToSchema(schema);
  }

  /**
   * Helper to convert Y.Map schema to plain ElementTypeSchema object
   */
  private convertYMapToSchema(ymap: Y.Map<unknown>): ElementTypeSchema {
    return {
      id: ymap.get('id') as string,
      type: ymap.get('type') as string,
      name: ymap.get('name') as string,
      icon: ymap.get('icon') as string,
      description: ymap.get('description') as string,
      version: ymap.get('version') as number,
      isBuiltIn: ymap.get('isBuiltIn') as boolean,
      tabs: JSON.parse(ymap.get('tabs') as string) as ElementTypeSchema['tabs'],
      defaultValues: ymap.has('defaultValues')
        ? (JSON.parse(ymap.get('defaultValues') as string) as Record<
            string,
            unknown
          >)
        : undefined,
      createdAt: ymap.has('createdAt')
        ? (ymap.get('createdAt') as string)
        : undefined,
      updatedAt: ymap.has('updatedAt')
        ? (ymap.get('updatedAt') as string)
        : undefined,
    };
  }

  /**
   * Get the icon for an element type (built-in or custom)
   * For custom types, looks up the icon from the schema library
   * For built-in types, returns the default icon
   */
  async getIconForType(
    elementType: string,
    username?: string,
    slug?: string
  ): Promise<string> {
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
      [GetApiV1ProjectsUsernameSlugElements200ResponseInnerType.Item]:
        'description',
      [GetApiV1ProjectsUsernameSlugElements200ResponseInnerType.Folder]:
        'folder',
    };

    // Check if it's a built-in type
    if (builtInIcons[elementType]) {
      return builtInIcons[elementType];
    }

    // For custom types, look up in schema library
    if (elementType.startsWith('CUSTOM_') && username && slug) {
      try {
        const projectKey = `${username}:${slug}`;
        const schema = await this.getSchemaFromLibrary(
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
}
