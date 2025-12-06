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
      type: ElementType.Character,
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
      type: ElementType.Character,
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
      type: ElementType.Location,
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
      const results = service.searchElements('character');
      expect(results.length).toBe(2);
      expect(results.every(r => r.element.type === ElementType.Character)).toBe(
        true
      );
    });

    it('should respect limit option', () => {
      const results = service.searchElements('', { limit: 2 });
      expect(results.length).toBe(2);
    });

    it('should filter by types option', () => {
      const results = service.searchElements('', {
        types: [ElementType.Character],
      });
      expect(results.length).toBe(2);
      expect(results.every(r => r.element.type === ElementType.Character)).toBe(
        true
      );
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
      expect(castleResult?.icon).toBe('place'); // Default for Location
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
        type: ElementType.Character,
      };

      const attrs = service.createNodeAttrs(element);

      expect(attrs.elementId).toBe('char-1');
      expect(attrs.elementType).toBe(ElementType.Character);
      expect(attrs.displayText).toBe('John Smith');
      expect(attrs.originalName).toBe('John Smith');
      expect(attrs.relationshipTypeId).toBe('referenced-in');
    });

    it('should use custom display text when provided', () => {
      const element = {
        id: 'char-1',
        name: 'John Smith',
        type: ElementType.Character,
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
        type: ElementType.Character,
      };

      const attrs = service.createNodeAttrs(element, {
        relationshipTypeId: 'mentioned',
        relationshipNote: 'First appearance',
      });

      expect(attrs.relationshipTypeId).toBe('mentioned');
      expect(attrs.relationshipNote).toBe('First appearance');
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
      expect(service.getElementIcon(element)).toBe('place');
    });

    it('should return folder icon for folders', () => {
      const element = mockElements.find(e => e.id === 'folder-1')!;
      expect(service.getElementIcon(element)).toBe('folder');
    });

    it('should return description icon for documents', () => {
      const element = mockElements.find(e => e.id === 'doc-1')!;
      expect(service.getElementIcon(element)).toBe('description');
    });
  });
});
