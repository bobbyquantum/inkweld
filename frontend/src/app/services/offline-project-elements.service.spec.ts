import { TestBed } from '@angular/core/testing';
import { ProjectElementDto } from '@inkweld/index';
import { nanoid } from 'nanoid';

import { OfflineProjectElementsService } from './offline-project-elements.service';

// Mock nanoid to generate predictable IDs for testing
vi.mock('nanoid', () => ({
  nanoid: vi.fn(),
}));

const mockNanoid = nanoid as vi.MockedFunction<typeof nanoid>;

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
    mockNanoid.mockReset();

    // Setup nanoid to return predictable IDs
    let idCounter = 0;
    mockNanoid.mockImplementation(() => `mock-id-${++idCounter}`);

    TestBed.configureTestingModule({
      providers: [OfflineProjectElementsService],
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
      const mockElements: ProjectElementDto[] = [
        {
          id: 'element-1',
          name: 'Test Element',
          type: 'FOLDER',
          level: 0,
          expandable: true,
          position: 0,
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
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation();

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
      const elements: ProjectElementDto[] = [
        {
          id: 'element-1',
          name: 'Test Element',
          type: 'ITEM',
          level: 0,
          expandable: false,
          position: 0,
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
      const elements: ProjectElementDto[] = [];
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
        id: 'mock-id-1',
        name: 'Chapters',
        type: 'FOLDER',
        level: 0,
        expandable: true,
        position: 0,
      });
      expect(result[1]).toMatchObject({
        id: 'mock-id-2',
        name: 'Chapter 1',
        type: 'ITEM',
        level: 1,
        expandable: false,
        position: 1,
      });
      expect(result[2]).toMatchObject({
        id: 'mock-id-3',
        name: 'Notes',
        type: 'FOLDER',
        level: 0,
        expandable: true,
        position: 2,
      });
      expect(result[3]).toMatchObject({
        id: 'mock-id-4',
        name: 'Research',
        type: 'ITEM',
        level: 1,
        expandable: false,
        position: 3,
      });

      expect(mockLocalStorage.setItem).toHaveBeenCalled();
    });
  });

  describe('addElement', () => {
    beforeEach(() => {
      const initialElements: ProjectElementDto[] = [
        {
          id: 'folder-1',
          name: 'Folder 1',
          type: 'FOLDER',
          level: 0,
          expandable: true,
          position: 0,
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
        id: 'mock-id-1',
        name: 'New Document',
        type: 'ITEM',
        level: 0,
        expandable: false,
        position: 0,
      });
      expect(result[1]).toMatchObject({
        id: 'folder-1',
        name: 'Folder 1',
        type: 'FOLDER',
        position: 1,
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
        id: 'mock-id-1',
        name: 'Child Document',
        type: 'ITEM',
        level: 1,
        expandable: false,
        position: 1,
      });
    });

    it('should recompute positions correctly', () => {
      service.addElement(TEST_USERNAME, TEST_SLUG, 'ITEM', 'Doc 1');
      const result = service.addElement(
        TEST_USERNAME,
        TEST_SLUG,
        'ITEM',
        'Doc 2'
      );

      expect(result[0].position).toBe(0);
      expect(result[1].position).toBe(1);
      expect(result[2].position).toBe(2);
    });
  });

  describe('deleteElement', () => {
    beforeEach(() => {
      const initialElements: ProjectElementDto[] = [
        {
          id: 'folder-1',
          name: 'Folder 1',
          type: 'FOLDER',
          level: 0,
          expandable: true,
          position: 0,
          version: 0,
          metadata: {},
        },
        {
          id: 'doc-1',
          name: 'Document 1',
          type: 'ITEM',
          level: 1,
          expandable: false,
          position: 1,
          version: 0,
          metadata: {},
        },
        {
          id: 'doc-2',
          name: 'Document 2',
          type: 'ITEM',
          level: 1,
          expandable: false,
          position: 2,
          version: 0,
          metadata: {},
        },
        {
          id: 'folder-2',
          name: 'Folder 2',
          type: 'FOLDER',
          level: 0,
          expandable: true,
          position: 3,
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
      expect(result[2].position).toBe(2); // Positions recomputed
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
      const initialElements: ProjectElementDto[] = [
        {
          id: 'folder-1',
          name: 'Folder 1',
          type: 'FOLDER',
          level: 0,
          expandable: true,
          position: 0,
          version: 0,
          metadata: {},
        },
        {
          id: 'doc-1',
          name: 'Document 1',
          type: 'ITEM',
          level: 1,
          expandable: false,
          position: 1,
          version: 0,
          metadata: {},
        },
        {
          id: 'doc-2',
          name: 'Document 2',
          type: 'ITEM',
          level: 0,
          expandable: false,
          position: 2,
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
      const initialElements: ProjectElementDto[] = [
        {
          id: 'doc-1',
          name: 'Old Name',
          type: 'ITEM',
          level: 0,
          expandable: false,
          position: 0,
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
      const project1Elements: ProjectElementDto[] = [
        {
          id: 'p1-doc',
          name: 'Project 1 Doc',
          type: 'ITEM',
          level: 0,
          expandable: false,
          position: 0,
          version: 0,
          metadata: {},
        },
      ];

      const project2Elements: ProjectElementDto[] = [
        {
          id: 'p2-doc',
          name: 'Project 2 Doc',
          type: 'ITEM',
          level: 0,
          expandable: false,
          position: 0,
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
