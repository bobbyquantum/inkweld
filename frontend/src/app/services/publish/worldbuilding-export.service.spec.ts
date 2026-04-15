import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type Project } from '@inkweld/index';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type ElementTypeSchema, FieldType } from '../../models/schema-types';
import { LocalStorageService } from '../local/local-storage.service';
import { ProjectStateService } from '../project/project-state.service';
import { WorldbuildingService } from '../worldbuilding/worldbuilding.service';
import { WorldbuildingExportService } from './worldbuilding-export.service';

describe('WorldbuildingExportService', () => {
  let service: WorldbuildingExportService;
  let worldbuildingMock: {
    getIdentityData: ReturnType<typeof vi.fn>;
    getWorldbuildingData: ReturnType<typeof vi.fn>;
    getSchemaForElement: ReturnType<typeof vi.fn>;
    destroyConnection: ReturnType<typeof vi.fn>;
  };
  let localStorageMock: {
    getMedia: ReturnType<typeof vi.fn>;
  };
  let projectStateMock: {
    project: ReturnType<typeof signal<Project | null>>;
  };

  const mockProject: Project = {
    id: 'proj-1',
    username: 'testuser',
    slug: 'test-project',
    title: 'Test Project',
    description: '',
    createdDate: '2024-01-01',
    updatedDate: '2024-01-01',
  };

  const mockSchema: ElementTypeSchema = {
    id: 'character-v1',
    name: 'Character',
    icon: 'person',
    description: 'A character',
    version: 1,
    isBuiltIn: true,
    tabs: [
      {
        key: 'basic',
        label: 'Basic Info',
        icon: 'info',
        order: 1,
        fields: [
          { key: 'name', label: 'Name', type: FieldType.TEXT },
          { key: 'age', label: 'Age', type: FieldType.NUMBER },
          { key: 'alive', label: 'Alive', type: FieldType.CHECKBOX },
        ],
      },
      {
        key: 'details',
        label: 'Details',
        icon: 'notes',
        order: 2,
        fields: [
          { key: 'bio', label: 'Biography', type: FieldType.TEXTAREA },
          {
            key: 'tags',
            label: 'Tags',
            type: FieldType.ARRAY,
          },
        ],
      },
    ],
    defaultValues: {},
  };

  beforeEach(() => {
    worldbuildingMock = {
      getIdentityData: vi.fn().mockResolvedValue({}),
      getWorldbuildingData: vi.fn().mockResolvedValue({}),
      getSchemaForElement: vi.fn().mockResolvedValue(null),
      destroyConnection: vi.fn(),
    };

    localStorageMock = {
      getMedia: vi.fn().mockResolvedValue(null),
    };

    projectStateMock = {
      project: signal(mockProject),
    };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        WorldbuildingExportService,
        { provide: WorldbuildingService, useValue: worldbuildingMock },
        { provide: LocalStorageService, useValue: localStorageMock },
        { provide: ProjectStateService, useValue: projectStateMock },
      ],
    });

    service = TestBed.inject(WorldbuildingExportService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('loadWorldbuildingEntry', () => {
    it('should return null when no project is set', async () => {
      projectStateMock.project = signal(
        null
      ) as typeof projectStateMock.project;
      // re-create service with null project
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          WorldbuildingExportService,
          { provide: WorldbuildingService, useValue: worldbuildingMock },
          { provide: LocalStorageService, useValue: localStorageMock },
          {
            provide: ProjectStateService,
            useValue: { project: signal(null) },
          },
        ],
      });
      const svc = TestBed.inject(WorldbuildingExportService);
      const result = await svc.loadWorldbuildingEntry('el-1', 'Test');
      expect(result).toBeNull();
    });

    it('should return entry with title and empty sections when data is empty', async () => {
      const result = await service.loadWorldbuildingEntry(
        'el-1',
        'My Character'
      );

      expect(result).toBeDefined();
      expect(result!.title).toBe('My Character');
      expect(result!.image).toBeNull();
      expect(result!.description).toBeNull();
      expect(result!.sections).toEqual([]);
    });

    it('should resolve image from media:// URL', async () => {
      const imageBlob = new Blob(['img'], { type: 'image/png' });
      worldbuildingMock.getIdentityData.mockResolvedValue({
        image: 'media://img-123',
        description: 'A hero',
      });
      localStorageMock.getMedia.mockResolvedValue(imageBlob);

      const result = await service.loadWorldbuildingEntry('el-1', 'Hero');

      expect(result!.image).toBe(imageBlob);
      expect(result!.imageMimeType).toBe('image/png');
      expect(result!.description).toBe('A hero');
      expect(localStorageMock.getMedia).toHaveBeenCalledWith(
        'testuser/test-project',
        'img-123'
      );
    });

    it('should ignore non-media:// image URLs', async () => {
      worldbuildingMock.getIdentityData.mockResolvedValue({
        image: 'https://example.com/img.png',
      });

      const result = await service.loadWorldbuildingEntry('el-1', 'Hero');

      expect(result!.image).toBeNull();
      expect(localStorageMock.getMedia).not.toHaveBeenCalled();
    });

    it('should build sections from schema tabs sorted by order', async () => {
      worldbuildingMock.getSchemaForElement.mockResolvedValue(mockSchema);
      worldbuildingMock.getWorldbuildingData.mockResolvedValue({
        name: 'Alice',
        age: 25,
        alive: true,
        bio: 'A brave adventurer',
        tags: ['hero', 'warrior'],
      });

      const result = await service.loadWorldbuildingEntry('el-1', 'Alice');

      expect(result!.sections).toHaveLength(2);
      expect(result!.sections[0].heading).toBe('Basic Info');
      expect(result!.sections[0].fields).toEqual([
        { label: 'Name', value: 'Alice' },
        { label: 'Age', value: '25' },
        { label: 'Alive', value: 'Yes' },
      ]);
      expect(result!.sections[1].heading).toBe('Details');
      expect(result!.sections[1].fields).toEqual([
        { label: 'Biography', value: 'A brave adventurer' },
        { label: 'Tags', value: 'hero, warrior' },
      ]);
    });

    it('should skip empty fields and sections', async () => {
      worldbuildingMock.getSchemaForElement.mockResolvedValue(mockSchema);
      worldbuildingMock.getWorldbuildingData.mockResolvedValue({
        name: 'Bob',
        // age, alive, bio, tags all empty/missing
      });

      const result = await service.loadWorldbuildingEntry('el-1', 'Bob');

      expect(result!.sections).toHaveLength(1);
      expect(result!.sections[0].heading).toBe('Basic Info');
      expect(result!.sections[0].fields).toEqual([
        { label: 'Name', value: 'Bob' },
      ]);
    });

    it('should format checkbox false as null (excluded)', async () => {
      worldbuildingMock.getSchemaForElement.mockResolvedValue(mockSchema);
      worldbuildingMock.getWorldbuildingData.mockResolvedValue({
        name: 'Carl',
        alive: false,
      });

      const result = await service.loadWorldbuildingEntry('el-1', 'Carl');
      const basicFields = result!.sections[0].fields;
      const aliveField = basicFields.find(f => f.label === 'Alive');
      expect(aliveField).toBeUndefined();
    });

    it('should build raw section when no schema exists', async () => {
      worldbuildingMock.getSchemaForElement.mockResolvedValue(null);
      worldbuildingMock.getWorldbuildingData.mockResolvedValue({
        name: 'Freeform Entry',
        power: 'flight',
        _internal: 'ignored',
        lastModified: 12345,
      });

      const result = await service.loadWorldbuildingEntry('el-1', 'Free');

      expect(result!.sections).toHaveLength(1);
      expect(result!.sections[0].heading).toBe('Details');
      expect(result!.sections[0].fields).toEqual([
        { label: 'name', value: 'Freeform Entry' },
        { label: 'power', value: 'flight' },
      ]);
    });

    it('should always call destroyConnection even on error', async () => {
      worldbuildingMock.getIdentityData.mockRejectedValue(
        new Error('connection failed')
      );

      await expect(
        service.loadWorldbuildingEntry('el-1', 'Fail')
      ).rejects.toThrow('connection failed');

      expect(worldbuildingMock.destroyConnection).toHaveBeenCalledWith(
        'el-1',
        'testuser',
        'test-project'
      );
    });

    it('should call destroyConnection on success', async () => {
      await service.loadWorldbuildingEntry('el-1', 'OK');

      expect(worldbuildingMock.destroyConnection).toHaveBeenCalledWith(
        'el-1',
        'testuser',
        'test-project'
      );
    });

    it('should handle SELECT fields with option labels', async () => {
      const selectSchema: ElementTypeSchema = {
        ...mockSchema,
        tabs: [
          {
            key: 'props',
            label: 'Properties',
            icon: 'list',
            order: 1,
            fields: [
              {
                key: 'role',
                label: 'Role',
                type: FieldType.SELECT,
                options: [
                  { value: 'protagonist', label: 'Protagonist' },
                  { value: 'antagonist', label: 'Antagonist' },
                ],
              },
            ],
          },
        ],
      };
      worldbuildingMock.getSchemaForElement.mockResolvedValue(selectSchema);
      worldbuildingMock.getWorldbuildingData.mockResolvedValue({
        role: 'protagonist',
      });

      const result = await service.loadWorldbuildingEntry('el-1', 'Hero');

      expect(result!.sections[0].fields[0]).toEqual({
        label: 'Role',
        value: 'Protagonist',
      });
    });

    it('should handle MULTISELECT fields', async () => {
      const multiSchema: ElementTypeSchema = {
        ...mockSchema,
        tabs: [
          {
            key: 'traits',
            label: 'Traits',
            icon: 'list',
            order: 1,
            fields: [
              {
                key: 'skills',
                label: 'Skills',
                type: FieldType.MULTISELECT,
              },
            ],
          },
        ],
      };
      worldbuildingMock.getSchemaForElement.mockResolvedValue(multiSchema);
      worldbuildingMock.getWorldbuildingData.mockResolvedValue({
        skills: ['sword', 'magic', 'stealth'],
      });

      const result = await service.loadWorldbuildingEntry('el-1', 'Rogue');

      expect(result!.sections[0].fields[0]).toEqual({
        label: 'Skills',
        value: 'sword, magic, stealth',
      });
    });
  });
});
