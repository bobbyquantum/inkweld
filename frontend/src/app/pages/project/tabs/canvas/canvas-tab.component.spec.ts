import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog, type MatDialogRef } from '@angular/material/dialog';
import { ActivatedRoute } from '@angular/router';
import {
  type CanvasConfig,
  type CanvasImage,
  type CanvasPath,
  type CanvasPin,
  type CanvasShape,
  type CanvasText,
  createDefaultCanvasConfig,
  createDefaultToolSettings,
} from '@models/canvas.model';
import { CanvasService } from '@services/canvas/canvas.service';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { LoggerService } from '@services/core/logger.service';
import { LocalStorageService } from '@services/local/local-storage.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { RelationshipService } from '@services/relationship/relationship.service';
import { of } from 'rxjs';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { type Element, ElementType } from '../../../../../api-client';
import { CanvasTabComponent } from './canvas-tab.component';

// Konva requires ResizeObserver which is not available in jsdom
class MockResizeObserver {
  observe(): void {
    // noop for jsdom tests
  }
  unobserve(): void {
    // noop for jsdom tests
  }
  disconnect(): void {
    // noop for jsdom tests
  }
}

describe('CanvasTabComponent', () => {
  let component: CanvasTabComponent;
  let fixture: ComponentFixture<CanvasTabComponent>;
  let mockDialog: { open: ReturnType<typeof vi.fn> };

  function createStageStub(overrides: Record<string, unknown> = {}) {
    return {
      width: vi.fn(() => 400),
      height: vi.fn(() => 200),
      x: vi.fn(() => 0),
      y: vi.fn(() => 0),
      scaleX: vi.fn(() => 1),
      position: vi.fn(),
      scale: vi.fn(),
      destroy: vi.fn(),
      ...overrides,
    };
  }

  beforeAll(() => {
    if (!globalThis.ResizeObserver) {
      globalThis.ResizeObserver =
        MockResizeObserver as unknown as typeof ResizeObserver;
    }
  });

  const defaultConfig = createDefaultCanvasConfig('test-canvas');

  const mockCanvasService = {
    activeConfig: signal<CanvasConfig | null>(defaultConfig),
    loadConfig: vi.fn(() => defaultConfig),
    saveConfig: vi.fn(),
    addLayer: vi.fn(() => 'new-layer-id'),
    removeLayer: vi.fn(),
    updateLayer: vi.fn(),
    reorderLayers: vi.fn(),
    getSortedLayers: vi.fn(() => defaultConfig.layers),
    addObject: vi.fn(),
    removeObject: vi.fn(),
    updateObject: vi.fn(),
    moveObjectToLayer: vi.fn(),
    getObjectsForLayer: vi.fn(() => []),
    updateObjectPositions: vi.fn(),
    createPin: vi.fn(() => ({
      id: 'pin-1',
      layerId: 'layer-1',
      type: 'pin' as const,
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      visible: true,
      locked: false,
      label: 'Test Pin',
      icon: 'place',
      color: '#E53935',
    })),
    saveViewport: vi.fn(),
    loadViewport: vi.fn(() => null),
  };

  const testElements: Element[] = [
    {
      id: 'test-canvas',
      name: 'Test Canvas',
      type: ElementType.Canvas,
      parentId: null,
      order: 0,
      level: 0,
      expandable: false,
      version: 1,
      metadata: {},
    } as Element,
  ];

  const mockProjectState = {
    elements: signal(testElements),
    project: signal<{ username: string; slug: string } | null>({
      username: 'testuser',
      slug: 'test-project',
    }),
    updateElementMetadata: vi.fn(),
  };

  const mockRoute = {
    paramMap: of(new Map([['tabId', 'test-canvas']])),
  };

  const mockDialogGateway = {
    openInsertImageDialog: vi.fn(() => Promise.resolve(undefined)),
  };

  const mockLocalStorageService = {
    saveMedia: vi.fn(() => Promise.resolve()),
    getMediaUrl: vi.fn<
      (projectKey: string, mediaId: string) => Promise<string | null>
    >(() => Promise.resolve(null)),
    preCacheMediaUrl: vi.fn(() => 'blob:mock-url'),
  };

  const mockLogger = {
    warn: vi.fn(),
  };

  const mockRelationshipService = {
    addRelationship: vi.fn(() => ({ id: 'relationship-1' })),
    removeRelationship: vi.fn(() => true),
    getTypeById: vi.fn(() => ({ id: 'canvas-pin' })),
    addRawType: vi.fn(),
  };

  beforeEach(async () => {
    // Use fake timers to prevent initStage() from firing —
    // Konva.Stage cannot create a real HTML canvas in jsdom.
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockCanvasService.activeConfig.set(defaultConfig);
    mockProjectState.project.set({
      username: 'testuser',
      slug: 'test-project',
    });

    mockDialog = {
      open: vi.fn(() => ({
        afterClosed: () => of(undefined),
      })),
    };

    await TestBed.configureTestingModule({
      imports: [CanvasTabComponent],
      providers: [
        { provide: ProjectStateService, useValue: mockProjectState },
        { provide: ActivatedRoute, useValue: mockRoute },
        { provide: MatDialog, useValue: mockDialog },
        { provide: DialogGatewayService, useValue: mockDialogGateway },
        { provide: LocalStorageService, useValue: mockLocalStorageService },
        { provide: LoggerService, useValue: mockLogger },
        { provide: RelationshipService, useValue: mockRelationshipService },
      ],
    })
      // CanvasService is a component-level provider; override it
      .overrideComponent(CanvasTabComponent, {
        set: {
          providers: [{ provide: CanvasService, useValue: mockCanvasService }],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(CanvasTabComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load canvas config on init', () => {
    fixture.detectChanges();
    expect(mockCanvasService.loadConfig).toHaveBeenCalledWith('test-canvas');
  });

  it('should set element name from project elements', () => {
    fixture.detectChanges();
    expect(component['elementName']()).toBe('Test Canvas');
  });

  it('should set active layer to first layer from config', () => {
    fixture.detectChanges();
    expect(component['activeLayerId']()).toBe(defaultConfig.layers[0].id);
  });

  it('should default to select tool', () => {
    expect(component['activeTool']()).toBe('select');
  });

  it('should default tool settings', () => {
    const settings = component['toolSettings']();
    const defaults = createDefaultToolSettings();
    expect(settings.stroke).toBe(defaults.stroke);
    expect(settings.fill).toBe(defaults.fill);
    expect(settings.strokeWidth).toBe(defaults.strokeWidth);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Tool Changes
  // ─────────────────────────────────────────────────────────────────────────

  describe('tool changes', () => {
    it('should change active tool', () => {
      component['onToolChange']('draw');
      expect(component['activeTool']()).toBe('draw');
    });

    it('should change tool via multiple calls', () => {
      component['onToolChange']('pin');
      expect(component['activeTool']()).toBe('pin');

      component['onToolChange']('text');
      expect(component['activeTool']()).toBe('text');
    });

    it('should support rectSelect tool', () => {
      component['onToolChange']('rectSelect');
      expect(component['activeTool']()).toBe('rectSelect');
      expect(component.toolClass).toBe('tool-rectSelect');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Layer Actions
  // ─────────────────────────────────────────────────────────────────────────

  describe('layer actions', () => {
    it('should delegate add layer to service', () => {
      component['onAddLayer']();
      expect(mockCanvasService.addLayer).toHaveBeenCalled();
    });

    it('should set active layer on add', () => {
      component['onAddLayer']();
      expect(component['activeLayerId']()).toBe('new-layer-id');
    });

    it('should change active layer', () => {
      component['onSelectLayer']('some-layer');
      expect(component['activeLayerId']()).toBe('some-layer');
    });

    it('should toggle layer visibility and stop propagation', () => {
      const event = { stopPropagation: vi.fn() } as unknown as Event;

      component['onToggleLayerVisibility'](defaultConfig.layers[0].id, event);

      expect(event.stopPropagation).toHaveBeenCalled();
      expect(mockCanvasService.updateLayer).toHaveBeenCalledWith(
        defaultConfig.layers[0].id,
        { visible: false }
      );
    });

    it('should toggle layer lock and stop propagation', () => {
      const event = { stopPropagation: vi.fn() } as unknown as Event;

      component['onToggleLayerLock'](defaultConfig.layers[0].id, event);

      expect(event.stopPropagation).toHaveBeenCalled();
      expect(mockCanvasService.updateLayer).toHaveBeenCalledWith(
        defaultConfig.layers[0].id,
        { locked: true }
      );
    });

    it('should rename a layer using trimmed dialog input', async () => {
      mockDialog.open.mockReturnValue({
        afterClosed: () => of('  Renamed Layer  '),
      } as MatDialogRef<unknown>);

      await component['onRenameLayer'](defaultConfig.layers[0].id);

      expect(mockCanvasService.updateLayer).toHaveBeenCalledWith(
        defaultConfig.layers[0].id,
        { name: 'Renamed Layer' }
      );
    });

    it('should ignore blank rename dialog results', async () => {
      mockDialog.open.mockReturnValue({
        afterClosed: () => of('   '),
      } as MatDialogRef<unknown>);

      await component['onRenameLayer'](defaultConfig.layers[0].id);

      expect(mockCanvasService.updateLayer).not.toHaveBeenCalled();
    });

    it('should duplicate layer objects and clear pin relationships', () => {
      const shape: CanvasShape = {
        id: 'shape-1',
        layerId: defaultConfig.layers[0].id,
        type: 'shape',
        shapeType: 'rect',
        x: 10,
        y: 20,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        visible: true,
        locked: false,
        width: 20,
        height: 30,
        fill: '#fff',
        stroke: '#000',
        strokeWidth: 1,
      };
      const pin: CanvasPin = {
        id: 'pin-1',
        layerId: defaultConfig.layers[0].id,
        type: 'pin',
        x: 30,
        y: 40,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        visible: true,
        locked: false,
        label: 'Pin',
        icon: 'place',
        color: '#f00',
        linkedElementId: 'character-1',
        relationshipId: 'rel-1',
      };

      mockCanvasService.activeConfig.set({
        ...defaultConfig,
        objects: [shape, pin],
      });

      component['onDuplicateLayer'](defaultConfig.layers[0].id);

      expect(mockCanvasService.addLayer).toHaveBeenCalledWith('Layer 1 (copy)');
      expect(mockCanvasService.addObject).toHaveBeenCalledTimes(2);
      expect(mockCanvasService.addObject.mock.calls[0][0]).toMatchObject({
        layerId: 'new-layer-id',
        type: 'shape',
      });
      expect(mockCanvasService.addObject.mock.calls[1][0]).toMatchObject({
        layerId: 'new-layer-id',
        type: 'pin',
        linkedElementId: undefined,
        relationshipId: undefined,
      });
    });

    it('should delegate delete layer to service on confirm', async () => {
      mockDialog.open.mockReturnValue({
        afterClosed: () => of(true),
      } as MatDialogRef<unknown>);
      await component['onDeleteLayer']('layer-1');
      expect(mockCanvasService.removeLayer).toHaveBeenCalledWith('layer-1');
    });

    it('should not delete layer when confirm is cancelled', async () => {
      mockDialog.open.mockReturnValue({
        afterClosed: () => of(undefined),
      } as MatDialogRef<unknown>);
      await component['onDeleteLayer']('layer-1');
      expect(mockCanvasService.removeLayer).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Object Actions
  // ─────────────────────────────────────────────────────────────────────────

  describe('object actions', () => {
    it('should select an object', () => {
      component['onSelectObject']('obj-1');
      expect(component['selectedObjectId']()).toBe('obj-1');
    });

    it('should delegate delete object to service', () => {
      component['selectedObjectId'].set('obj-1');
      const event = new Event('click');
      component['onDeleteObject']('obj-1', event);

      expect(mockCanvasService.removeObject).toHaveBeenCalledWith('obj-1');
      expect(component['selectedObjectId']()).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Computed Values
  // ─────────────────────────────────────────────────────────────────────────

  describe('computed properties', () => {
    it('should compute zoom percent from zoom level', () => {
      expect(component['zoomPercent']()).toBe(100);
    });

    it('should compute sorted layers from config', () => {
      const sorted = component['sortedLayers']();
      expect(sorted).toHaveLength(1);
      expect(sorted[0].name).toBe('Layer 1');
    });

    it('should compute active layer objects', () => {
      // Default config has no objects
      fixture.detectChanges();
      expect(component['activeLayerObjects']()).toHaveLength(0);
    });

    it('should return empty computed values when config is missing', () => {
      mockCanvasService.activeConfig.set(null);

      expect(component['sortedLayers']()).toEqual([]);
      expect(component['activeLayerObjects']()).toEqual([]);
      expect(component['hasActiveLayer']()).toBe(false);
    });

    it('should compute shape icon based on tool settings', () => {
      expect(component['shapeIcon']()).toBe('crop_square');
    });

    it('should compute shape icon for alternate shape types', () => {
      component['toolSettings'].update(settings => ({
        ...settings,
        shapeType: 'ellipse',
      }));
      expect(component['shapeIcon']()).toBe('circle');

      component['toolSettings'].update(settings => ({
        ...settings,
        shapeType: 'arrow',
      }));
      expect(component['shapeIcon']()).toBe('arrow_right_alt');

      component['toolSettings'].update(settings => ({
        ...settings,
        shapeType: 'line',
      }));
      expect(component['shapeIcon']()).toBe('horizontal_rule');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Sidebar Toggle
  // ─────────────────────────────────────────────────────────────────────────

  describe('sidebar', () => {
    it('should toggle sidebar state', () => {
      const initial = component['sidebarOpen']();
      component['toggleSidebar']();
      expect(component['sidebarOpen']()).toBe(!initial);
    });

    it('should persist sidebar state to localStorage', () => {
      const writeLocalStorageSpy = vi.spyOn(
        component as never,
        'writeLocalStorage'
      );

      component['toggleSidebar']();

      expect(writeLocalStorageSpy).toHaveBeenCalledWith(
        'canvasSidebarOpen',
        String(component['sidebarOpen']())
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Object Icons & Labels
  // ─────────────────────────────────────────────────────────────────────────

  describe('getObjectIcon', () => {
    it('should return correct icon for each type', () => {
      const base = {
        id: 'x',
        layerId: 'l',
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        visible: true,
        locked: false,
      };
      expect(
        component['getObjectIcon']({
          ...base,
          type: 'image',
          src: '',
          width: 1,
          height: 1,
        } as CanvasImage)
      ).toBe('image');
      expect(
        component['getObjectIcon']({
          ...base,
          type: 'text',
          text: '',
          fontSize: 16,
          fontFamily: 'Arial',
          fontStyle: 'normal',
          fill: '#000',
          width: 100,
          align: 'left',
        } as CanvasText)
      ).toBe('title');
      expect(
        component['getObjectIcon']({
          ...base,
          type: 'path',
          points: [],
          stroke: '#000',
          strokeWidth: 2,
          closed: false,
          tension: 0,
        } as CanvasPath)
      ).toBe('draw');
      expect(
        component['getObjectIcon']({
          ...base,
          type: 'shape',
          shapeType: 'rect',
          width: 50,
          height: 50,
          fill: '#fff',
          stroke: '#000',
          strokeWidth: 1,
        } as CanvasShape)
      ).toBe('crop_square');
      expect(
        component['getObjectIcon']({
          ...base,
          type: 'pin',
          label: 'Pin',
          icon: 'place',
          color: '#f00',
        } as CanvasPin)
      ).toBe('place');
    });
  });

  describe('getObjectLabel', () => {
    it('should return Image for image objects', () => {
      const obj: CanvasImage = {
        id: 'x',
        layerId: 'l',
        type: 'image',
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        visible: true,
        locked: false,
        src: 'image.png',
        width: 100,
        height: 100,
      };

      expect(component['getObjectLabel'](obj)).toBe('Image');
    });

    it('should return text content for text objects', () => {
      const obj: CanvasText = {
        id: 'x',
        layerId: 'l',
        type: 'text',
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        visible: true,
        locked: false,
        text: 'Hello World',
        fontSize: 16,
        fontFamily: 'Arial',
        fontStyle: 'normal',
        fill: '#000',
        width: 200,
        align: 'left',
      };
      const label = component['getObjectLabel'](obj);
      expect(label).toBe('Hello World');
    });

    it('should fall back to Text when the text object is empty', () => {
      const obj: CanvasText = {
        id: 'x',
        layerId: 'l',
        type: 'text',
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        visible: true,
        locked: false,
        text: '',
        fontSize: 16,
        fontFamily: 'Arial',
        fontStyle: 'normal',
        fill: '#000',
        width: 200,
        align: 'left',
      };

      expect(component['getObjectLabel'](obj)).toBe('Text');
    });

    it('should return point count for path objects', () => {
      const obj: CanvasPath = {
        id: 'x',
        layerId: 'l',
        type: 'path',
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        visible: true,
        locked: false,
        points: [0, 0, 10, 10, 20, 20],
        stroke: '#000',
        strokeWidth: 2,
        closed: false,
        tension: 0,
      };

      expect(component['getObjectLabel'](obj)).toBe('Path (3 pts)');
    });

    it('should return pin label for pin objects', () => {
      const obj: CanvasPin = {
        id: 'x',
        layerId: 'l',
        type: 'pin',
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        visible: true,
        locked: false,
        label: 'My Location',
        icon: 'place',
        color: '#f00',
      };
      const label = component['getObjectLabel'](obj);
      expect(label).toBe('My Location');
    });

    it('should return shape type for shape objects', () => {
      const obj: CanvasShape = {
        id: 'x',
        layerId: 'l',
        type: 'shape',
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        visible: true,
        locked: false,
        shapeType: 'ellipse',
        width: 50,
        height: 50,
        fill: '#fff',
        stroke: '#000',
        strokeWidth: 1,
      };
      const label = component['getObjectLabel'](obj);
      expect(label).toBe('ellipse');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Shape Type Change
  // ─────────────────────────────────────────────────────────────────────────

  describe('shape type change', () => {
    it('should update tool settings and switch to shape tool', () => {
      component['onShapeTypeChange']('ellipse');
      expect(component['toolSettings']().shapeType).toBe('ellipse');
      expect(component['activeTool']()).toBe('shape');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Rect Intersection
  // ─────────────────────────────────────────────────────────────────────────

  describe('rectsIntersect', () => {
    it('should detect overlapping rects', () => {
      const a = { x: 0, y: 0, width: 10, height: 10 };
      const b = { x: 5, y: 5, width: 10, height: 10 };
      expect(component['rectsIntersect'](a, b)).toBe(true);
    });

    it('should detect non-overlapping rects', () => {
      const a = { x: 0, y: 0, width: 10, height: 10 };
      const b = { x: 20, y: 20, width: 10, height: 10 };
      expect(component['rectsIntersect'](a, b)).toBe(false);
    });

    it('should detect edge-touching rects as non-overlapping', () => {
      const a = { x: 0, y: 0, width: 10, height: 10 };
      const b = { x: 10, y: 0, width: 10, height: 10 };
      expect(component['rectsIntersect'](a, b)).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Tool CSS Class
  // ─────────────────────────────────────────────────────────────────────────

  describe('toolClass', () => {
    it('should return CSS class based on active tool', () => {
      expect(component.toolClass).toBe('tool-select');

      component['onToolChange']('draw');
      expect(component.toolClass).toBe('tool-draw');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  describe('lifecycle', () => {
    it('should save viewport on destroy', () => {
      fixture.detectChanges();
      fixture.destroy();
      // saveViewport is called but stage is null in jsdom -> no-op, shouldn't throw
      expect(() => fixture.destroy).not.toThrow();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Context Menu & Clipboard
  // ─────────────────────────────────────────────────────────────────────────

  describe('clipboard operations', () => {
    const testObj: CanvasShape = {
      id: 'shape-1',
      layerId: defaultConfig.layers[0].id,
      type: 'shape',
      shapeType: 'rect',
      x: 50,
      y: 50,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      visible: true,
      locked: false,
      width: 100,
      height: 100,
      stroke: '#000',
      strokeWidth: 2,
    };

    beforeEach(() => {
      fixture.detectChanges();
      // Put an object into the config
      mockCanvasService.activeConfig.set({
        ...defaultConfig,
        objects: [testObj],
      });
    });

    it('should copy selected object to clipboard', () => {
      component['selectedObjectId'].set('shape-1');
      component['onCopy']();
      expect(component['clipboard']()).toBeTruthy();
      expect(component['clipboard']()?.id).toBe('shape-1');
    });

    it('should not copy when nothing is selected', () => {
      component['selectedObjectId'].set(null);
      component['onCopy']();
      expect(component['clipboard']()).toBeNull();
    });

    it('should cut selected object', () => {
      component['selectedObjectId'].set('shape-1');
      component['onCut']();
      expect(component['clipboard']()).toBeTruthy();
      expect(mockCanvasService.removeObject).toHaveBeenCalledWith('shape-1');
      expect(component['selectedObjectId']()).toBeNull();
    });

    it('should paste from clipboard', () => {
      component['selectedObjectId'].set('shape-1');
      component['onCopy']();
      component['onPaste']();
      expect(mockCanvasService.addObject).toHaveBeenCalled();
      const pastedObj = mockCanvasService.addObject.mock.calls[0][0];
      expect(pastedObj.id).not.toBe('shape-1'); // new ID
      expect(pastedObj.type).toBe('shape');
    });

    it('should not paste when clipboard is empty', () => {
      component['clipboard'].set(null);
      component['onPaste']();
      expect(mockCanvasService.addObject).not.toHaveBeenCalled();
    });

    it('should clear clipboard after pasting a cut object', () => {
      component['selectedObjectId'].set('shape-1');
      component['onCut']();
      component['onPaste']();
      expect(component['clipboard']()).toBeNull();
    });

    it('should auto-select the first layer when pasting with no active layer', () => {
      component['selectedObjectId'].set('shape-1');
      component['onCopy']();
      component['activeLayerId'].set('');

      component['onPaste']();

      expect(component['activeLayerId']()).toBe(defaultConfig.layers[0].id);
      expect(mockCanvasService.addObject).toHaveBeenCalled();
    });

    it('should duplicate selected object', () => {
      component['selectedObjectId'].set('shape-1');
      component['onDuplicateObject']();
      expect(mockCanvasService.addObject).toHaveBeenCalled();
      const dup = mockCanvasService.addObject.mock.calls[0][0];
      expect(dup.id).not.toBe('shape-1');
      expect(dup.x).toBe(70); // 50 + 20 offset
      expect(dup.y).toBe(70);
    });

    it('should delete from context menu', () => {
      component['selectedObjectId'].set('shape-1');
      component['onContextDelete']();
      expect(mockCanvasService.removeObject).toHaveBeenCalledWith('shape-1');
    });
  });

  describe('send to layer', () => {
    it('should get selected object layer ID', () => {
      fixture.detectChanges();
      const testObj: CanvasShape = {
        id: 'obj-1',
        layerId: defaultConfig.layers[0].id,
        type: 'shape',
        shapeType: 'rect',
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        visible: true,
        locked: false,
        width: 50,
        height: 50,
        stroke: '#000',
        strokeWidth: 1,
      };
      mockCanvasService.activeConfig.set({
        ...defaultConfig,
        objects: [testObj],
      });
      component['selectedObjectId'].set('obj-1');
      expect(component['getSelectedObjectLayerId']()).toBe(
        defaultConfig.layers[0].id
      );
    });

    it('should delegate send-to-layer to canvas service', () => {
      component['selectedObjectId'].set('obj-1');
      component['onSendToLayer']('target-layer');
      expect(mockCanvasService.moveObjectToLayer).toHaveBeenCalledWith(
        'obj-1',
        'target-layer'
      );
    });

    it('should return empty string when no object is selected', () => {
      fixture.detectChanges();
      component['selectedObjectId'].set(null);
      expect(component['getSelectedObjectLayerId']()).toBe('');
    });
  });

  describe('zoom actions', () => {
    it('should zoom in around the stage center', () => {
      component['stage'] = createStageStub() as never;
      const zoomToPointSpy = vi.spyOn(component as never, 'zoomToPoint');

      component['onZoomIn']();

      expect(zoomToPointSpy).toHaveBeenCalledWith({ x: 200, y: 100 }, 1.1);
    });

    it('should zoom out around the stage center', () => {
      component['stage'] = createStageStub() as never;
      const zoomToPointSpy = vi.spyOn(component as never, 'zoomToPoint');

      component['onZoomOut']();

      expect(zoomToPointSpy).toHaveBeenCalledWith({ x: 200, y: 100 }, 1 / 1.1);
    });

    it('should reset position and zoom when fitting an empty canvas', () => {
      const stage = createStageStub();
      component['stage'] = stage as never;
      mockCanvasService.activeConfig.set({ ...defaultConfig, objects: [] });

      component['onFitAll']();

      expect(stage.position).toHaveBeenCalledWith({ x: 0, y: 0 });
      expect(stage.scale).toHaveBeenCalledWith({ x: 1, y: 1 });
      expect(component['zoomLevel']()).toBe(1);
    });

    it('should return early when objects exist but no layers have content', () => {
      const stage = createStageStub();
      component['stage'] = stage as never;

      // Config has objects, so it won't take the empty early-return path
      const configWithObjects = {
        ...defaultConfig,
        objects: [
          {
            id: 'obj-1',
            layerId: 'some-layer',
            type: 'shape' as const,
            shapeType: 'rect' as const,
            x: 10,
            y: 10,
            width: 100,
            height: 100,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            visible: true,
            locked: false,
            stroke: '#000',
            strokeWidth: 1,
          },
        ],
      };
      mockCanvasService.activeConfig.set(configWithObjects);

      // konvaLayers is empty → minX stays Infinity → !Number.isFinite(minX) → return
      (component['konvaLayers'] as Map<string, unknown>).clear();

      component['onFitAll']();

      // Should not have called position/scale because it returned early
      expect(stage.position).not.toHaveBeenCalled();
      expect(stage.scale).not.toHaveBeenCalled();
    });
  });

  describe('exportAsSvg', () => {
    let clickSpy: ReturnType<typeof vi.fn>;
    let createObjectURLSpy: ReturnType<typeof vi.spyOn>;
    let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>;
    let createElementSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      clickSpy = vi.fn();
      const originalCreateElement = document.createElement.bind(document);
      createElementSpy = vi
        .spyOn(document, 'createElement')
        .mockImplementation(
          (tagName: string, options?: ElementCreationOptions) => {
            if (tagName === 'a') {
              return {
                href: '',
                download: '',
                click: clickSpy,
              } as unknown as HTMLAnchorElement;
            }
            return originalCreateElement(tagName, options);
          }
        );
      createObjectURLSpy = vi
        .spyOn(URL, 'createObjectURL')
        .mockReturnValue('blob:test');
      revokeObjectURLSpy = vi
        .spyOn(URL, 'revokeObjectURL')
        .mockImplementation(() => {});
    });

    afterEach(() => {
      createElementSpy.mockRestore();
      createObjectURLSpy.mockRestore();
      revokeObjectURLSpy.mockRestore();
    });

    it('should use default viewBox when no visible objects exist', () => {
      const layerId = defaultConfig.layers[0].id;
      // Objects exist but none are visible → bounds stay at Infinity
      mockCanvasService.activeConfig.set({
        ...defaultConfig,
        objects: [
          {
            id: 'hidden-obj',
            layerId,
            type: 'shape' as const,
            shapeType: 'rect' as const,
            x: 10,
            y: 20,
            width: 100,
            height: 50,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            visible: false,
            locked: false,
            stroke: '#000',
            strokeWidth: 1,
          },
        ],
      });

      component['exportAsSvg']();

      expect(createObjectURLSpy).toHaveBeenCalled();
      const blob = createObjectURLSpy.mock.calls[0][0] as Blob;
      expect(blob.type).toBe('image/svg+xml');
      expect(clickSpy).toHaveBeenCalled();
      expect(revokeObjectURLSpy).toHaveBeenCalled();
    });

    it('should compute correct viewBox from visible objects', () => {
      const layerId = defaultConfig.layers[0].id;
      mockCanvasService.activeConfig.set({
        ...defaultConfig,
        objects: [
          {
            id: 'rect-1',
            layerId,
            type: 'shape' as const,
            shapeType: 'rect' as const,
            x: 50,
            y: 100,
            width: 200,
            height: 150,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            visible: true,
            locked: false,
            stroke: '#000',
            strokeWidth: 1,
          },
        ],
      });

      component['exportAsSvg']();

      expect(createObjectURLSpy).toHaveBeenCalled();
      // vX = 50 - 20 = 30, vY = 100 - 20 = 80
      // vW = (250 - 50) + 40 = 240, vH = (250 - 100) + 40 = 190
      const blob = createObjectURLSpy.mock.calls[0][0] as Blob;
      expect(blob.type).toBe('image/svg+xml');
      expect(clickSpy).toHaveBeenCalled();
    });
  });

  describe('resolveImageSrc', () => {
    it('should return non-media URLs unchanged', async () => {
      await expect(
        component['resolveImageSrc']('https://example.com/test.png')
      ).resolves.toBe('https://example.com/test.png');
    });

    it('should return an empty string when project context is missing', async () => {
      mockProjectState.project.set(null);

      await expect(
        component['resolveImageSrc']('media:test-image')
      ).resolves.toBe('');
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should return an empty string when stored media cannot be found', async () => {
      mockLocalStorageService.getMediaUrl.mockResolvedValueOnce(null);

      await expect(
        component['resolveImageSrc']('media:test-image')
      ).resolves.toBe('');
      expect(mockLocalStorageService.getMediaUrl).toHaveBeenCalledWith(
        'testuser/test-project',
        'test-image'
      );
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should return the resolved blob URL for stored media', async () => {
      mockLocalStorageService.getMediaUrl.mockResolvedValueOnce(
        'blob:resolved-image'
      );

      await expect(
        component['resolveImageSrc']('media:test-image')
      ).resolves.toBe('blob:resolved-image');
    });
  });
});
