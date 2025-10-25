import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { ProjectElementDto } from '../../api-client';
import { ElementTypeSchema } from '../models/schema-types';
import { SetupService } from './setup.service';
import { WorldbuildingService } from './worldbuilding.service';

describe('WorldbuildingService', () => {
  let service: WorldbuildingService;
  let setupService: Partial<SetupService>;

  const mockCharacterSchema: ElementTypeSchema = {
    id: 'character',
    type: 'character',
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
      getMode: vi.fn().mockReturnValue('server'),
      getWebSocketUrl: vi.fn().mockReturnValue('ws://localhost:8333'),
    };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        WorldbuildingService,
        { provide: SetupService, useValue: setupService },
      ],
    });

    service = TestBed.inject(WorldbuildingService);
  });

  it('should be created', () => {
    expect(service).toBeDefined();
  });

  describe('setupCollaboration', () => {
    it('should setup collaboration for a worldbuilding element', async () => {
      const elementId = 'test-element-123';
      const username = 'testuser';
      const slug = 'test-project';

      const dataMap = await service.setupCollaboration(
        elementId,
        username,
        slug
      );

      expect(dataMap).toBeDefined();
      expect(dataMap).toBeInstanceOf(Y.Map);
    });

    it('should reuse existing connection if already setup', async () => {
      const elementId = 'test-element-123';
      const username = 'testuser';
      const slug = 'test-project';

      const dataMap1 = await service.setupCollaboration(
        elementId,
        username,
        slug
      );
      const dataMap2 = await service.setupCollaboration(
        elementId,
        username,
        slug
      );

      expect(dataMap1).toBe(dataMap2); // Same instance
    });

    it('should work in offline mode without WebSocket', async () => {
      (setupService.getMode as ReturnType<typeof vi.fn>).mockReturnValue(
        'offline'
      );
      const elementId = 'test-element-123';

      const dataMap = await service.setupCollaboration(elementId);

      expect(dataMap).toBeDefined();
    });
  });

  describe('loadSchemaLibrary', () => {
    it('should load schema library for a project', async () => {
      const projectKey = 'testuser:test-project';
      const username = 'testuser';
      const slug = 'test-project';

      const library = await service.loadSchemaLibrary(
        projectKey,
        username,
        slug
      );

      expect(library).toBeDefined();
      expect(library).toBeInstanceOf(Y.Map);
    });
  });

  describe('embedSchemaInElement', () => {
    it('should embed schema snapshot in element Y.Doc', () => {
      const ydoc = new Y.Doc();

      service.embedSchemaInElement(ydoc, mockCharacterSchema);

      const schemaMap = ydoc.getMap('__schema__');
      expect(schemaMap.get('type')).toBe('character');
      expect(schemaMap.get('name')).toBe('Character');
      expect(schemaMap.get('version')).toBe(1);
    });
  });

  describe('loadSchemaFromElement', () => {
    it('should load schema from element Y.Doc', () => {
      const ydoc = new Y.Doc();
      service.embedSchemaInElement(ydoc, mockCharacterSchema);

      const loadedSchema = service.loadSchemaFromElement(ydoc);

      expect(loadedSchema).toBeDefined();
      expect(loadedSchema?.type).toBe('character');
      expect(loadedSchema?.name).toBe('Character');
      expect(loadedSchema?.tabs).toHaveLength(1);
    });

    it('should return null if no schema embedded', () => {
      const ydoc = new Y.Doc();

      const loadedSchema = service.loadSchemaFromElement(ydoc);

      expect(loadedSchema).toBeNull();
    });
  });

  describe('getWorldbuildingData', () => {
    it('should retrieve worldbuilding data from element', async () => {
      const elementId = 'test-element-123';
      const username = 'testuser';
      const slug = 'test-project';

      // Setup collaboration first
      const dataMap = await service.setupCollaboration(
        elementId,
        username,
        slug
      );

      // Set some data
      dataMap.set('name', 'Test Character');
      dataMap.set('type', 'character');

      const data = await service.getWorldbuildingData(elementId);

      expect(data).toBeDefined();
      expect(data?.name).toBe('Test Character');
    });

    it('should return empty object if connection not found', async () => {
      const data = await service.getWorldbuildingData('nonexistent-id');

      expect(data).toEqual({});
    });
  });

  describe('saveWorldbuildingData', () => {
    it('should save worldbuilding data to element', async () => {
      const elementId = 'test-element-123';
      const username = 'testuser';
      const slug = 'test-project';

      // Setup collaboration first
      await service.setupCollaboration(elementId, username, slug);

      const testData = {
        name: 'Updated Character',
      };

      await service.saveWorldbuildingData(elementId, testData, username, slug);

      // Verify data was saved
      const savedData = await service.getWorldbuildingData(elementId);
      expect(savedData?.name).toBe('Updated Character');
    });
  });

  describe('getSchemaFromLibrary', () => {
    it('should retrieve schema from library', async () => {
      const projectKey = 'testuser:test-project';
      const username = 'testuser';
      const slug = 'test-project';

      // Create Y.Doc and get maps from it to ensure proper Y.js context
      const mockDoc = new Y.Doc();
      const mockLibrary = mockDoc.getMap('library');
      const schemasMap = new Y.Map();
      const schemaData = new Y.Map();

      schemaData.set('id', mockCharacterSchema.id);
      schemaData.set('type', mockCharacterSchema.type);
      schemaData.set('name', mockCharacterSchema.name);
      schemaData.set('icon', mockCharacterSchema.icon);
      schemaData.set('description', mockCharacterSchema.description);
      schemaData.set('version', mockCharacterSchema.version);
      schemaData.set('isBuiltIn', mockCharacterSchema.isBuiltIn);
      schemaData.set('tabs', JSON.stringify(mockCharacterSchema.tabs));
      schemaData.set(
        'defaultValues',
        JSON.stringify(mockCharacterSchema.defaultValues)
      );

      schemasMap.set('character', schemaData);
      mockLibrary.set('schemas', schemasMap);

      // Verify the structure is correct
      expect(mockLibrary.has('schemas')).toBe(true);
      const retrievedSchemasMap = mockLibrary.get('schemas');
      expect(retrievedSchemasMap).toBe(schemasMap);

      const loadSpy = vi
        .spyOn(service, 'loadSchemaLibrary')
        .mockResolvedValue(mockLibrary);

      const schema = await service.getSchemaFromLibrary(
        projectKey,
        'character',
        username,
        slug
      );

      expect(loadSpy).toHaveBeenCalledWith(projectKey, username, slug);
      expect(schema).toBeDefined();
      expect(schema?.type).toBe('character');
      expect(schema?.name).toBe('Character');
    });

    it('should return null if schema type not found', async () => {
      const projectKey = 'testuser:test-project';
      const username = 'testuser';
      const slug = 'test-project';

      vi.spyOn(service, 'loadSchemaLibrary').mockResolvedValue({
        get: (key: string) => {
          if (key === 'schemas') {
            return new Y.Map();
          }
          return undefined;
        },
      } as Y.Map<unknown>);

      const schema = await service.getSchemaFromLibrary(
        projectKey,
        'nonexistent',
        username,
        slug
      );

      expect(schema).toBeNull();
    });
  });

  describe('cloneTemplate', () => {
    it('should clone an existing template with new ID', async () => {
      const projectKey = 'testuser:test-project';
      const username = 'testuser';
      const slug = 'test-project';
      const sourceType = 'character';
      const newName = 'Hero';
      const newDescription = 'Custom hero template';

      // Create Y.Doc and get maps from it
      const mockDoc = new Y.Doc();
      const mockLibrary = mockDoc.getMap('library');
      const schemasMap = new Y.Map();
      const schemaData = new Y.Map();

      schemaData.set('id', mockCharacterSchema.id);
      schemaData.set('type', mockCharacterSchema.type);
      schemaData.set('name', mockCharacterSchema.name);
      schemaData.set('icon', mockCharacterSchema.icon);
      schemaData.set('description', mockCharacterSchema.description);
      schemaData.set('version', mockCharacterSchema.version);
      schemaData.set('isBuiltIn', true);
      schemaData.set('tabs', JSON.stringify(mockCharacterSchema.tabs));
      schemaData.set(
        'defaultValues',
        JSON.stringify(mockCharacterSchema.defaultValues)
      );
      schemasMap.set('character', schemaData);
      mockLibrary.set('schemas', schemasMap);

      vi.spyOn(service, 'loadSchemaLibrary').mockResolvedValue(mockLibrary);

      const clonedSchema = await service.cloneTemplate(
        projectKey,
        sourceType,
        newName,
        newDescription,
        username,
        slug
      );

      expect(clonedSchema).toBeDefined();
      expect(clonedSchema.name).toBe(newName);
      expect(clonedSchema.description).toBe(newDescription);
      expect(clonedSchema.isBuiltIn).toBe(false);
      expect(clonedSchema.version).toBe(1);
      expect(clonedSchema.type.startsWith('CUSTOM_')).toBe(true);
      expect(clonedSchema.tabs).toEqual(mockCharacterSchema.tabs);
    });

    it('should throw error if source template not found', async () => {
      const projectKey = 'testuser:test-project';
      const username = 'testuser';
      const slug = 'test-project';

      const mockDoc = new Y.Doc();
      const mockLibrary = mockDoc.getMap('library');
      mockLibrary.set('schemas', new Y.Map());

      vi.spyOn(service, 'loadSchemaLibrary').mockResolvedValue(mockLibrary);

      await expect(
        service.cloneTemplate(
          projectKey,
          'nonexistent',
          'New',
          undefined,
          username,
          slug
        )
      ).rejects.toThrow('Template nonexistent not found');
    });
  });

  describe('deleteTemplate', () => {
    it('should delete a custom template from the library', async () => {
      const projectKey = 'testuser:test-project';
      const username = 'testuser';
      const slug = 'test-project';
      const templateType = 'CUSTOM_hero';

      const mockDoc = new Y.Doc();
      const mockLibrary = mockDoc.getMap('library');
      const schemasMap = new Y.Map();
      const templateData = new Y.Map();
      templateData.set('isBuiltIn', false);
      schemasMap.set(templateType, templateData);
      mockLibrary.set('schemas', schemasMap);

      vi.spyOn(service, 'loadSchemaLibrary').mockResolvedValue(mockLibrary);

      await service.deleteTemplate(projectKey, templateType, username, slug);

      expect(schemasMap.has(templateType)).toBe(false);
    });

    it('should throw error when trying to delete built-in template', async () => {
      const projectKey = 'testuser:test-project';
      const username = 'testuser';
      const slug = 'test-project';
      const templateType = 'character';

      const mockDoc = new Y.Doc();
      const mockLibrary = mockDoc.getMap('library');
      const schemasMap = new Y.Map();
      const templateData = new Y.Map();
      templateData.set('isBuiltIn', true);
      schemasMap.set(templateType, templateData);
      mockLibrary.set('schemas', schemasMap);

      vi.spyOn(service, 'loadSchemaLibrary').mockResolvedValue(mockLibrary);

      await expect(
        service.deleteTemplate(projectKey, templateType, username, slug)
      ).rejects.toThrow('Cannot delete built-in templates');
    });
  });

  describe('updateTemplate', () => {
    it('should update an existing template in the library', async () => {
      const projectKey = 'testuser:test-project';
      const username = 'testuser';
      const slug = 'test-project';
      const templateType = 'CUSTOM_hero';

      const updatedData = {
        name: 'Updated Hero',
        description: 'Updated description',
        tabs: [
          {
            key: 'basic',
            label: 'Basic Info',
            fields: [],
          },
        ],
      };

      const mockDoc = new Y.Doc();
      const mockLibrary = mockDoc.getMap('library');
      const schemasMap = new Y.Map();
      const templateData = new Y.Map();
      templateData.set('version', 1);
      templateData.set('isBuiltIn', false);
      templateData.set('tabs', JSON.stringify(mockCharacterSchema.tabs));
      schemasMap.set(templateType, templateData);
      mockLibrary.set('schemas', schemasMap);

      vi.spyOn(service, 'loadSchemaLibrary').mockResolvedValue(mockLibrary);

      const result = await service.updateTemplate(
        projectKey,
        templateType,
        updatedData,
        username,
        slug
      );

      expect(result.name).toBe('Updated Hero');
      expect(result.description).toBe('Updated description');
      expect(result.version).toBe(2); // Should increment version
      expect(templateData.get('name')).toBe('Updated Hero');
      expect(templateData.get('version')).toBe(2);
    });
  });

  describe('getIconForType', () => {
    it('should return icon for built-in types', async () => {
      expect(await service.getIconForType('CHARACTER')).toBe('person');
      expect(await service.getIconForType('LOCATION')).toBe('place');
      expect(await service.getIconForType('WB_ITEM')).toBe('category');
      expect(await service.getIconForType('ITEM')).toBe('description');
    });

    it('should return default icon for unknown types', async () => {
      expect(await service.getIconForType('unknown')).toBe('description');
    });

    it('should look up icon for custom types from schema library', async () => {
      const elementType = 'CUSTOM_hero';
      const username = 'testuser';
      const slug = 'test-project';

      vi.spyOn(service, 'getSchemaFromLibrary').mockResolvedValue({
        ...mockCharacterSchema,
        type: elementType,
        icon: 'star',
      });

      const icon = await service.getIconForType(elementType, username, slug);

      expect(icon).toBe('star');
      expect(service.getSchemaFromLibrary).toHaveBeenCalledWith(
        'testuser:test-project',
        elementType,
        username,
        slug
      );
    });

    it('should fallback to default icon if custom type schema not found', async () => {
      const elementType = 'CUSTOM_unknown';
      const username = 'testuser';
      const slug = 'test-project';

      vi.spyOn(service, 'getSchemaFromLibrary').mockResolvedValue(null);

      const icon = await service.getIconForType(elementType, username, slug);

      expect(icon).toBe('description');
    });
  });

  describe('initializeWorldbuildingElement', () => {
    it('should initialize element with schema and default values', async () => {
      const element = {
        id: 'test-element-123',
        type: 'CHARACTER' as ProjectElementDto.TypeEnum,
        name: 'Test Character',
      } as ProjectElementDto;
      const username = 'testuser';
      const slug = 'test-project';

      // Create mock Yjs document and connection
      const mockYdoc = new Y.Doc();
      const mockDataMap = mockYdoc.getMap('worldbuilding');
      const mockConnection = {
        ydoc: mockYdoc,
        dataMap: mockDataMap,
        provider: undefined,
        indexeddbProvider: undefined,
      };

      // Mock schema library
      vi.spyOn(service, 'getSchemaFromLibrary').mockResolvedValue(
        mockCharacterSchema
      );

      // Mock setupCollaboration to return dataMap and set up connection
      vi.spyOn(service, 'setupCollaboration').mockImplementation(
        async (elementId: string) => {
          (service as any).connections.set(elementId, mockConnection);
          return mockDataMap;
        }
      );

      await service.initializeWorldbuildingElement(element, username, slug);

      expect(mockDataMap.get('type')).toBe('character'); // Schema type, not element type
      expect(mockDataMap.get('name')).toBe(element.name);
    });

    it('should skip initialization for non-worldbuilding types', async () => {
      const element = {
        id: 'test-element-123',
        type: 'ITEM' as ProjectElementDto.TypeEnum, // ITEM is not a worldbuilding type
        name: 'Test Document',
      } as ProjectElementDto;

      const setupSpy = vi.spyOn(service, 'setupCollaboration');

      await service.initializeWorldbuildingElement(element);

      expect(setupSpy).not.toHaveBeenCalled();
    });

    it('should skip initialization if already initialized', async () => {
      const element = {
        id: 'test-element-123',
        type: 'CHARACTER' as ProjectElementDto.TypeEnum,
        name: 'Test Character',
      } as ProjectElementDto;

      // Create mock Yjs document and connection with type already set
      const mockYdoc = new Y.Doc();
      const mockDataMap = mockYdoc.getMap('worldbuilding');
      mockDataMap.set('type', 'character'); // Already initialized

      const mockConnection = {
        ydoc: mockYdoc,
        dataMap: mockDataMap,
        provider: undefined,
        indexeddbProvider: undefined,
      };

      // Mock setupCollaboration to return dataMap with type already set
      vi.spyOn(service, 'setupCollaboration').mockImplementation(
        async (elementId: string) => {
          (service as any).connections.set(elementId, mockConnection);
          return mockDataMap;
        }
      );

      const schemaSpy = vi.spyOn(service, 'getSchemaFromLibrary');

      await service.initializeWorldbuildingElement(element);

      expect(schemaSpy).not.toHaveBeenCalled();
    });
  });
});
