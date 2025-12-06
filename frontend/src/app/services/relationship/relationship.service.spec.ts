import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Element, ElementType } from '@inkweld/index';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoggerService } from '../core/logger.service';
import { SetupService } from '../core/setup.service';
import { ProjectStateService } from '../project/project-state.service';
import { RelationshipService } from './relationship.service';

describe('RelationshipService', () => {
  let service: RelationshipService;
  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  let mockSetupService: { getWebSocketUrl: ReturnType<typeof vi.fn> };
  let mockProjectState: { elements: ReturnType<typeof signal<Element[]>> };

  const mockElements: Element[] = [
    {
      id: 'char-1',
      name: 'John Smith',
      type: ElementType.Character,
      parentId: null,
      order: 0,
      level: 0,
      expandable: false,
      version: 1,
      metadata: {},
    },
    {
      id: 'char-2',
      name: 'Jane Doe',
      type: ElementType.Character,
      parentId: null,
      order: 1,
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
      order: 2,
      level: 0,
      expandable: false,
      version: 1,
      metadata: {},
    },
  ];

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    mockSetupService = {
      getWebSocketUrl: vi.fn().mockReturnValue(null), // Offline mode
    };

    mockProjectState = {
      elements: signal(mockElements),
    };

    TestBed.configureTestingModule({
      providers: [
        RelationshipService,
        { provide: LoggerService, useValue: mockLogger },
        { provide: SetupService, useValue: mockSetupService },
        { provide: ProjectStateService, useValue: mockProjectState },
      ],
    });

    service = TestBed.inject(RelationshipService);
  });

  describe('initialization', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('should initialize with empty custom types', () => {
      expect(service.customTypes()).toEqual([]);
    });

    it('should have built-in types available', () => {
      const types = service.getAllTypes();
      expect(types.length).toBeGreaterThan(0);
      expect(types.some(t => t.id === 'parent-of')).toBe(true);
      expect(types.some(t => t.id === 'referenced-in')).toBe(true);
    });
  });

  describe('relationship types', () => {
    it('should get type by ID', () => {
      const type = service.getTypeById('parent-of');
      expect(type).toBeDefined();
      expect(type?.label).toBe('Parent of');
      expect(type?.inverseLabel).toBe('Child of');
    });

    it('should return undefined for unknown type ID', () => {
      const type = service.getTypeById('unknown-type');
      expect(type).toBeUndefined();
    });

    it('should add custom relationship type', () => {
      const newType = service.addCustomType({
        category: 'custom' as any,
        label: 'Nemesis of',
        inverseLabel: 'Hunted by',
        icon: 'skull',
      });

      expect(newType.id).toMatch(/^custom-/);
      expect(newType.isBuiltIn).toBe(false);
      expect(newType.label).toBe('Nemesis of');

      const retrieved = service.getTypeById(newType.id);
      expect(retrieved).toEqual(newType);
    });

    it('should update custom relationship type', () => {
      const newType = service.addCustomType({
        category: 'custom' as any,
        label: 'Test Type',
      });

      const updated = service.updateCustomType(newType.id, {
        label: 'Updated Type',
        icon: 'star',
      });

      expect(updated).toBe(true);

      const retrieved = service.getTypeById(newType.id);
      expect(retrieved?.label).toBe('Updated Type');
      expect(retrieved?.icon).toBe('star');
    });

    it('should not update built-in types', () => {
      const updated = service.updateCustomType('parent-of', {
        label: 'Hacked!',
      });

      expect(updated).toBe(false);

      const type = service.getTypeById('parent-of');
      expect(type?.label).toBe('Parent of');
    });

    it('should remove custom relationship type', () => {
      const newType = service.addCustomType({
        category: 'custom' as any,
        label: 'Temporary Type',
      });

      expect(service.getTypeById(newType.id)).toBeDefined();

      const removed = service.removeCustomType(newType.id);
      expect(removed).toBe(true);

      expect(service.getTypeById(newType.id)).toBeUndefined();
    });

    it('should not remove built-in types', () => {
      const removed = service.removeCustomType('parent-of');
      expect(removed).toBe(false);
      expect(service.getTypeById('parent-of')).toBeDefined();
    });
  });

  describe('resolveRelationship', () => {
    it('should resolve outgoing relationship', () => {
      const relationship = {
        id: 'rel-1',
        sourceElementId: 'char-1',
        targetElementId: 'char-2',
        relationshipTypeId: 'parent-of',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const resolved = service.resolveRelationship(relationship, false);

      expect(resolved).not.toBeNull();
      expect(resolved?.relatedElement.id).toBe('char-2');
      expect(resolved?.relatedElement.name).toBe('Jane Doe');
      expect(resolved?.isIncoming).toBe(false);
      expect(resolved?.displayLabel).toBe('Parent of');
    });

    it('should resolve incoming relationship with inverse label', () => {
      const relationship = {
        id: 'rel-1',
        sourceElementId: 'char-1',
        targetElementId: 'char-2',
        relationshipTypeId: 'parent-of',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const resolved = service.resolveRelationship(relationship, true);

      expect(resolved).not.toBeNull();
      expect(resolved?.relatedElement.id).toBe('char-1');
      expect(resolved?.relatedElement.name).toBe('John Smith');
      expect(resolved?.isIncoming).toBe(true);
      expect(resolved?.displayLabel).toBe('Child of');
    });

    it('should return null for unknown element', () => {
      const relationship = {
        id: 'rel-1',
        sourceElementId: 'unknown-id',
        targetElementId: 'char-2',
        relationshipTypeId: 'parent-of',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const resolved = service.resolveRelationship(relationship, true);
      expect(resolved).toBeNull();
    });

    it('should return null for unknown relationship type', () => {
      const relationship = {
        id: 'rel-1',
        sourceElementId: 'char-1',
        targetElementId: 'char-2',
        relationshipTypeId: 'unknown-type',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const resolved = service.resolveRelationship(relationship, false);
      expect(resolved).toBeNull();
    });
  });

  describe('loadCustomTypes', () => {
    it('should load custom types and filter out built-in', () => {
      const types = [
        {
          id: 'custom-1',
          category: 'custom' as any,
          label: 'Custom 1',
          isBuiltIn: false,
        },
        {
          id: 'parent-of',
          category: 'familial' as any,
          label: 'Parent of',
          isBuiltIn: true,
        },
      ];

      service.loadCustomTypes(types);

      const customTypes = service.customTypes();
      expect(customTypes.length).toBe(1);
      expect(customTypes[0].id).toBe('custom-1');
    });
  });
});
