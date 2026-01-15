import { provideHttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Element, ElementType } from '@inkweld/index';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import {
  ElementRelationship,
  RelationshipTypeDefinition,
} from '../../components/element-ref/element-ref.model';
import { ElementTag, TagDefinition } from '../../components/tags/tag.model';
import { DocumentSyncState } from '../../models/document-sync-state';
import { PublishPlan } from '../../models/publish-plan';
import { ElementTypeSchema } from '../../models/schema-types';
import { SetupService } from '../core/setup.service';
import { ElementSyncProviderFactory } from '../sync/element-sync-provider.factory';
import {
  IElementSyncProvider,
  ProjectMeta,
} from '../sync/element-sync-provider.interface';
import { WorldbuildingService } from './worldbuilding.service';

/**
 * Creates a mock IElementSyncProvider for schema tests.
 */
function createMockSyncProvider(): IElementSyncProvider & {
  _schemasSubject: BehaviorSubject<ElementTypeSchema[]>;
} {
  const elementsSubject = new BehaviorSubject<Element[]>([]);
  const publishPlansSubject = new BehaviorSubject<PublishPlan[]>([]);
  const relationshipsSubject = new BehaviorSubject<ElementRelationship[]>([]);
  const customTypesSubject = new BehaviorSubject<RelationshipTypeDefinition[]>(
    []
  );
  const schemasSubject = new BehaviorSubject<ElementTypeSchema[]>([]);
  const elementTagsSubject = new BehaviorSubject<ElementTag[]>([]);
  const customTagsSubject = new BehaviorSubject<TagDefinition[]>([]);
  const projectMetaSubject = new BehaviorSubject<ProjectMeta | undefined>(
    undefined
  );
  const syncStateSubject = new BehaviorSubject<DocumentSyncState>(
    DocumentSyncState.Synced
  );

  return {
    _schemasSubject: schemasSubject,

    connect: vi.fn().mockResolvedValue({ success: true }),
    disconnect: vi.fn(),
    isConnected: vi.fn().mockReturnValue(true),
    getSyncState: vi.fn(() => syncStateSubject.getValue()),
    getElements: vi.fn(() => elementsSubject.getValue()),
    getPublishPlans: vi.fn(() => publishPlansSubject.getValue()),
    getRelationships: vi.fn(() => relationshipsSubject.getValue()),
    getCustomRelationshipTypes: vi.fn(() => customTypesSubject.getValue()),
    getSchemas: vi.fn(() => schemasSubject.getValue()),
    getElementTags: vi.fn(() => elementTagsSubject.getValue()),
    getCustomTags: vi.fn(() => customTagsSubject.getValue()),
    getProjectMeta: vi.fn(() => projectMetaSubject.getValue()),
    updateElements: vi.fn(),
    updatePublishPlans: vi.fn(),
    updateRelationships: vi.fn(),
    updateCustomRelationshipTypes: vi.fn(),
    updateSchemas: vi.fn((schemas: ElementTypeSchema[]) => {
      schemasSubject.next(schemas);
    }),
    updateElementTags: vi.fn(),
    updateCustomTags: vi.fn(),
    updateProjectMeta: vi.fn(),

    syncState$: syncStateSubject.asObservable(),
    elements$: elementsSubject.asObservable(),
    publishPlans$: publishPlansSubject.asObservable(),
    relationships$: relationshipsSubject.asObservable(),
    customRelationshipTypes$: customTypesSubject.asObservable(),
    schemas$: schemasSubject.asObservable(),
    elementTags$: elementTagsSubject.asObservable(),
    customTags$: customTagsSubject.asObservable(),
    projectMeta$: projectMetaSubject.asObservable(),
    errors$: new BehaviorSubject<string>('').asObservable(),
    lastConnectionError$: new BehaviorSubject<string | null>(
      null
    ).asObservable(),
  };
}

describe('WorldbuildingService', () => {
  let service: WorldbuildingService;
  let setupService: Partial<SetupService>;
  let mockSyncProvider: ReturnType<typeof createMockSyncProvider>;
  const username = 'testuser';
  const slug = 'testproject';

  const mockCharacterSchema: ElementTypeSchema = {
    id: 'character-v1',
    name: 'Character',
    icon: 'person',
    description: 'Character schema',
    version: 1,
    isBuiltIn: true,
    tabs: [
      {
        key: 'basic',
        label: 'Basic Info',
        icon: 'info',
        order: 1,
        fields: [
          {
            key: 'name',
            label: 'Name',
            type: 'text',
            placeholder: 'Character name',
          },
          {
            key: 'age',
            label: 'Age',
            type: 'number',
          },
        ],
      },
    ],
    defaultValues: {
      name: '',
      age: 0,
    },
  };

  beforeEach(() => {
    setupService = {
      getMode: vi.fn().mockReturnValue('local'), // Use offline mode to avoid WebSocket
      getWebSocketUrl: vi.fn().mockReturnValue('ws://localhost:8333'),
    };

    mockSyncProvider = createMockSyncProvider();

    const mockSyncProviderFactory = {
      getProvider: vi.fn().mockReturnValue(mockSyncProvider),
      getCurrentMode: vi.fn().mockReturnValue('local'),
    };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        WorldbuildingService,
        { provide: SetupService, useValue: setupService },
        {
          provide: ElementSyncProviderFactory,
          useValue: mockSyncProviderFactory,
        },
      ],
    });

    service = TestBed.inject(WorldbuildingService);
    // Set the mock sync provider for schema operations
    service.setSyncProvider(mockSyncProvider);
  });

  it('should be created', () => {
    expect(service).toBeDefined();
  });

  describe('getWorldbuildingData', () => {
    it('should retrieve worldbuilding data from element', async () => {
      const elementId = 'test-element-123';

      // First save some data
      await service.saveWorldbuildingData(
        elementId,
        {
          name: 'Test Character',
          type: 'character',
        },
        username,
        slug
      );

      const data = await service.getWorldbuildingData(
        elementId,
        username,
        slug
      );

      expect(data).toBeDefined();
      expect(data?.['name']).toBe('Test Character');
    });

    it('should return empty object for new element', async () => {
      const data = await service.getWorldbuildingData(
        'new-element-id',
        username,
        slug
      );
      expect(data).toEqual({});
    });
  });

  describe('saveWorldbuildingData', () => {
    it('should save worldbuilding data to element', async () => {
      const elementId = 'test-element-123';

      const testData = {
        name: 'Updated Character',
        age: 25,
      };

      await service.saveWorldbuildingData(elementId, testData, username, slug);

      // Verify data was saved
      const savedData = await service.getWorldbuildingData(
        elementId,
        username,
        slug
      );
      expect(savedData?.['name']).toBe('Updated Character');
      expect(savedData?.['age']).toBe(25);
    });

    it('should handle nested object data', async () => {
      const elementId = 'test-element-nested';

      const testData = {
        name: 'Test',
        appearance: {
          height: '180cm',
          weight: '75kg',
        },
      };

      await service.saveWorldbuildingData(elementId, testData, username, slug);

      const savedData = await service.getWorldbuildingData(
        elementId,
        username,
        slug
      );
      expect(savedData?.['name']).toBe('Test');
      // Nested data is stored as Y.Map, verify it's accessible
      expect(savedData?.['appearance']).toBeDefined();
    });

    it('should handle array data', async () => {
      const elementId = 'test-element-arrays';

      const testData = {
        name: 'Test',
        aliases: ['John', 'Johnny'],
      };

      await service.saveWorldbuildingData(elementId, testData, username, slug);

      const savedData = await service.getWorldbuildingData(
        elementId,
        username,
        slug
      );
      expect(savedData?.['name']).toBe('Test');
    });
  });

  describe('observeChanges', () => {
    it('should call callback when data changes', async () => {
      const elementId = 'test-element-observe';
      const callback = vi.fn();

      const unsubscribe = await service.observeChanges(
        elementId,
        callback,
        username,
        slug
      );

      // Make a change
      await service.saveWorldbuildingData(
        elementId,
        { name: 'Changed' },
        username,
        slug
      );

      // Callback should have been called
      expect(callback).toHaveBeenCalled();

      // Cleanup
      unsubscribe();
    });
  });

  describe('getElementSchemaId / getSchemaForElement', () => {
    it('should return null for element with no schema ID', async () => {
      const elementId = 'element-no-schema';

      const schemaId = await service.getElementSchemaId(
        elementId,
        username,
        slug
      );

      expect(schemaId).toBeNull();
    });

    it('should retrieve schema ID from element', async () => {
      const elementId = 'element-with-type';
      const username = 'testuser';
      const slug = 'testproject';

      // Save a schema to the library
      service.saveSchemaToLibrary(mockCharacterSchema);

      // Initialize an element (which sets schemaId)
      const element = {
        id: elementId,
        type: ElementType.Worldbuilding,
        schemaId: 'character-v1',
        name: 'Test Character',
        parentId: null,
        order: 0,
        level: 0,
        expandable: false,
        version: 1,
        metadata: {},
      } as unknown as Element;
      await service.initializeWorldbuildingElement(element, username, slug);

      // Retrieve schema ID
      const schemaId = await service.getElementSchemaId(
        elementId,
        username,
        slug
      );
      expect(schemaId).toBe('character-v1');
    });

    it('should retrieve full schema for element from library', async () => {
      const elementId = 'element-full-schema';
      const username = 'testuser';
      const slug = 'testproject-full';

      // Save a schema to the library
      service.saveSchemaToLibrary(mockCharacterSchema);

      // Initialize an element (which sets schemaId)
      const element = {
        id: elementId,
        type: ElementType.Worldbuilding,
        schemaId: 'character-v1',
        name: 'Test Character',
        parentId: null,
        order: 0,
        level: 0,
        expandable: false,
        version: 1,
        metadata: {},
      } as unknown as Element;
      await service.initializeWorldbuildingElement(element, username, slug);

      // Retrieve full schema
      const schema = await service.getSchemaForElement(
        elementId,
        username,
        slug
      );
      expect(schema).toBeDefined();
      expect(schema?.id).toBe('character-v1');
      expect(schema?.name).toBe('Character');
      expect(schema?.tabs).toHaveLength(1);
    });
  });

  describe('getAllSchemas / saveSchemaToLibrary', () => {
    it('should return empty array for new project', () => {
      const schemas = service.getAllSchemas();

      expect(schemas).toEqual([]);
    });

    it('should save and retrieve schemas from library', () => {
      // Save a schema
      service.saveSchemaToLibrary(mockCharacterSchema);

      // Retrieve all schemas
      const schemas = service.getAllSchemas();

      expect(schemas).toHaveLength(1);
      expect(schemas[0].id).toBe('character-v1');
      expect(schemas[0].name).toBe('Character');
    });

    it('should save multiple schemas', () => {
      const locationSchema: ElementTypeSchema = {
        ...mockCharacterSchema,
        id: 'location-v1',
        name: 'Location',
        icon: 'place',
      };

      service.saveSchemasToLibrary([mockCharacterSchema, locationSchema]);

      const schemas = service.getAllSchemas();

      expect(schemas).toHaveLength(2);
      expect(schemas.map(s => s.id).sort()).toEqual([
        'character-v1',
        'location-v1',
      ]);
    });
  });

  describe('getSchema', () => {
    it('should retrieve specific schema by ID', () => {
      // Save schema first
      service.saveSchemaToLibrary(mockCharacterSchema);

      // Get specific schema
      const schema = service.getSchema('character-v1');

      expect(schema).toBeDefined();
      expect(schema?.id).toBe('character-v1');
    });

    it('should return null for non-existent schema ID', () => {
      const schema = service.getSchema('nonexistent');

      expect(schema).toBeNull();
    });
  });

  describe('hasNoSchemas', () => {
    it('should return true for empty library', () => {
      const isEmpty = service.hasNoSchemas();

      expect(isEmpty).toBe(true);
    });

    it('should return false when schemas exist', () => {
      service.saveSchemaToLibrary(mockCharacterSchema);

      const isEmpty = service.hasNoSchemas();

      expect(isEmpty).toBe(false);
    });
  });

  describe('isSchemaLibraryEmpty', () => {
    it('should return true when schema cache is empty', () => {
      const result = service.isSchemaLibraryEmpty();

      expect(result).toBe(true);
    });

    it('should return false when schemas exist in cache', () => {
      // Add a schema to populate the cache
      service.saveSchemaToLibrary(mockCharacterSchema);

      const result = service.isSchemaLibraryEmpty();

      expect(result).toBe(false);
    });
  });

  describe('getSchemaById', () => {
    it('should return null when schema is not in cache', () => {
      const result = service.getSchemaById('nonexistent-schema');

      expect(result).toBeNull();
    });

    it('should return schema when it exists in cache', () => {
      // Add a schema to the cache
      service.saveSchemaToLibrary(mockCharacterSchema);

      const result = service.getSchemaById('character-v1');

      expect(result).toEqual(mockCharacterSchema);
    });
  });

  describe('cloneTemplate', () => {
    it('should clone an existing template with new ID', () => {
      // Save original template
      service.saveSchemaToLibrary(mockCharacterSchema);

      // Clone it using schemaId
      const clonedSchema = service.cloneTemplate(
        'character-v1',
        'Hero',
        'Custom hero template'
      );

      expect(clonedSchema).toBeDefined();
      expect(clonedSchema.name).toBe('Hero');
      expect(clonedSchema.description).toBe('Custom hero template');
      expect(clonedSchema.isBuiltIn).toBe(false);
      expect(clonedSchema.version).toBe(1);
      expect(clonedSchema.id.startsWith('custom-')).toBe(true);
      expect(clonedSchema.tabs).toEqual(mockCharacterSchema.tabs);
    });

    it('should throw error if source template not found', () => {
      expect(() =>
        service.cloneTemplate('nonexistent', 'New', undefined)
      ).toThrow('Template with ID nonexistent not found');
    });
  });

  describe('deleteTemplate', () => {
    it('should delete a custom template from the library', () => {
      // Save and clone to create a custom template
      service.saveSchemaToLibrary(mockCharacterSchema);
      const cloned = service.cloneTemplate(
        'character-v1',
        'ToDelete',
        undefined
      );

      // Delete the custom template using its id
      service.deleteTemplate(cloned.id);

      // Verify it's deleted
      const schema = service.getSchema(cloned.id);
      expect(schema).toBeNull();
    });

    it('should allow deleting built-in template (now stored per-project)', () => {
      service.saveSchemaToLibrary(mockCharacterSchema);

      // Should not throw - built-in templates are now deletable
      service.deleteTemplate('character-v1');

      // Verify it's deleted
      const schema = service.getSchema('character-v1');
      expect(schema).toBeNull();
    });
  });

  describe('updateTemplate', () => {
    it('should update an existing template in the library', () => {
      // Save and clone to create a custom template
      service.saveSchemaToLibrary(mockCharacterSchema);
      const cloned = service.cloneTemplate(
        'character-v1',
        'ToUpdate',
        undefined
      );

      const updatedData = {
        name: 'Updated Hero',
        description: 'Updated description',
      };

      const result = service.updateTemplate(cloned.id, updatedData);

      expect(result.name).toBe('Updated Hero');
      expect(result.description).toBe('Updated description');
      expect(result.version).toBe(2); // Should increment version
    });
  });

  describe('getIconForType', () => {
    it('should return icon for built-in element types', () => {
      // These are the legacy built-in type strings that getIconForType still supports
      expect(service.getIconForType('CHARACTER')).toBe('person');
      expect(service.getIconForType('LOCATION')).toBe('place');
      expect(service.getIconForType('WB_ITEM')).toBe('category');
      expect(service.getIconForType(ElementType.Item)).toBe('description');
      expect(service.getIconForType(ElementType.Folder)).toBe('folder');
    });

    it('should return default icon for unknown types', () => {
      expect(service.getIconForType('unknown')).toBe('description');
    });
    it('should return icon from schema for custom types', () => {
      const customSchema: ElementTypeSchema = {
        ...mockCharacterSchema,
        id: 'CUSTOM_123',
        icon: 'star',
      };
      mockSyncProvider._schemasSubject.next([customSchema]);

      expect(service.getIconForType('CUSTOM_123', username, slug)).toBe('star');
    });
  });

  describe('initializeWorldbuildingElement', () => {
    it('should skip initialization for non-worldbuilding types', async () => {
      const element = {
        id: 'test-element-123',
        type: ElementType.Item, // ITEM is not a worldbuilding type
        name: 'Test Document',
      } as Element;

      // Should complete without errors
      await service.initializeWorldbuildingElement(element, username, slug);

      // No schemaId should be set for non-worldbuilding types
      const schemaId = await service.getElementSchemaId(
        'test-element-123',
        username,
        slug
      );
      expect(schemaId).toBeNull();
    });

    it('should skip initialization if already initialized', async () => {
      const element = {
        id: 'initialized-element',
        type: ElementType.Worldbuilding,
        schemaId: 'character-v1',
        name: 'Test Character',
      } as Element;

      const username = 'testuser';
      const slug = 'inittest';

      // Pre-save schema to library so initialization can find it
      service.saveSchemaToLibrary(mockCharacterSchema);

      // Initialize first time
      await service.initializeWorldbuildingElement(element, username, slug);

      // Get the data after initialization
      const data1 = await service.getWorldbuildingData(
        'initialized-element',
        username,
        slug
      );
      const createdDate = data1?.['createdDate'];

      // Initialize again - should be skipped
      await service.initializeWorldbuildingElement(element, username, slug);

      // Verify createdDate hasn't changed (would change if re-initialized)
      const data2 = await service.getWorldbuildingData(
        'initialized-element',
        username,
        slug
      );
      expect(data2?.['createdDate']).toBe(createdDate);
    });
  });

  describe('getElementsOfType', () => {
    it('should return empty array as placeholder', async () => {
      const result = await service.getElementsOfType(ElementType.Worldbuilding);

      expect(result).toEqual([]);
    });
  });

  describe('searchRelatedElements', () => {
    it('should return empty array as placeholder', async () => {
      const result = await service.searchRelatedElements('test', [
        ElementType.Worldbuilding,
      ]);

      expect(result).toEqual([]);
    });

    it('should return empty array when no types specified', async () => {
      const result = await service.searchRelatedElements('test');

      expect(result).toEqual([]);
    });
  });

  describe('exportToJSON', () => {
    it('should export worldbuilding data as JSON string', async () => {
      const elementId = 'export-test-element';
      const testData = { name: 'Test Character', description: 'A test' };

      await service.saveWorldbuildingData(elementId, testData, username, slug);
      const result = await service.exportToJSON(elementId, username, slug);
      const parsed = JSON.parse(result);

      expect(parsed.name).toEqual(testData.name);
      expect(parsed.description).toEqual(testData.description);
      expect(typeof result).toBe('string');
    });
  });

  it('should manage sync provider and schemas', () => {
    const mockProvider = createMockSyncProvider();
    const schemas: ElementTypeSchema[] = [
      {
        id: 's1',
        name: 'Schema 1',
        icon: 'person',
        description: 'desc',
        version: 1,
        isBuiltIn: true,
        tabs: [],
      },
    ];
    mockProvider._schemasSubject.next(schemas);

    service.setSyncProvider(mockProvider);
    expect(service.getAllSchemas()).toEqual(schemas);

    const newSchemas: ElementTypeSchema[] = [
      ...schemas,
      {
        id: 's2',
        name: 'Schema 2',
        icon: 'place',
        description: 'desc',
        version: 1,
        isBuiltIn: true,
        tabs: [],
      },
    ];
    mockProvider._schemasSubject.next(newSchemas);
    expect(service.getAllSchemas()).toEqual(newSchemas);

    service.setSyncProvider(null);
    expect(service.getAllSchemas()).toEqual([]);
  });

  it('should save schemas to library', () => {
    const mockProvider = createMockSyncProvider();
    service.setSyncProvider(mockProvider);

    const schema: ElementTypeSchema = {
      id: 's1',
      name: 'Schema 1',
      icon: 'person',
      description: 'desc',
      version: 1,
      isBuiltIn: true,
      tabs: [],
    };
    service.saveSchemaToLibrary(schema);

    expect(mockProvider.updateSchemas).toHaveBeenCalledWith([schema]);

    const schema2: ElementTypeSchema = {
      id: 's2',
      name: 'Schema 2',
      icon: 'place',
      description: 'desc',
      version: 1,
      isBuiltIn: true,
      tabs: [],
    };
    service.saveSchemasToLibrary([schema2]);
    // It merges with existing in cache
    expect(mockProvider.updateSchemas).toHaveBeenCalledWith([schema, schema2]);
  });

  it('should import from JSON', async () => {
    const data = {
      field: 'value',
    };
    const json = JSON.stringify(data);

    const mockProvider = createMockSyncProvider();
    service.setSyncProvider(mockProvider);

    await service.importFromJSON('e1', json, username, slug);

    const worldData = await service.getWorldbuildingData('e1', username, slug);
    expect(worldData).toEqual(expect.objectContaining({ field: 'value' }));
  });

  it('should get YDoc for connected element', async () => {
    const testElementId = 'ydoc-test-element';
    await service.getWorldbuildingData(testElementId, username, slug);
    const ydoc = service.getYDoc(testElementId, username, slug);
    expect(ydoc).toBeDefined();
    expect(ydoc).toBeInstanceOf(Y.Doc);

    expect(service.getYDoc('non-existent', username, slug)).toBeNull();
  });
});
