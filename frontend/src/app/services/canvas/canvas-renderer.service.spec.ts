import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type {
  CanvasImage,
  CanvasLayer,
  CanvasObject,
  CanvasPath,
  CanvasPin,
  CanvasShape,
  CanvasText,
} from '@models/canvas.model';
import { LoggerService } from '@services/core/logger.service';
import { LocalStorageService } from '@services/local/local-storage.service';
import { ProjectStateService } from '@services/project/project-state.service';
import Konva from 'konva';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { CanvasService } from './canvas.service';
import type { CanvasNodeHandlers } from './canvas-renderer.service';
import { CanvasRendererService } from './canvas-renderer.service';

// jsdom does not implement canvas.getContext('2d'), which Konva requires.
// Provide a minimal stub so Konva node constructors don't throw.
function makeCanvas2dStub() {
  return {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    measureText: vi.fn(() => ({
      width: 0,
      actualBoundingBoxAscent: 0,
      actualBoundingBoxDescent: 0,
    })),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    arc: vi.fn(),
    arcTo: vi.fn(),
    ellipse: vi.fn(),
    rect: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    translate: vi.fn(),
    transform: vi.fn(),
    setTransform: vi.fn(),
    resetTransform: vi.fn(),
    drawImage: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createPattern: vi.fn(() => null),
    clip: vi.fn(),
    isPointInPath: vi.fn(() => false),
    isPointInStroke: vi.fn(() => false),
    putImageData: vi.fn(),
    getImageData: vi.fn(() => ({
      data: new Uint8ClampedArray(0),
      width: 0,
      height: 0,
    })),
    createImageData: vi.fn(() => ({
      data: new Uint8ClampedArray(0),
      width: 0,
      height: 0,
    })),
    setLineDash: vi.fn(),
    getLineDash: vi.fn(() => []),
    canvas: { width: 300, height: 150 },
    shadowBlur: 0,
    shadowColor: '',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    lineWidth: 1,
    lineCap: 'butt' as CanvasLineCap,
    lineJoin: 'miter' as CanvasLineJoin,
    miterLimit: 10,
    font: '10px sans-serif',
    textAlign: 'start' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    direction: 'ltr' as CanvasDirection,
    fillStyle: '#000000',
    strokeStyle: '#000000',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over' as GlobalCompositeOperation,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const baseObj = {
  id: 'o1',
  layerId: 'L1',
  x: 10,
  y: 20,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  visible: true,
  locked: false,
};

const makeText = (overrides: Partial<CanvasText> = {}): CanvasText => ({
  ...baseObj,
  type: 'text',
  text: 'Hello',
  fontSize: 14,
  fontFamily: 'Arial',
  fontStyle: 'normal',
  fill: '#000',
  width: 0,
  align: 'left',
  ...overrides,
});

const makePath = (overrides: Partial<CanvasPath> = {}): CanvasPath => ({
  ...baseObj,
  type: 'path',
  points: [0, 0, 10, 10],
  stroke: '#000',
  strokeWidth: 2,
  closed: false,
  tension: 0.5,
  ...overrides,
});

const makeShape = (shapeType: CanvasShape['shapeType']): CanvasShape => ({
  ...baseObj,
  type: 'shape',
  shapeType,
  width: 100,
  height: 50,
  stroke: '#000',
  strokeWidth: 1,
});

const makePin = (overrides: Partial<CanvasPin> = {}): CanvasPin => ({
  ...baseObj,
  type: 'pin',
  label: 'Pin 1',
  icon: 'star',
  color: '#f00',
  ...overrides,
});

const makeImage = (overrides: Partial<CanvasImage> = {}): CanvasImage => ({
  ...baseObj,
  type: 'image',
  src: 'https://example.com/img.jpg',
  width: 200,
  height: 100,
  ...overrides,
});

const makeLayer = (overrides: Partial<CanvasLayer> = {}): CanvasLayer => ({
  id: 'L1',
  name: 'Layer 1',
  visible: true,
  locked: false,
  opacity: 1,
  order: 0,
  ...overrides,
});

const makeHandlers = (): CanvasNodeHandlers => ({
  onSelect: vi.fn(),
  onSelectKonvaNode: vi.fn(),
  onDragEnd: vi.fn(),
  onTransformEnd: vi.fn(),
  onDblClickText: vi.fn(),
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('CanvasRendererService', () => {
  let service: CanvasRendererService;
  let mockProjectState: any;
  let mockLocalStorage: any;
  let mockLogger: any;

  beforeAll(() => {
    // Install a minimal 2D context stub so Konva node constructors work in jsdom.
    (HTMLCanvasElement.prototype as any).getContext = function (type: string) {
      if (type === '2d') return makeCanvas2dStub();
      return null;
    };
  });

  beforeEach(() => {
    mockProjectState = { project: signal(null) };
    mockLocalStorage = { getMediaUrl: vi.fn() };
    mockLogger = { warn: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        CanvasRendererService,
        { provide: CanvasService, useValue: { activeConfig: signal(null) } },
        { provide: ProjectStateService, useValue: mockProjectState },
        { provide: LocalStorageService, useValue: mockLocalStorage },
        { provide: LoggerService, useValue: mockLogger },
      ],
    });
    service = TestBed.inject(CanvasRendererService);
  });

  // ─── Initial state ────────────────────────────────────────────────────────

  describe('initial state', () => {
    it('stage is null before initStage', () => {
      expect(service.stage).toBeNull();
    });

    it('transformer is null before initStage', () => {
      expect(service.transformer).toBeNull();
    });

    it('selectionLayer is null before initStage', () => {
      expect(service.selectionLayer).toBeNull();
    });

    it('konvaLayers map is empty', () => {
      expect(service.konvaLayers.size).toBe(0);
    });

    it('konvaNodes map is empty', () => {
      expect(service.konvaNodes.size).toBe(0);
    });
  });

  // ─── destroyStage ─────────────────────────────────────────────────────────

  describe('destroyStage', () => {
    it('is a no-op when stage is not initialised', () => {
      expect(() => service.destroyStage()).not.toThrow();
    });
  });

  // ─── getCanvasPointerPosition ────────────────────────────────────────────

  describe('getCanvasPointerPosition', () => {
    it('returns null when stage is not initialised', () => {
      expect(service.getCanvasPointerPosition()).toBeNull();
    });
  });

  // ─── getViewportCenter ───────────────────────────────────────────────────

  describe('getViewportCenter', () => {
    it('returns {x:0, y:0} when stage is not initialised', () => {
      expect(service.getViewportCenter()).toEqual({ x: 0, y: 0 });
    });
  });

  // ─── resolveImageSrc ─────────────────────────────────────────────────────

  describe('resolveImageSrc', () => {
    it('returns src unchanged for a plain https URL', async () => {
      const result = await service.resolveImageSrc(
        'https://example.com/img.png'
      );
      expect(result).toBe('https://example.com/img.png');
    });

    it('returns src unchanged for a data: URL', async () => {
      const result = await service.resolveImageSrc('data:image/png;base64,abc');
      expect(result).toBe('data:image/png;base64,abc');
    });

    it('returns empty string when media URL but no project loaded', async () => {
      const result = await service.resolveImageSrc('media://abc123');
      expect(result).toBe('');
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('returns empty string when media not found in LocalStorage', async () => {
      mockProjectState.project = signal({
        username: 'alice',
        slug: 'myproject',
      });
      mockLocalStorage.getMediaUrl.mockResolvedValue(null);
      const result = await service.resolveImageSrc('media://notfound');
      expect(result).toBe('');
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('returns resolved URL from LocalStorage when media found', async () => {
      mockProjectState.project = signal({
        username: 'alice',
        slug: 'myproject',
      });
      mockLocalStorage.getMediaUrl.mockResolvedValue(
        'blob:http://localhost/abc'
      );
      const result = await service.resolveImageSrc('media://abc123');
      expect(result).toBe('blob:http://localhost/abc');
    });
  });

  // ─── getObjectRenderSignature (static) ───────────────────────────────────

  describe('getObjectRenderSignature (static)', () => {
    it('returns JSON signature for image type', () => {
      const obj = makeImage();
      const sig = CanvasRendererService.getObjectRenderSignature(obj);
      const parsed = JSON.parse(sig);
      expect(parsed.type).toBe('image');
      expect(parsed.src).toBe('https://example.com/img.jpg');
      expect(parsed.width).toBe(200);
    });

    it('returns JSON signature for text type', () => {
      const obj = makeText({ text: 'World', fontSize: 18 });
      const sig = CanvasRendererService.getObjectRenderSignature(obj);
      const parsed = JSON.parse(sig);
      expect(parsed.type).toBe('text');
      expect(parsed.text).toBe('World');
      expect(parsed.fontSize).toBe(18);
    });

    it('returns JSON signature for path type', () => {
      const obj = makePath({ stroke: '#ff0000', strokeWidth: 3 });
      const sig = CanvasRendererService.getObjectRenderSignature(obj);
      const parsed = JSON.parse(sig);
      expect(parsed.type).toBe('path');
      expect(parsed.stroke).toBe('#ff0000');
    });

    it('returns JSON signature for shape type', () => {
      const obj = makeShape('rect');
      const sig = CanvasRendererService.getObjectRenderSignature(obj);
      const parsed = JSON.parse(sig);
      expect(parsed.type).toBe('shape');
      expect(parsed.shapeType).toBe('rect');
    });

    it('returns JSON signature for pin type', () => {
      const obj = makePin({
        linkedElementId: 'E1',
        relationshipId: 'R1',
        note: 'a note',
      });
      const sig = CanvasRendererService.getObjectRenderSignature(obj);
      const parsed = JSON.parse(sig);
      expect(parsed.type).toBe('pin');
      expect(parsed.linkedElementId).toBe('E1');
    });

    it('falls back to full JSON.stringify for unknown type', () => {
      const obj = {
        ...baseObj,
        type: 'unknown',
      } as unknown as CanvasObject;
      const sig = CanvasRendererService.getObjectRenderSignature(obj);
      expect(sig).toContain('"type":"unknown"');
    });

    it('produces different signatures when content changes', () => {
      const a = makeText({ text: 'A' });
      const b = makeText({ text: 'B' });
      expect(CanvasRendererService.getObjectRenderSignature(a)).not.toBe(
        CanvasRendererService.getObjectRenderSignature(b)
      );
    });
  });

  // ─── createTextNode (static) ──────────────────────────────────────────────

  describe('createTextNode (static)', () => {
    it('creates a Konva.Text with correct text', () => {
      const node = CanvasRendererService.createTextNode(makeText(), {});
      expect(node).toBeInstanceOf(Konva.Text);
      expect(node.text()).toBe('Hello');
    });

    it('fires dblclick handler when provided', () => {
      const onDblClick = vi.fn();
      const obj = makeText();
      const node = CanvasRendererService.createTextNode(obj, {}, onDblClick);
      node.fire('dblclick');
      expect(onDblClick).toHaveBeenCalledWith(obj, node);
    });

    it('does not throw without dblclick handler', () => {
      const node = CanvasRendererService.createTextNode(makeText(), {});
      expect(() => node.fire('dblclick')).not.toThrow();
    });
  });

  // ─── createPathNode (static) ──────────────────────────────────────────────

  describe('createPathNode (static)', () => {
    it('creates a Konva.Line', () => {
      const node = CanvasRendererService.createPathNode(makePath(), {});
      expect(node).toBeInstanceOf(Konva.Line);
    });

    it('applies fill when path is closed', () => {
      const node = CanvasRendererService.createPathNode(
        makePath({ closed: true, fill: '#abc' }),
        {}
      );
      expect(node.fill()).toBe('#abc');
    });

    it('does not apply fill when path is not closed', () => {
      const node = CanvasRendererService.createPathNode(
        makePath({ closed: false, fill: '#abc' }),
        {}
      );
      expect(node.fill()).toBeFalsy();
    });
  });

  // ─── createShapeNode (static) ────────────────────────────────────────────

  describe('createShapeNode (static)', () => {
    it('rect → Konva.Rect', () => {
      expect(
        CanvasRendererService.createShapeNode(makeShape('rect'), {})
      ).toBeInstanceOf(Konva.Rect);
    });

    it('ellipse → Konva.Ellipse', () => {
      expect(
        CanvasRendererService.createShapeNode(makeShape('ellipse'), {})
      ).toBeInstanceOf(Konva.Ellipse);
    });

    it('arrow → Konva.Arrow with pointer', () => {
      const node = CanvasRendererService.createShapeNode(
        makeShape('arrow'),
        {}
      ) as Konva.Arrow;
      expect(node).toBeInstanceOf(Konva.Arrow);
      expect(node.pointerLength()).toBe(10);
    });

    it('line → Konva.Arrow without pointer', () => {
      const node = CanvasRendererService.createShapeNode(
        makeShape('line'),
        {}
      ) as Konva.Arrow;
      expect(node).toBeInstanceOf(Konva.Arrow);
      expect(node.pointerLength()).toBe(0);
    });

    it('polygon → Konva.Line closed', () => {
      const node = CanvasRendererService.createShapeNode(
        makeShape('polygon'),
        {}
      ) as Konva.Line;
      expect(node).toBeInstanceOf(Konva.Line);
      expect(node.closed()).toBe(true);
    });

    it('unknown shape type → Konva.Rect fallback', () => {
      const shape = { ...makeShape('rect'), shapeType: 'star' as any };
      expect(CanvasRendererService.createShapeNode(shape, {})).toBeInstanceOf(
        Konva.Rect
      );
    });
  });

  // ─── createPinNode (static) ──────────────────────────────────────────────

  describe('createPinNode (static)', () => {
    it('returns a Konva.Group', () => {
      expect(CanvasRendererService.createPinNode(makePin(), {})).toBeInstanceOf(
        Konva.Group
      );
    });

    it('has no link badge when linkedElementId is absent', () => {
      const group = CanvasRendererService.createPinNode(makePin(), {});
      expect(group.findOne('.linkBadge')).toBeUndefined();
    });

    it('adds link badge and icon when linkedElementId is present', () => {
      const group = CanvasRendererService.createPinNode(
        makePin({ linkedElementId: 'E1' }),
        {}
      );
      expect(group.findOne('.linkBadge')).toBeDefined();
      expect(group.findOne('.linkIcon')).toBeDefined();
    });
  });

  // ─── updatePinLinkIndicator (static) ────────────────────────────────────

  describe('updatePinLinkIndicator (static)', () => {
    it('removes badge and icon when hasLink is false', () => {
      const group = CanvasRendererService.createPinNode(
        makePin({ linkedElementId: 'E1' }),
        {}
      );
      expect(group.findOne('.linkBadge')).toBeDefined();
      CanvasRendererService.updatePinLinkIndicator(group, false);
      expect(group.findOne('.linkBadge')).toBeUndefined();
      expect(group.findOne('.linkIcon')).toBeUndefined();
    });

    it('adds badge when hasLink is true and no badge exists', () => {
      const group = CanvasRendererService.createPinNode(makePin(), {});
      expect(group.findOne('.linkBadge')).toBeUndefined();
      CanvasRendererService.updatePinLinkIndicator(group, true);
      expect(group.findOne('.linkBadge')).toBeDefined();
    });

    it('does not add duplicate badge when one already exists', () => {
      const group = CanvasRendererService.createPinNode(
        makePin({ linkedElementId: 'E1' }),
        {}
      );
      CanvasRendererService.updatePinLinkIndicator(group, true);
      expect(group.find('.linkBadge').length).toBe(1);
    });
  });

  // ─── createImageNode (static) ────────────────────────────────────────────

  describe('createImageNode (static)', () => {
    it('returns a Konva.Group (placeholder while image loads)', () => {
      const resolveSrc = vi.fn(() =>
        Promise.resolve('https://example.com/img.jpg')
      );
      const node = CanvasRendererService.createImageNode(
        makeImage(),
        {},
        resolveSrc
      );
      expect(node).toBeInstanceOf(Konva.Group);
    });

    it('calls resolveSrc with the image src', () => {
      const resolveSrc = vi.fn(() => Promise.resolve(''));
      CanvasRendererService.createImageNode(makeImage(), {}, resolveSrc);
      expect(resolveSrc).toHaveBeenCalledWith('https://example.com/img.jpg');
    });

    it('calls warnLogger when resolveSrc rejects', async () => {
      const warnLogger = vi.fn();
      const resolveSrc = vi.fn(() => Promise.reject(new Error('fail')));
      CanvasRendererService.createImageNode(
        makeImage(),
        {},
        resolveSrc,
        warnLogger
      );
      // Allow microtask queue to flush
      await Promise.resolve();
      await Promise.resolve();
      expect(warnLogger).toHaveBeenCalled();
    });
  });

  // ─── with stage initialized ──────────────────────────────────────────────

  describe('with stage initialized', () => {
    let container: HTMLDivElement;

    beforeEach(() => {
      container = document.createElement('div');
      Object.defineProperty(container, 'clientWidth', {
        get: () => 800,
        configurable: true,
      });
      Object.defineProperty(container, 'clientHeight', {
        get: () => 600,
        configurable: true,
      });
      document.body.appendChild(container);
      class ResizeObserverMock {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      }
      vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    });

    afterEach(() => {
      service.destroyStage();
      container.remove();
      vi.unstubAllGlobals();
    });

    it('initStage creates a Konva.Stage', () => {
      service.initStage(container, [makeLayer()], [], null, makeHandlers());
      expect(service.stage).not.toBeNull();
    });

    it('initStage returns zoomLevel 1 when no savedViewport', () => {
      const result = service.initStage(
        container,
        [makeLayer()],
        [],
        null,
        makeHandlers()
      );
      expect(result.zoomLevel).toBe(1);
    });

    it('initStage creates a Konva.Transformer', () => {
      service.initStage(container, [makeLayer()], [], null, makeHandlers());
      expect(service.transformer).toBeInstanceOf(Konva.Transformer);
    });

    it('initStage creates a selection layer', () => {
      service.initStage(container, [makeLayer()], [], null, makeHandlers());
      expect(service.selectionLayer).toBeInstanceOf(Konva.Layer);
    });

    it('initStage creates a Konva.Layer per config layer', () => {
      service.initStage(container, [makeLayer()], [], null, makeHandlers());
      expect(service.konvaLayers.size).toBe(1);
      expect(service.konvaLayers.get('L1')).toBeInstanceOf(Konva.Layer);
    });

    it('initStage applies savedViewport zoom and position', () => {
      const result = service.initStage(
        container,
        [makeLayer()],
        [],
        { x: 10, y: 20, zoom: 1.5 },
        makeHandlers()
      );
      expect(result.zoomLevel).toBe(1.5);
      expect(service.stage!.x()).toBe(10);
      expect(service.stage!.y()).toBe(20);
    });

    it('initStage builds text objects into konvaNodes', () => {
      service.initStage(
        container,
        [makeLayer()],
        [makeText()],
        null,
        makeHandlers()
      );
      expect(service.konvaNodes.size).toBe(1);
      expect(service.konvaNodes.get('o1')).toBeInstanceOf(Konva.Text);
    });

    it('destroyStage clears stage, maps, transformer and selectionLayer', () => {
      service.initStage(container, [makeLayer()], [], null, makeHandlers());
      service.destroyStage();
      expect(service.stage).toBeNull();
      expect(service.konvaLayers.size).toBe(0);
      expect(service.konvaNodes.size).toBe(0);
      expect(service.transformer).toBeNull();
      expect(service.selectionLayer).toBeNull();
    });

    it('getViewportCenter returns stage-center when no pan', () => {
      service.initStage(container, [makeLayer()], [], null, makeHandlers());
      const center = service.getViewportCenter();
      expect(center.x).toBeCloseTo(400);
      expect(center.y).toBeCloseTo(300);
    });

    it('getCanvasPointerPosition returns null when stage has no pointer', () => {
      service.initStage(container, [makeLayer()], [], null, makeHandlers());
      expect(service.getCanvasPointerPosition()).toBeNull();
    });

    it('syncKonvaFromConfig updates layer visibility', () => {
      const layer = makeLayer({ visible: true });
      service.initStage(container, [layer], [], null, makeHandlers());
      service.syncKonvaFromConfig(
        [{ ...layer, visible: false }],
        [],
        null,
        makeHandlers()
      );
      expect(service.konvaLayers.get('L1')!.visible()).toBe(false);
    });

    it('syncKonvaFromConfig rebuilds when a new layer is added', () => {
      const layer = makeLayer();
      service.initStage(container, [layer], [], null, makeHandlers());
      const layer2 = makeLayer({ id: 'L2', name: 'Layer 2', order: 1 });
      service.syncKonvaFromConfig([layer, layer2], [], null, makeHandlers());
      expect(service.konvaLayers.size).toBe(2);
    });

    it('syncKonvaFromConfig does position-only update on second identical sync', () => {
      const layer = makeLayer();
      const obj = makeText();
      const handlers = makeHandlers();
      service.initStage(container, [layer], [obj], null, handlers);
      // First sync: populates render signatures
      service.syncKonvaFromConfig([layer], [obj], null, handlers);
      // Second sync: only position changed (not in render signature)
      service.syncKonvaFromConfig(
        [layer],
        [{ ...obj, x: 99, y: 88 }],
        null,
        handlers
      );
      const node = service.konvaNodes.get('o1')!;
      expect(node.x()).toBe(99);
      expect(node.y()).toBe(88);
    });

    it('rebuildAllKonvaNodes clears nodes when no objects provided', () => {
      const layer = makeLayer();
      service.initStage(container, [layer], [makeText()], null, makeHandlers());
      service.rebuildAllKonvaNodes([layer], [], null, makeHandlers());
      expect(service.konvaNodes.size).toBe(0);
    });

    it('rebuildAllKonvaNodes re-selects the selected node', () => {
      const layer = makeLayer();
      const obj = makeText();
      const handlers = makeHandlers();
      service.initStage(container, [layer], [obj], null, handlers);
      service.rebuildAllKonvaNodes([layer], [obj], 'o1', handlers);
      expect(handlers.onSelectKonvaNode).toHaveBeenCalled();
    });

    it('createKonvaNode click fires onSelect and onSelectKonvaNode', () => {
      const layer = makeLayer();
      const obj = makeText();
      const handlers = makeHandlers();
      service.initStage(container, [layer], [obj], null, handlers);
      const node = service.konvaNodes.get('o1')!;
      node.fire('click');
      expect(handlers.onSelect).toHaveBeenCalledWith('o1');
      expect(handlers.onSelectKonvaNode).toHaveBeenCalledWith(node);
    });

    it('createKonvaNode dragend fires onDragEnd with position', () => {
      const layer = makeLayer();
      const obj = makeText();
      const handlers = makeHandlers();
      service.initStage(container, [layer], [obj], null, handlers);
      const node = service.konvaNodes.get('o1')!;
      node.fire('dragend');
      expect(handlers.onDragEnd).toHaveBeenCalledWith(
        'o1',
        expect.any(Number),
        expect.any(Number)
      );
    });

    it('createKonvaNode transformend fires onTransformEnd', () => {
      const layer = makeLayer();
      const obj = makeText();
      const handlers = makeHandlers();
      service.initStage(container, [layer], [obj], null, handlers);
      const node = service.konvaNodes.get('o1')!;
      node.fire('transformend');
      expect(handlers.onTransformEnd).toHaveBeenCalled();
    });
  });
});
