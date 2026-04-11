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
  // Keyboard Shortcuts
  // ─────────────────────────────────────────────────────────────────────────

  describe('keyHandler', () => {
    function dispatchKey(
      key: string,
      opts: Partial<KeyboardEventInit> = {}
    ): void {
      const event = new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        ...opts,
      });
      component['keyHandler'](event);
    }

    it('should ignore shortcuts when target is an input element', () => {
      const input = document.createElement('input');
      const event = new KeyboardEvent('keydown', {
        key: 'v',
        bubbles: true,
      });
      Object.defineProperty(event, 'target', { value: input });
      component['keyHandler'](event);
      // Tool should remain unchanged
      expect(component['activeTool']()).toBe('select');
    });

    it('should switch to select tool on v key', () => {
      component['activeTool'].set('draw');
      dispatchKey('v');
      expect(component['activeTool']()).toBe('select');
    });

    it('should switch to rectSelect tool on r key', () => {
      dispatchKey('r');
      expect(component['activeTool']()).toBe('rectSelect');
    });

    it('should switch to pan tool on h key', () => {
      dispatchKey('h');
      expect(component['activeTool']()).toBe('pan');
    });

    it('should switch to pin tool on p key', () => {
      dispatchKey('p');
      expect(component['activeTool']()).toBe('pin');
    });

    it('should switch to draw tool on d key (no modifier)', () => {
      dispatchKey('d');
      expect(component['activeTool']()).toBe('draw');
    });

    it('should switch to line tool on l key', () => {
      dispatchKey('l');
      expect(component['activeTool']()).toBe('line');
    });

    it('should switch to shape tool on s key (no modifier)', () => {
      dispatchKey('s');
      expect(component['activeTool']()).toBe('shape');
    });

    it('should NOT switch to shape tool when Ctrl+S is pressed', () => {
      dispatchKey('s', { ctrlKey: true });
      expect(component['activeTool']()).toBe('select');
    });

    it('should switch to text tool on t key', () => {
      dispatchKey('t');
      expect(component['activeTool']()).toBe('text');
    });

    it('should reset to select tool on Escape', () => {
      component['activeTool'].set('draw');
      dispatchKey('Escape');
      expect(component['activeTool']()).toBe('select');
      expect(component['selectedObjectId']()).toBeNull();
    });

    it('should call onCopy on Ctrl+C', () => {
      const spy = vi.spyOn(component as never, 'onCopy');
      dispatchKey('c', { ctrlKey: true });
      expect(spy).toHaveBeenCalled();
    });

    it('should call onCut on Ctrl+X', () => {
      const spy = vi.spyOn(component as never, 'onCut');
      dispatchKey('x', { ctrlKey: true });
      expect(spy).toHaveBeenCalled();
    });

    it('should call onPaste on Ctrl+V', () => {
      const spy = vi.spyOn(component as never, 'onPaste');
      dispatchKey('v', { ctrlKey: true });
      expect(spy).toHaveBeenCalled();
    });

    it('should call onDuplicateObject on Ctrl+D', () => {
      const spy = vi.spyOn(component as never, 'onDuplicateObject');
      dispatchKey('d', { ctrlKey: true });
      expect(spy).toHaveBeenCalled();
    });

    it('should call deleteSelectedObject on Delete key', () => {
      const spy = vi.spyOn(component as never, 'deleteSelectedObject');
      dispatchKey('Delete');
      expect(spy).toHaveBeenCalled();
    });

    it('should call deleteSelectedObject on Backspace key', () => {
      const spy = vi.spyOn(component as never, 'deleteSelectedObject');
      dispatchKey('Backspace');
      expect(spy).toHaveBeenCalled();
    });

    it('should call onZoomIn on Ctrl+=', () => {
      const spy = vi.spyOn(component as never, 'onZoomIn');
      dispatchKey('=', { ctrlKey: true });
      expect(spy).toHaveBeenCalled();
    });

    it('should call onZoomOut on Ctrl+-', () => {
      const spy = vi.spyOn(component as never, 'onZoomOut');
      dispatchKey('-', { ctrlKey: true });
      expect(spy).toHaveBeenCalled();
    });

    it('should call onFitAll on Ctrl+0', () => {
      const spy = vi.spyOn(component as never, 'onFitAll');
      dispatchKey('0', { ctrlKey: true });
      expect(spy).toHaveBeenCalled();
    });

    it('should ignore shortcuts when target is a select element', () => {
      const select = document.createElement('select');
      const event = new KeyboardEvent('keydown', {
        key: 'v',
        bubbles: true,
      });
      Object.defineProperty(event, 'target', { value: select });
      component['keyHandler'](event);
      expect(component['activeTool']()).toBe('select');
    });

    it('should ignore shortcuts when target is a textarea element', () => {
      const textarea = document.createElement('textarea');
      const event = new KeyboardEvent('keydown', {
        key: 'd',
        bubbles: true,
      });
      Object.defineProperty(event, 'target', { value: textarea });
      component['keyHandler'](event);
      expect(component['activeTool']()).toBe('select');
    });

    it('should ignore shortcuts when target is contentEditable', () => {
      const div = document.createElement('div');
      div.setAttribute('contenteditable', 'true');
      document.body.appendChild(div);
      const event = new KeyboardEvent('keydown', {
        key: 'r',
        bubbles: true,
      });
      Object.defineProperty(event, 'target', { value: div });
      component['keyHandler'](event);
      expect(component['activeTool']()).toBe('select');
      div.remove();
    });

    it('should NOT switch tool when Ctrl+R is pressed', () => {
      dispatchKey('r', { ctrlKey: true });
      expect(component['activeTool']()).toBe('select');
    });

    it('should NOT switch tool when Ctrl+H is pressed', () => {
      dispatchKey('h', { ctrlKey: true });
      expect(component['activeTool']()).toBe('select');
    });

    it('should NOT switch tool when Meta+P is pressed', () => {
      dispatchKey('p', { metaKey: true });
      expect(component['activeTool']()).toBe('select');
    });

    it('should NOT switch tool when Ctrl+L is pressed', () => {
      dispatchKey('l', { ctrlKey: true });
      expect(component['activeTool']()).toBe('select');
    });

    it('should NOT switch tool when Ctrl+T is pressed', () => {
      dispatchKey('t', { ctrlKey: true });
      expect(component['activeTool']()).toBe('select');
    });

    it('should not call onZoomIn without modifier on =', () => {
      const spy = vi.spyOn(component as never, 'onZoomIn');
      dispatchKey('=');
      expect(spy).not.toHaveBeenCalled();
    });

    it('should not call onZoomOut without modifier on -', () => {
      const spy = vi.spyOn(component as never, 'onZoomOut');
      dispatchKey('-');
      expect(spy).not.toHaveBeenCalled();
    });

    it('should not respond to unrecognized key', () => {
      const spy = vi.spyOn(component as never, 'onToolChange');
      dispatchKey('q');
      expect(spy).not.toHaveBeenCalled();
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
  // Drawing Operations
  // ─────────────────────────────────────────────────────────────────────────

  describe('drawing operations', () => {
    function setupDrawingState() {
      fixture.detectChanges();
      component['stage'] = createStageStub({ draggable: vi.fn() }) as any;
      component['selectionLayer'] = {
        batchDraw: vi.fn(),
        add: vi.fn(),
      } as any;
      component['transformer'] = { nodes: vi.fn() } as any;
    }

    describe('handleDrawEnd', () => {
      beforeEach(() => setupDrawingState());

      it('should finalize rect select when rectSelectRect and rectSelectStart exist', () => {
        component['activeTool'].set('rectSelect');
        const mockRect = {
          x: vi.fn(() => 5),
          y: vi.fn(() => 5),
          width: vi.fn(() => 1),
          height: vi.fn(() => 1),
          destroy: vi.fn(),
        };
        component['rectSelectRect'] = mockRect as any;
        component['rectSelectStart'] = { x: 5, y: 5 };

        component['handleDrawEnd']();

        expect(mockRect.destroy).toHaveBeenCalled();
        expect(component['rectSelectRect']).toBeNull();
        expect(component['rectSelectStart']).toBeNull();
      });

      it('should finalize free draw when drawingLine exists and tool is draw', () => {
        component['activeTool'].set('draw');
        component['drawingLine'] = { destroy: vi.fn() } as any;
        component['drawingPoints'] = [10, 20];

        component['handleDrawEnd']();

        expect(component['drawingLine']).toBeNull();
        expect(component['drawingPoints']).toEqual([]);
      });

      it('should finalize line draw when drawingLine exists and tool is line', () => {
        component['activeTool'].set('line');
        component['drawingLine'] = {
          destroy: vi.fn(),
          points: vi.fn(() => [10, 20, 11, 21]),
        } as any;

        component['handleDrawEnd']();

        expect(component['drawingLine']).toBeNull();
        expect(component['drawingStartPos']).toBeNull();
      });

      it('should finalize line shape draw when drawingLine exists and tool is shape', () => {
        component['activeTool'].set('shape');
        component['drawingLine'] = {
          destroy: vi.fn(),
          points: vi.fn(() => [10, 20, 11, 21]),
        } as any;

        component['handleDrawEnd']();

        expect(component['drawingLine']).toBeNull();
        expect(component['drawingStartPos']).toBeNull();
      });

      it('should finalize rect shape draw when drawingShape exists and tool is shape', () => {
        component['activeTool'].set('shape');
        component['drawingShape'] = {
          destroy: vi.fn(),
          width: vi.fn(() => 1),
          height: vi.fn(() => 1),
          x: vi.fn(() => 0),
          y: vi.fn(() => 0),
        } as any;
        component['drawingStartPos'] = { x: 0, y: 0 };

        component['handleDrawEnd']();

        expect(component['drawingShape']).toBeNull();
        expect(component['drawingStartPos']).toBeNull();
      });

      it('should restore stage draggable to true for select tool', () => {
        component['activeTool'].set('select');
        const draggableFn = vi.fn();
        component['stage'] = createStageStub({
          draggable: draggableFn,
        }) as any;

        component['handleDrawEnd']();

        expect(draggableFn).toHaveBeenCalledWith(true);
      });

      it('should restore stage draggable to true for pan tool', () => {
        component['activeTool'].set('pan');
        const draggableFn = vi.fn();
        component['stage'] = createStageStub({
          draggable: draggableFn,
        }) as any;

        component['handleDrawEnd']();

        expect(draggableFn).toHaveBeenCalledWith(true);
      });

      it('should restore stage draggable to false for draw tool', () => {
        component['activeTool'].set('draw');
        const draggableFn = vi.fn();
        component['stage'] = createStageStub({
          draggable: draggableFn,
        }) as any;

        component['handleDrawEnd']();

        expect(draggableFn).toHaveBeenCalledWith(false);
      });
    });

    describe('handleDrawStart', () => {
      beforeEach(() => setupDrawingState());

      it('should return early for non-drawing tools like select', () => {
        component['activeTool'].set('select');
        const draggableFn = vi.fn();
        component['stage'] = createStageStub({
          draggable: draggableFn,
        }) as any;

        component['handleDrawStart'](mockDrawEvent);

        expect(draggableFn).not.toHaveBeenCalled();
      });

      it('should disable stage dragging for drawing tools', () => {
        component['activeTool'].set('draw');
        const draggableFn = vi.fn();
        component['stage'] = createStageStub({
          draggable: draggableFn,
        }) as any;
        vi.spyOn(component as any, 'getCanvasPointerPosition').mockReturnValue(
          null
        );

        component['handleDrawStart'](mockDrawEvent);

        expect(draggableFn).toHaveBeenCalledWith(false);
      });

      it('should dispatch to initRectSelect for rectSelect tool', () => {
        component['activeTool'].set('rectSelect');
        vi.spyOn(component as any, 'initRectSelect').mockImplementation(
          () => {}
        );

        component['handleDrawStart'](mockDrawEvent);

        expect(component['initRectSelect']).toHaveBeenCalled();
      });

      it('should dispatch to initFreeDraw for draw tool', () => {
        const pos = { x: 10, y: 20 };
        component['activeTool'].set('draw');
        vi.spyOn(component as any, 'getCanvasPointerPosition').mockReturnValue(
          pos
        );
        vi.spyOn(component as any, 'initFreeDraw').mockImplementation(() => {});
        const layerId = defaultConfig.layers[0].id;
        const mockLayer = createMockLayer();
        component['konvaLayers'].set(layerId, mockLayer);

        component['handleDrawStart'](mockDrawEvent);

        expect(component['initFreeDraw']).toHaveBeenCalledWith(
          pos,
          expect.any(Object),
          mockLayer
        );
      });

      it('should dispatch to initLineDraw for line tool', () => {
        const pos = { x: 15, y: 25 };
        component['activeTool'].set('line');
        vi.spyOn(component as any, 'getCanvasPointerPosition').mockReturnValue(
          pos
        );
        vi.spyOn(component as any, 'initLineDraw').mockImplementation(() => {});
        const layerId = defaultConfig.layers[0].id;
        const mockLayer = createMockLayer();
        component['konvaLayers'].set(layerId, mockLayer);

        component['handleDrawStart'](mockDrawEvent);

        expect(component['initLineDraw']).toHaveBeenCalledWith(
          pos,
          expect.any(Object),
          mockLayer
        );
      });

      it('should dispatch to initShapeDraw for shape tool', () => {
        const pos = { x: 20, y: 30 };
        component['activeTool'].set('shape');
        vi.spyOn(component as any, 'getCanvasPointerPosition').mockReturnValue(
          pos
        );
        vi.spyOn(component as any, 'initShapeDraw').mockImplementation(
          () => {}
        );
        const layerId = defaultConfig.layers[0].id;
        const mockLayer = createMockLayer();
        component['konvaLayers'].set(layerId, mockLayer);

        component['handleDrawStart'](mockDrawEvent);

        expect(component['initShapeDraw']).toHaveBeenCalledWith(
          pos,
          expect.any(Object),
          mockLayer
        );
      });

      it('should return early when getCanvasPointerPosition returns null', () => {
        component['activeTool'].set('draw');
        vi.spyOn(component as any, 'getCanvasPointerPosition').mockReturnValue(
          null
        );
        vi.spyOn(component as any, 'initFreeDraw');

        component['handleDrawStart'](mockDrawEvent);

        expect(component['initFreeDraw']).not.toHaveBeenCalled();
      });

      it('should return early when no konva layer exists for active layer', () => {
        component['activeTool'].set('draw');
        vi.spyOn(component as any, 'getCanvasPointerPosition').mockReturnValue({
          x: 0,
          y: 0,
        });
        vi.spyOn(component as any, 'initFreeDraw');

        component['handleDrawStart'](mockDrawEvent);

        expect(component['initFreeDraw']).not.toHaveBeenCalled();
      });
    });

    describe('finalizeRectSelect', () => {
      beforeEach(() => setupDrawingState());

      it('should deselect when rect is too small', () => {
        component['rectSelectRect'] = {
          x: vi.fn(() => 10),
          y: vi.fn(() => 20),
          width: vi.fn(() => 1),
          height: vi.fn(() => 1),
          destroy: vi.fn(),
        } as any;
        component['rectSelectStart'] = { x: 10, y: 20 };

        component['finalizeRectSelect']();

        expect(component['selectedObjectId']()).toBeNull();
        expect(component['transformer']!.nodes).toHaveBeenCalledWith([]);
        expect(component['rectSelectRect']).toBeNull();
        expect(component['rectSelectStart']).toBeNull();
      });

      it('should select nodes when rect is large enough', () => {
        vi.spyOn(component as any, 'selectNodesInRect').mockImplementation(
          () => {}
        );
        component['rectSelectRect'] = {
          x: vi.fn(() => 10),
          y: vi.fn(() => 20),
          width: vi.fn(() => 100),
          height: vi.fn(() => 80),
          destroy: vi.fn(),
        } as any;
        component['rectSelectStart'] = { x: 10, y: 20 };

        component['finalizeRectSelect']();

        expect(component['selectNodesInRect']).toHaveBeenCalledWith({
          x: 10,
          y: 20,
          width: 100,
          height: 80,
        });
      });
    });

    describe('finalizeFreeDraw', () => {
      beforeEach(() => setupDrawingState());

      it('should create path object when enough points are drawn', () => {
        component['drawingPoints'] = [10, 20, 30, 40];
        component['drawingLine'] = { destroy: vi.fn() } as any;

        component['finalizeFreeDraw']();

        expect(mockCanvasService.addObject).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'path',
            points: [10, 20, 30, 40],
            closed: false,
          })
        );
      });

      it('should not create path when fewer than 4 points', () => {
        component['drawingPoints'] = [10, 20];
        component['drawingLine'] = { destroy: vi.fn() } as any;

        component['finalizeFreeDraw']();

        expect(mockCanvasService.addObject).not.toHaveBeenCalled();
      });

      it('should clean up drawing state after free draw', () => {
        component['drawingPoints'] = [10, 20, 30, 40];
        const destroyFn = vi.fn();
        component['drawingLine'] = { destroy: destroyFn } as any;

        component['finalizeFreeDraw']();

        expect(destroyFn).toHaveBeenCalled();
        expect(component['drawingLine']).toBeNull();
        expect(component['drawingPoints']).toEqual([]);
      });
    });

    describe('finalizeLineDraw', () => {
      beforeEach(() => setupDrawingState());

      it('should create path when line is long enough', () => {
        component['drawingLine'] = {
          points: vi.fn(() => [10, 20, 100, 120]),
          destroy: vi.fn(),
        } as any;

        component['finalizeLineDraw']();

        expect(mockCanvasService.addObject).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'path',
            points: [10, 20, 100, 120],
            closed: false,
            tension: 0,
          })
        );
      });

      it('should not create path when line is too short', () => {
        component['drawingLine'] = {
          points: vi.fn(() => [10, 20, 12, 21]),
          destroy: vi.fn(),
        } as any;

        component['finalizeLineDraw']();

        expect(mockCanvasService.addObject).not.toHaveBeenCalled();
      });

      it('should clean up drawing state after line draw', () => {
        const destroyFn = vi.fn();
        component['drawingLine'] = {
          points: vi.fn(() => [10, 20, 100, 120]),
          destroy: destroyFn,
        } as any;
        component['drawingStartPos'] = { x: 10, y: 20 };

        component['finalizeLineDraw']();

        expect(destroyFn).toHaveBeenCalled();
        expect(component['drawingLine']).toBeNull();
        expect(component['drawingStartPos']).toBeNull();
      });
    });

    describe('finalizeLineShapeDraw', () => {
      beforeEach(() => setupDrawingState());

      it('should create shape when line is long enough', () => {
        component['drawingLine'] = {
          points: vi.fn(() => [10, 20, 100, 120]),
          destroy: vi.fn(),
        } as any;

        component['finalizeLineShapeDraw']();

        expect(mockCanvasService.addObject).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'shape',
            x: 10,
            y: 20,
          })
        );
      });

      it('should not create shape when line is too short', () => {
        component['drawingLine'] = {
          points: vi.fn(() => [10, 20, 12, 21]),
          destroy: vi.fn(),
        } as any;

        component['finalizeLineShapeDraw']();

        expect(mockCanvasService.addObject).not.toHaveBeenCalled();
      });

      it('should clean up drawing state after line shape draw', () => {
        const destroyFn = vi.fn();
        component['drawingLine'] = {
          points: vi.fn(() => [10, 20, 100, 120]),
          destroy: destroyFn,
        } as any;
        component['drawingStartPos'] = { x: 10, y: 20 };

        component['finalizeLineShapeDraw']();

        expect(destroyFn).toHaveBeenCalled();
        expect(component['drawingLine']).toBeNull();
        expect(component['drawingStartPos']).toBeNull();
      });
    });

    describe('finalizeRectShapeDraw', () => {
      beforeEach(() => setupDrawingState());

      it('should create rect shape when large enough', () => {
        component['drawingShape'] = {
          width: vi.fn(() => 100),
          height: vi.fn(() => 80),
          x: vi.fn(() => 10),
          y: vi.fn(() => 20),
          destroy: vi.fn(),
        } as any;
        component['drawingStartPos'] = { x: 10, y: 20 };

        component['finalizeRectShapeDraw']();

        expect(mockCanvasService.addObject).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'shape',
            width: 100,
            height: 80,
            x: 10,
            y: 20,
          })
        );
      });

      it('should create ellipse shape when large enough', () => {
        component['toolSettings'].set({
          ...createDefaultToolSettings(),
          shapeType: 'ellipse',
        });
        component['drawingShape'] = {
          radiusX: vi.fn(() => 50),
          radiusY: vi.fn(() => 40),
          x: vi.fn(() => 60),
          y: vi.fn(() => 70),
          destroy: vi.fn(),
        } as any;
        component['drawingStartPos'] = { x: 10, y: 30 };

        component['finalizeRectShapeDraw']();

        expect(mockCanvasService.addObject).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'shape',
            shapeType: 'ellipse',
            width: 100,
            height: 80,
            x: 10,
            y: 30,
          })
        );
      });

      it('should not create shape when rect is too small', () => {
        component['drawingShape'] = {
          width: vi.fn(() => 2),
          height: vi.fn(() => 2),
          x: vi.fn(() => 0),
          y: vi.fn(() => 0),
          destroy: vi.fn(),
        } as any;
        component['drawingStartPos'] = { x: 0, y: 0 };

        component['finalizeRectShapeDraw']();

        expect(mockCanvasService.addObject).not.toHaveBeenCalled();
      });

      it('should not create shape when ellipse is too small', () => {
        component['toolSettings'].set({
          ...createDefaultToolSettings(),
          shapeType: 'ellipse',
        });
        component['drawingShape'] = {
          radiusX: vi.fn(() => 1),
          radiusY: vi.fn(() => 1),
          x: vi.fn(() => 5),
          y: vi.fn(() => 5),
          destroy: vi.fn(),
        } as any;
        component['drawingStartPos'] = { x: 4, y: 4 };

        component['finalizeRectShapeDraw']();

        expect(mockCanvasService.addObject).not.toHaveBeenCalled();
      });

      it('should clean up drawing state after rect shape draw', () => {
        const destroyFn = vi.fn();
        component['drawingShape'] = {
          width: vi.fn(() => 100),
          height: vi.fn(() => 80),
          x: vi.fn(() => 10),
          y: vi.fn(() => 20),
          destroy: destroyFn,
        } as any;
        component['drawingStartPos'] = { x: 10, y: 20 };

        component['finalizeRectShapeDraw']();

        expect(destroyFn).toHaveBeenCalled();
        expect(component['drawingShape']).toBeNull();
        expect(component['drawingStartPos']).toBeNull();
      });
    });

    // Typed helpers for Konva mocks
    const mockDrawEvent = {} as Konva.KonvaEventObject<MouseEvent | TouchEvent>;
    function createMockLayer() {
      return { add: vi.fn() } as unknown as Konva.Layer;
    }

    // Init methods create real Konva objects which need canvas context in jsdom
    function mockCanvasForKonva() {
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        clearRect: vi.fn(),
        getImageData: vi.fn(() => ({
          data: new Uint8ClampedArray(4),
        })),
        fillRect: vi.fn(),
        putImageData: vi.fn(),
      } as unknown as RenderingContext);
    }

    describe('initRectSelect', () => {
      beforeEach(() => {
        setupDrawingState();
        mockCanvasForKonva();
      });

      it('should set up rect select state when pointer position exists', () => {
        vi.spyOn(component as any, 'getCanvasPointerPosition').mockReturnValue({
          x: 10,
          y: 20,
        });

        component['initRectSelect']();

        expect(component['rectSelectStart']).toEqual({ x: 10, y: 20 });
        expect(component['rectSelectRect']).toBeTruthy();
        expect(component['selectionLayer']!.add).toHaveBeenCalled();
      });

      it('should do nothing when no pointer position', () => {
        vi.spyOn(component as any, 'getCanvasPointerPosition').mockReturnValue(
          null
        );

        component['initRectSelect']();

        expect(component['rectSelectStart']).toBeFalsy();
        expect(component['rectSelectRect']).toBeFalsy();
      });
    });

    describe('initFreeDraw', () => {
      beforeEach(() => {
        setupDrawingState();
        mockCanvasForKonva();
      });

      it('should set up drawing points and line', () => {
        const mockLayer = createMockLayer();
        const settings = createDefaultToolSettings();

        component['initFreeDraw']({ x: 10, y: 20 }, settings, mockLayer);

        expect(component['drawingPoints']).toEqual([10, 20]);
        expect(component['drawingLine']).toBeTruthy();
        expect(mockLayer.add).toHaveBeenCalled();
      });
    });

    describe('initLineDraw', () => {
      beforeEach(() => {
        setupDrawingState();
        mockCanvasForKonva();
      });

      it('should set up start position and line', () => {
        const mockLayer = createMockLayer();
        const settings = createDefaultToolSettings();

        component['initLineDraw']({ x: 15, y: 25 }, settings, mockLayer);

        expect(component['drawingStartPos']).toEqual({ x: 15, y: 25 });
        expect(component['drawingLine']).toBeTruthy();
        expect(mockLayer.add).toHaveBeenCalled();
      });
    });

    describe('initShapeDraw', () => {
      beforeEach(() => {
        setupDrawingState();
        mockCanvasForKonva();
      });

      it('should create arrow for arrow shape type', () => {
        const mockLayer = createMockLayer();
        const settings = {
          ...createDefaultToolSettings(),
          shapeType: 'arrow' as const,
        };

        component['initShapeDraw']({ x: 10, y: 20 }, settings, mockLayer);

        expect(component['drawingStartPos']).toEqual({ x: 10, y: 20 });
        expect(component['drawingLine']).toBeTruthy();
        expect(mockLayer.add).toHaveBeenCalled();
      });

      it('should create line shape for line shape type', () => {
        const mockLayer = createMockLayer();
        const settings = {
          ...createDefaultToolSettings(),
          shapeType: 'line' as const,
        };

        component['initShapeDraw']({ x: 10, y: 20 }, settings, mockLayer);

        expect(component['drawingLine']).toBeTruthy();
        expect(mockLayer.add).toHaveBeenCalled();
      });

      it('should create ellipse for ellipse shape type', () => {
        const mockLayer = createMockLayer();
        const settings = {
          ...createDefaultToolSettings(),
          shapeType: 'ellipse' as const,
        };

        component['initShapeDraw']({ x: 10, y: 20 }, settings, mockLayer);

        expect(component['drawingStartPos']).toEqual({ x: 10, y: 20 });
        expect(component['drawingShape']).toBeTruthy();
        expect(mockLayer.add).toHaveBeenCalled();
      });

      it('should create rect for rect shape type', () => {
        const mockLayer = createMockLayer();
        const settings = {
          ...createDefaultToolSettings(),
          shapeType: 'rect' as const,
        };

        component['initShapeDraw']({ x: 10, y: 20 }, settings, mockLayer);

        expect(component['drawingStartPos']).toEqual({ x: 10, y: 20 });
        expect(component['drawingShape']).toBeTruthy();
        expect(mockLayer.add).toHaveBeenCalled();
      });
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
      } as CanvasShape;
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
      component['stage'] = null as unknown as Konva.Stage;
      component['exportAsPng']();
      expect(clickSpy).not.toHaveBeenCalled();
    });

    it('should export PNG with pixelRatio 2', () => {
      component['stage'] = {
        toDataURL: vi.fn(() => 'data:image/png;base64,abc'),
      } as unknown as Konva.Stage;

      component['exportAsPng']();

      expect(component['stage'].toDataURL).toHaveBeenCalledWith({
        pixelRatio: 2,
      });
      expect(clickSpy).toHaveBeenCalled();
    });

    it('should export high-res PNG with pixelRatio 3', () => {
      component['stage'] = {
        toDataURL: vi.fn(() => 'data:image/png;base64,xyz'),
      } as unknown as Konva.Stage;

      component['exportAsHighResPng']();

      expect(component['stage'].toDataURL).toHaveBeenCalledWith({
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
});
