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
  type CanvasTool,
  createDefaultCanvasConfig,
  createDefaultToolSettings,
} from '@models/canvas.model';
import { CanvasService } from '@services/canvas/canvas.service';
import { CanvasClipboardService } from '@services/canvas/canvas-clipboard.service';
import { CanvasColorService } from '@services/canvas/canvas-color.service';
import { CanvasContextMenuService } from '@services/canvas/canvas-context-menu.service';
import { CanvasDrawingService } from '@services/canvas/canvas-drawing.service';
import { CanvasExportService } from '@services/canvas/canvas-export.service';
import { CanvasKeyboardService } from '@services/canvas/canvas-keyboard.service';
import { CanvasLayerService } from '@services/canvas/canvas-layer.service';
import { CanvasLayerActionsService } from '@services/canvas/canvas-layer-actions.service';
import { CanvasPlacementService } from '@services/canvas/canvas-placement.service';
import { CanvasRendererService } from '@services/canvas/canvas-renderer.service';
import { CanvasSelectionService } from '@services/canvas/canvas-selection.service';
import { CanvasStageEventsService } from '@services/canvas/canvas-stage-events.service';
import { CanvasZoomService } from '@services/canvas/canvas-zoom.service';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { LoggerService } from '@services/core/logger.service';
import { LocalStorageService } from '@services/local/local-storage.service';
import { PresenceService } from '@services/presence/presence.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { RelationshipService } from '@services/relationship/relationship.service';
import type Konva from 'konva';
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
import { translocoTestProvider } from '../../../../../testing/transloco-test-provider';
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
  let mockCanvasRenderer: any;
  const mockPresenceService = {
    setActiveLocation: vi.fn(),
    setSelection: vi.fn(),
    usersAtLocation: () => signal([]).asReadonly(),
    users: signal([]).asReadonly(),
  };

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
      draggable: vi.fn(),
      batchDraw: vi.fn(),
      container: vi.fn(() => document.createElement('div')),
      ...overrides,
    };
  }

  beforeAll(() => {
    if (!globalThis.ResizeObserver) {
      globalThis.ResizeObserver = MockResizeObserver;
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
    reorderObject: vi.fn(),
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
    loadToolSettings: vi.fn(() => createDefaultToolSettings()),
    saveToolSettings: vi.fn(),
    removeObjects: vi.fn(),
    updateObjects: vi.fn(),
    flush: vi.fn(),
    undo: vi.fn(() => false),
    redo: vi.fn(() => false),
    canUndo: signal(false),
    canRedo: signal(false),
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
    },
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
    openInsertImageDialog: vi.fn(
      (): Promise<{ mediaId: string; imageBlob: Blob } | undefined> =>
        Promise.resolve(undefined)
    ),
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

    // Renderer stand-in. Konva cannot build a real stage under jsdom, so the
    // component spec stubs the scene-graph surface; the real reconciliation is
    // covered against a live stage in canvas-renderer.service.spec.ts.
    const r: any = {};
    r._stage = null;
    r._konvaLayers = new Map<string, any>();
    r._konvaNodes = new Map<string, any>();
    r._transformer = null;
    r._selectionLayer = null;
    r._previewLayer = null;

    Object.defineProperties(r, {
      stage: {
        get: () => r._stage,
        set: (v: any) => {
          r._stage = v;
        },
        configurable: true,
      },
      konvaLayers: { get: () => r._konvaLayers, configurable: true },
      konvaNodes: { get: () => r._konvaNodes, configurable: true },
      transformer: {
        get: () => r._transformer,
        set: (v: any) => {
          r._transformer = v;
        },
        configurable: true,
      },
      selectionLayer: {
        get: () => r._selectionLayer,
        set: (v: any) => {
          r._selectionLayer = v;
        },
        configurable: true,
      },
      previewLayer: {
        get: () => r._previewLayer,
        set: (v: any) => {
          r._previewLayer = v;
        },
        configurable: true,
      },
    });

    r.syncKonvaFromConfig = vi.fn();
    r.rebuildAllKonvaNodes = vi.fn();
    r.buildKonvaLayers = vi.fn();
    r.buildKonvaObjects = vi.fn();
    r.setContentInteractive = vi.fn();
    r.resolveImageSrc = CanvasRendererService.prototype.resolveImageSrc.bind(r);
    r.initStage = vi.fn(() => ({ zoomLevel: 1 }));
    r.destroyStage = vi.fn();
    r.getCanvasPointerPosition = vi.fn(() => null);
    r.getViewportCenter = vi.fn(() => ({ x: 0, y: 0 }));

    r.projectState = mockProjectState;
    r.logger = mockLogger;
    r.localStorageService = mockLocalStorageService;
    r.canvasService = mockCanvasService;

    mockCanvasRenderer = r;

    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), CanvasTabComponent],
      providers: [
        { provide: ProjectStateService, useValue: mockProjectState },
        { provide: ActivatedRoute, useValue: mockRoute },
        { provide: MatDialog, useValue: mockDialog },
        { provide: DialogGatewayService, useValue: mockDialogGateway },
        { provide: LocalStorageService, useValue: mockLocalStorageService },
        { provide: LoggerService, useValue: mockLogger },
        { provide: RelationshipService, useValue: mockRelationshipService },
        {
          provide: PresenceService,
          useValue: mockPresenceService,
        },
      ],
    })
      // CanvasService is a component-level provider; override it
      .overrideComponent(CanvasTabComponent, {
        set: {
          providers: [
            { provide: CanvasService, useValue: mockCanvasService },
            { provide: CanvasRendererService, useValue: mockCanvasRenderer },
            CanvasLayerService,
            CanvasLayerActionsService,
            CanvasZoomService,
            CanvasColorService,
            CanvasClipboardService,
            CanvasContextMenuService,
            CanvasKeyboardService,
            CanvasDrawingService,
            CanvasExportService,
            CanvasPlacementService,
            CanvasSelectionService,
            CanvasStageEventsService,
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(CanvasTabComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.useRealTimers();
    mockPresenceService.setActiveLocation.mockReset();
    mockPresenceService.setSelection.mockReset();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load canvas config on init', () => {
    fixture.detectChanges();
    expect(mockCanvasService.loadConfig).toHaveBeenCalledWith('test-canvas');
    expect(mockPresenceService.setActiveLocation).toHaveBeenCalledWith({
      kind: 'canvas',
      elementId: 'test-canvas',
    });

    fixture.destroy();
    expect(mockPresenceService.setActiveLocation).toHaveBeenCalledWith(null);
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

    it('should delegate move layer up to layer actions service', () => {
      const moveUpSpy = vi.spyOn(component['canvasLayerActions'], 'moveUp');
      component['onMoveLayerUp']('layer-1');
      expect(moveUpSpy).toHaveBeenCalledWith('layer-1', expect.any(Object));
    });

    it('should delegate move layer down to layer actions service', () => {
      const moveDownSpy = vi.spyOn(component['canvasLayerActions'], 'moveDown');
      component['onMoveLayerDown']('layer-1');
      expect(moveDownSpy).toHaveBeenCalledWith('layer-1', expect.any(Object));
    });

    it('should parse string value and delegate opacity change to service', () => {
      const setOpacitySpy = vi.spyOn(
        component['canvasLayerActions'],
        'setOpacity'
      );
      component['onLayerOpacityChange']('layer-1', '0.75');
      expect(setOpacitySpy).toHaveBeenCalledWith('layer-1', 0.75);
    });

    it('should pass numeric value directly to opacity service', () => {
      const setOpacitySpy = vi.spyOn(
        component['canvasLayerActions'],
        'setOpacity'
      );
      component['onLayerOpacityChange']('layer-1', 0.5);
      expect(setOpacitySpy).toHaveBeenCalledWith('layer-1', 0.5);
    });

    it('should not call setOpacity when value is not a finite number', () => {
      const setOpacitySpy = vi.spyOn(
        component['canvasLayerActions'],
        'setOpacity'
      );
      component['onLayerOpacityChange']('layer-1', 'not-a-number');
      expect(setOpacitySpy).not.toHaveBeenCalled();
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

    it('should delegate reorder object to canvas service', () => {
      component['selectedObjectId'].set('obj-1');
      component['onReorderObject']('front');
      expect(mockCanvasService.reorderObject).toHaveBeenCalledWith(
        'obj-1',
        'front'
      );
    });

    it('should not reorder when no object is selected', () => {
      component['selectedObjectId'].set(null);
      component['onReorderObject']('back');
      expect(mockCanvasService.reorderObject).not.toHaveBeenCalled();
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
        })
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
        })
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
        })
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
        })
      ).toBe('crop_square');
      expect(
        component['getObjectIcon']({
          ...base,
          type: 'pin',
          label: 'Pin',
          icon: 'place',
          color: '#f00',
        })
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

    it('should save viewport on destroy when stage is set', () => {
      const stage = createStageStub({ on: vi.fn() }) as never;

      fixture.detectChanges();
      // Set stage AFTER detectChanges to avoid the syncKonvaFromConfig effect
      // running with a non-null stage (which would trigger real Konva creation).
      mockCanvasRenderer.stage = stage;
      vi.runAllTimers();

      fixture.destroy();

      expect(mockCanvasService.saveViewport).toHaveBeenCalledWith(
        'test-canvas',
        expect.objectContaining({ zoom: 1 })
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Stage Initialization
  // ─────────────────────────────────────────────────────────────────────────

  describe('stage initialization', () => {
    it('should init stage and attach stage/keyboard events when container is available', () => {
      const stage = createStageStub({ on: vi.fn() }) as never;

      fixture.detectChanges();
      // Set stage AFTER detectChanges to avoid the syncKonvaFromConfig effect
      // running with a non-null stage (which would trigger real Konva creation).
      mockCanvasRenderer.stage = stage;
      vi.runAllTimers();

      expect(mockCanvasRenderer.initStage).toHaveBeenCalled();
      expect(component['zoomLevel']()).toBe(1);
      expect((stage as { on: ReturnType<typeof vi.fn> }).on).toHaveBeenCalled();
    });

    it('should not attach stage events when config is null', () => {
      const stage = createStageStub({ on: vi.fn() }) as never;
      mockCanvasRenderer.stage = stage;
      mockCanvasService.activeConfig.set(null);

      fixture.detectChanges();
      vi.runAllTimers();

      // initStage() was called but returned early at the !config guard
      expect(mockCanvasRenderer.initStage).not.toHaveBeenCalled();
    });

    it('should invoke keyboard shortcut callbacks registered by setupKeyboardShortcuts', () => {
      // Use a stub with all methods that onToolChange needs (draggable)
      const stage = createStageStub({
        on: vi.fn(),
        draggable: vi.fn(),
      }) as never;

      fixture.detectChanges();
      mockCanvasRenderer.stage = stage;
      vi.runAllTimers();

      // After runAllTimers, setupKeyboardShortcuts has registered a document keydown listener.
      // Dispatch key events to exercise the registered callback lambdas.

      // Escape → onEscape body (selectedObjectId.set / clearSelection / activeTool.set)
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      );
      expect(component['activeTool']()).toBe('select');

      // Delete → onDelete lambda
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })
      );

      // Tool key 'v' (no modifier) → onToolChange lambda
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'v', bubbles: true })
      );

      // Ctrl+= → onZoomIn lambda
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: '=', ctrlKey: true, bubbles: true })
      );

      // Ctrl+- → onZoomOut lambda
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: '-', ctrlKey: true, bubbles: true })
      );

      // Ctrl+0 → onFitAll lambda
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: '0', ctrlKey: true, bubbles: true })
      );

      // Ctrl+C → onCopy lambda
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true })
      );

      // Ctrl+X → onCut lambda
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'x', ctrlKey: true, bubbles: true })
      );

      // Ctrl+V → onPaste body (clearCanvasPos + paste)
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true })
      );

      // Ctrl+D → onDuplicate lambda
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true })
      );

      // No exceptions thrown = all callbacks handled gracefully
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
      mockCanvasRenderer.stage = createStageStub() as never;
      const zoomService = component['canvasZoom'];
      const zoomToPointSpy = vi.spyOn(zoomService, 'zoomToPoint');

      component['onZoomIn']();

      expect(zoomToPointSpy).toHaveBeenCalledWith({ x: 200, y: 100 }, 1.1);
    });

    it('should zoom out around the stage center', () => {
      mockCanvasRenderer.stage = createStageStub() as never;
      const zoomService = component['canvasZoom'];
      const zoomToPointSpy = vi.spyOn(zoomService, 'zoomToPoint');

      component['onZoomOut']();

      expect(zoomToPointSpy).toHaveBeenCalledWith({ x: 200, y: 100 }, 1 / 1.1);
    });

    it('should reset position and zoom when fitting an empty canvas', () => {
      const stage = createStageStub();
      mockCanvasRenderer.stage = stage as never;
      mockCanvasService.activeConfig.set({ ...defaultConfig, objects: [] });

      component['onFitAll']();

      expect(stage.position).toHaveBeenCalledWith({ x: 0, y: 0 });
      expect(stage.scale).toHaveBeenCalledWith({ x: 1, y: 1 });
      expect(component['zoomLevel']()).toBe(1);
    });

    it('should return early when objects exist but no layers have content', () => {
      const stage = createStageStub();
      mockCanvasRenderer.stage = stage as never;

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
      (mockCanvasRenderer.konvaLayers as Map<string, unknown>).clear();

      component['onFitAll']();

      // Should not have called position/scale because it returned early
      expect(stage.position).not.toHaveBeenCalled();
      expect(stage.scale).not.toHaveBeenCalled();
    });

    it('should reset zoom to 100% and update zoom level', () => {
      mockCanvasRenderer.stage = createStageStub() as never;
      component['onZoomReset']();
      expect(component['zoomLevel']()).toBe(1);
    });

    it('should not update zoom level when reset returns null (no stage)', () => {
      mockCanvasRenderer.stage = null;
      const initialZoom = component['zoomLevel']();
      component['onZoomReset']();
      expect(component['zoomLevel']()).toBe(initialZoom);
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

    it('should convert text objects with correct text-anchor mapping', async () => {
      const layerId = defaultConfig.layers[0].id;
      mockCanvasService.activeConfig.set({
        ...defaultConfig,
        objects: [
          {
            id: 'txt-center',
            layerId,
            type: 'text' as const,
            x: 10,
            y: 20,
            width: 200,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            visible: true,
            locked: false,
            text: 'Centered',
            fontSize: 16,
            fontFamily: 'Arial',
            fontStyle: 'normal' as const,
            fill: '#000',
            align: 'center' as const,
          },
          {
            id: 'txt-left',
            layerId,
            type: 'text' as const,
            x: 10,
            y: 60,
            width: 200,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            visible: true,
            locked: false,
            text: 'Left',
            fontSize: 16,
            fontFamily: 'Arial',
            fontStyle: 'bold italic' as const,
            fill: '#333',
            align: 'left' as const,
          },
        ],
      });

      component['exportAsSvg']();

      expect(createObjectURLSpy).toHaveBeenCalled();
      const blob = createObjectURLSpy.mock.calls[0][0] as Blob;
      const svgText = await blob.text();
      // 'center' maps to 'middle'
      expect(svgText).toContain('text-anchor="middle"');
      // 'left' falls back to 'start' via ?? operator
      expect(svgText).toContain('text-anchor="start"');
    });
  });

  describe('resolveImageSrc', () => {
    it('should return non-media URLs unchanged', async () => {
      await expect(
        mockCanvasRenderer.resolveImageSrc('https://example.com/test.png')
      ).resolves.toBe('https://example.com/test.png');
    });

    it('should return an empty string when project context is missing', async () => {
      mockProjectState.project.set(null);

      await expect(
        mockCanvasRenderer.resolveImageSrc('media:test-image')
      ).resolves.toBe('');
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should return an empty string when stored media cannot be found', async () => {
      mockLocalStorageService.getMediaUrl.mockResolvedValueOnce(null);

      await expect(
        mockCanvasRenderer.resolveImageSrc('media:test-image')
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
        mockCanvasRenderer.resolveImageSrc('media:test-image')
      ).resolves.toBe('blob:resolved-image');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ensureActiveLayer
  // ─────────────────────────────────────────────────────────────────────────

  describe('ensureActiveLayer', () => {
    it('should return the current activeLayerId when it exists in the config', () => {
      fixture.detectChanges();
      const layerId = defaultConfig.layers[0].id;
      component['activeLayerId'].set(layerId);
      expect(component['ensureActiveLayer']()).toBe(layerId);
    });

    it('should fall back to the first layer when activeLayerId is stale', () => {
      fixture.detectChanges();
      component['activeLayerId'].set('nonexistent-layer');
      const result = component['ensureActiveLayer']();
      expect(result).toBe(defaultConfig.layers[0].id);
      expect(component['activeLayerId']()).toBe(defaultConfig.layers[0].id);
    });

    it('should fall back to the first layer when activeLayerId is empty', () => {
      fixture.detectChanges();
      component['activeLayerId'].set('');
      const result = component['ensureActiveLayer']();
      expect(result).toBe(defaultConfig.layers[0].id);
    });

    it('should return empty string when config has no layers', () => {
      mockCanvasService.activeConfig.set({
        ...defaultConfig,
        layers: [],
      });
      fixture.detectChanges();
      component['activeLayerId'].set('');
      expect(component['ensureActiveLayer']()).toBe('');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Pin-Aware Clipboard Operations
  // ─────────────────────────────────────────────────────────────────────────

  describe('pin-aware clipboard operations', () => {
    const pinObj: CanvasPin = {
      id: 'pin-linked',
      layerId: defaultConfig.layers[0].id,
      type: 'pin',
      x: 30,
      y: 40,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      visible: true,
      locked: false,
      label: 'Test Pin',
      icon: 'place',
      color: '#E53935',
      linkedElementId: 'linked-elem',
      relationshipId: 'rel-1',
    };

    beforeEach(() => {
      mockCanvasService.activeConfig.set({
        ...defaultConfig,
        objects: [pinObj],
      });
    });

    it('should strip relationshipId when copying a linked pin', () => {
      component['selectedObjectId'].set('pin-linked');
      component['onCopy']();
      const clipContent = component['clipboard']();
      expect(clipContent).toBeTruthy();
      expect(clipContent!.type).toBe('pin');
      expect((clipContent as CanvasPin).relationshipId).toBeUndefined();
    });

    it('should call removePinRelationship when cutting a linked pin', () => {
      component['selectedObjectId'].set('pin-linked');
      component['onCut']();
      expect(mockRelationshipService.removeRelationship).toHaveBeenCalledWith(
        'rel-1'
      );
      const clipContent = component['clipboard']();
      expect((clipContent as CanvasPin).relationshipId).toBeUndefined();
    });

    it('should create a fresh relationship when pasting a linked pin', () => {
      // Copy the pin first
      component['selectedObjectId'].set('pin-linked');
      component['onCopy']();
      vi.clearAllMocks();

      // Paste it
      component['onPaste']();
      expect(mockRelationshipService.addRelationship).toHaveBeenCalled();
      const pastedObj = mockCanvasService.addObject.mock.calls[0][0];
      expect(pastedObj.type).toBe('pin');
      expect(pastedObj.relationshipId).toBe('relationship-1');
    });

    it('should call removePinRelationship when deleting a linked pin via context menu', () => {
      component['selectedObjectId'].set('pin-linked');
      component['onContextDelete']();
      expect(mockRelationshipService.removeRelationship).toHaveBeenCalledWith(
        'rel-1'
      );
      expect(mockCanvasService.removeObject).toHaveBeenCalledWith('pin-linked');
    });

    it('should call removePinRelationship when deleting a linked pin via sidebar', () => {
      const event = new MouseEvent('click');
      component['onDeleteObject']('pin-linked', event);
      expect(mockRelationshipService.removeRelationship).toHaveBeenCalledWith(
        'rel-1'
      );
      expect(mockCanvasService.removeObject).toHaveBeenCalledWith('pin-linked');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // onEditObjectColors
  // ─────────────────────────────────────────────────────────────────────────

  describe('onEditObjectColors', () => {
    const layerId = defaultConfig.layers[0].id;

    function makeShape(overrides: Record<string, unknown>): CanvasShape {
      return {
        id: 'shape-1',
        layerId,
        type: 'shape',
        shapeType: 'rect',
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        visible: true,
        locked: false,
        fill: '#FF0000',
        stroke: '#000000',
        strokeWidth: 2,
        ...overrides,
      };
    }

    it('should do nothing when no object is selected', () => {
      component['selectedObjectId'].set(null);
      component['onEditObjectColors']();
      expect(mockDialog.open).not.toHaveBeenCalled();
    });

    it('should do nothing when config is null', () => {
      component['selectedObjectId'].set('obj-1');
      mockCanvasService.activeConfig.set(null);
      component['onEditObjectColors']();
      expect(mockDialog.open).not.toHaveBeenCalled();
    });

    it('should do nothing when object not found', () => {
      component['selectedObjectId'].set('nonexistent');
      mockCanvasService.activeConfig.set({ ...defaultConfig, objects: [] });
      component['onEditObjectColors']();
      expect(mockDialog.open).not.toHaveBeenCalled();
    });

    it('should open color dialog for text object with fill only', () => {
      const textObj: CanvasText = {
        id: 'text-1',
        layerId,
        type: 'text',
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        visible: true,
        locked: false,
        text: 'Hello',
        fontSize: 16,
        fontFamily: 'Arial',
        fontStyle: 'normal',
        fill: '#333333',
        width: 0,
        align: 'left',
      };
      mockCanvasService.activeConfig.set({
        ...defaultConfig,
        objects: [textObj],
      });
      component['selectedObjectId'].set('text-1');
      mockDialog.open.mockReturnValue({
        afterClosed: () => of(undefined),
      });

      component['onEditObjectColors']();

      expect(mockDialog.open).toHaveBeenCalled();
      const dialogData = mockDialog.open.mock.calls[0][1].data;
      expect(dialogData.showFill).toBe(true);
      expect(dialogData.showStroke).toBe(false);
      expect(dialogData.fill).toBe('#333333');
    });

    it('should open color dialog for shape object with fill and stroke', () => {
      const shapeObj = makeShape({});
      mockCanvasService.activeConfig.set({
        ...defaultConfig,
        objects: [shapeObj],
      });
      component['selectedObjectId'].set('shape-1');
      mockDialog.open.mockReturnValue({
        afterClosed: () => of(undefined),
      });

      component['onEditObjectColors']();

      const dialogData = mockDialog.open.mock.calls[0][1].data;
      expect(dialogData.showFill).toBe(true);
      expect(dialogData.showStroke).toBe(true);
      expect(dialogData.fill).toBe('#FF0000');
      expect(dialogData.stroke).toBe('#000000');
    });

    it('should open color dialog for path object with stroke only (open path)', () => {
      const pathObj: CanvasPath = {
        id: 'path-1',
        layerId,
        type: 'path',
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        visible: true,
        locked: false,
        points: [0, 0, 100, 100],
        stroke: '#0000FF',
        strokeWidth: 2,
        closed: false,
        tension: 0,
      };
      mockCanvasService.activeConfig.set({
        ...defaultConfig,
        objects: [pathObj],
      });
      component['selectedObjectId'].set('path-1');
      mockDialog.open.mockReturnValue({
        afterClosed: () => of(undefined),
      });

      component['onEditObjectColors']();

      const dialogData = mockDialog.open.mock.calls[0][1].data;
      expect(dialogData.showStroke).toBe(true);
      expect(dialogData.showFill).toBe(false);
    });

    it('should open color dialog for closed path with fill and stroke', () => {
      const closedPath: CanvasPath = {
        id: 'path-2',
        layerId,
        type: 'path',
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        visible: true,
        locked: false,
        points: [0, 0, 100, 100, 50, 50],
        stroke: '#0000FF',
        strokeWidth: 2,
        closed: true,
        fill: '#00FF00',
        tension: 0,
      };
      mockCanvasService.activeConfig.set({
        ...defaultConfig,
        objects: [closedPath],
      });
      component['selectedObjectId'].set('path-2');
      mockDialog.open.mockReturnValue({
        afterClosed: () => of(undefined),
      });

      component['onEditObjectColors']();

      const dialogData = mockDialog.open.mock.calls[0][1].data;
      expect(dialogData.showStroke).toBe(true);
      expect(dialogData.showFill).toBe(true);
      expect(dialogData.fill).toBe('#00FF00');
    });

    it('should open color dialog for pin with fill (color)', () => {
      const pin: CanvasPin = {
        id: 'pin-1',
        layerId,
        type: 'pin',
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        visible: true,
        locked: false,
        label: 'Pin',
        icon: 'place',
        color: '#E53935',
      };
      mockCanvasService.activeConfig.set({
        ...defaultConfig,
        objects: [pin],
      });
      component['selectedObjectId'].set('pin-1');
      mockDialog.open.mockReturnValue({
        afterClosed: () => of(undefined),
      });

      component['onEditObjectColors']();

      const dialogData = mockDialog.open.mock.calls[0][1].data;
      expect(dialogData.showFill).toBe(true);
      expect(dialogData.showStroke).toBe(false);
      expect(dialogData.fill).toBe('#E53935');
    });

    it('should return early for image objects (no editable colors)', () => {
      const imageObj: CanvasImage = {
        id: 'img-1',
        layerId,
        type: 'image',
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        visible: true,
        locked: false,
        src: 'test.png',
        width: 100,
        height: 100,
        name: 'test',
      };
      mockCanvasService.activeConfig.set({
        ...defaultConfig,
        objects: [imageObj],
      });
      component['selectedObjectId'].set('img-1');

      component['onEditObjectColors']();

      expect(mockDialog.open).not.toHaveBeenCalled();
    });

    it('should update shape object colors when dialog returns result', () => {
      const shapeObj = makeShape({});
      mockCanvasService.activeConfig.set({
        ...defaultConfig,
        objects: [shapeObj],
      });
      component['selectedObjectId'].set('shape-1');
      mockDialog.open.mockReturnValue({
        afterClosed: () => of({ fill: '#AABB00', stroke: '#112233' }),
      });

      component['onEditObjectColors']();

      expect(mockCanvasService.updateObject).toHaveBeenCalledWith(
        'shape-1',
        expect.objectContaining({ fill: '#AABB00', stroke: '#112233' })
      );
    });

    it('should update pin color via "color" key when dialog returns result', () => {
      const pin: CanvasPin = {
        id: 'pin-2',
        layerId,
        type: 'pin',
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        visible: true,
        locked: false,
        label: 'P',
        icon: 'place',
        color: '#E53935',
      };
      mockCanvasService.activeConfig.set({
        ...defaultConfig,
        objects: [pin],
      });
      component['selectedObjectId'].set('pin-2');
      mockDialog.open.mockReturnValue({
        afterClosed: () => of({ fill: '#00FF00' }),
      });

      component['onEditObjectColors']();

      expect(mockCanvasService.updateObject).toHaveBeenCalledWith(
        'pin-2',
        expect.objectContaining({ color: '#00FF00' })
      );
    });

    it('should not update when dialog is cancelled', () => {
      const shapeObj = makeShape({});
      mockCanvasService.activeConfig.set({
        ...defaultConfig,
        objects: [shapeObj],
      });
      component['selectedObjectId'].set('shape-1');
      mockDialog.open.mockReturnValue({
        afterClosed: () => of(undefined),
      });

      component['onEditObjectColors']();

      expect(mockCanvasService.updateObject).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // exportAsPng / exportAsHighResPng
  // ─────────────────────────────────────────────────────────────────────────

  describe('exportAsPng', () => {
    let clickSpy: ReturnType<typeof vi.fn>;
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
    });

    afterEach(() => {
      createElementSpy.mockRestore();
    });

    it('should do nothing when stage is null', () => {
      mockCanvasRenderer.stage = null;
      component['exportAsPng']();
      expect(clickSpy).not.toHaveBeenCalled();
    });

    it('should export PNG with pixelRatio 2', () => {
      mockCanvasRenderer.stage = {
        toDataURL: vi.fn(() => 'data:image/png;base64,abc'),
      };

      component['exportAsPng']();

      expect(component['stage']!.toDataURL).toHaveBeenCalledWith({
        pixelRatio: 2,
      });
      expect(clickSpy).toHaveBeenCalled();
    });

    it('should export high-res PNG with pixelRatio 3', () => {
      mockCanvasRenderer.stage = {
        toDataURL: vi.fn(() => 'data:image/png;base64,xyz'),
      };

      component['exportAsHighResPng']();

      expect(component['stage']!.toDataURL).toHaveBeenCalledWith({
        pixelRatio: 3,
      });
      expect(clickSpy).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // onAddImage early returns
  // ─────────────────────────────────────────────────────────────────────────

  describe('onAddImage', () => {
    it('should return early when project is null', async () => {
      mockProjectState.project.set(null);
      await component['onAddImage']();
      expect(mockDialogGateway.openInsertImageDialog).not.toHaveBeenCalled();
    });

    it('should return early when dialog returns undefined', async () => {
      mockDialogGateway.openInsertImageDialog.mockResolvedValue(undefined);
      await component['onAddImage']();
      expect(mockLocalStorageService.saveMedia).not.toHaveBeenCalled();
    });

    it('should return early when dialog returns no mediaId', async () => {
      mockDialogGateway.openInsertImageDialog.mockResolvedValue({
        mediaId: '',
        imageBlob: new Blob(),
      });
      await component['onAddImage']();
      expect(mockLocalStorageService.saveMedia).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // onDeleteLayer – post-delete layer selection
  // ─────────────────────────────────────────────────────────────────────────

  describe('onDeleteLayer post-delete selection', () => {
    it('should select first remaining layer after deletion', async () => {
      const config: CanvasConfig = {
        ...defaultConfig,
        layers: [
          {
            id: 'layer-a',
            name: 'A',
            order: 0,
            visible: true,
            locked: false,
            opacity: 1,
          },
          {
            id: 'layer-b',
            name: 'B',
            order: 1,
            visible: true,
            locked: false,
            opacity: 1,
          },
        ],
      };
      mockCanvasService.activeConfig.set(config);
      mockDialog.open.mockReturnValue({
        afterClosed: () => of(true),
      } as MatDialogRef<unknown>);

      // Delete layer-b; layer-a remains first and is not the deleted one
      await component['onDeleteLayer']('layer-b');

      expect(component['activeLayerId']()).toBe('layer-a');
    });

    it('should select second layer when first layer is the deleted one', async () => {
      const config: CanvasConfig = {
        ...defaultConfig,
        layers: [
          {
            id: 'layer-a',
            name: 'A',
            order: 0,
            visible: true,
            locked: false,
            opacity: 1,
          },
          {
            id: 'layer-b',
            name: 'B',
            order: 1,
            visible: true,
            locked: false,
            opacity: 1,
          },
        ],
      };
      mockCanvasService.activeConfig.set(config);
      mockDialog.open.mockReturnValue({
        afterClosed: () => of(true),
      } as MatDialogRef<unknown>);

      // Delete layer-a; it's still first in sortedLayers (not yet removed from signal),
      // so fallback to second remaining layer
      await component['onDeleteLayer']('layer-a');

      expect(component['activeLayerId']()).toBe('layer-b');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // handleStageClick – tool dispatch branches
  // ─────────────────────────────────────────────────────────────────────────

  describe('handleStageClick', () => {
    const fakeEvent = {} as Konva.KonvaEventObject<MouseEvent>;

    it('should deselect when tool is select', () => {
      component['activeTool'].set('select');
      component['selectedObjectId'].set('some-id');
      mockCanvasRenderer.transformer = {
        nodes: vi.fn(),
      } as any;
      mockCanvasRenderer.selectionLayer = { batchDraw: vi.fn() } as any;

      component['handleStageClick'](fakeEvent);

      expect(component['selectedObjectId']()).toBeNull();
      expect(mockCanvasRenderer.transformer.nodes).toHaveBeenCalledWith([]);
    });

    it('should deselect when tool is pan', () => {
      component['activeTool'].set('pan');
      component['selectedObjectId'].set('some-id');
      mockCanvasRenderer.transformer = { nodes: vi.fn() } as any;
      mockCanvasRenderer.selectionLayer = { batchDraw: vi.fn() } as any;

      component['handleStageClick'](fakeEvent);

      expect(component['selectedObjectId']()).toBeNull();
    });

    it('should deselect when tool is rectSelect', () => {
      component['activeTool'].set('rectSelect');
      component['selectedObjectId'].set('some-id');
      mockCanvasRenderer.transformer = { nodes: vi.fn() } as any;
      mockCanvasRenderer.selectionLayer = { batchDraw: vi.fn() } as any;

      component['handleStageClick'](fakeEvent);

      expect(component['selectedObjectId']()).toBeNull();
    });

    it.each<[string, CanvasTool]>([
      ['placePin', 'pin'],
      ['placeText', 'text'],
      ['placeDefaultShape', 'shape'],
    ])('should call %s when tool is %s', (method, tool) => {
      component['activeTool'].set(tool);
      const spy = vi
        .spyOn(component as any, method)
        .mockImplementation(() => {});
      component['handleStageClick'](fakeEvent);
      expect(spy).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // updatePinLinkIndicator
  // ─────────────────────────────────────────────────────────────────────────

  describe('updatePinLinkIndicator', () => {
    it('should not add duplicate badge when hasLink=true and badge already exists', () => {
      const group = {
        findOne: vi.fn((name: string) =>
          name === '.linkBadge' ? { existing: true } : null
        ),
        add: vi.fn(),
      } as unknown as Konva.Group;

      CanvasRendererService.updatePinLinkIndicator(group, true);

      expect(
        (group as unknown as { add: ReturnType<typeof vi.fn> }).add
      ).not.toHaveBeenCalled();
    });

    it('should destroy badge and icon when hasLink=false', () => {
      const badge = { destroy: vi.fn() };
      const icon = { destroy: vi.fn() };
      const group = {
        findOne: vi.fn((name: string) => {
          if (name === '.linkBadge') return badge;
          if (name === '.linkIcon') return icon;
          return null;
        }),
      } as unknown as Konva.Group;

      CanvasRendererService.updatePinLinkIndicator(group, false);

      expect(badge.destroy).toHaveBeenCalled();
      expect(icon.destroy).toHaveBeenCalled();
    });

    it('should handle hasLink=false when no existing badge/icon', () => {
      const group = {
        findOne: vi.fn(() => null),
      } as unknown as Konva.Group;

      // Should not throw
      CanvasRendererService.updatePinLinkIndicator(group, false);
      expect(
        (group as unknown as { findOne: ReturnType<typeof vi.fn> }).findOne
      ).toHaveBeenCalledTimes(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Drawing tools
  // ─────────────────────────────────────────────────────────────────────────

  describe('tool activation', () => {
    let stage: ReturnType<typeof createStageStub>;

    beforeEach(() => {
      fixture.detectChanges();
      stage = createStageStub();
      mockCanvasRenderer.stage = stage;
    });

    it('takes pointer events away from objects for creation tools', () => {
      component['onToolChange']('draw');

      expect(mockCanvasRenderer.setContentInteractive).toHaveBeenCalledWith(
        false
      );
      expect(stage.draggable).toHaveBeenCalledWith(false);
    });

    it.each(['eraser', 'line', 'shape', 'rectSelect', 'pin', 'text'] as const)(
      'captures stage input for the %s tool',
      tool => {
        component['onToolChange'](tool);
        expect(mockCanvasRenderer.setContentInteractive).toHaveBeenCalledWith(
          false
        );
      }
    );

    it('gives pointer events back for the select tool', () => {
      component['onToolChange']('draw');
      component['onToolChange']('select');

      expect(mockCanvasRenderer.setContentInteractive).toHaveBeenLastCalledWith(
        true
      );
      expect(stage.draggable).toHaveBeenLastCalledWith(true);
    });

    it('keeps objects selectable while panning', () => {
      component['onToolChange']('pan');
      expect(mockCanvasRenderer.setContentInteractive).toHaveBeenLastCalledWith(
        true
      );
    });

    it('drags the stage rather than objects while space-panning', () => {
      component['onToolChange']('select');
      component['setSpacePanning'](true);

      expect(stage.draggable).toHaveBeenLastCalledWith(true);
      expect(mockCanvasRenderer.setContentInteractive).toHaveBeenLastCalledWith(
        false
      );
    });

    it('abandons an in-progress stroke when the tool changes', () => {
      const drawing = component['canvasDrawing'];
      vi.spyOn(drawing, 'isDrawing').mockReturnValue(true);
      const cancel = vi.spyOn(drawing, 'cancel').mockImplementation(() => {});

      component['onToolChange']('select');
      expect(cancel).toHaveBeenCalled();
    });

    it('space pans without losing the active tool', () => {
      component['onToolChange']('draw');
      component['setSpacePanning'](true);

      expect(component['activeTool']()).toBe('draw');
      expect(stage.draggable).toHaveBeenLastCalledWith(true);
      expect(component.toolClass).toBe('tool-pan');

      component['setSpacePanning'](false);
      expect(component.toolClass).toBe('tool-draw');
    });

    it('ignores space while a stroke is being drawn', () => {
      vi.spyOn(component['canvasDrawing'], 'isDrawing').mockReturnValue(true);
      component['setSpacePanning'](true);
      expect(component.toolClass).not.toBe('tool-pan');
    });
  });

  describe('tool settings', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('persists changes for the next session', () => {
      component['updateToolSettings']({ stroke: '#FF0000' });

      expect(component['toolSettings']().stroke).toBe('#FF0000');
      expect(mockCanvasService.saveToolSettings).toHaveBeenCalledWith(
        expect.objectContaining({ stroke: '#FF0000' })
      );
    });

    it('clamps the stroke width to the supported range', () => {
      component['onStrokeWidthChange'](500);
      expect(component['toolSettings']().strokeWidth).toBe(96);

      component['onStrokeWidthChange'](0);
      expect(component['toolSettings']().strokeWidth).toBe(1);
    });

    it('ignores an unparseable width', () => {
      const before = component['toolSettings']().strokeWidth;
      component['onStrokeWidthChange']('abc');
      expect(component['toolSettings']().strokeWidth).toBe(before);
    });

    it('steps up and down through the width presets', () => {
      component['onStrokeWidthChange'](4);
      component['onAdjustStrokeWidth'](1);
      expect(component['toolSettings']().strokeWidth).toBe(8);

      component['onAdjustStrokeWidth'](-1);
      expect(component['toolSettings']().strokeWidth).toBe(4);
    });

    it('stops at the ends of the preset range', () => {
      component['onStrokeWidthChange'](1);
      component['onAdjustStrokeWidth'](-1);
      expect(component['toolSettings']().strokeWidth).toBe(1);
    });

    it('toggles fill on and off', () => {
      const before = component['toolSettings']().fillEnabled;
      component['onToggleFill']();
      expect(component['toolSettings']().fillEnabled).toBe(!before);
    });

    it('toggles pressure', () => {
      const before = component['toolSettings']().pressure;
      component['onTogglePressure']();
      expect(component['toolSettings']().pressure).toBe(!before);
    });

    it('clamps smoothing and opacity', () => {
      component['onSmoothingChange']('2');
      expect(component['toolSettings']().tension).toBe(1);

      component['onOpacityChange']('0');
      expect(component['toolSettings']().opacity).toBe(0.05);
    });

    it('accepts an eraser size', () => {
      component['onEraserSizeChange']('40');
      expect(component['toolSettings']().eraserSize).toBe(40);
    });

    it('recolours the selection while picking a stroke colour', () => {
      const applyColor = vi
        .spyOn(component['canvasColor'], 'applyColor')
        .mockImplementation(() => {});
      component['selectedObjectId'].set('obj-1');

      component['onStrokeColorChange']('#00FF00');

      expect(applyColor).toHaveBeenCalledWith('obj-1', { stroke: '#00FF00' });
      expect(component['toolSettings']().stroke).toBe('#00FF00');
    });

    it('only updates the tool when nothing is selected', () => {
      const applyColor = vi
        .spyOn(component['canvasColor'], 'applyColor')
        .mockImplementation(() => {});
      component['selectedObjectId'].set(null);

      component['onFillColorChange']('#0000FF');

      expect(applyColor).not.toHaveBeenCalled();
      expect(component['toolSettings']().fill).toBe('#0000FF');
      expect(component['toolSettings']().fillEnabled).toBe(true);
    });
  });

  describe('undo and redo', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('delegates undo to the canvas service', () => {
      component['onUndo']();
      expect(mockCanvasService.undo).toHaveBeenCalled();
    });

    it('delegates redo to the canvas service', () => {
      component['onRedo']();
      expect(mockCanvasService.redo).toHaveBeenCalled();
    });

    it('clears the selection when the undone step removed it', () => {
      mockCanvasService.undo.mockReturnValue(true);
      component['selectedObjectId'].set('gone');

      component['onUndo']();
      expect(component['selectedObjectId']()).toBeNull();
    });

    it('keeps a selection that survived the undo', () => {
      mockCanvasService.undo.mockReturnValue(true);
      const config = mockCanvasService.activeConfig();
      mockCanvasService.activeConfig.set({
        ...config!,
        objects: [
          {
            id: 'kept',
            layerId: config!.layers[0].id,
            type: 'path',
            x: 0,
            y: 0,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            visible: true,
            locked: false,
            points: [0, 0, 10, 10],
            stroke: '#000',
            strokeWidth: 2,
            closed: false,
            tension: 0,
          },
        ],
      });
      component['selectedObjectId'].set('kept');

      component['onUndo']();
      expect(component['selectedObjectId']()).toBe('kept');
    });
  });

  describe('brush cursor', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('sizes the ring to the stroke width and zoom', () => {
      component['onToolChange']('draw');
      component['updateToolSettings']({ strokeWidth: 10 });
      component['zoomLevel'].set(2);

      component['moveBrushCursor']({ x: 30, y: 40 });

      const ring = fixture.nativeElement.querySelector(
        '[data-testid="brush-cursor"]'
      ) as HTMLElement;
      expect(ring.style.width).toBe('20px');
      expect(ring.style.opacity).toBe('1');
      expect(ring.style.transform).toContain('translate(30px, 40px)');
    });

    it('uses the eraser diameter for the eraser', () => {
      component['onToolChange']('eraser');
      component['updateToolSettings']({ eraserSize: 12 });
      component['zoomLevel'].set(1);

      component['moveBrushCursor']({ x: 0, y: 0 });

      const ring = fixture.nativeElement.querySelector(
        '[data-testid="brush-cursor"]'
      ) as HTMLElement;
      expect(ring.style.width).toBe('24px');
    });

    it('hides the ring for tools that do not paint', () => {
      component['onToolChange']('select');
      component['moveBrushCursor']({ x: 10, y: 10 });

      const ring = fixture.nativeElement.querySelector(
        '[data-testid="brush-cursor"]'
      ) as HTMLElement;
      expect(ring.style.opacity).toBe('0');
    });

    it('hides the ring when the pointer leaves', () => {
      component['onToolChange']('draw');
      component['moveBrushCursor']({ x: 10, y: 10 });
      component['moveBrushCursor'](null);

      const ring = fixture.nativeElement.querySelector(
        '[data-testid="brush-cursor"]'
      ) as HTMLElement;
      expect(ring.style.opacity).toBe('0');
    });
  });

  describe('Presence selection integration', () => {
    it('selectKonvaNode reports canvas selection to presence service when elementId and nodeId are set', () => {
      fixture.detectChanges();
      component['elementId'].set('element-abc');

      const mockNode = {
        id: () => 'node-42',
      } as unknown as import('konva/lib/Node').Node;
      vi.spyOn(component['canvasSelection'], 'selectNode').mockImplementation(
        () => {}
      );

      component['selectKonvaNode'](mockNode);

      expect(mockPresenceService.setSelection).toHaveBeenCalledWith({
        kind: 'canvas',
        elementId: 'element-abc',
        selectedIds: ['node-42'],
      });
    });

    it('selectKonvaNode does not call setSelection when elementId is empty', () => {
      fixture.detectChanges();
      component['elementId'].set('');

      const mockNode = {
        id: () => 'node-99',
      } as unknown as import('konva/lib/Node').Node;
      vi.spyOn(component['canvasSelection'], 'selectNode').mockImplementation(
        () => {}
      );

      component['selectKonvaNode'](mockNode);

      expect(mockPresenceService.setSelection).not.toHaveBeenCalled();
    });

    it('selectNodesInRect reports single-select to presence and clears on deselect', () => {
      fixture.detectChanges();
      component['elementId'].set('element-xyz');

      let capturedCallbacks: {
        onSingleSelected?: (id: string) => void;
        onCleared?: () => void;
      } = {};
      vi.spyOn(
        component['canvasSelection'],
        'selectNodesInRect'
      ).mockImplementation(
        (
          _rect: unknown,
          callbacks: {
            onSingleSelected?: (id: string) => void;
            onCleared?: () => void;
          }
        ) => {
          capturedCallbacks = callbacks;
        }
      );

      component['selectNodesInRect']({ x: 0, y: 0, width: 100, height: 100 });

      capturedCallbacks.onSingleSelected?.('shape-1');
      expect(mockPresenceService.setSelection).toHaveBeenCalledWith({
        kind: 'canvas',
        elementId: 'element-xyz',
        selectedIds: ['shape-1'],
      });

      mockPresenceService.setSelection.mockClear();
      capturedCallbacks.onCleared?.();
      expect(mockPresenceService.setSelection).toHaveBeenCalledWith(null);
    });
  });
});
