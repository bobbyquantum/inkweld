import { provideHttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Element } from '@inkweld/index';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ElementTypeSchema } from '../../models/schema-types';
import { SetupService } from '../core/setup.service';
import { DefaultTemplatesService } from './default-templates.service';
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
      getMode: vi.fn().mockReturnValue('offline'), // Use offline mode to avoid WebSocket
      getWebSocketUrl: vi.fn().mockReturnValue('ws://localhost:8333'),
    };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        WorldbuildingService,
        DefaultTemplatesService,
        { provide: SetupService, useValue: setupService },
      ],
    });

    service = TestBed.inject(WorldbuildingService);
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

  describe('getEmbeddedSchema / updateEmbeddedSchema', () => {
    it('should return null for element with no embedded schema', async () => {
      const elementId = 'element-no-schema';

      const schema = await service.getEmbeddedSchema(elementId);

      expect(schema).toBeNull();
    });

    it('should embed and retrieve schema from element', async () => {
      const elementId = 'element-with-schema';

      // Update embedded schema
      await service.updateEmbeddedSchema(elementId, mockCharacterSchema);

      // Retrieve it
      const schema = await service.getEmbeddedSchema(elementId);

      expect(schema).toBeDefined();
      expect(schema?.type).toBe('character');
      expect(schema?.name).toBe('Character');
      expect(schema?.version).toBe(1);
      expect(schema?.tabs).toHaveLength(1);
    });
  });

  describe('getAllSchemas / saveSchemaToLibrary', () => {
    it('should return empty array for new project', async () => {
      const schemas = await service.getAllSchemas('newuser', 'newproject');

      expect(schemas).toEqual([]);
    });

    it('should save and retrieve schemas from library', async () => {
      const username = 'testuser';
      const slug = 'testproject';

      // Save a schema
      await service.saveSchemaToLibrary(username, slug, mockCharacterSchema);

      // Retrieve all schemas
      const schemas = await service.getAllSchemas(username, slug);

      expect(schemas).toHaveLength(1);
      expect(schemas[0].type).toBe('character');
      expect(schemas[0].name).toBe('Character');
    });

    it('should save multiple schemas', async () => {
      const username = 'testuser';
      const slug = 'testproject2';

      const locationSchema: ElementTypeSchema = {
        ...mockCharacterSchema,
        id: 'location',
        type: 'location',
        name: 'Location',
        icon: 'place',
      };

      await service.saveSchemasToLibrary(username, slug, [
        mockCharacterSchema,
        locationSchema,
      ]);

      const schemas = await service.getAllSchemas(username, slug);

      expect(schemas).toHaveLength(2);
      expect(schemas.map(s => s.type).sort()).toEqual([
        'character',
        'location',
      ]);
    });
  });

  describe('getSchema', () => {
    it('should retrieve specific schema by type', async () => {
      const username = 'testuser';
      const slug = 'testproject3';

      // Save schema first
      await service.saveSchemaToLibrary(username, slug, mockCharacterSchema);

      // Get specific schema
      const schema = await service.getSchema(username, slug, 'character');

      expect(schema).toBeDefined();
      expect(schema?.type).toBe('character');
    });

    it('should return null for non-existent schema type', async () => {
      const schema = await service.getSchema(
        'testuser',
        'testproject4',
        'nonexistent'
      );

      expect(schema).toBeNull();
    });
  });

  describe('hasNoSchemas', () => {
    it('should return true for empty library', async () => {
      const isEmpty = await service.hasNoSchemas('newuser2', 'newproject2');

      expect(isEmpty).toBe(true);
    });

    it('should return false when schemas exist', async () => {
      const username = 'testuser';
      const slug = 'testproject5';

      await service.saveSchemaToLibrary(username, slug, mockCharacterSchema);

      const isEmpty = await service.hasNoSchemas(username, slug);

      expect(isEmpty).toBe(false);
    });
  });

  describe('cloneTemplate', () => {
    it('should clone an existing template with new ID', async () => {
      const username = 'testuser';
      const slug = 'clonetest';
      const projectKey = `${username}:${slug}`;

      // Save original template
      await service.saveSchemaToLibrary(username, slug, mockCharacterSchema);

      // Clone it
      const clonedSchema = await service.cloneTemplate(
        projectKey,
        'character',
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

    it('should throw error if source template not found', async () => {
      const username = 'testuser';
      const slug = 'clonetest2';
      const projectKey = `${username}:${slug}`;

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
      const username = 'testuser';
      const slug = 'deletetest';
      const projectKey = `${username}:${slug}`;

      // Save and clone to create a custom template
      await service.saveSchemaToLibrary(username, slug, mockCharacterSchema);
      const cloned = await service.cloneTemplate(
        projectKey,
        'character',
        'ToDelete',
        undefined,
        username,
        slug
      );

      // Delete the custom template
      await service.deleteTemplate(projectKey, cloned.type, username, slug);

      // Verify it's deleted
      const schema = await service.getSchema(username, slug, cloned.type);
      expect(schema).toBeNull();
    });

    it('should throw error when trying to delete built-in template', async () => {
      const username = 'testuser';
      const slug = 'deletetest2';
      const projectKey = `${username}:${slug}`;

      await service.saveSchemaToLibrary(username, slug, mockCharacterSchema);

      await expect(
        service.deleteTemplate(projectKey, 'character', username, slug)
      ).rejects.toThrow('Cannot delete built-in templates');
    });
  });

  describe('updateTemplate', () => {
    it('should update an existing template in the library', async () => {
      const username = 'testuser';
      const slug = 'updatetest';
      const projectKey = `${username}:${slug}`;

      // Save and clone to create a custom template
      await service.saveSchemaToLibrary(username, slug, mockCharacterSchema);
      const cloned = await service.cloneTemplate(
        projectKey,
        'character',
        'ToUpdate',
        undefined,
        username,
        slug
      );

      const updatedData = {
        name: 'Updated Hero',
        description: 'Updated description',
      };

      const result = await service.updateTemplate(
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
      const username = 'testuser';
      const slug = 'icontest';

      // Save custom schema with specific icon
      const customSchema: ElementTypeSchema = {
        ...mockCharacterSchema,
        type: 'CUSTOM_hero',
        icon: 'star',
      };
      await service.saveSchemaToLibrary(username, slug, customSchema);

      const icon = await service.getIconForType('CUSTOM_hero', username, slug);

      expect(icon).toBe('star');
    });

    it('should fallback to default icon if custom type schema not found', async () => {
      const icon = await service.getIconForType(
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

      // No schema should be embedded for non-worldbuilding types
      const schema = await service.getEmbeddedSchema('test-element-123');
      expect(schema).toBeNull();
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
      await service.saveSchemaToLibrary(username, slug, mockCharacterSchema);

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
