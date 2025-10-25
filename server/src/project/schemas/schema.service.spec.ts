import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, jest } from 'bun:test';
import * as Y from 'yjs';
import { LevelDBManagerService } from '../../common/persistence/leveldb-manager.service.js';
import { SchemaService } from './schema.service.js';
import type {
  ElementTypeSchema,
  ProjectSchemaLibrary,
} from './worldbuilding-schema.interface.js';

describe('SchemaService', () => {
  let service: SchemaService;
  let levelDBManager: LevelDBManagerService;
  let mockDb: {
    getYDoc: ReturnType<typeof jest.fn>;
    storeUpdate: ReturnType<typeof jest.fn>;
  };

  const mockCharacterSchema: ElementTypeSchema = {
    id: 'character',
    type: 'character',
    name: 'Character',
    icon: 'person',
    description: 'Character schema',
    version: 1,
    isBuiltIn: true,
    tabs: [],
    defaultValues: {},
  };

  beforeEach(async () => {
    // Create mock database
    mockDb = {
      getYDoc: jest.fn(),
      storeUpdate: jest.fn(),
    };

    // Create mock LevelDBManager
    const mockLevelDBManager = {
      getProjectDatabase: jest.fn().mockResolvedValue(mockDb),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchemaService,
        {
          provide: LevelDBManagerService,
          useValue: mockLevelDBManager,
        },
      ],
    }).compile();

    service = module.get<SchemaService>(SchemaService);
    levelDBManager = module.get<LevelDBManagerService>(LevelDBManagerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initializeProjectSchemas', () => {
    it('should create a project schema library with default schemas', () => {
      const projectId = 'testuser:test-project';

      const library = service.initializeProjectSchemas(projectId);

      expect(library.projectId).toBe(projectId);
      expect(library.schemas).toBeDefined();
      expect(Object.keys(library.schemas).length).toBeGreaterThan(0);
      expect(library.createdAt).toBeDefined();
      expect(library.updatedAt).toBeDefined();
    });
  });

  describe('getSchemaFromLibrary', () => {
    it('should retrieve schema from library', () => {
      const library: ProjectSchemaLibrary = {
        projectId: 'test',
        schemas: {
          character: mockCharacterSchema,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const schema = service.getSchemaFromLibrary(library, 'character');

      expect(schema).toEqual(mockCharacterSchema);
    });

    it('should throw NotFoundException if schema not found', () => {
      const library: ProjectSchemaLibrary = {
        projectId: 'test',
        schemas: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(() => {
        service.getSchemaFromLibrary(library, 'nonexistent');
      }).toThrow();
    });
  });

  describe('createSchemaSnapshot', () => {
    it('should create a deep copy of the schema', () => {
      const snapshot = service.createSchemaSnapshot(mockCharacterSchema);

      expect(snapshot).toEqual(mockCharacterSchema);
      expect(snapshot).not.toBe(mockCharacterSchema); // Different reference
    });
  });

  describe('storeLibraryInYDoc and loadLibraryFromYDoc', () => {
    it('should store and load schema library from Y.Doc', () => {
      const ydoc = new Y.Doc();
      const library: ProjectSchemaLibrary = {
        projectId: 'test-project',
        schemas: {
          character: mockCharacterSchema,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      service.storeLibraryInYDoc(ydoc, library);
      const loadedLibrary = service.loadLibraryFromYDoc(ydoc);

      expect(loadedLibrary).toBeDefined();
      expect(loadedLibrary?.projectId).toBe(library.projectId);
      expect(loadedLibrary?.schemas.character).toBeDefined();
      expect(loadedLibrary?.schemas.character.type).toBe('character');
    });

    it('should return null if Y.Doc has no schema library', () => {
      const ydoc = new Y.Doc();

      const loadedLibrary = service.loadLibraryFromYDoc(ydoc);

      expect(loadedLibrary).toBeNull();
    });
  });

  describe('updateSchemaInLibrary', () => {
    it('should update a schema in the library', () => {
      const library: ProjectSchemaLibrary = {
        projectId: 'test',
        schemas: {
          character: mockCharacterSchema,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const updates: Partial<ElementTypeSchema> = {
        name: 'Updated Character',
        description: 'Updated description',
      };

      const updatedLibrary = service.updateSchemaInLibrary(
        library,
        'character',
        updates,
      );

      expect(updatedLibrary.schemas.character.name).toBe('Updated Character');
      expect(updatedLibrary.schemas.character.description).toBe(
        'Updated description',
      );
      expect(updatedLibrary.schemas.character.version).toBe(2); // Version incremented
    });

    it('should throw NotFoundException if schema not found', () => {
      const library: ProjectSchemaLibrary = {
        projectId: 'test',
        schemas: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(() => {
        service.updateSchemaInLibrary(library, 'nonexistent', {});
      }).toThrow();
    });
  });

  describe('addSchemaToLibrary', () => {
    it('should add a new schema to the library', () => {
      const library: ProjectSchemaLibrary = {
        projectId: 'test',
        schemas: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const newSchema: ElementTypeSchema = {
        id: 'custom',
        type: 'custom',
        name: 'Custom Element',
        icon: 'star',
        description: 'A custom element',
        version: 1,
        isBuiltIn: false,
        tabs: [],
      };

      const updatedLibrary = service.addSchemaToLibrary(library, newSchema);

      expect(updatedLibrary.schemas.custom).toBeDefined();
      expect(updatedLibrary.schemas.custom.name).toBe('Custom Element');
      expect(updatedLibrary.schemas.custom.isBuiltIn).toBe(false);
    });

    it('should throw error if schema already exists', () => {
      const library: ProjectSchemaLibrary = {
        projectId: 'test',
        schemas: {
          character: mockCharacterSchema,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(() => {
        service.addSchemaToLibrary(library, mockCharacterSchema);
      }).toThrow();
    });
  });

  describe('initializeProjectSchemasInDB', () => {
    it('should initialize schemas in LevelDB', async () => {
      const username = 'testuser';
      const slug = 'test-project';
      const mockYDoc = new Y.Doc();

      mockDb.getYDoc.mockResolvedValueOnce(mockYDoc);
      mockDb.storeUpdate.mockResolvedValueOnce(undefined);

      await service.initializeProjectSchemasInDB(username, slug);

      expect(levelDBManager.getProjectDatabase).toHaveBeenCalledWith(
        username,
        slug,
      );
      expect(mockDb.getYDoc).toHaveBeenCalledWith('__schemas__');
      expect(mockDb.storeUpdate).toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      const username = 'testuser';
      const slug = 'test-project';

      (levelDBManager.getProjectDatabase as ReturnType<typeof jest.fn>).mockRejectedValueOnce(
        new Error('Database error'),
      );

      await expect(
        service.initializeProjectSchemasInDB(username, slug),
      ).rejects.toThrow('Database error');
    });
  });

  describe('loadProjectSchemas', () => {
    it('should load schemas from LevelDB', async () => {
      const username = 'testuser';
      const slug = 'test-project';
      const mockYDoc = new Y.Doc();

      // Setup Y.Doc with a schema library
      const library = service.initializeProjectSchemas('testuser:test-project');
      service.storeLibraryInYDoc(mockYDoc, library);

      mockDb.getYDoc.mockResolvedValueOnce(mockYDoc);

      const result = await service.loadProjectSchemas(username, slug);

      expect(result).toBeDefined();
      expect(result?.projectId).toBe('testuser:test-project');
    });

    it('should return null on error', async () => {
      const username = 'testuser';
      const slug = 'test-project';

      (levelDBManager.getProjectDatabase as ReturnType<typeof jest.fn>).mockRejectedValueOnce(
        new Error('Database error'),
      );

      const result = await service.loadProjectSchemas(username, slug);

      expect(result).toBeNull();
    });
  });

  describe('embedSchemaInElementDoc and loadSchemaFromElementDoc', () => {
    it('should embed and load schema from element Y.Doc', () => {
      const ydoc = new Y.Doc();

      service.embedSchemaInElementDoc(ydoc, mockCharacterSchema);
      const loadedSchema = service.loadSchemaFromElementDoc(ydoc);

      expect(loadedSchema).toBeDefined();
      expect(loadedSchema?.type).toBe('character');
      expect(loadedSchema?.name).toBe('Character');
    });

    it('should return null if no schema embedded', () => {
      const ydoc = new Y.Doc();

      const loadedSchema = service.loadSchemaFromElementDoc(ydoc);

      expect(loadedSchema).toBeNull();
    });
  });

  describe('getDefaultSchemas', () => {
    it('should return default schemas', () => {
      const schemas = service.getDefaultSchemas();

      expect(Array.isArray(schemas)).toBe(true);
      expect(schemas.length).toBeGreaterThan(0);
      expect(schemas[0]).toHaveProperty('id');
      expect(schemas[0]).toHaveProperty('type');
      expect(schemas[0]).toHaveProperty('tabs');
    });
  });
});

