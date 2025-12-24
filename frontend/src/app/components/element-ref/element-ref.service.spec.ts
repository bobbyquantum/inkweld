import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Element, ElementType } from '@inkweld/index';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoggerService } from '../../services/core/logger.service';
import { ProjectStateService } from '../../services/project/project-state.service';
import { WorldbuildingService } from '../../services/worldbuilding/worldbuilding.service';
import { ElementRefService } from './element-ref.service';

describe('ElementRefService', () => {
  let service: ElementRefService;
  let mockProjectState: { elements: ReturnType<typeof signal<Element[]>> };

  const mockElements: Element[] = [
    {
      id: 'folder-1',
      name: 'Act 1',
      type: ElementType.Folder,
      parentId: null,
      order: 0,
      level: 0,
      expandable: true,
      version: 1,
      metadata: {},
    },
    {
      id: 'doc-1',
      name: 'Chapter 1',
      type: ElementType.Item,
      parentId: 'folder-1',
      order: 0,
      level: 1,
      expandable: false,
      version: 1,
      metadata: {},
    },
    {
      id: 'char-1',
      name: 'John Smith',
      type: ElementType.Worldbuilding,
      parentId: null,
      order: 1,
      level: 0,
      expandable: false,
      version: 1,
      metadata: { icon: 'person' },
    },
    {
      id: 'char-2',
      name: 'Jane Johnson',
      type: ElementType.Worldbuilding,
      parentId: null,
      order: 2,
      level: 0,
      expandable: false,
      version: 1,
      metadata: {},
    },
    {
      id: 'loc-1',
      name: 'Castle Blackwood',
      type: ElementType.Worldbuilding,
      parentId: null,
      order: 3,
      level: 0,
      expandable: false,
      version: 1,
      metadata: {},
    },
  ];

  beforeEach(() => {
    mockProjectState = {
      elements: signal(mockElements),
    };

    TestBed.configureTestingModule({
      providers: [
        ElementRefService,
        { provide: ProjectStateService, useValue: mockProjectState },
        { provide: LoggerService, useValue: { debug: vi.fn() } },
        { provide: WorldbuildingService, useValue: {} },
      ],
    });

    service = TestBed.inject(ElementRefService);
  });

  describe('initialization', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('should start with popup closed', () => {
      expect(service.isPopupOpen()).toBe(false);
      expect(service.popupPosition()).toBeNull();
    });

    it('should start with empty search query', () => {
      expect(service.searchQuery()).toBe('');
    });
  });

  describe('searchElements', () => {
    it('should return all elements when no query', () => {
      const results = service.searchElements('');
      expect(results.length).toBe(5);
    });

    it('should filter by name', () => {
      const results = service.searchElements('john');
      expect(results.length).toBe(2); // John Smith and Jane Johnson
      expect(results.some(r => r.element.name === 'John Smith')).toBe(true);
      expect(results.some(r => r.element.name === 'Jane Johnson')).toBe(true);
    });

    it('should filter by type', () => {
      const results = service.searchElements('worldbuilding');
      expect(results.length).toBe(3);
      expect(
        results.every(r => r.element.type === ElementType.Worldbuilding)
      ).toBe(true);
    });

    it('should respect limit option', () => {
      const results = service.searchElements('', { limit: 2 });
      expect(results.length).toBe(2);
    });

    it('should filter by types option', () => {
      const results = service.searchElements('', {
        types: [ElementType.Worldbuilding],
      });
      expect(results.length).toBe(3);
      expect(
        results.every(r => r.element.type === ElementType.Worldbuilding)
      ).toBe(true);
    });

    it('should exclude specified IDs', () => {
      const results = service.searchElements('', {
        excludeIds: ['char-1', 'char-2'],
      });
      expect(results.some(r => r.element.id === 'char-1')).toBe(false);
      expect(results.some(r => r.element.id === 'char-2')).toBe(false);
    });

    it('should rank exact matches higher', () => {
      const results = service.searchElements('john smith');
      expect(results[0].element.name).toBe('John Smith');
    });

    it('should include path for nested elements', () => {
      const results = service.searchElements('chapter');
      const chapter = results.find(r => r.element.id === 'doc-1');
      expect(chapter?.path).toBe('Act 1');
    });

    it('should return icon from metadata when available', () => {
      const results = service.searchElements('john smith');
      const johnResult = results.find(r => r.element.id === 'char-1');
      expect(johnResult?.icon).toBe('person');
    });

    it('should return default icon when no metadata icon', () => {
      const results = service.searchElements('castle');
      const castleResult = results.find(r => r.element.id === 'loc-1');
      expect(castleResult?.icon).toBe('category'); // Default for Worldbuilding without schema
    });
  });

  describe('popup control', () => {
    it('should open popup with position', () => {
      service.openPopup({ x: 100, y: 200 });

      expect(service.isPopupOpen()).toBe(true);
      expect(service.popupPosition()).toEqual({ x: 100, y: 200 });
    });

    it('should open popup with initial query', () => {
      service.openPopup({ x: 100, y: 200 }, 'test');

      expect(service.searchQuery()).toBe('test');
    });

    it('should close popup', () => {
      service.openPopup({ x: 100, y: 200 }, 'test');
      service.closePopup();

      expect(service.isPopupOpen()).toBe(false);
      expect(service.popupPosition()).toBeNull();
      expect(service.searchQuery()).toBe('');
    });

    it('should update search query', () => {
      service.setSearchQuery('new query');
      expect(service.searchQuery()).toBe('new query');
    });
  });

  describe('createNodeAttrs', () => {
    it('should create node attributes with defaults', () => {
      const element = {
        id: 'char-1',
        name: 'John Smith',
        type: ElementType.Worldbuilding,
      };

      const attrs = service.createNodeAttrs(element);

      expect(attrs.elementId).toBe('char-1');
      expect(attrs.elementType).toBe(ElementType.Worldbuilding);
      expect(attrs.displayText).toBe('John Smith');
      expect(attrs.originalName).toBe('John Smith');
      expect(attrs.relationshipTypeId).toBe('referenced-in');
    });

    it('should use custom display text when provided', () => {
      const element = {
        id: 'char-1',
        name: 'John Smith',
        type: ElementType.Worldbuilding,
      };

      const attrs = service.createNodeAttrs(element, {
        displayText: 'the protagonist',
      });

      expect(attrs.displayText).toBe('the protagonist');
      expect(attrs.originalName).toBe('John Smith');
    });

    it('should use custom relationship type when provided', () => {
      const element = {
        id: 'char-1',
        name: 'John Smith',
        type: ElementType.Worldbuilding,
      };

      const attrs = service.createNodeAttrs(element, {
        relationshipTypeId: 'mentioned',
        relationshipNote: 'First appearance',
      });

      expect(attrs.relationshipTypeId).toBe('mentioned');
      expect(attrs.relationshipNote).toBe('First appearance');
    });
  });

  describe('searchResults signal', () => {
    it('should return limited elements when no query is set', () => {
      service.setSearchQuery('');
      const results = service.searchResults();
      expect(results.length).toBeLessThanOrEqual(10);
    });

    it('should filter results based on search query', () => {
      service.setSearchQuery('john');
      const results = service.searchResults();
      expect(results.length).toBe(2);
      expect(results.some(r => r.element.name === 'John Smith')).toBe(true);
      expect(results.some(r => r.element.name === 'Jane Johnson')).toBe(true);
    });

    it('should filter by type in search query', () => {
      service.setSearchQuery('castle');
      const results = service.searchResults();
      expect(results.length).toBe(1);
      expect(results[0].element.type).toBe(ElementType.Worldbuilding);
    });

    it('should handle whitespace in queries', () => {
      service.setSearchQuery('   john   ');
      const results = service.searchResults();
      expect(results.length).toBe(2);
    });

    it('should return empty results for non-matching query', () => {
      service.setSearchQuery('nonexistent');
      const results = service.searchResults();
      expect(results.length).toBe(0);
    });

    it('should handle element with missing parent in path', () => {
      // Add an element with a parentId that does not exist
      mockProjectState.elements.set([
        ...mockElements,
        {
          id: 'orphan-1',
          name: 'Orphan Element',
          type: ElementType.Worldbuilding,
          parentId: 'non-existent-parent', // Parent doesn't exist
          order: 10,
          level: 1,
          expandable: false,
          version: 1,
          metadata: {},
        },
      ]);

      service.setSearchQuery('orphan');
      const results = service.searchResults();

      expect(results.length).toBe(1);
      expect(results[0].element.name).toBe('Orphan Element');
      // Path should be empty since parent doesn't exist
      expect(results[0].path).toBe('');
    });
  });

  describe('element lookup', () => {
    it('should get element by ID', () => {
      const element = service.getElementById('char-1');
      expect(element?.name).toBe('John Smith');
    });

    it('should return undefined for unknown ID', () => {
      const element = service.getElementById('unknown');
      expect(element).toBeUndefined();
    });

    it('should check if element exists', () => {
      expect(service.elementExists('char-1')).toBe(true);
      expect(service.elementExists('unknown')).toBe(false);
    });

    it('should detect name changes', () => {
      expect(service.hasElementNameChanged('char-1', 'John Smith')).toBe(false);
      expect(service.hasElementNameChanged('char-1', 'Old Name')).toBe(true);
      expect(service.hasElementNameChanged('unknown', 'Any Name')).toBe(true);
    });
  });

  describe('getElementIcon', () => {
    it('should return icon from metadata', () => {
      const element = mockElements.find(e => e.id === 'char-1')!;
      expect(service.getElementIcon(element)).toBe('person');
    });

    it('should return default icon for type', () => {
      const element = mockElements.find(e => e.id === 'loc-1')!;
      expect(service.getElementIcon(element)).toBe('category');
    });

    it('should return folder icon for folders', () => {
      const element = mockElements.find(e => e.id === 'folder-1')!;
      expect(service.getElementIcon(element)).toBe('folder');
    });

    it('should return description icon for documents', () => {
      const element = mockElements.find(e => e.id === 'doc-1')!;
      expect(service.getElementIcon(element)).toBe('description');
    });

    it('should return category icon for custom types', () => {
      const customElement: Element = {
        id: 'custom-1',
        name: 'Custom Item',
        type: 'CUSTOM_MyType' as ElementType,
        parentId: null,
        order: 0,
        level: 0,
        expandable: false,
        version: 1,
        metadata: {},
      };
      expect(service.getElementIcon(customElement)).toBe('description');
    });
  });

  describe('getDefaultIconForType', () => {
    it('should return default icon for standard types', () => {
      expect(service.getDefaultIconForType(ElementType.Worldbuilding)).toBe(
        'category'
      );
      expect(service.getDefaultIconForType(ElementType.Folder)).toBe('folder');
      expect(service.getDefaultIconForType(ElementType.Item)).toBe(
        'description'
      );
    });

    it('should return category icon for custom types', () => {
      expect(service.getDefaultIconForType('CUSTOM_Race' as ElementType)).toBe(
        'description'
      );
    });

    it('should return description icon for unknown types', () => {
      expect(service.getDefaultIconForType('UNKNOWN' as ElementType)).toBe(
        'description'
      );
    });
  });

  describe('formatElementType', () => {
    it('should format standard element types', () => {
      expect(service.formatElementType(ElementType.Worldbuilding)).toBe(
        'Worldbuilding'
      );
      expect(service.formatElementType(ElementType.Item)).toBe('Document');
    });

    it('should format custom types with title case and spaces', () => {
      expect(service.formatElementType('CUSTOM_Race' as ElementType)).toBe(
        'Custom Race'
      );
      expect(
        service.formatElementType('CUSTOM_Magic_System' as ElementType)
      ).toBe('Custom Magic System');
    });

    it('should return title case for unrecognized types', () => {
      expect(service.formatElementType('UNKNOWN' as ElementType)).toBe(
        'Unknown'
      );
    });
  });

  describe('tooltip control', () => {
    it('should show tooltip with data', () => {
      const tooltipData = {
        elementId: 'char-1',
        displayText: 'John',
        originalName: 'John Smith',
        elementType: ElementType.Worldbuilding,
        position: { x: 100, y: 200 },
      };

      service.showTooltip(tooltipData);

      expect(service.tooltipData()).toEqual(tooltipData);
    });

    it('should hide tooltip', () => {
      const tooltipData = {
        elementId: 'char-1',
        displayText: 'John',
        originalName: 'John Smith',
        elementType: ElementType.Worldbuilding,
        position: { x: 100, y: 200 },
      };

      service.showTooltip(tooltipData);
      service.hideTooltip();

      expect(service.tooltipData()).toBeNull();
    });
  });

  describe('click event handling', () => {
    it('should handle ref click event', () => {
      const clickEvent = {
        elementId: 'char-1',
        elementType: ElementType.Worldbuilding,
        displayText: 'John',
        originalName: 'John Smith',
        nodePos: 42,
        mouseEvent: new MouseEvent('click'),
        isContextMenu: false,
      };

      service.handleRefClick(clickEvent);

      expect(service.clickEvent()).toEqual(clickEvent);
    });

    it('should clear click event', () => {
      const clickEvent = {
        elementId: 'char-1',
        elementType: ElementType.Worldbuilding,
        displayText: 'John',
        originalName: 'John Smith',
        nodePos: 42,
        mouseEvent: new MouseEvent('click'),
        isContextMenu: true,
      };

      service.handleRefClick(clickEvent);
      service.clearClickEvent();

      expect(service.clickEvent()).toBeNull();
    });
  });

  describe('editor view management', () => {
    it('should set and get editor view', () => {
      const mockView = {
        state: {},
        dispatch: vi.fn(),
      } as unknown as Parameters<typeof service.setEditorView>[0];

      expect(service.editorView()).toBeNull();

      service.setEditorView(mockView);

      expect(service.editorView()).toBe(mockView);
    });
  });
});
