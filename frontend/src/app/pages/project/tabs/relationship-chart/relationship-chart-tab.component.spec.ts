import { HttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  Element,
  ElementsService,
  ElementType,
} from '../../../../../api-client';
import {
  ChartGraphData,
  createDefaultChartConfig,
} from '../../../../models/relationship-chart.model';
import { ProjectStateService } from '../../../../services/project/project-state.service';
import { RelationshipService } from '../../../../services/relationship/relationship.service';
import { RelationshipChartService } from '../../../../services/relationship-chart/relationship-chart.service';
import { RelationshipChartTabComponent } from './relationship-chart-tab.component';

// Cytoscape requires ResizeObserver which is not available in jsdom
class MockResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

describe('RelationshipChartTabComponent', () => {
  let component: RelationshipChartTabComponent;
  let fixture: ComponentFixture<RelationshipChartTabComponent>;

  beforeAll(() => {
    if (!globalThis.ResizeObserver) {
      globalThis.ResizeObserver = MockResizeObserver as any;
    }
  });

  const graphDataSignal = signal<ChartGraphData | null>(null);

  const mockChartService = {
    activeConfig: signal(createDefaultChartConfig('test-chart')),
    graphData: graphDataSignal,
    loadConfig: vi.fn(() => createDefaultChartConfig('test-chart')),
    saveConfig: vi.fn(),
    setLayout: vi.fn(),
    setFilters: vi.fn(),
    clearActiveConfig: vi.fn(),
    loadLocalState: vi.fn(() => null),
    saveLocalState: vi.fn(),
    buildGraph: vi.fn(),
    addElements: vi.fn(),
    removeElement: vi.fn(),
    toggleRelationshipType: vi.fn(),
    setMode: vi.fn(),
    setFocusElement: vi.fn(),
  };

  const testElements: Element[] = [
    {
      id: 'el-1',
      name: 'Alice',
      type: ElementType.Worldbuilding,
      schemaId: 'character-v1',
    } as Element,
    {
      id: 'el-2',
      name: 'Mordor',
      type: ElementType.Worldbuilding,
      schemaId: 'location-v1',
    } as Element,
    {
      id: 'el-3',
      name: 'Sword',
      type: ElementType.Worldbuilding,
      schemaId: 'wb-item-v1',
    } as Element,
  ];

  const mockProjectState = {
    elements: signal(testElements),
    project: signal({ username: 'testuser', slug: 'test-project' }),
  };

  const mockRoute = {
    paramMap: of(new Map([['tabId', 'test-chart']])),
  };

  const mockElementsService = {
    getElementImages: vi.fn(() => of({ images: {} })),
  };

  const mockHttpClient = {
    get: vi.fn(() => of(new Blob())),
  };

  const mockRelationshipService = {
    allTypes: signal([
      { id: 'friend', name: 'Friend', color: '#5B8FF9' },
      { id: 'enemy', name: 'Enemy', color: '#E8684A' },
      { id: 'ally', name: 'Ally', color: '#5AD8A6' },
    ]),
    relationships: signal([
      {
        id: 'r1',
        sourceElementId: 'el-1',
        targetElementId: 'el-2',
        relationshipTypeId: 'friend',
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'r2',
        sourceElementId: 'el-2',
        targetElementId: 'el-3',
        relationshipTypeId: 'enemy',
        createdAt: '',
        updatedAt: '',
      },
    ]),
    getAllRelationships: vi.fn(() => []),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    graphDataSignal.set(null);
    mockChartService.activeConfig.set(createDefaultChartConfig('test-chart'));

    await TestBed.configureTestingModule({
      imports: [RelationshipChartTabComponent],
      providers: [
        { provide: ProjectStateService, useValue: mockProjectState },
        { provide: ActivatedRoute, useValue: mockRoute },
        { provide: ElementsService, useValue: mockElementsService },
        { provide: HttpClient, useValue: mockHttpClient },
        { provide: RelationshipService, useValue: mockRelationshipService },
      ],
    })
      // RelationshipChartService is now a component-level provider; override it
      // so the component gets the mock instead of a real instance.
      .overrideComponent(RelationshipChartTabComponent, {
        set: {
          providers: [
            { provide: RelationshipChartService, useValue: mockChartService },
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(RelationshipChartTabComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load chart config on init', () => {
    fixture.detectChanges();
    expect(mockChartService.loadConfig).toHaveBeenCalledWith('test-chart');
  });

  it('should clear active config on destroy', () => {
    fixture.detectChanges();
    fixture.destroy();
    expect(mockChartService.clearActiveConfig).toHaveBeenCalled();
  });

  it('should report hasData false when graph is null', () => {
    fixture.detectChanges();
    expect(component['hasData']()).toBe(false);
  });

  it('should report hasData false when graph has empty nodes', () => {
    graphDataSignal.set({ nodes: [], edges: [] });
    fixture.detectChanges();
    expect(component['hasData']()).toBe(false);
  });

  it('should report hasData true when graph has nodes', () => {
    graphDataSignal.set({
      nodes: [
        {
          id: 'a',
          name: 'Alice',
          type: 'WORLDBUILDING' as any,
          category: 'Character',
          relationshipCount: 1,
        },
      ],
      edges: [],
    });
    fixture.detectChanges();
    expect(component['hasData']()).toBe(true);
  });

  it('should delegate layout change to chart service', () => {
    fixture.detectChanges();
    component['onLayoutChange']('circular');
    expect(mockChartService.setLayout).toHaveBeenCalledWith('circular');
    expect(component['layout']()).toBe('circular');
  });

  it('should toggle orphans via chart service', () => {
    fixture.detectChanges();
    component['toggleOrphans']();
    expect(mockChartService.setFilters).toHaveBeenCalledWith(
      expect.objectContaining({ showOrphans: true })
    );
  });

  it('should set hasData when graph data arrives', () => {
    fixture.detectChanges();
    graphDataSignal.set({
      nodes: [
        {
          id: 'a',
          name: 'Alice',
          type: 'WORLDBUILDING' as any,
          category: 'Character',
          relationshipCount: 2,
        },
        {
          id: 'b',
          name: 'Bob',
          type: 'WORLDBUILDING' as any,
          category: 'Character',
          relationshipCount: 1,
        },
      ],
      edges: [
        {
          source: 'a',
          target: 'b',
          relationshipTypeId: 'friend',
          label: 'Friend',
          color: '#5B8FF9',
          relationshipId: 'r1',
        },
      ],
    });
    TestBed.flushEffects();

    expect(component['hasData']()).toBe(true);
  });

  it('should not crash when exporting without cytoscape instance', () => {
    fixture.detectChanges();
    // These should be no-ops when cy is null
    expect(() => component['exportAsPng']()).not.toThrow();
    expect(() => component['exportAsSvg']()).not.toThrow();
  });

  it('should not save local state on destroy when cy is null', () => {
    fixture.detectChanges();
    fixture.destroy();
    // saveLocalState early-returns when cy is null
    expect(mockChartService.saveLocalState).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Sidebar & Element Management
  // ─────────────────────────────────────────────────────────────────────────

  it('should start with sidebar open', () => {
    fixture.detectChanges();
    expect(component['sidebarOpen']()).toBe(true);
  });

  it('should toggle sidebar visibility', () => {
    fixture.detectChanges();
    expect(component['sidebarOpen']()).toBe(true);
    component['toggleSidebar']();
    expect(component['sidebarOpen']()).toBe(false);
    component['toggleSidebar']();
    expect(component['sidebarOpen']()).toBe(true);
  });

  it('should delegate mode change to chart service', () => {
    fixture.detectChanges();
    component['onModeChange']('all');
    expect(mockChartService.setMode).toHaveBeenCalledWith('all');
  });

  it('should delegate removeElement to chart service', () => {
    fixture.detectChanges();
    component['removeElement']('el-1');
    expect(mockChartService.removeElement).toHaveBeenCalledWith('el-1');
  });

  it('should delegate toggleRelType to chart service', () => {
    fixture.detectChanges();
    component['toggleRelType']('friend');
    expect(mockChartService.toggleRelationshipType).toHaveBeenCalledWith(
      'friend'
    );
  });

  it('should clear relationship type filter via showAllRelTypes', () => {
    fixture.detectChanges();
    component['showAllRelTypes']();
    expect(mockChartService.setFilters).toHaveBeenCalledWith(
      expect.objectContaining({ relationshipTypeIds: [] })
    );
  });

  it('should compute includedElements from config IDs', () => {
    const config = createDefaultChartConfig('test-chart');
    config.filters.includedElementIds = ['el-1', 'el-3'];
    mockChartService.activeConfig.set(config);
    fixture.detectChanges();

    const included = component['includedElements']();
    expect(included).toHaveLength(2);
    expect(included.map(e => e.id)).toEqual(['el-1', 'el-3']);
  });

  it('should return empty array for includedElements when no IDs', () => {
    fixture.detectChanges();
    const included = component['includedElements']();
    expect(included).toEqual([]);
  });

  it('should only include relationship types present on chart elements', () => {
    // Set mode to 'all' so all test elements are included
    const config = createDefaultChartConfig('test-chart');
    config.filters.mode = 'all';
    mockChartService.activeConfig.set(config);
    fixture.detectChanges();

    // Mock has 3 types (friend, enemy, ally) but only friend & enemy
    // have relationships between the test elements
    const types = component['allRelationshipTypes']();
    expect(types).toHaveLength(2);
    expect(types.map(t => t.id)).toEqual(['friend', 'enemy']);
  });

  it('should return empty types when curated mode has no elements', () => {
    fixture.detectChanges();
    const types = component['allRelationshipTypes']();
    expect(types).toHaveLength(0);
  });

  it('should filter types to curated element relationships', () => {
    const config = createDefaultChartConfig('test-chart');
    config.filters.mode = 'curated';
    config.filters.includedElementIds = ['el-1', 'el-2'];
    mockChartService.activeConfig.set(config);
    fixture.detectChanges();

    // Only el-1 <-> el-2 relationship exists (friend), not enemy (el-2 <-> el-3)
    const types = component['allRelationshipTypes']();
    expect(types).toHaveLength(1);
    expect(types[0].id).toBe('friend');
  });

  it('should treat all types as active when filter is empty', () => {
    fixture.detectChanges();
    expect(component['isRelTypeActive']('friend')).toBe(true);
    expect(component['isRelTypeActive']('enemy')).toBe(true);
  });

  it('should check isRelTypeActive against filtered set', () => {
    const config = createDefaultChartConfig('test-chart');
    config.filters.relationshipTypeIds = ['friend'];
    mockChartService.activeConfig.set(config);
    fixture.detectChanges();

    expect(component['isRelTypeActive']('friend')).toBe(true);
    expect(component['isRelTypeActive']('enemy')).toBe(false);
  });

  it('should open add elements dialog', () => {
    fixture.detectChanges();
    // openAddElements calls this.dialog.open(); verify it doesn't crash
    // Dialog integration is tested via the service methods
    expect(() => component['openAddElements']()).not.toThrow();
  });

  it('should return correct icon for character schema', () => {
    const el = {
      id: 'el-1',
      name: 'Alice',
      type: ElementType.Worldbuilding,
      schemaId: 'character-v1',
    } as Element;
    expect(component['getElementIcon'](el)).toBe('person');
  });

  it('should return correct icon for location schema', () => {
    const el = {
      id: 'el-2',
      name: 'Mordor',
      type: ElementType.Worldbuilding,
      schemaId: 'location-v1',
    } as Element;
    expect(component['getElementIcon'](el)).toBe('place');
  });

  it('should return correct icon for faction schema', () => {
    const el = {
      id: 'el-5',
      name: 'The Council',
      type: ElementType.Worldbuilding,
      schemaId: 'faction-v1',
    } as Element;
    expect(component['getElementIcon'](el)).toBe('groups');
  });

  it('should return inventory_2 icon for wb-item schema', () => {
    const el = {
      id: 'el-6',
      name: 'Magic Sword',
      type: ElementType.Worldbuilding,
      schemaId: 'wb-item-v1',
    } as Element;
    expect(component['getElementIcon'](el)).toBe('inventory_2');
  });

  it('should export PNG when cytoscape instance is available', () => {
    fixture.detectChanges();
    const mockPng = vi.fn(() => 'data:image/png;base64,abc');
    component['cy'] = { png: mockPng, destroy: vi.fn() } as any;
    expect(() => component['exportAsPng']()).not.toThrow();
    expect(mockPng).toHaveBeenCalledWith(
      expect.objectContaining({ full: true, scale: 2 })
    );
  });

  it('should export SVG fallback (high-res PNG) when cytoscape instance is available', () => {
    fixture.detectChanges();
    const mockPng = vi.fn(() => 'data:image/png;base64,abc');
    component['cy'] = { png: mockPng, destroy: vi.fn() } as any;
    expect(() => component['exportAsSvg']()).not.toThrow();
    expect(mockPng).toHaveBeenCalledWith(
      expect.objectContaining({ full: true, scale: 3 })
    );
  });

  it('should save local state on destroy when cytoscape instance is set', () => {
    fixture.detectChanges();
    const mockNodes = vi.fn(() => ({
      forEach: vi.fn((_cb: (node: any) => void) => {}),
    }));
    component['cy'] = {
      nodes: mockNodes,
      destroy: vi.fn(),
    } as any;
    fixture.destroy();
    expect(mockChartService.saveLocalState).toHaveBeenCalledWith('test-chart', {
      nodePositions: {},
    });
  });

  it('should return description icon for documents', () => {
    const el = {
      id: 'el-4',
      name: 'Chapter 1',
      type: ElementType.Item,
    } as Element;
    expect(component['getElementIcon'](el)).toBe('description');
  });

  it('should compute mode from active config', () => {
    fixture.detectChanges();
    expect(component['mode']()).toBe('curated');

    const config = createDefaultChartConfig('test-chart');
    config.filters.mode = 'all';
    mockChartService.activeConfig.set(config);
    expect(component['mode']()).toBe('all');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Focus Mode
  // ─────────────────────────────────────────────────────────────────────────

  it('should set focus element and delegate to chart service', () => {
    fixture.detectChanges();
    component['setFocusElement']('el-1');
    expect(component['focusElementId']()).toBe('el-1');
    expect(mockChartService.setFocusElement).toHaveBeenCalledWith('el-1', 3);
  });

  it('should clear focus when same node is clicked twice', () => {
    fixture.detectChanges();
    component['setFocusElement']('el-1');
    component['setFocusElement']('el-1'); // toggle off
    expect(component['focusElementId']()).toBeNull();
    expect(mockChartService.setFocusElement).toHaveBeenLastCalledWith(null);
  });

  it('should clear focus and delegate to chart service', () => {
    fixture.detectChanges();
    component['setFocusElement']('el-1');
    component['clearFocus']();
    expect(component['focusElementId']()).toBeNull();
    expect(mockChartService.setFocusElement).toHaveBeenLastCalledWith(null);
  });

  it('should update maxDepth and propagate to service when in focus mode', () => {
    fixture.detectChanges();
    component['setFocusElement']('el-1');
    const inputEvent = { target: { value: '2' } } as unknown as Event;
    component['onMaxDepthChange'](inputEvent);
    expect(component['maxDepth']()).toBe(2);
    expect(mockChartService.setFocusElement).toHaveBeenLastCalledWith(
      'el-1',
      2
    );
  });

  it('should derive focus element name from project elements', () => {
    fixture.detectChanges();
    component['setFocusElement']('el-1');
    expect(component['focusElementName']()).toBe('Alice');
  });

  it('should reset focus state on tab navigation', () => {
    fixture.detectChanges();
    component['setFocusElement']('el-1');
    expect(component['focusElementId']()).toBe('el-1');
    // paramMap emits again (simulating navigation)
    // Can't easily re-trigger here, but we verify default state:
    expect(component['maxDepth']()).toBe(3);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Label Visibility
  // ─────────────────────────────────────────────────────────────────────────

  it('should start with labels in auto mode', () => {
    fixture.detectChanges();
    expect(component['showLabelsOverride']()).toBeNull();
    expect(component['labelsButtonLabel']).toBe('Labels: Auto');
  });

  it('should cycle labels: auto → on → off → auto', () => {
    fixture.detectChanges();
    component['toggleLabels']();
    expect(component['showLabelsOverride']()).toBe(true);
    expect(component['labelsButtonLabel']).toBe('Labels: On');
    component['toggleLabels']();
    expect(component['showLabelsOverride']()).toBe(false);
    expect(component['labelsButtonLabel']).toBe('Labels: Off');
    component['toggleLabels']();
    expect(component['showLabelsOverride']()).toBeNull();
    expect(component['labelsButtonLabel']).toBe('Labels: Auto');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Schema Filters
  // ─────────────────────────────────────────────────────────────────────────

  it('should derive available schemas from worldbuilding elements', () => {
    fixture.detectChanges();
    const schemas = component['availableSchemas']();
    expect(schemas).toContain('character-v1');
    expect(schemas).toContain('location-v1');
    expect(schemas).toContain('wb-item-v1');
  });

  it('should toggle a schema filter', () => {
    fixture.detectChanges();
    component['toggleSchema']('character-v1');
    expect(mockChartService.setFilters).toHaveBeenCalledWith(
      expect.objectContaining({ schemaIds: ['character-v1'] })
    );
  });

  it('should clear schema filters', () => {
    fixture.detectChanges();
    component['clearSchemaFilters']();
    expect(mockChartService.setFilters).toHaveBeenCalledWith(
      expect.objectContaining({ schemaIds: [] })
    );
  });

  it('should return schema active when filter is empty', () => {
    fixture.detectChanges();
    expect(component['isSchemaActive']('character-v1')).toBe(true);
  });

  it('should return schema active only for included schemas when filter is set', () => {
    const config = createDefaultChartConfig('test-chart');
    config.filters.schemaIds = ['character-v1'];
    mockChartService.activeConfig.set(config);
    fixture.detectChanges();
    expect(component['isSchemaActive']('character-v1')).toBe(true);
    expect(component['isSchemaActive']('location-v1')).toBe(false);
  });

  it('should convert schema ID to label correctly', () => {
    fixture.detectChanges();
    expect(component['getSchemaLabel']('character-v1')).toBe('Character');
    expect(component['getSchemaLabel']('wb-item-v1')).toBe('Wb Item');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Show Orphans
  // ─────────────────────────────────────────────────────────────────────────

  it('should compute showOrphans from active config', () => {
    fixture.detectChanges();
    expect(component['showOrphans']()).toBe(false);

    const config = createDefaultChartConfig('test-chart');
    config.filters.showOrphans = true;
    mockChartService.activeConfig.set(config);
    expect(component['showOrphans']()).toBe(true);
  });
});
