import { TestBed } from '@angular/core/testing';
import { Element, ElementType } from '@inkweld/index';

import { LoggerService } from '../core/logger.service';
import { AppTab, TabManagerService } from './tab-manager.service';

describe('TabManagerService', () => {
  let service: TabManagerService;
  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  // Helper to create test elements
  const createElement = (
    id: string,
    name: string,
    type: ElementType = ElementType.Item
  ): Element => ({
    id,
    name,
    type,
    level: 0,
    order: 0,
    parentId: null,
    expandable: type === ElementType.Folder,
    version: 1,
    metadata: {},
  });

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        TabManagerService,
        { provide: LoggerService, useValue: mockLogger },
      ],
    });

    service = TestBed.inject(TabManagerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getTabTypeForElement', () => {
    it('should return "folder" for Folder type', () => {
      expect(service.getTabTypeForElement(ElementType.Folder)).toBe('folder');
    });

    it('should return "document" for Item type', () => {
      expect(service.getTabTypeForElement(ElementType.Item)).toBe('document');
    });

    it('should return "worldbuilding" for Character type', () => {
      expect(service.getTabTypeForElement(ElementType.Character)).toBe(
        'worldbuilding'
      );
    });

    it('should return "worldbuilding" for Location type', () => {
      expect(service.getTabTypeForElement(ElementType.Location)).toBe(
        'worldbuilding'
      );
    });

    it('should return "worldbuilding" for custom types', () => {
      expect(
        service.getTabTypeForElement('CUSTOM_MY_TYPE' as ElementType)
      ).toBe('worldbuilding');
    });
  });

  describe('openDocument', () => {
    it('should create a new tab for a document element', () => {
      const element = createElement('doc-1', 'Chapter 1', ElementType.Item);

      const result = service.openDocument(element);

      expect(result.wasCreated).toBe(true);
      expect(result.tab.id).toBe('doc-1');
      expect(result.tab.name).toBe('Chapter 1');
      expect(result.tab.type).toBe('document');
      expect(service.openTabs().length).toBe(1);
      expect(service.openDocuments().length).toBe(1);
    });

    it('should create a folder tab for folder element', () => {
      const element = createElement('folder-1', 'Act 1', ElementType.Folder);

      const result = service.openDocument(element);

      expect(result.tab.type).toBe('folder');
    });

    it('should create a worldbuilding tab for character element', () => {
      const element = createElement(
        'char-1',
        'John Doe',
        ElementType.Character
      );

      const result = service.openDocument(element);

      expect(result.tab.type).toBe('worldbuilding');
    });

    it('should select existing tab instead of creating duplicate', () => {
      const element = createElement('doc-1', 'Chapter 1', ElementType.Item);

      const result1 = service.openDocument(element);
      const result2 = service.openDocument(element);

      expect(result1.wasCreated).toBe(true);
      expect(result2.wasCreated).toBe(false);
      expect(service.openTabs().length).toBe(1);
    });

    it('should set selected tab index for opened document', () => {
      const element = createElement('doc-1', 'Chapter 1', ElementType.Item);

      service.openDocument(element);

      // Index should be 0 (first tab in the array)
      expect(service.selectedTabIndex()).toBe(0);
    });

    it('should add element to openDocuments', () => {
      const element = createElement('doc-1', 'Chapter 1', ElementType.Item);

      service.openDocument(element);

      expect(service.openDocuments()).toContainEqual(element);
    });
  });

  describe('openSystemTab', () => {
    it('should create documents-list system tab', () => {
      const result = service.openSystemTab('documents-list');

      expect(result.wasCreated).toBe(true);
      expect(result.tab.id).toBe('system-documents-list');
      expect(result.tab.name).toBe('Documents');
      expect(result.tab.type).toBe('system');
      expect(result.tab.systemType).toBe('documents-list');
    });

    it('should create media system tab', () => {
      const result = service.openSystemTab('media');

      expect(result.tab.name).toBe('Media');
      expect(result.tab.systemType).toBe('media');
    });

    it('should create templates-list system tab', () => {
      const result = service.openSystemTab('templates-list');

      expect(result.tab.name).toBe('Templates');
      expect(result.tab.systemType).toBe('templates-list');
    });

    it('should select existing system tab instead of creating duplicate', () => {
      const result1 = service.openSystemTab('documents-list');
      const result2 = service.openSystemTab('documents-list');

      expect(result1.wasCreated).toBe(true);
      expect(result2.wasCreated).toBe(false);
      expect(service.openTabs().length).toBe(1);
    });
  });

  describe('closeTab', () => {
    beforeEach(() => {
      // Set up some tabs
      service.openDocument(
        createElement('doc-1', 'Chapter 1', ElementType.Item)
      );
      service.openDocument(
        createElement('doc-2', 'Chapter 2', ElementType.Item)
      );
      service.openSystemTab('documents-list');
    });

    it('should close tab at specified index', () => {
      const initialCount = service.openTabs().length;

      const result = service.closeTab(0);

      expect(result).toBe(true);
      expect(service.openTabs().length).toBe(initialCount - 1);
    });

    it('should return false for invalid index', () => {
      const result = service.closeTab(99);

      expect(result).toBe(false);
    });

    it('should remove element from openDocuments when closing document tab', () => {
      const initialDocCount = service.openDocuments().length;

      service.closeTab(0);

      expect(service.openDocuments().length).toBe(initialDocCount - 1);
    });

    it('should select home tab when closing currently selected tab', () => {
      // Select the first document tab (index 1 with home offset)
      service.selectTab(1);
      expect(service.selectedTabIndex()).toBe(1);

      // Close the first tab (index 0 in tabs array)
      service.closeTab(0);

      // Should go back to home tab
      expect(service.selectedTabIndex()).toBe(0);
    });

    it('should adjust selected index when closing tab before selected one', () => {
      // Select the third tab (index 3 with home offset)
      service.selectTab(3);
      expect(service.selectedTabIndex()).toBe(3);

      // Close the first tab
      service.closeTab(0);

      // Selected index should decrease by 1
      expect(service.selectedTabIndex()).toBe(2);
    });

    it('should not adjust selected index when closing tab after selected one', () => {
      // Select the first tab (index 1 with home offset)
      service.selectTab(1);

      // Close the last tab
      service.closeTab(2);

      // Selected index should remain the same
      expect(service.selectedTabIndex()).toBe(1);
    });
  });

  describe('closeTabByElementId', () => {
    it('should close tab matching element ID', () => {
      service.openDocument(
        createElement('doc-1', 'Chapter 1', ElementType.Item)
      );
      service.openDocument(
        createElement('doc-2', 'Chapter 2', ElementType.Item)
      );

      const result = service.closeTabByElementId('doc-1');

      expect(result).toBe(true);
      expect(service.openTabs().length).toBe(1);
      expect(service.openTabs()[0].id).toBe('doc-2');
    });

    it('should return false if element ID not found', () => {
      service.openDocument(
        createElement('doc-1', 'Chapter 1', ElementType.Item)
      );

      const result = service.closeTabByElementId('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('closeTabById', () => {
    it('should close tab by tab ID', () => {
      service.openSystemTab('documents-list');

      const result = service.closeTabById('system-documents-list');

      expect(result).toBe(true);
      expect(service.openTabs().length).toBe(0);
    });

    it('should return false when tab ID is not found', () => {
      const result = service.closeTabById('non-existent-tab-id');

      expect(result).toBe(false);
    });
  });

  describe('clearAllTabs', () => {
    it('should clear all tabs and reset state', () => {
      service.openDocument(
        createElement('doc-1', 'Chapter 1', ElementType.Item)
      );
      service.openSystemTab('documents-list');
      service.selectTab(2);

      service.clearAllTabs();

      expect(service.openTabs().length).toBe(0);
      expect(service.openDocuments().length).toBe(0);
      expect(service.selectedTabIndex()).toBe(0);
    });
  });

  describe('setTabs', () => {
    it('should set tabs directly', () => {
      const tabs: AppTab[] = [
        { id: 'doc-1', name: 'Chapter 1', type: 'document' },
        {
          id: 'system-media',
          name: 'Media',
          type: 'system',
          systemType: 'media',
        },
      ];

      service.setTabs(tabs, 1);

      expect(service.openTabs()).toEqual(tabs);
      expect(service.selectedTabIndex()).toBe(1);
    });

    it('should update openDocuments from tabs with elements', () => {
      const element = createElement('doc-1', 'Chapter 1', ElementType.Item);
      const tabs: AppTab[] = [
        { id: 'doc-1', name: 'Chapter 1', type: 'document', element },
      ];

      service.setTabs(tabs);

      expect(service.openDocuments()).toContainEqual(element);
    });
  });

  describe('validateAndFilterTabs', () => {
    it('should keep system tabs regardless of elements', () => {
      service.openSystemTab('documents-list');

      const validTabs = service.validateAndFilterTabs([]);

      expect(validTabs.length).toBe(1);
      expect(validTabs[0].type).toBe('system');
    });

    it('should remove document tabs for missing elements', () => {
      const element1 = createElement('doc-1', 'Chapter 1', ElementType.Item);
      const element2 = createElement('doc-2', 'Chapter 2', ElementType.Item);
      service.openDocument(element1);
      service.openDocument(element2);

      // Only element1 exists now
      const validTabs = service.validateAndFilterTabs([element1]);

      expect(validTabs.length).toBe(1);
      expect(validTabs[0].id).toBe('doc-1');
    });

    it('should update openDocuments when filtering', () => {
      const element1 = createElement('doc-1', 'Chapter 1', ElementType.Item);
      const element2 = createElement('doc-2', 'Chapter 2', ElementType.Item);
      service.openDocument(element1);
      service.openDocument(element2);

      service.validateAndFilterTabs([element1]);

      expect(service.openDocuments().length).toBe(1);
    });
  });

  describe('getTabByElementId', () => {
    it('should return tab for matching element ID', () => {
      const element = createElement('doc-1', 'Chapter 1', ElementType.Item);
      service.openDocument(element);

      const tab = service.getTabByElementId('doc-1');

      expect(tab).toBeDefined();
      expect(tab?.id).toBe('doc-1');
    });

    it('should return undefined for non-matching ID', () => {
      const tab = service.getTabByElementId('nonexistent');

      expect(tab).toBeUndefined();
    });
  });

  describe('updateTabElement', () => {
    it('should update tab element reference', () => {
      const element = createElement('doc-1', 'Chapter 1', ElementType.Item);
      service.openDocument(element);

      const updatedElement = { ...element, name: 'Updated Chapter' };
      service.updateTabElement('doc-1', updatedElement);

      const tab = service.getTabByElementId('doc-1');
      expect(tab?.name).toBe('Updated Chapter');
      expect(tab?.element?.name).toBe('Updated Chapter');
    });
  });

  describe('findSystemTabIndex', () => {
    it('should return index for existing system tab', () => {
      service.openDocument(
        createElement('doc-1', 'Chapter 1', ElementType.Item)
      );
      service.openSystemTab('documents-list');

      const index = service.findSystemTabIndex('documents-list');

      // Should be 1 (second tab in array after doc-1)
      expect(index).toBe(1);
    });

    it('should return -1 for non-existing system tab', () => {
      const index = service.findSystemTabIndex('documents-list');

      expect(index).toBe(-1);
    });
  });

  describe('findTabIndexByElementId', () => {
    it('should return index for existing tab', () => {
      service.openDocument(
        createElement('doc-1', 'Chapter 1', ElementType.Item)
      );
      service.openDocument(
        createElement('doc-2', 'Chapter 2', ElementType.Item)
      );

      const index = service.findTabIndexByElementId('doc-2');

      expect(index).toBe(1); // Second tab in array
    });

    it('should return -1 for non-existing element', () => {
      const index = service.findTabIndexByElementId('nonexistent');

      expect(index).toBe(-1);
    });
  });
});
