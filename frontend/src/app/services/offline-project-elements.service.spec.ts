import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { GetApiV1ProjectsUsernameSlugElements200ResponseInnerType } from '@inkweld/index';
import { GetApiV1ProjectsUsernameSlugElements200ResponseInnerType } from '@inkweld/index';
import { GetApiV1ProjectsUsernameSlugElements200ResponseInner } from '@inkweld/index';
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
    it('should load elements from localStorage', () => {
      const mockElements: GetApiV1ProjectsUsernameSlugElements200ResponseInner[] =
        [
          {
            id: 'element-1',
            name: 'Test Element',
            type: GetApiV1ProjectsUsernameSlugElements200ResponseInnerType.Folder,
            level: 0,
            expandable: true,
            order: 0,
            version: 0,
            metadata: {},
          },
        ];

      const storedData = { [PROJECT_KEY]: mockElements };
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(storedData));

      service.loadElements(TEST_USERNAME, TEST_SLUG);

      expect(mockLocalStorage.getItem).toHaveBeenCalledWith(
        'inkweld-offline-elements'
      );
      expect(service.elements()).toEqual(mockElements);
      expect(service.isLoading()).toBe(false);
    });

    it('should handle empty localStorage', () => {
      mockLocalStorage.getItem.mockReturnValue(null);

      service.loadElements(TEST_USERNAME, TEST_SLUG);

      expect(service.elements()).toEqual([]);
      expect(service.isLoading()).toBe(false);
    });

    it('should handle localStorage parse errors', () => {
      mockLocalStorage.getItem.mockReturnValue('invalid-json');
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      service.loadElements(TEST_USERNAME, TEST_SLUG);

      expect(service.elements()).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to load offline elements:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('saveElements', () => {
    it('should save elements to localStorage', () => {
      const elements: GetApiV1ProjectsUsernameSlugElements200ResponseInner[] = [
        {
          id: 'element-1',
          name: 'Test Element',
          type: GetApiV1ProjectsUsernameSlugElements200ResponseInnerType.Item,
          level: 0,
          expandable: false,
          order: 0,
          version: 0,
          metadata: {},
        },
      ];

      mockLocalStorage.getItem.mockReturnValue('{}');

      service.saveElements(TEST_USERNAME, TEST_SLUG, elements);

      const expectedStoredData = { [PROJECT_KEY]: elements };
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'inkweld-offline-elements',
        JSON.stringify(expectedStoredData)
      );
      expect(service.elements()).toEqual(elements);
    });

    it('should handle localStorage write errors', () => {
      const elements: GetApiV1ProjectsUsernameSlugElements200ResponseInner[] =
        [];
      mockLocalStorage.getItem.mockReturnValue('{}');
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      expect(() =>
        service.saveElements(TEST_USERNAME, TEST_SLUG, elements)
      ).toThrow('Storage quota exceeded');
    });
  });

  describe('createDefaultStructure', () => {
    beforeEach(() => {
      mockLocalStorage.getItem.mockReturnValue('{}');
    });

    it('should create default project structure', () => {
      const result = service.createDefaultStructure(TEST_USERNAME, TEST_SLUG);

      expect(result).toHaveLength(4);
      expect(result[0]).toMatchObject({
        name: 'Chapters',
        type: GetApiV1ProjectsUsernameSlugElements200ResponseInnerType.Folder,
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
      const initialElements: GetApiV1ProjectsUsernameSlugElements200ResponseInner[] =
        [
          {
            id: 'folder-1',
            name: 'Folder 1',
            type: GetApiV1ProjectsUsernameSlugElements200ResponseInnerType.Folder,
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
        'ITEM',
        'New Document'
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        name: 'New Document',
        type: GetApiV1ProjectsUsernameSlugElements200ResponseInnerType.Item,
        level: 0,
        expandable: false,
        order: 0,
      });
      expect(result[0].id).toBeTypeOf('string');
      expect(result[1]).toMatchObject({
        id: 'folder-1',
        name: 'Folder 1',
        type: GetApiV1ProjectsUsernameSlugElements200ResponseInnerType.Folder,
        order: 1,
      });
    });

    it('should add element as child of folder', () => {
      const result = service.addElement(
        TEST_USERNAME,
        TEST_SLUG,
        'ITEM',
        'Child Document',
        'folder-1'
      );

      expect(result).toHaveLength(2);
      expect(result[1]).toMatchObject({
        name: 'Child Document',
        type: GetApiV1ProjectsUsernameSlugElements200ResponseInnerType.Item,
        level: 1,
        expandable: false,
        order: 1,
      });
      expect(result[1].id).toBeTypeOf('string');
    });

    it('should recompute positions correctly', () => {
      service.addElement(TEST_USERNAME, TEST_SLUG, 'ITEM', 'Doc 1');
      const result = service.addElement(
        TEST_USERNAME,
        TEST_SLUG,
        'ITEM',
        'Doc 2'
      );

      expect(result[0].order).toBe(0);
      expect(result[1].order).toBe(1);
      expect(result[2].order).toBe(2);
    });
  });

  describe('deleteElement', () => {
    beforeEach(() => {
      const initialElements: GetApiV1ProjectsUsernameSlugElements200ResponseInner[] =
        [
          {
            id: 'folder-1',
            name: 'Folder 1',
            type: GetApiV1ProjectsUsernameSlugElements200ResponseInnerType.Folder,
            level: 0,
            expandable: true,
            order: 0,
            version: 0,
            metadata: {},
          },
          {
            id: 'doc-1',
            name: 'Document 1',
            type: GetApiV1ProjectsUsernameSlugElements200ResponseInnerType.Item,
            level: 1,
            expandable: false,
            order: 1,
            version: 0,
            metadata: {},
          },
          {
            id: 'doc-2',
            name: 'Document 2',
            type: GetApiV1ProjectsUsernameSlugElements200ResponseInnerType.Item,
            level: 1,
            expandable: false,
            order: 2,
            version: 0,
            metadata: {},
          },
          {
            id: 'folder-2',
            name: 'Folder 2',
            type: GetApiV1ProjectsUsernameSlugElements200ResponseInnerType.Folder,
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
      const initialElements: GetApiV1ProjectsUsernameSlugElements200ResponseInner[] =
        [
          {
            id: 'folder-1',
            name: 'Folder 1',
            type: GetApiV1ProjectsUsernameSlugElements200ResponseInnerType.Folder,
            level: 0,
            expandable: true,
            order: 0,
            version: 0,
            metadata: {},
          },
          {
            id: 'doc-1',
            name: 'Document 1',
            type: GetApiV1ProjectsUsernameSlugElements200ResponseInnerType.Item,
            level: 1,
            expandable: false,
            order: 1,
            version: 0,
            metadata: {},
          },
          {
            id: 'doc-2',
            name: 'Document 2',
            type: GetApiV1ProjectsUsernameSlugElements200ResponseInnerType.Item,
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
      const initialElements: GetApiV1ProjectsUsernameSlugElements200ResponseInner[] =
        [
          {
            id: 'doc-1',
            name: 'Old Name',
            type: GetApiV1ProjectsUsernameSlugElements200ResponseInnerType.Item,
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

      expect(result[0].name).toBe('Old Name'); // No change
    });
  });

  describe('project isolation', () => {
    it('should isolate elements by project key', () => {
      const project1Elements: GetApiV1ProjectsUsernameSlugElements200ResponseInner[] =
        [
          {
            id: 'p1-doc',
            name: 'Project 1 Doc',
            type: GetApiV1ProjectsUsernameSlugElements200ResponseInnerType.Item,
            level: 0,
            expandable: false,
            order: 0,
            version: 0,
            metadata: {},
          },
        ];

      const project2Elements: GetApiV1ProjectsUsernameSlugElements200ResponseInner[] =
        [
          {
            id: 'p2-doc',
            name: 'Project 2 Doc',
            type: GetApiV1ProjectsUsernameSlugElements200ResponseInnerType.Item,
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
      service.loadElements('user1', 'project1');
      expect(service.elements()).toEqual(project1Elements);

      // Load project 2
      service.loadElements('user2', 'project2');
      expect(service.elements()).toEqual(project2Elements);
    });
  });
});
