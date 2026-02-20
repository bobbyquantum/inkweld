import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Element, ElementType } from '@inkweld/index';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ElementRelationship,
  RelationshipCategory,
  RelationshipTypeDefinition,
} from '../../components/element-ref/element-ref.model';
import { LoggerService } from '../core/logger.service';
import { ProjectStateService } from '../project/project-state.service';
import { RelationshipService } from '../relationship/relationship.service';
import { RelationshipChartService } from './relationship-chart.service';

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeElement(overrides: Partial<Element> = {}): Element {
  return {
    id: 'el-1',
    name: 'Test Element',
    type: ElementType.Worldbuilding,
    parentId: null,
    order: 0,
    level: 0,
    expandable: false,
    version: 1,
    metadata: {},
    ...overrides,
  };
}

function makeRelationship(
  overrides: Partial<ElementRelationship> = {}
): ElementRelationship {
  return {
    id: 'rel-1',
    sourceElementId: 'el-1',
    targetElementId: 'el-2',
    relationshipTypeId: 'friend',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeRelType(
  overrides: Partial<RelationshipTypeDefinition> = {}
): RelationshipTypeDefinition {
  return {
    id: 'friend',
    name: 'Friend',
    inverseLabel: 'Friend of',
    showInverse: true,
    category: RelationshipCategory.Social,
    isBuiltIn: true,
    sourceEndpoint: { allowedSchemas: [] },
    targetEndpoint: { allowedSchemas: [] },
    color: '#5B8FF9',
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('RelationshipChartService', () => {
  let service: RelationshipChartService;
  const mockElements = signal<Element[]>([]);
  const mockRelationships = signal<ElementRelationship[]>([]);
  const mockAllTypes = signal<RelationshipTypeDefinition[]>([]);

  const mockProjectState = {
    elements: mockElements,
    updateElementMetadata: vi.fn(),
    project: vi.fn(() => null),
  };

  const mockRelationshipService = {
    relationships: mockRelationships,
    allTypes: mockAllTypes,
    getAllRelationships: vi.fn(() => mockRelationships()),
  };

  const mockLogger = {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        RelationshipChartService,
        { provide: ProjectStateService, useValue: mockProjectState },
        { provide: RelationshipService, useValue: mockRelationshipService },
        { provide: LoggerService, useValue: mockLogger },
      ],
    });

    service = TestBed.inject(RelationshipChartService);
    mockElements.set([]);
    mockRelationships.set([]);
    mockAllTypes.set([]);
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // buildGraph
  // ─────────────────────────────────────────────────────────────────────────

  describe('buildGraph', () => {
    it('should return empty graph when no elements', () => {
      const result = service.buildGraph([], [], [], {
        mode: 'all',
        includedElementIds: [],
        relationshipTypeIds: [],
        schemaIds: [],
        elementTypes: [],
        showOrphans: false,
      });
      expect(result.nodes).toHaveLength(0);
      expect(result.edges).toHaveLength(0);
    });

    it('should include elements with relationships and exclude orphans', () => {
      const elements = [
        makeElement({ id: 'a', name: 'Alice', schemaId: 'character-v1' }),
        makeElement({ id: 'b', name: 'Bob', schemaId: 'character-v1' }),
        makeElement({ id: 'c', name: 'Orphan', schemaId: 'character-v1' }),
      ];
      const relationships = [
        makeRelationship({ sourceElementId: 'a', targetElementId: 'b' }),
      ];
      const types = [makeRelType()];

      const result = service.buildGraph(elements, relationships, types, {
        mode: 'all',
        includedElementIds: [],
        relationshipTypeIds: [],
        schemaIds: [],
        elementTypes: [],
        showOrphans: false,
      });

      expect(result.nodes).toHaveLength(2);
      expect(result.nodes.map(n => n.id)).toContain('a');
      expect(result.nodes.map(n => n.id)).toContain('b');
      expect(result.nodes.map(n => n.id)).not.toContain('c');
      expect(result.edges).toHaveLength(1);
    });

    it('should include orphans when showOrphans is true', () => {
      const elements = [
        makeElement({ id: 'a', name: 'Alice', schemaId: 'character-v1' }),
        makeElement({ id: 'b', name: 'Orphan', schemaId: 'character-v1' }),
      ];

      const result = service.buildGraph(elements, [], [], {
        mode: 'all',
        includedElementIds: [],
        relationshipTypeIds: [],
        schemaIds: [],
        elementTypes: [],
        showOrphans: true,
      });

      expect(result.nodes).toHaveLength(2);
    });

    it('should filter by relationship type', () => {
      const elements = [
        makeElement({ id: 'a', name: 'Alice' }),
        makeElement({ id: 'b', name: 'Bob' }),
        makeElement({ id: 'c', name: 'City' }),
      ];
      const relationships = [
        makeRelationship({
          id: 'r1',
          sourceElementId: 'a',
          targetElementId: 'b',
          relationshipTypeId: 'friend',
        }),
        makeRelationship({
          id: 'r2',
          sourceElementId: 'a',
          targetElementId: 'c',
          relationshipTypeId: 'located_in',
        }),
      ];
      const types = [
        makeRelType({ id: 'friend', name: 'Friend' }),
        makeRelType({ id: 'located_in', name: 'Located in' }),
      ];

      const result = service.buildGraph(elements, relationships, types, {
        mode: 'all',
        includedElementIds: [],
        relationshipTypeIds: ['friend'],
        schemaIds: [],
        elementTypes: [],
        showOrphans: false,
      });

      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].relationshipTypeId).toBe('friend');
      // 'c' should be excluded since its only relationship was filtered out
      expect(result.nodes.map(n => n.id)).not.toContain('c');
    });

    it('should filter by element type', () => {
      const elements = [
        makeElement({
          id: 'a',
          name: 'Alice',
          type: ElementType.Worldbuilding,
        }),
        makeElement({ id: 'b', name: 'Chapter 1', type: ElementType.Item }),
      ];
      const relationships = [
        makeRelationship({ sourceElementId: 'a', targetElementId: 'b' }),
      ];
      const types = [makeRelType()];

      const result = service.buildGraph(elements, relationships, types, {
        mode: 'all',
        includedElementIds: [],
        relationshipTypeIds: [],
        schemaIds: [],
        elementTypes: [ElementType.Worldbuilding],
        showOrphans: false,
      });

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].type).toBe(ElementType.Worldbuilding);
    });

    it('should exclude folders and chart elements', () => {
      const elements = [
        makeElement({
          id: 'a',
          name: 'Alice',
          type: ElementType.Worldbuilding,
        }),
        makeElement({ id: 'b', name: 'My Folder', type: ElementType.Folder }),
        makeElement({
          id: 'c',
          name: 'My Chart',
          type: ElementType.RelationshipChart,
        }),
      ];

      const result = service.buildGraph(elements, [], [], {
        mode: 'all',
        includedElementIds: [],
        relationshipTypeIds: [],
        schemaIds: [],
        elementTypes: [],
        showOrphans: true,
      });

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].id).toBe('a');
    });

    it('should apply focus mode with BFS depth limiting', () => {
      const elements = [
        makeElement({ id: 'a', name: 'Center' }),
        makeElement({ id: 'b', name: 'Depth 1' }),
        makeElement({ id: 'c', name: 'Depth 2' }),
        makeElement({ id: 'd', name: 'Depth 3 (outside)' }),
      ];
      const relationships = [
        makeRelationship({
          id: 'r1',
          sourceElementId: 'a',
          targetElementId: 'b',
        }),
        makeRelationship({
          id: 'r2',
          sourceElementId: 'b',
          targetElementId: 'c',
        }),
        makeRelationship({
          id: 'r3',
          sourceElementId: 'c',
          targetElementId: 'd',
        }),
      ];
      const types = [makeRelType()];

      const result = service.buildGraph(elements, relationships, types, {
        mode: 'all',
        includedElementIds: [],
        relationshipTypeIds: [],
        schemaIds: [],
        elementTypes: [],
        showOrphans: false,
        focusElementId: 'a',
        maxDepth: 2,
      });

      expect(result.nodes.map(n => n.id)).toContain('a');
      expect(result.nodes.map(n => n.id)).toContain('b');
      expect(result.nodes.map(n => n.id)).toContain('c');
      expect(result.nodes.map(n => n.id)).not.toContain('d');
    });

    it('should derive correct category labels', () => {
      const elements = [
        makeElement({
          id: 'a',
          name: 'Alice',
          type: ElementType.Worldbuilding,
          schemaId: 'character-v1',
        }),
        makeElement({ id: 'b', name: 'Chapter', type: ElementType.Item }),
      ];
      const relationships = [
        makeRelationship({ sourceElementId: 'a', targetElementId: 'b' }),
      ];

      const result = service.buildGraph(
        elements,
        relationships,
        [makeRelType()],
        {
          mode: 'all',
          includedElementIds: [],
          relationshipTypeIds: [],
          schemaIds: [],
          elementTypes: [],
          showOrphans: false,
        }
      );

      const charNode = result.nodes.find(n => n.id === 'a');
      const docNode = result.nodes.find(n => n.id === 'b');
      expect(charNode?.category).toBe('Character');
      expect(docNode?.category).toBe('Document');
    });

    it('should populate edge data from relationship types', () => {
      const elements = [
        makeElement({ id: 'a', name: 'Alice' }),
        makeElement({ id: 'b', name: 'Bob' }),
      ];
      const relationships = [
        makeRelationship({
          sourceElementId: 'a',
          targetElementId: 'b',
          note: 'Best friends since childhood',
        }),
      ];
      const types = [makeRelType({ color: '#FF0000' })];

      const result = service.buildGraph(elements, relationships, types, {
        mode: 'all',
        includedElementIds: [],
        relationshipTypeIds: [],
        schemaIds: [],
        elementTypes: [],
        showOrphans: false,
      });

      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].label).toBe('Friend');
      expect(result.edges[0].color).toBe('#FF0000');
      expect(result.edges[0].note).toBe('Best friends since childhood');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Config Management
  // ─────────────────────────────────────────────────────────────────────────

  describe('loadConfig', () => {
    it('should create default config when element has no metadata', () => {
      mockElements.set([
        makeElement({ id: 'chart-1', type: ElementType.RelationshipChart }),
      ]);

      const config = service.loadConfig('chart-1');
      expect(config.elementId).toBe('chart-1');
      expect(config.layout).toBe('force');
      expect(config.filters.mode).toBe('curated');
      expect(config.filters.includedElementIds).toEqual([]);
      expect(config.filters.showOrphans).toBe(false);
      expect(config.filters.relationshipTypeIds).toEqual([]);
    });

    it('should restore config from element metadata', () => {
      const savedConfig = {
        layout: 'circular',
        filters: {
          mode: 'all',
          includedElementIds: [],
          relationshipTypeIds: ['friend'],
          schemaIds: [],
          elementTypes: [],
          showOrphans: true,
        },
      };

      mockElements.set([
        makeElement({
          id: 'chart-1',
          type: ElementType.RelationshipChart,
          metadata: { chartConfig: JSON.stringify(savedConfig) },
        }),
      ]);

      const config = service.loadConfig('chart-1');
      expect(config.layout).toBe('circular');
      expect(config.filters.showOrphans).toBe(true);
      expect(config.filters.relationshipTypeIds).toEqual(['friend']);
    });
  });

  describe('saveConfig', () => {
    it('should persist config to element metadata', () => {
      const config = {
        elementId: 'chart-1',
        layout: 'force' as const,
        filters: {
          mode: 'all' as const,
          includedElementIds: [],
          relationshipTypeIds: ['enemy'],
          schemaIds: [],
          elementTypes: [],
          showOrphans: true,
        },
      };

      service.saveConfig(config);

      expect(mockProjectState.updateElementMetadata).toHaveBeenCalledWith(
        'chart-1',
        expect.objectContaining({
          chartConfig: expect.any(String),
        })
      );

      // Verify serialized content
      const call = mockProjectState.updateElementMetadata.mock.calls[0];
      const metadata = call[1] as Record<string, string>;
      const parsed = JSON.parse(metadata['chartConfig']);
      expect(parsed.layout).toBe('force');
      expect(parsed.filters.showOrphans).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Config Persistence Round-Trip
  // ─────────────────────────────────────────────────────────────────────────

  describe('config round-trip', () => {
    beforeEach(() => {
      // Replace the no-op mock with an implementation that actually updates
      // the signal, simulating what ProjectStateService.updateElementMetadata does.
      mockProjectState.updateElementMetadata.mockImplementation(
        (elementId: string, metadata: Record<string, string>) => {
          const elements = mockElements();
          const index = elements.findIndex(e => e.id === elementId);
          if (index === -1) return;
          const newElements = [...elements];
          newElements[index] = {
            ...newElements[index],
            metadata: { ...newElements[index].metadata, ...metadata },
          };
          mockElements.set(newElements);
        }
      );
    });

    it('should persist and restore curated elements across load cycles', () => {
      mockElements.set([
        makeElement({ id: 'chart-1', type: ElementType.RelationshipChart }),
      ]);

      // First load — no saved config
      service.loadConfig('chart-1');
      expect(service.activeConfig()?.filters.includedElementIds).toEqual([]);

      // Add elements
      service.addElements(['elem-a', 'elem-b']);
      expect(service.activeConfig()?.filters.includedElementIds).toEqual([
        'elem-a',
        'elem-b',
      ]);

      // Simulate navigating away
      service.clearActiveConfig();
      expect(service.activeConfig()).toBeNull();

      // Navigate back — should restore from element metadata
      const restored = service.loadConfig('chart-1');
      expect(restored.filters.includedElementIds).toEqual(['elem-a', 'elem-b']);
      expect(restored.filters.mode).toBe('curated');
    });

    it('should persist and restore relationship type filters', () => {
      mockElements.set([
        makeElement({ id: 'chart-1', type: ElementType.RelationshipChart }),
      ]);

      service.loadConfig('chart-1');
      service.toggleRelationshipType('friend');
      service.toggleRelationshipType('enemy');

      service.clearActiveConfig();
      const restored = service.loadConfig('chart-1');

      expect(restored.filters.relationshipTypeIds).toEqual(['friend', 'enemy']);
    });

    it('should persist and restore layout and mode', () => {
      mockElements.set([
        makeElement({ id: 'chart-1', type: ElementType.RelationshipChart }),
      ]);

      service.loadConfig('chart-1');
      service.setLayout('circular');
      service.setMode('all');

      service.clearActiveConfig();
      const restored = service.loadConfig('chart-1');

      expect(restored.layout).toBe('circular');
      expect(restored.filters.mode).toBe('all');
      expect(restored.filters.showOrphans).toBe(true);
    });

    it('should return defaults when element is not found in elements array', () => {
      // No elements loaded (simulates page refresh before async load)
      mockElements.set([]);
      const config = service.loadConfig('chart-1');

      expect(config.filters.mode).toBe('curated');
      expect(config.filters.includedElementIds).toEqual([]);
      expect(config.layout).toBe('force');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Local State
  // ─────────────────────────────────────────────────────────────────────────

  describe('local state', () => {
    it('should save and load local state', () => {
      const state = { viewport: { x: 10, y: 20, zoom: 1.5 } };
      service.saveLocalState('chart-1', state);
      const loaded = service.loadLocalState('chart-1');
      expect(loaded).toEqual(state);
    });

    it('should return null for missing local state', () => {
      const loaded = service.loadLocalState('nonexistent');
      expect(loaded).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Curated Mode
  // ─────────────────────────────────────────────────────────────────────────

  describe('curated mode', () => {
    it('should include only curated elements in curated mode', () => {
      const elements = [
        makeElement({ id: 'a', name: 'Alice' }),
        makeElement({ id: 'b', name: 'Bob' }),
        makeElement({ id: 'c', name: 'Charlie' }),
      ];
      const relationships = [
        makeRelationship({
          id: 'r1',
          sourceElementId: 'a',
          targetElementId: 'b',
        }),
        makeRelationship({
          id: 'r2',
          sourceElementId: 'b',
          targetElementId: 'c',
        }),
      ];
      const types = [makeRelType()];

      const result = service.buildGraph(elements, relationships, types, {
        mode: 'curated',
        includedElementIds: ['a', 'b'],
        relationshipTypeIds: [],
        schemaIds: [],
        elementTypes: [],
        showOrphans: false,
      });

      expect(result.nodes).toHaveLength(2);
      expect(result.nodes.map(n => n.id)).toEqual(
        expect.arrayContaining(['a', 'b'])
      );
      expect(result.nodes.map(n => n.id)).not.toContain('c');
      // Only edges between included elements
      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].source).toBe('a');
      expect(result.edges[0].target).toBe('b');
    });

    it('should include curated elements even without relationships', () => {
      const elements = [
        makeElement({ id: 'a', name: 'Alice' }),
        makeElement({ id: 'b', name: 'Bob' }),
      ];

      const result = service.buildGraph(elements, [], [], {
        mode: 'curated',
        includedElementIds: ['a', 'b'],
        relationshipTypeIds: [],
        schemaIds: [],
        elementTypes: [],
        showOrphans: false,
      });

      // Curated mode should include explicit picks regardless of orphan status
      expect(result.nodes).toHaveLength(2);
    });

    it('should return empty graph in curated mode with no element IDs', () => {
      const elements = [makeElement({ id: 'a', name: 'Alice' })];

      const result = service.buildGraph(elements, [], [], {
        mode: 'curated',
        includedElementIds: [],
        relationshipTypeIds: [],
        schemaIds: [],
        elementTypes: [],
        showOrphans: false,
      });

      expect(result.nodes).toHaveLength(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Element & Relationship Type Management
  // ─────────────────────────────────────────────────────────────────────────

  describe('addElements', () => {
    it('should add elements to the curated list', () => {
      service.loadConfig('chart-1');
      service.addElements(['el-1', 'el-2']);

      const config = service.activeConfig();
      expect(config?.filters.includedElementIds).toContain('el-1');
      expect(config?.filters.includedElementIds).toContain('el-2');
      expect(config?.filters.mode).toBe('curated');
    });

    it('should not duplicate existing element IDs', () => {
      service.loadConfig('chart-1');
      service.addElements(['el-1']);
      service.addElements(['el-1', 'el-2']);

      const config = service.activeConfig();
      const elIds = config?.filters.includedElementIds ?? [];
      expect(elIds.filter(id => id === 'el-1')).toHaveLength(1);
      expect(elIds).toContain('el-2');
    });
  });

  describe('removeElement', () => {
    it('should remove an element from the curated list', () => {
      service.loadConfig('chart-1');
      service.addElements(['el-1', 'el-2', 'el-3']);
      service.removeElement('el-2');

      const config = service.activeConfig();
      expect(config?.filters.includedElementIds).not.toContain('el-2');
      expect(config?.filters.includedElementIds).toContain('el-1');
      expect(config?.filters.includedElementIds).toContain('el-3');
    });
  });

  describe('toggleRelationshipType', () => {
    it('should add a type to empty filter', () => {
      service.loadConfig('chart-1');
      service.toggleRelationshipType('friend');

      const config = service.activeConfig();
      expect(config?.filters.relationshipTypeIds).toContain('friend');
    });

    it('should remove a type when toggled again', () => {
      service.loadConfig('chart-1');
      service.toggleRelationshipType('friend');
      service.toggleRelationshipType('friend');

      const config = service.activeConfig();
      expect(config?.filters.relationshipTypeIds).not.toContain('friend');
    });
  });

  describe('setMode', () => {
    it('should set mode to all and enable showOrphans', () => {
      service.loadConfig('chart-1');
      service.setMode('all');

      const config = service.activeConfig();
      expect(config?.filters.mode).toBe('all');
      expect(config?.filters.showOrphans).toBe(true);
    });

    it('should set mode to curated without changing showOrphans', () => {
      service.loadConfig('chart-1');
      service.setMode('curated');

      const config = service.activeConfig();
      expect(config?.filters.mode).toBe('curated');
    });
  });
});
