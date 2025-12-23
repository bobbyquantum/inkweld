import { provideHttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Element } from '@inkweld/index';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
import { DefaultTemplatesService } from './default-templates.service';
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
  };
}

describe('WorldbuildingService', () => {
  let service: WorldbuildingService;
  let setupService: Partial<SetupService>;
  let mockSyncProvider: ReturnType<typeof createMockSyncProvider>;

  const mockCharacterSchema: ElementTypeSchema = {
    id: 'character',
    type: 'CHARACTER',
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
      getMode: vi.fn().mockReturnValue('offline'), // Use offline mode to avoid WebSocket
      getWebSocketUrl: vi.fn().mockReturnValue('ws://localhost:8333'),
    };

    mockSyncProvider = createMockSyncProvider();

    const mockSyncProviderFactory = {
      getProvider: vi.fn().mockReturnValue(mockSyncProvider),
      getCurrentMode: vi.fn().mockReturnValue('offline'),
    };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        WorldbuildingService,
        DefaultTemplatesService,
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
      await service.saveWorldbuildingData(elementId, {
        name: 'Test Character',
        type: 'character',
      });

      const data = await service.getWorldbuildingData(elementId);

      expect(data).toBeDefined();
      expect(data?.['name']).toBe('Test Character');
    });

    it('should return empty object for new element', async () => {
      const data = await service.getWorldbuildingData('new-element-id');
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

      await service.saveWorldbuildingData(elementId, testData);

      // Verify data was saved
      const savedData = await service.getWorldbuildingData(elementId);
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

      await service.saveWorldbuildingData(elementId, testData);

      const savedData = await service.getWorldbuildingData(elementId);
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

      await service.saveWorldbuildingData(elementId, testData);

      const savedData = await service.getWorldbuildingData(elementId);
      expect(savedData?.['name']).toBe('Test');
    });
  });

  describe('observeChanges', () => {
    it('should call callback when data changes', async () => {
      const elementId = 'test-element-observe';
      const callback = vi.fn();

      const unsubscribe = await service.observeChanges(elementId, callback);

      // Make a change
      await service.saveWorldbuildingData(elementId, { name: 'Changed' });

      // Callback should have been called
      expect(callback).toHaveBeenCalled();

      // Cleanup
      unsubscribe();
    });
  });

  describe('getElementSchemaType / getSchemaForElement', () => {
    it('should return null for element with no schema type', async () => {
      const elementId = 'element-no-schema';

      const schemaType = await service.getElementSchemaType(elementId);

      expect(schemaType).toBeNull();
    });

    it('should retrieve schema type from element', async () => {
      const elementId = 'element-with-type';
      const username = 'testuser';
      const slug = 'testproject';

      // Save a schema to the library
      service.saveSchemaToLibrary(username, slug, mockCharacterSchema);

      // Initialize an element (which sets schemaType)
      const element = {
        id: elementId,
        type: 'CHARACTER',
        name: 'Test Character',
        parentId: null,
        order: 0,
        level: 0,
        expandable: false,
        version: 1,
        metadata: {},
      } as unknown as Element;
      await service.initializeWorldbuildingElement(element, username, slug);

      // Retrieve schema type
      const schemaType = await service.getElementSchemaType(
        elementId,
        username,
        slug
      );
      expect(schemaType).toBe('CHARACTER');
    });

    it('should retrieve full schema for element from library', async () => {
      const elementId = 'element-full-schema';
      const username = 'testuser';
      const slug = 'testproject-full';

      // Save a schema to the library
      service.saveSchemaToLibrary(username, slug, mockCharacterSchema);

      // Initialize an element (which sets schemaType)
      const element = {
        id: elementId,
        type: 'CHARACTER',
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
      expect(schema?.type).toBe('CHARACTER');
      expect(schema?.name).toBe('Character');
      expect(schema?.tabs).toHaveLength(1);
    });
  });

  describe('getAllSchemas / saveSchemaToLibrary', () => {
    it('should return empty array for new project', () => {
      const schemas = service.getAllSchemas('newuser', 'newproject');

      expect(schemas).toEqual([]);
    });

    it('should save and retrieve schemas from library', () => {
      const username = 'testuser';
      const slug = 'testproject';

      // Save a schema
      service.saveSchemaToLibrary(username, slug, mockCharacterSchema);

      // Retrieve all schemas
      const schemas = service.getAllSchemas(username, slug);

      expect(schemas).toHaveLength(1);
      expect(schemas[0].type).toBe('CHARACTER');
      expect(schemas[0].name).toBe('Character');
    });

    it('should save multiple schemas', () => {
      const username = 'testuser';
      const slug = 'testproject2';

      const locationSchema: ElementTypeSchema = {
        ...mockCharacterSchema,
        id: 'location',
        type: 'LOCATION',
        name: 'Location',
        icon: 'place',
      };

      service.saveSchemasToLibrary(username, slug, [
        mockCharacterSchema,
        locationSchema,
      ]);

      const schemas = service.getAllSchemas(username, slug);

      expect(schemas).toHaveLength(2);
      expect(schemas.map(s => s.type).sort()).toEqual([
        'CHARACTER',
        'LOCATION',
      ]);
    });
  });

  describe('getSchema', () => {
    it('should retrieve specific schema by type', () => {
      const username = 'testuser';
      const slug = 'testproject3';

      // Save schema first
      service.saveSchemaToLibrary(username, slug, mockCharacterSchema);

      // Get specific schema
      const schema = service.getSchema(username, slug, 'CHARACTER');

      expect(schema).toBeDefined();
      expect(schema?.type).toBe('CHARACTER');
    });

    it('should return null for non-existent schema type', () => {
      const schema = service.getSchema(
        'testuser',
        'testproject4',
        'nonexistent'
      );

      expect(schema).toBeNull();
    });
  });

  describe('hasNoSchemas', () => {
    it('should return true for empty library', () => {
      const isEmpty = service.hasNoSchemas('newuser2', 'newproject2');

      expect(isEmpty).toBe(true);
    });

    it('should return false when schemas exist', () => {
      const username = 'testuser';
      const slug = 'testproject5';

      service.saveSchemaToLibrary(username, slug, mockCharacterSchema);

      const isEmpty = service.hasNoSchemas(username, slug);

      expect(isEmpty).toBe(false);
    });
  });

  describe('cloneTemplate', () => {
    it('should clone an existing template with new ID', () => {
      const username = 'testuser';
      const slug = 'clonetest';
      const projectKey = `${username}:${slug}`;

      // Save original template
      service.saveSchemaToLibrary(username, slug, mockCharacterSchema);

      // Clone it
      const clonedSchema = service.cloneTemplate(
        projectKey,
        'CHARACTER',
        'Hero',
        'Custom hero template',
        username,
        slug
      );

      expect(clonedSchema).toBeDefined();
      expect(clonedSchema.name).toBe('Hero');
      expect(clonedSchema.description).toBe('Custom hero template');
      expect(clonedSchema.isBuiltIn).toBe(false);
      expect(clonedSchema.version).toBe(1);
      expect(clonedSchema.type.startsWith('CUSTOM_')).toBe(true);
      expect(clonedSchema.tabs).toEqual(mockCharacterSchema.tabs);
    });

    it('should throw error if source template not found', () => {
      const username = 'testuser';
      const slug = 'clonetest2';
      const projectKey = `${username}:${slug}`;

      expect(() =>
        service.cloneTemplate(
          projectKey,
          'nonexistent',
          'New',
          undefined,
          username,
          slug
        )
      ).toThrow('Template nonexistent not found');
    });
  });

  describe('deleteTemplate', () => {
    it('should delete a custom template from the library', () => {
      const username = 'testuser';
      const slug = 'deletetest';
      const projectKey = `${username}:${slug}`;

      // Save and clone to create a custom template
      service.saveSchemaToLibrary(username, slug, mockCharacterSchema);
      const cloned = service.cloneTemplate(
        projectKey,
        'CHARACTER',
        'ToDelete',
        undefined,
        username,
        slug
      );

      // Delete the custom template
      service.deleteTemplate(projectKey, cloned.type, username, slug);

      // Verify it's deleted
      const schema = service.getSchema(username, slug, cloned.type);
      expect(schema).toBeNull();
    });

    it('should allow deleting built-in template (now stored per-project)', () => {
      const username = 'testuser';
      const slug = 'deletetest2';
      const projectKey = `${username}:${slug}`;

      service.saveSchemaToLibrary(username, slug, mockCharacterSchema);

      // Should not throw - built-in templates are now deletable
      service.deleteTemplate(projectKey, 'CHARACTER', username, slug);

      // Verify it's deleted
      const schema = service.getSchema(username, slug, 'CHARACTER');
      expect(schema).toBeNull();
    });
  });

  describe('updateTemplate', () => {
    it('should update an existing template in the library', () => {
      const username = 'testuser';
      const slug = 'updatetest';
      const projectKey = `${username}:${slug}`;

      // Save and clone to create a custom template
      service.saveSchemaToLibrary(username, slug, mockCharacterSchema);
      const cloned = service.cloneTemplate(
        projectKey,
        'CHARACTER',
        'ToUpdate',
        undefined,
        username,
        slug
      );

      const updatedData = {
        name: 'Updated Hero',
        description: 'Updated description',
      };

      const result = service.updateTemplate(
        projectKey,
        cloned.type,
        updatedData,
        username,
        slug
      );

      expect(result.name).toBe('Updated Hero');
      expect(result.description).toBe('Updated description');
      expect(result.version).toBe(2); // Should increment version
    });
  });

  describe('getIconForType', () => {
    it('should return icon for built-in types', () => {
      expect(service.getIconForType('CHARACTER')).toBe('person');
      expect(service.getIconForType('LOCATION')).toBe('place');
      expect(service.getIconForType('WB_ITEM')).toBe('category');
      expect(service.getIconForType('ITEM')).toBe('description');
    });

    it('should return default icon for unknown types', () => {
      expect(service.getIconForType('unknown')).toBe('description');
    });

    it('should look up icon for custom types from schema library', () => {
      const username = 'testuser';
      const slug = 'icontest';

      // Save custom schema with specific icon
      const customSchema: ElementTypeSchema = {
        ...mockCharacterSchema,
        type: 'CUSTOM_hero',
        icon: 'star',
      };
      service.saveSchemaToLibrary(username, slug, customSchema);

      const icon = service.getIconForType('CUSTOM_hero', username, slug);

      expect(icon).toBe('star');
    });

    it('should fallback to default icon if custom type schema not found', () => {
      const icon = service.getIconForType(
        'CUSTOM_unknown',
        'testuser',
        'icontest2'
      );

      expect(icon).toBe('description');
    });
  });

  describe('initializeWorldbuildingElement', () => {
    it('should skip initialization for non-worldbuilding types', async () => {
      const element = {
        id: 'test-element-123',
        type: 'ITEM', // ITEM is not a worldbuilding type
        name: 'Test Document',
      } as Element;

      // Should complete without errors
      await service.initializeWorldbuildingElement(element);

      // No schemaType should be set for non-worldbuilding types
      const schemaType = await service.getElementSchemaType('test-element-123');
      expect(schemaType).toBeNull();
    });

    it('should skip initialization if already initialized', async () => {
      const element = {
        id: 'initialized-element',
        type: 'CHARACTER',
        name: 'Test Character',
      } as Element;

      const username = 'testuser';
      const slug = 'inittest';

      // Pre-save schema to library so initialization can find it
      service.saveSchemaToLibrary(username, slug, mockCharacterSchema);

      // Initialize first time
      await service.initializeWorldbuildingElement(element, username, slug);

      // Get the data after initialization
      const data1 = await service.getWorldbuildingData('initialized-element');
      const createdDate = data1?.['createdDate'];

      // Initialize again - should be skipped
      await service.initializeWorldbuildingElement(element, username, slug);

      // Verify createdDate hasn't changed (would change if re-initialized)
      const data2 = await service.getWorldbuildingData('initialized-element');
      expect(data2?.['createdDate']).toBe(createdDate);
    });
  });
});
