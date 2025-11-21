import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ElementType } from '@inkweld/index';
import { Element } from '@inkweld/index';
import { vi } from 'vitest';

import { OfflineProjectElementsService } from './offline-project-elements.service';

// Note: nanoid is difficult to mock in Vitest due to hoisting issues
// Tests will verify IDs exist rather than checking specific values

describe('OfflineProjectElementsService', () => {
  let service: OfflineProjectElementsService;
  const TEST_USERNAME = 'testuser';
  const TEST_SLUG = 'test-project';
  const PROJECT_KEY = `${TEST_USERNAME}:${TEST_SLUG}`;

  // Mock localStorage
  const mockLocalStorage = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  };

  beforeEach(() => {
    // Setup localStorage mock
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
    });

    // Reset mocks
    mockLocalStorage.getItem.mockReset();
    mockLocalStorage.setItem.mockReset();

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        OfflineProjectElementsService,
      ],
    });

    service = TestBed.inject(OfflineProjectElementsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
      expect(service.elements()).toEqual([]);
      expect(service.isLoading()).toBe(false);
    });
  });

  describe('loadElements', () => {
    it('should load elements from localStorage', async () => {
      const mockElements: Element[] =
        [
          {
            id: 'element-1',
            name: 'Test Element',
            type: ElementType.Folder,
            parentId: null,
            level: 0,
            expandable: true,
            order: 0,
            version: 0,
            metadata: {},
          },
        ];

      const storedData = { [PROJECT_KEY]: mockElements };
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(storedData));

      await service.loadElements(TEST_USERNAME, TEST_SLUG);

      expect(service.elements()).toHaveLength(mockElements.length);
      expect(service.isLoading()).toBe(false);
    });

    it('should handle empty IndexedDB', async () => {
      mockLocalStorage.getItem.mockReturnValue(null);

      await service.loadElements(TEST_USERNAME, TEST_SLUG);

      expect(service.elements()).toEqual([]);
      expect(service.isLoading()).toBe(false);
    });

    it('should handle localStorage parse errors', async () => {
      mockLocalStorage.getItem.mockReturnValue('invalid-json');
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await service.loadElements(TEST_USERNAME, TEST_SLUG);

      expect(service.elements()).toEqual([]);

      consoleSpy.mockRestore();
    });
  });

  describe('saveElements', () => {
    it('should save elements using Yjs', async () => {
      const elements: Element[] = [
        {
          id: 'element-1',
          name: 'Test Element',
          type: ElementType.Item,
          parentId: null,
          level: 0,
          expandable: false,
          order: 0,
          version: 0,
          metadata: {},
        },
      ];

      mockLocalStorage.getItem.mockReturnValue('{}');

      await service.saveElements(TEST_USERNAME, TEST_SLUG, elements);

      expect(service.elements()).toEqual(elements);
    });

    it('should handle save errors', async () => {
      const elements: Element[] =
        [];
      mockLocalStorage.getItem.mockReturnValue('{}');

      // The save should complete even if there are issues
      await expect(
        service.saveElements(TEST_USERNAME, TEST_SLUG, elements)
      ).resolves.not.toThrow();
    });
  });

  describe('createDefaultStructure', () => {
    beforeEach(() => {
      mockLocalStorage.getItem.mockReturnValue('{}');
    });

    it('should create default project structure', async () => {
      const result = await service.createDefaultStructure(
        TEST_USERNAME,
        TEST_SLUG
      );

      expect(result).toHaveLength(4);
      expect(result[0]).toMatchObject({
        name: 'Chapters',
        type: ElementType.Folder,
        level: 0,
        expandable: true,
        order: 0,
      });
      expect(result[0].id).toBeTypeOf('string');
      expect(result[0].id.length).toBeGreaterThan(0);
      expect(result[1].id).toBeTypeOf('string');
      expect(result[2].id).toBeTypeOf('string');
      expect(result[3].id).toBeTypeOf('string');

      expect(mockLocalStorage.setItem).toHaveBeenCalled();
    });
  });

  describe('addElement', () => {
    beforeEach(() => {
      const initialElements: Element[] =
        [
          {
            id: 'folder-1',
            name: 'Folder 1',
            type: ElementType.Folder,
            parentId: null,
            level: 0,
            expandable: true,
            order: 0,
            version: 0,
            metadata: {},
          },
        ];
      service.elements.set(initialElements);
      mockLocalStorage.getItem.mockReturnValue(
        JSON.stringify({ [PROJECT_KEY]: initialElements })
      );
    });

    it('should add element at root level', () => {
      const result = service.addElement(
        TEST_USERNAME,
        TEST_SLUG,
        ElementType.Item,
        'New Document'
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        name: 'New Document',
        type: ElementType.Item,
        level: 0,
        expandable: false,
        order: 0,
      });
      expect(result[0].id).toBeTypeOf('string');
      expect(result[1]).toMatchObject({
        id: 'folder-1',
        name: 'Folder 1',
        type: ElementType.Folder,
        order: 1,
      });
    });

    it('should add element as child of folder', () => {
      const result = service.addElement(
        TEST_USERNAME,
        TEST_SLUG,
        ElementType.Item,
        'Child Document',
        'folder-1'
      );

      expect(result).toHaveLength(2);
      expect(result[1]).toMatchObject({
        name: 'Child Document',
        type: ElementType.Item,
        level: 1,
        expandable: false,
        order: 1,
      });
      expect(result[1].id).toBeTypeOf('string');
    });

    it.skip('should recompute positions correctly', async () => {
      await service.addElement(
        TEST_USERNAME,
        TEST_SLUG,
        ElementType.Item,
        'Doc 1'
      );
      const result = await service.addElement(
        TEST_USERNAME,
        TEST_SLUG,
        ElementType.Item,
        'Doc 2'
      );

      expect(result[0].order).toBe(0);
      expect(result[1].order).toBe(1);
      expect(result[2].order).toBe(2);
    });
  });

  describe('deleteElement', () => {
    beforeEach(() => {
      const initialElements: Element[] =
        [
          {
            id: 'folder-1',
            name: 'Folder 1',
            type: ElementType.Folder,
            parentId: null,
            level: 0,
            expandable: true,
            order: 0,
            version: 0,
            metadata: {},
          },
          {
            id: 'doc-1',
            name: 'Document 1',
            type: ElementType.Item,
            parentId: null,
            level: 1,
            expandable: false,
            order: 1,
            version: 0,
            metadata: {},
          },
          {
            id: 'doc-2',
            name: 'Document 2',
            type: ElementType.Item,
            parentId: null,
            level: 1,
            expandable: false,
            order: 2,
            version: 0,
            metadata: {},
          },
          {
            id: 'folder-2',
            name: 'Folder 2',
            type: ElementType.Folder,
            parentId: null,
            level: 0,
            expandable: true,
            order: 3,
            version: 0,
            metadata: {},
          },
        ];
      service.elements.set(initialElements);
      mockLocalStorage.getItem.mockReturnValue(
        JSON.stringify({ [PROJECT_KEY]: initialElements })
      );
    });

    it('should delete single element', () => {
      const result = service.deleteElement(TEST_USERNAME, TEST_SLUG, 'doc-2');

      expect(result).toHaveLength(3);
      expect(result.find(e => e.id === 'doc-2')).toBeUndefined();
      expect(result[2].order).toBe(2); // Positions recomputed
    });

    it('should delete element with subtree', () => {
      const result = service.deleteElement(
        TEST_USERNAME,
        TEST_SLUG,
        'folder-1'
      );

      expect(result).toHaveLength(1);
      expect(result.find(e => e.id === 'folder-1')).toBeUndefined();
      expect(result.find(e => e.id === 'doc-1')).toBeUndefined();
      expect(result.find(e => e.id === 'doc-2')).toBeUndefined();
      expect(result[0].id).toBe('folder-2');
    });

    it('should handle non-existent element', () => {
      const result = service.deleteElement(
        TEST_USERNAME,
        TEST_SLUG,
        'non-existent'
      );

      expect(result).toHaveLength(4); // No change
    });
  });

  describe('moveElement', () => {
    beforeEach(() => {
      const initialElements: Element[] =
        [
          {
            id: 'folder-1',
            name: 'Folder 1',
            type: ElementType.Folder,
            parentId: null,
            level: 0,
            expandable: true,
            order: 0,
            version: 0,
            metadata: {},
          },
          {
            id: 'doc-1',
            name: 'Document 1',
            type: ElementType.Item,
            parentId: null,
            level: 1,
            expandable: false,
            order: 1,
            version: 0,
            metadata: {},
          },
          {
            id: 'doc-2',
            name: 'Document 2',
            type: ElementType.Item,
            parentId: null,
            level: 0,
            expandable: false,
            order: 2,
            version: 0,
            metadata: {},
          },
        ];
      service.elements.set(initialElements);
      mockLocalStorage.getItem.mockReturnValue(
        JSON.stringify({ [PROJECT_KEY]: initialElements })
      );
    });

    it('should move element to different position', () => {
      const result = service.moveElement(
        TEST_USERNAME,
        TEST_SLUG,
        'doc-2',
        0,
        0
      );

      expect(result[0].id).toBe('doc-2');
      expect(result[1].id).toBe('folder-1');
      expect(result[2].id).toBe('doc-1');
    });

    it('should change element level when moving', () => {
      const result = service.moveElement(
        TEST_USERNAME,
        TEST_SLUG,
        'doc-2',
        2,
        1
      );

      const movedElement = result.find(e => e.id === 'doc-2');
      expect(movedElement?.level).toBe(1);
    });

    it('should handle non-existent element', () => {
      const result = service.moveElement(
        TEST_USERNAME,
        TEST_SLUG,
        'non-existent',
        0,
        0
      );

      expect(result).toHaveLength(3); // No change
    });
  });

  describe('renameElement', () => {
    beforeEach(() => {
      const initialElements: Element[] =
        [
          {
            id: 'doc-1',
            name: 'Old Name',
            type: ElementType.Item,
            parentId: null,
            level: 0,
            expandable: false,
            order: 0,
            version: 0,
            metadata: {},
          },
        ];
      service.elements.set(initialElements);
      mockLocalStorage.getItem.mockReturnValue(
        JSON.stringify({ [PROJECT_KEY]: initialElements })
      );
    });

    it('should rename element', () => {
      const result = service.renameElement(
        TEST_USERNAME,
        TEST_SLUG,
        'doc-1',
        'New Name'
      );

      expect(result[0].name).toBe('New Name');
      expect(mockLocalStorage.setItem).toHaveBeenCalled();
    });

    it('should handle non-existent element', () => {
      const result = service.renameElement(
        TEST_USERNAME,
        TEST_SLUG,
        'non-existent',
        'New Name'
      );

      const firstElement = result[0];
      expect(firstElement.name).toBe('Old Name'); // No change
    });
  });

  describe('project isolation', () => {
    it('should isolate elements by project key', async () => {
      const project1Elements: Element[] =
        [
          {
            id: 'p1-doc',
            name: 'Project 1 Doc',
            type: ElementType.Item,
            parentId: null,
            level: 0,
            expandable: false,
            order: 0,
            version: 0,
            metadata: {},
          },
        ];

      const project2Elements: Element[] =
        [
          {
            id: 'p2-doc',
            name: 'Project 2 Doc',
            type: ElementType.Item,
            parentId: null,
            level: 0,
            expandable: false,
            order: 0,
            version: 0,
            metadata: {},
          },
        ];

      const storedData = {
        'user1:project1': project1Elements,
        'user2:project2': project2Elements,
      };
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(storedData));

      // Load project 1
      await service.loadElements('user1', 'project1');
      expect(service.elements()).toHaveLength(project1Elements.length);

      // Load project 2
      await service.loadElements('user2', 'project2');
      expect(service.elements()).toHaveLength(project2Elements.length);
    });
  });
});
