import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Element, ElementType } from '@inkweld/index';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_RELATIONSHIP_TYPE_DEFINITIONS } from '../../components/element-ref/default-relationship-types';
import {
  ElementRelationship,
  RelationshipCategory,
  RelationshipTypeDefinition,
} from '../../components/element-ref/element-ref.model';
import { LoggerService } from '../core/logger.service';
import { ProjectStateService } from '../project/project-state.service';
import { ElementSyncProviderFactory } from '../sync/element-sync-provider.factory';
import { IElementSyncProvider } from '../sync/element-sync-provider.interface';
import { RelationshipService } from './relationship.service';

describe('RelationshipService', () => {
  let service: RelationshipService;
  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  let mockProjectState: { elements: ReturnType<typeof signal<Element[]>> };
  let mockSyncProvider: {
    getRelationships: ReturnType<typeof vi.fn>;
    updateRelationships: ReturnType<typeof vi.fn>;
    getCustomRelationshipTypes: ReturnType<typeof vi.fn>;
    updateCustomRelationshipTypes: ReturnType<typeof vi.fn>;
    relationships$: BehaviorSubject<ElementRelationship[]>;
    customRelationshipTypes$: BehaviorSubject<RelationshipTypeDefinition[]>;
  };
  let mockSyncProviderFactory: {
    getProvider: ReturnType<typeof vi.fn>;
  };

  // Test data storage (simulating Yjs arrays)
  let relationshipsStore: ElementRelationship[];
  let customTypesStore: RelationshipTypeDefinition[];

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
    // Reset stores - pre-seed with default relationship types (as would happen at project creation)
    relationshipsStore = [];
    customTypesStore = [...DEFAULT_RELATIONSHIP_TYPE_DEFINITIONS];

    mockLogger = {
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    mockProjectState = {
      elements: signal(mockElements),
    };

    // Create mock sync provider that uses the stores
    mockSyncProvider = {
      getRelationships: vi.fn().mockImplementation(() => relationshipsStore),
      updateRelationships: vi
        .fn()
        .mockImplementation((rels: ElementRelationship[]) => {
          relationshipsStore = rels;
          mockSyncProvider.relationships$.next(rels);
        }),
      getCustomRelationshipTypes: vi
        .fn()
        .mockImplementation(() => customTypesStore),
      updateCustomRelationshipTypes: vi
        .fn()
        .mockImplementation((types: RelationshipTypeDefinition[]) => {
          customTypesStore = types;
          mockSyncProvider.customRelationshipTypes$.next(types);
        }),
      relationships$: new BehaviorSubject<ElementRelationship[]>([]),
      // Initialize with seeded types (as would happen at project creation)
      customRelationshipTypes$: new BehaviorSubject<
        RelationshipTypeDefinition[]
      >([...DEFAULT_RELATIONSHIP_TYPE_DEFINITIONS]),
    };

    mockSyncProviderFactory = {
      getProvider: vi
        .fn()
        .mockReturnValue(mockSyncProvider as unknown as IElementSyncProvider),
    };

    TestBed.configureTestingModule({
      providers: [
        RelationshipService,
        { provide: LoggerService, useValue: mockLogger },
        { provide: ProjectStateService, useValue: mockProjectState },
        {
          provide: ElementSyncProviderFactory,
          useValue: mockSyncProviderFactory,
        },
      ],
    });

    service = TestBed.inject(RelationshipService);
  });

  describe('initialization', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('should initialize with seeded default types', () => {
      // Types are now seeded at project creation
      expect(service.customTypes().length).toBe(
        DEFAULT_RELATIONSHIP_TYPE_DEFINITIONS.length
      );
    });

    it('should have built-in types available', () => {
      const types = service.getAllTypes();
      expect(types.length).toBeGreaterThan(0);
      expect(types.some(t => t.id === 'parent')).toBe(true);
      expect(types.some(t => t.id === 'referenced-in')).toBe(true);
    });
  });

  describe('relationship CRUD', () => {
    it('should add a relationship', () => {
      const relationship = service.addRelationship(
        'char-1',
        'char-2',
        'parent-of',
        { note: 'Father' }
      );

      expect(relationship.id).toBeDefined();
      expect(relationship.sourceElementId).toBe('char-1');
      expect(relationship.targetElementId).toBe('char-2');
      expect(relationship.relationshipTypeId).toBe('parent-of');
      expect(relationship.note).toBe('Father');

      expect(mockSyncProvider.updateRelationships).toHaveBeenCalled();
      expect(relationshipsStore.length).toBe(1);
    });

    it('should get outgoing relationships', () => {
      service.addRelationship('char-1', 'char-2', 'parent-of');
      service.addRelationship('char-1', 'loc-1', 'lives-at');
      service.addRelationship('char-2', 'char-1', 'friend-of');

      const outgoing = service.getOutgoingRelationships('char-1');

      expect(outgoing.length).toBe(2);
      expect(outgoing.every(r => r.sourceElementId === 'char-1')).toBe(true);
    });

    it('should get incoming relationships (backlinks)', () => {
      service.addRelationship('char-1', 'char-2', 'parent-of');
      service.addRelationship('char-1', 'loc-1', 'lives-at');

      const incoming = service.getIncomingRelationships('char-2');

      expect(incoming.length).toBe(1);
      expect(incoming[0].sourceElementId).toBe('char-1');
    });

    it('should get relationship view (outgoing + incoming)', () => {
      service.addRelationship('char-1', 'char-2', 'parent-of');
      service.addRelationship('loc-1', 'char-2', 'home-of');

      const view = service.getRelationshipView('char-2');

      expect(view.outgoing.length).toBe(0);
      expect(view.incoming.length).toBe(2);
    });

    it('should update a relationship', () => {
      const rel = service.addRelationship('char-1', 'char-2', 'parent-of');

      const updated = service.updateRelationship(rel.id, {
        note: 'Adopted father',
        relationshipTypeId: 'guardian-of',
      });

      expect(updated).not.toBeNull();
      expect(updated?.note).toBe('Adopted father');
      expect(updated?.relationshipTypeId).toBe('guardian-of');
    });

    it('should return null when updating non-existent relationship', () => {
      const result = service.updateRelationship('fake-id', { note: 'test' });
      expect(result).toBeNull();
    });

    it('should remove a relationship', () => {
      const rel = service.addRelationship('char-1', 'char-2', 'parent-of');

      const removed = service.removeRelationship(rel.id);

      expect(removed).toBe(true);
      expect(relationshipsStore.length).toBe(0);
    });

    it('should return false when removing non-existent relationship', () => {
      const result = service.removeRelationship('fake-id');
      expect(result).toBe(false);
    });

    it('should find relationships between two elements', () => {
      service.addRelationship('char-1', 'char-2', 'parent-of');
      service.addRelationship('char-1', 'char-2', 'mentor-of');
      service.addRelationship('char-1', 'loc-1', 'lives-at');

      const between = service.findRelationshipsBetween('char-1', 'char-2');

      expect(between.length).toBe(2);
    });
  });

  describe('document context relationships', () => {
    it('should add relationship with document context', () => {
      const rel = service.addRelationship('char-1', 'char-2', 'referenced-in', {
        documentContext: {
          documentId: 'doc-1',
          fullDocumentId: 'user:project:doc-1',
          position: 100,
        },
      });

      expect(rel.documentContext?.documentId).toBe('doc-1');
    });

    it('should find relationships in a document', () => {
      service.addRelationship('char-1', 'char-2', 'referenced-in', {
        documentContext: { documentId: 'doc-1' },
      });
      service.addRelationship('char-1', 'loc-1', 'referenced-in', {
        documentContext: { documentId: 'doc-1' },
      });
      service.addRelationship('char-2', 'loc-1', 'referenced-in', {
        documentContext: { documentId: 'doc-2' },
      });

      const inDoc1 = service.findRelationshipsInDocument('doc-1');

      expect(inDoc1.length).toBe(2);
    });

    it('should remove all relationships from a document', () => {
      service.addRelationship('char-1', 'char-2', 'referenced-in', {
        documentContext: { documentId: 'doc-1' },
      });
      service.addRelationship('char-1', 'loc-1', 'referenced-in', {
        documentContext: { documentId: 'doc-1' },
      });
      service.addRelationship('char-2', 'loc-1', 'referenced-in', {
        documentContext: { documentId: 'doc-2' },
      });

      const removed = service.removeRelationshipsFromDocument('doc-1');

      expect(removed).toBe(2);
      expect(relationshipsStore.length).toBe(1);
    });

    it('should remove relationships from document for specific target', () => {
      service.addRelationship('char-1', 'char-2', 'referenced-in', {
        documentContext: { documentId: 'doc-1' },
      });
      service.addRelationship('char-1', 'loc-1', 'referenced-in', {
        documentContext: { documentId: 'doc-1' },
      });

      const removed = service.removeRelationshipsFromDocument(
        'doc-1',
        'char-2'
      );

      expect(removed).toBe(1);
      expect(relationshipsStore.length).toBe(1);
      expect(relationshipsStore[0].targetElementId).toBe('loc-1');
    });
  });

  describe('relationship types', () => {
    it('should get type by ID', () => {
      const type = service.getTypeById('parent');
      expect(type).toBeDefined();
      expect(type?.name).toBe('Parent');
      expect(type?.inverseLabel).toBe('Child of');
    });

    it('should return undefined for unknown type ID', () => {
      const type = service.getTypeById('unknown-type');
      expect(type).toBeUndefined();
    });

    it('should add custom relationship type', () => {
      const newType = service.addCustomType({
        category: RelationshipCategory.Custom,
        name: 'Nemesis of',
        inverseLabel: 'Hunted by',
        showInverse: true,
        icon: 'skull',
        sourceEndpoint: { allowedSchemas: [] },
        targetEndpoint: { allowedSchemas: [] },
      });

      expect(newType.id).toMatch(/^custom-/);
      expect(newType.isBuiltIn).toBe(false);
      expect(newType.name).toBe('Nemesis of');

      expect(mockSyncProvider.updateCustomRelationshipTypes).toHaveBeenCalled();
    });

    it('should update custom relationship type', () => {
      const newType = service.addCustomType({
        category: RelationshipCategory.Custom,
        name: 'Test Type',
        inverseLabel: 'Test Type (inverse)',
        showInverse: true,
        sourceEndpoint: { allowedSchemas: [] },
        targetEndpoint: { allowedSchemas: [] },
      });

      const updated = service.updateCustomType(newType.id, {
        name: 'Updated Type',
        icon: 'star',
      });

      expect(updated).toBe(true);
      const updatedType = customTypesStore.find(t => t.id === newType.id);
      expect(updatedType?.name).toBe('Updated Type');
      expect(updatedType?.icon).toBe('star');
    });

    it('should not update non-existent types', () => {
      const updated = service.updateCustomType('fake-id', {
        name: 'Hacked!',
      });

      expect(updated).toBe(false);
    });

    it('should remove custom relationship type', () => {
      const initialCount = customTypesStore.length;

      const newType = service.addCustomType({
        category: RelationshipCategory.Custom,
        name: 'Temporary Type',
        inverseLabel: 'Temporary Type (inverse)',
        showInverse: true,
        sourceEndpoint: { allowedSchemas: [] },
        targetEndpoint: { allowedSchemas: [] },
      });

      expect(customTypesStore.length).toBe(initialCount + 1);

      const removed = service.removeCustomType(newType.id);
      expect(removed).toBe(true);

      expect(customTypesStore.length).toBe(initialCount);
      expect(customTypesStore.find(t => t.id === newType.id)).toBeUndefined();
    });

    it('should not remove non-existent types', () => {
      const removed = service.removeCustomType('fake-type');
      expect(removed).toBe(false);
    });
  });

  describe('resolveRelationship', () => {
    it('should resolve outgoing relationship', () => {
      const relationship: ElementRelationship = {
        id: 'rel-1',
        sourceElementId: 'char-1',
        targetElementId: 'char-2',
        relationshipTypeId: 'parent',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const resolved = service.resolveRelationship(relationship, false);

      expect(resolved).not.toBeNull();
      expect(resolved?.relatedElement.id).toBe('char-2');
      expect(resolved?.relatedElement.name).toBe('Jane Doe');
      expect(resolved?.isIncoming).toBe(false);
      expect(resolved?.displayLabel).toBe('Parent');
    });

    it('should resolve incoming relationship with inverse label', () => {
      const relationship: ElementRelationship = {
        id: 'rel-1',
        sourceElementId: 'char-1',
        targetElementId: 'char-2',
        relationshipTypeId: 'parent',
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
      const relationship: ElementRelationship = {
        id: 'rel-1',
        sourceElementId: 'unknown-id',
        targetElementId: 'char-2',
        relationshipTypeId: 'parent',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const resolved = service.resolveRelationship(relationship, true);
      expect(resolved).toBeNull();
    });

    it('should return null for unknown relationship type', () => {
      const relationship: ElementRelationship = {
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

  describe('utility methods', () => {
    it('should check if element has relationships', () => {
      expect(service.hasRelationships('char-1')).toBe(false);

      service.addRelationship('char-1', 'char-2', 'parent');

      expect(service.hasRelationships('char-1')).toBe(true);
      expect(service.hasRelationships('char-2')).toBe(true); // incoming
      expect(service.hasRelationships('loc-1')).toBe(false);
    });

    it('should get relationship count', () => {
      service.addRelationship('char-1', 'char-2', 'parent');
      service.addRelationship('char-1', 'loc-1', 'residence');
      service.addRelationship('loc-1', 'char-1', 'houses');

      const count = service.getRelationshipCount('char-1');

      expect(count.outgoing).toBe(2);
      expect(count.incoming).toBe(1);
      expect(count.total).toBe(3);
    });

    it('should remove all relationships for element', () => {
      service.addRelationship('char-1', 'char-2', 'parent');
      service.addRelationship('char-2', 'char-1', 'child');
      service.addRelationship('char-2', 'loc-1', 'residence');

      const removed = service.removeAllRelationshipsForElement('char-1');

      expect(removed).toBe(2);
      expect(relationshipsStore.length).toBe(1);
      expect(relationshipsStore[0].sourceElementId).toBe('char-2');
      expect(relationshipsStore[0].targetElementId).toBe('loc-1');
    });
  });
});
