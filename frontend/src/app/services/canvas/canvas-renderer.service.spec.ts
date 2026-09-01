import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type {
  CanvasFrame,
  CanvasImage,
  CanvasLayer,
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

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
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
      imports: [translocoTestProvider()],
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

  // ─── getObjectStructure (static) ─────────────────────────────────────────

  describe('getObjectStructure (static)', () => {
    it('keys images by source so a new source rebuilds the node', () => {
      expect(CanvasRendererService.getObjectStructure(makeImage())).toBe(
        'image:https://example.com/img.jpg'
      );
      expect(
        CanvasRendererService.getObjectStructure(
          makeImage({ src: 'media://other' })
        )
      ).toBe('image:media://other');
    });

    it('keys shapes by their variant', () => {
      expect(CanvasRendererService.getObjectStructure(makeShape('rect'))).toBe(
        'shape:rect'
      );
      expect(
        CanvasRendererService.getObjectStructure(makeShape('ellipse'))
      ).toBe('shape:ellipse');
    });

    it('distinguishes outlined ink from a stroked polyline', () => {
      expect(CanvasRendererService.getObjectStructure(makePath())).toBe(
        'path:line'
      );
      expect(
        CanvasRendererService.getObjectStructure(
          makePath({ pressures: [1, 0.5] })
        )
      ).toBe('path:ink');
    });

    it('is stable when only appearance changes', () => {
      expect(
        CanvasRendererService.getObjectStructure(makeText({ text: 'A' }))
      ).toBe(CanvasRendererService.getObjectStructure(makeText({ text: 'B' })));
      expect(
        CanvasRendererService.getObjectStructure(makePath({ stroke: '#f00' }))
      ).toBe(CanvasRendererService.getObjectStructure(makePath()));
    });

    it('distinguishes linked from plain pins', () => {
      expect(CanvasRendererService.getObjectStructure(makePin())).toBe(
        'pin:plain'
      );
      expect(
        CanvasRendererService.getObjectStructure(
          makePin({ linkedElementId: 'el-1' })
        )
      ).toBe('pin:linked:el-1');
      // Retargeting a link must rebuild the node so its handlers follow.
      expect(
        CanvasRendererService.getObjectStructure(
          makePin({ linkedElementId: 'el-2' })
        )
      ).not.toBe(
        CanvasRendererService.getObjectStructure(
          makePin({ linkedElementId: 'el-1' })
        )
      );
    });

    it('never makes background images draggable', () => {
      const calls: unknown[] = [];
      const node = {
        position: () => {},
        rotation: () => {},
        scale: () => {},
        visible: () => {},
        opacity: () => {},
        draggable: (v: boolean) => calls.push(v),
      } as unknown as Konva.Node;
      CanvasRendererService.applyCommonAttrs(
        node,
        makeImage({ isBackground: true, locked: false })
      );
      expect(calls).toEqual([false]);
    });

    it('distinguishes background from regular images', () => {
      expect(CanvasRendererService.getObjectStructure(makeImage())).not.toBe(
        CanvasRendererService.getObjectStructure(
          makeImage({ isBackground: true })
        )
      );
    });
  });

  // ─── pathAttrs (static) ──────────────────────────────────────────────────

  describe('pathAttrs (static)', () => {
    it('keeps a plain path stroked', () => {
      const attrs = CanvasRendererService.pathAttrs(
        makePath({ stroke: '#123456', strokeWidth: 3, tension: 0.4 })
      );
      expect(attrs.stroke).toBe('#123456');
      expect(attrs.strokeWidth).toBe(3);
      expect(attrs.tension).toBe(0.4);
      expect(attrs.closed).toBe(false);
      expect(attrs.fill).toBeUndefined();
    });

    it('gives thin strokes a generous hit area', () => {
      expect(
        CanvasRendererService.pathAttrs(makePath({ strokeWidth: 1 }))
          .hitStrokeWidth
      ).toBeGreaterThanOrEqual(12);
    });

    it('fills a closed path', () => {
      const attrs = CanvasRendererService.pathAttrs(
        makePath({ closed: true, fill: '#abcdef' })
      );
      expect(attrs.fill).toBe('#abcdef');
    });

    it('turns pressure ink into a filled outline', () => {
      const attrs = CanvasRendererService.pathAttrs(
        makePath({
          points: [0, 0, 50, 0],
          pressures: [1, 0.4],
          stroke: '#222222',
          strokeWidth: 8,
        })
      );
      expect(attrs.closed).toBe(true);
      expect(attrs.fill).toBe('#222222');
      expect(attrs.stroke).toBeUndefined();
      expect(attrs.strokeWidth).toBe(0);
      expect(attrs.points.length).toBeGreaterThan(4);
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
      expect(group.find('.linkBadge')).toHaveLength(1);
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

    it('keeps the same node when only style changes', () => {
      const layer = makeLayer();
      const obj = makePath();
      const handlers = makeHandlers();
      service.initStage(container, [layer], [obj], null, handlers);
      const before = service.konvaNodes.get('o1');

      service.syncKonvaFromConfig(
        [layer],
        [{ ...obj, stroke: '#ff0000', strokeWidth: 9 }],
        null,
        handlers
      );

      const after = service.konvaNodes.get('o1') as Konva.Line;
      expect(after).toBe(before);
      expect(after.stroke()).toBe('#ff0000');
      expect(after.strokeWidth()).toBe(9);
    });

    it('keeps the image node across edits so it does not reload', () => {
      const layer = makeLayer();
      const obj = makeImage();
      const handlers = makeHandlers();
      service.initStage(container, [layer], [obj], null, handlers);
      const before = service.konvaNodes.get('o1');

      service.syncKonvaFromConfig(
        [layer],
        [{ ...obj, width: 400, height: 300 }],
        null,
        handlers
      );

      expect(service.konvaNodes.get('o1')).toBe(before);
    });

    it('rebuilds the node when the image source changes', () => {
      const layer = makeLayer();
      const obj = makeImage();
      const handlers = makeHandlers();
      service.initStage(container, [layer], [obj], null, handlers);
      const before = service.konvaNodes.get('o1');

      service.syncKonvaFromConfig(
        [layer],
        [{ ...obj, src: 'https://example.com/other.png' }],
        null,
        handlers
      );

      expect(service.konvaNodes.get('o1')).not.toBe(before);
    });

    it('rebuilds the node when a shape changes variant', () => {
      const layer = makeLayer();
      const handlers = makeHandlers();
      service.initStage(
        container,
        [layer],
        [makeShape('rect')],
        null,
        handlers
      );
      const before = service.konvaNodes.get('o1');

      service.syncKonvaFromConfig(
        [layer],
        [makeShape('ellipse')],
        null,
        handlers
      );

      const after = service.konvaNodes.get('o1');
      expect(after).not.toBe(before);
      expect(after).toBeInstanceOf(Konva.Ellipse);
    });

    it('drops nodes for objects that were deleted', () => {
      const layer = makeLayer();
      const handlers = makeHandlers();
      service.initStage(container, [layer], [makeText()], null, handlers);

      service.syncKonvaFromConfig([layer], [], null, handlers);
      expect(service.konvaNodes.size).toBe(0);
    });

    it('moves a node when its object changes layer', () => {
      const layer = makeLayer();
      const layer2 = makeLayer({ id: 'L2', name: 'Layer 2', order: 1 });
      const obj = makeText();
      const handlers = makeHandlers();
      service.initStage(container, [layer], [obj], null, handlers);

      service.syncKonvaFromConfig(
        [layer, layer2],
        [{ ...obj, layerId: 'L2' }],
        null,
        handlers
      );

      const node = service.konvaNodes.get('o1');
      expect(node?.getLayer()).toBe(service.konvaLayers.get('L2'));
    });

    it('drops nodes that belonged to a deleted layer', () => {
      const layer = makeLayer();
      const handlers = makeHandlers();
      service.initStage(container, [layer], [makeText()], null, handlers);

      const other = makeLayer({ id: 'L2', name: 'Layer 2', order: 0 });
      service.syncKonvaFromConfig([other], [], null, handlers);

      expect(service.konvaNodes.size).toBe(0);
      expect(service.konvaLayers.has('L1')).toBe(false);
    });

    it('applies object opacity', () => {
      const layer = makeLayer();
      const obj = makeText();
      const handlers = makeHandlers();
      service.initStage(container, [layer], [obj], null, handlers);

      service.syncKonvaFromConfig(
        [layer],
        [{ ...obj, opacity: 0.4 }],
        null,
        handlers
      );

      expect(service.konvaNodes.get('o1')!.opacity()).toBe(0.4);
    });

    it('mirrors object array order into z-order', () => {
      const layer = makeLayer();
      const a = makeText({ id: 'a' });
      const b = makeText({ id: 'b' });
      const handlers = makeHandlers();
      service.initStage(container, [layer], [a, b], null, handlers);

      service.syncKonvaFromConfig([layer], [b, a], null, handlers);

      const nodeA = service.konvaNodes.get('a')!;
      const nodeB = service.konvaNodes.get('b')!;
      expect(nodeA.zIndex()).toBeGreaterThan(nodeB.zIndex());
    });

    it('keeps the preview layer above the content layers', () => {
      const layer = makeLayer();
      const handlers = makeHandlers();
      service.initStage(container, [layer], [], null, handlers);
      service.syncKonvaFromConfig([layer], [], null, handlers);

      const preview = service.previewLayer!;
      expect(preview.zIndex()).toBeGreaterThan(
        service.konvaLayers.get('L1')!.zIndex()
      );
      expect(service.selectionLayer!.zIndex()).toBeGreaterThan(
        preview.zIndex()
      );
    });

    it('setContentInteractive stops objects from taking pointer events', () => {
      const layer = makeLayer();
      const handlers = makeHandlers();
      service.initStage(container, [layer], [], null, handlers);

      service.setContentInteractive(false);
      expect(service.konvaLayers.get('L1')!.listening()).toBe(false);

      service.setContentInteractive(true);
      expect(service.konvaLayers.get('L1')!.listening()).toBe(true);
    });

    it('keeps locked layers unlistening when interactivity returns', () => {
      const layer = makeLayer({ locked: true });
      const handlers = makeHandlers();
      service.initStage(container, [layer], [], null, handlers);

      service.setContentInteractive(false);
      service.setContentInteractive(true);
      expect(service.konvaLayers.get('L1')!.listening()).toBe(false);
    });

    it('survives a sync while content is non-interactive', () => {
      const layer = makeLayer();
      const handlers = makeHandlers();
      service.initStage(container, [layer], [], null, handlers);
      service.setContentInteractive(false);

      service.syncKonvaFromConfig([layer], [makeText()], null, handlers);
      expect(service.konvaLayers.get('L1')!.listening()).toBe(false);
    });

    it('detaches a destroyed node from the transformer', () => {
      const layer = makeLayer();
      const obj = makeText();
      const handlers = makeHandlers();
      service.initStage(container, [layer], [obj], null, handlers);

      const node = service.konvaNodes.get('o1')!;
      service.transformer!.nodes([node]);

      service.syncKonvaFromConfig([layer], [], null, handlers);
      expect(service.transformer!.nodes()).toHaveLength(0);
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

    // ─── Annotations overlay, frames, links and gradients ──────────────────

    const makeFrame = (o: Partial<CanvasFrame> = {}): CanvasFrame => ({
      id: 'F1',
      name: 'Canvas',
      kind: 'canvas',
      x: 0,
      y: 0,
      width: 100,
      height: 80,
      visible: true,
      ...o,
    });

    const frameOpts = (
      o: Partial<{ viewMode: boolean; framesVisible: boolean }> = {}
    ) => ({
      viewMode: false,
      framesVisible: true,
      ...o,
    });

    it('routes pins onto the annotations overlay, not their layer', () => {
      service.initStage(
        container,
        [makeLayer()],
        [makePin()],
        null,
        makeHandlers()
      );
      const node = service.konvaNodes.get('o1')!;
      expect(node.getLayer()).toBe(service.annotationsLayer);
      expect(service.konvaLayers.get('L1')!.getChildren()).toHaveLength(0);
    });

    it('renders pins whose layer no longer exists', () => {
      service.initStage(container, [makeLayer()], [], null, makeHandlers());
      service.syncKonvaFromConfig(
        [makeLayer()],
        [makePin({ layerId: 'gone' })],
        null,
        makeHandlers()
      );
      expect(service.konvaNodes.get('o1')?.getLayer()).toBe(
        service.annotationsLayer
      );
    });

    it('keeps the annotations overlay above the artwork layers', () => {
      service.initStage(container, [makeLayer()], [], null, makeHandlers());
      service.syncKonvaFromConfig([makeLayer()], [], null, makeHandlers());
      const artwork = service.konvaLayers.get('L1')!.getZIndex();
      expect(service.annotationsLayer!.getZIndex()).toBeGreaterThan(artwork);
      expect(service.framesLayer!.getZIndex()).toBeGreaterThan(
        service.annotationsLayer!.getZIndex()
      );
    });

    it('setContentInteractive toggles the annotations overlay too', () => {
      service.initStage(container, [makeLayer()], [], null, makeHandlers());
      service.setContentInteractive(false);
      expect(service.annotationsLayer!.listening()).toBe(false);
      service.setContentInteractive(true);
      expect(service.annotationsLayer!.listening()).toBe(true);
    });

    it('rebuildAllKonvaNodes does not duplicate pins on the overlay', () => {
      const handlers = makeHandlers();
      service.initStage(container, [makeLayer()], [makePin()], null, handlers);
      service.rebuildAllKonvaNodes([makeLayer()], [makePin()], null, handlers);
      expect(service.annotationsLayer!.getChildren()).toHaveLength(1);
    });

    it('setInteractionLocked stops objects being draggable', () => {
      service.initStage(
        container,
        [makeLayer()],
        [makeText()],
        null,
        makeHandlers()
      );
      service.setInteractionLocked(true);
      expect(service.konvaNodes.get('o1')!.draggable()).toBe(false);

      // A sync while locked keeps them locked.
      service.syncKonvaFromConfig(
        [makeLayer()],
        [makeText()],
        null,
        makeHandlers()
      );
      expect(service.konvaNodes.get('o1')!.draggable()).toBe(false);
    });

    it('syncFrames draws frames and reconciles removals', () => {
      service.initStage(container, [makeLayer()], [], null, makeHandlers());
      service.syncFrames(
        [makeFrame(), makeFrame({ id: 'F2', kind: 'crop' })],
        frameOpts()
      );
      expect(service.framesLayer!.getChildren()).toHaveLength(2);

      service.syncFrames([makeFrame()], frameOpts());
      expect(service.framesLayer!.getChildren()).toHaveLength(1);

      service.syncFrames(undefined, frameOpts());
      expect(service.framesLayer!.getChildren()).toHaveLength(0);
    });

    it('styles the canvas-size frame solid and crop frames dashed', () => {
      service.initStage(container, [makeLayer()], [], null, makeHandlers());
      service.syncFrames(
        [makeFrame(), makeFrame({ id: 'F2', kind: 'crop' })],
        frameOpts()
      );
      const [canvasGroup, cropGroup] = service.framesLayer!.getChildren();
      const canvasRect = (canvasGroup as Konva.Group).findOne<Konva.Rect>(
        '.frameRect'
      )!;
      const cropRect = (cropGroup as Konva.Group).findOne<Konva.Rect>(
        '.frameRect'
      )!;
      expect(canvasRect.dash()).toEqual([]);
      expect(canvasRect.strokeScaleEnabled()).toBe(false);
      expect(cropRect.dash()).toEqual([6, 4]);
    });

    it('hides frames per-frame, globally, and in view mode', () => {
      service.initStage(container, [makeLayer()], [], null, makeHandlers());
      const frames = [makeFrame(), makeFrame({ id: 'F2', kind: 'crop' })];

      service.syncFrames(frames, frameOpts({ framesVisible: false }));
      for (const group of service.framesLayer!.getChildren()) {
        expect(group.visible()).toBe(false);
      }

      // View mode keeps the page border but hides crop frames.
      service.syncFrames(frames, frameOpts({ viewMode: true }));
      const [canvasGroup, cropGroup] = service.framesLayer!.getChildren();
      expect(canvasGroup.visible()).toBe(true);
      expect(cropGroup.visible()).toBe(false);

      service.syncFrames([makeFrame({ visible: false })], frameOpts());
      expect(service.framesLayer!.getChildren()[0].visible()).toBe(false);
    });

    it('counter-scales frame labels against the stage zoom', () => {
      service.initStage(container, [makeLayer()], [], null, makeHandlers());
      service.syncFrames([makeFrame()], frameOpts());
      service.stage!.scale({ x: 2, y: 2 });
      service.updateFrameOverlayScale(2);

      const label = (
        service.framesLayer!.getChildren()[0] as Konva.Group
      ).findOne<Konva.Label>('.frameLabel')!;
      expect(label.scaleX()).toBeCloseTo(0.5);
    });

    it('setFrameEditing attaches a transformer and commits geometry', () => {
      service.initStage(container, [makeLayer()], [], null, makeHandlers());
      service.syncFrames([makeFrame()], frameOpts());

      const onChange = vi.fn();
      service.setFrameEditing('F1', onChange);
      expect(service.framesLayer!.listening()).toBe(true);

      const group = service.framesLayer!.getChildren()[0] as Konva.Group;
      const rect = group.findOne<Konva.Rect>('.frameRect')!;
      expect(rect.draggable()).toBe(true);

      rect.position({ x: 10, y: 5 });
      rect.scale({ x: 2, y: 1 });
      rect.fire('transformend');

      expect(onChange).toHaveBeenCalledWith('F1', {
        x: 10,
        y: 5,
        width: 200,
        height: 80,
      });
      // Scale is normalized back into width/height.
      expect(rect.scaleX()).toBe(1);
    });

    it('editing frames are grabbed by their border only', () => {
      service.initStage(container, [makeLayer()], [], null, makeHandlers());
      service.syncFrames([makeFrame()], frameOpts());
      service.setFrameEditing('F1', vi.fn());

      const rect = (
        service.framesLayer!.getChildren()[0] as Konva.Group
      ).findOne<Konva.Rect>('.frameRect')!;
      // A filled hit area would sit above every object inside the frame.
      expect(rect.fillEnabled()).toBe(false);
      expect(rect.hitStrokeWidth()).toBeGreaterThan(0);
    });

    it('a creation tool switches the editing frame off the hit graph', () => {
      service.initStage(container, [makeLayer()], [], null, makeHandlers());
      service.syncFrames([makeFrame()], frameOpts());
      service.setFrameEditing('F1', vi.fn());
      expect(service.framesLayer!.listening()).toBe(true);

      service.setContentInteractive(false);
      expect(service.framesLayer!.listening()).toBe(false);
      service.setContentInteractive(true);
      expect(service.framesLayer!.listening()).toBe(true);
    });

    it('re-selecting the same frame keeps the existing transformer', () => {
      service.initStage(container, [makeLayer()], [], null, makeHandlers());
      service.syncFrames([makeFrame()], frameOpts());
      service.setFrameEditing('F1', vi.fn());
      const before = service.framesLayer!.findOne('Transformer');
      service.setFrameEditing('F1', vi.fn());
      expect(service.framesLayer!.findOne('Transformer')).toBe(before);
    });

    it('setFrameEditing(null) tears the editing state down', () => {
      service.initStage(container, [makeLayer()], [], null, makeHandlers());
      service.syncFrames([makeFrame()], frameOpts());
      service.setFrameEditing('F1', vi.fn());
      service.setFrameEditing(null);

      const rect = (
        service.framesLayer!.getChildren()[0] as Konva.Group
      ).findOne<Konva.Rect>('.frameRect')!;
      expect(rect.draggable()).toBe(false);
      expect(service.framesLayer!.listening()).toBe(false);
    });

    it('setFrameEditing ignores unknown frames', () => {
      service.initStage(container, [makeLayer()], [], null, makeHandlers());
      service.syncFrames([makeFrame()], frameOpts());
      expect(() => service.setFrameEditing('nope', vi.fn())).not.toThrow();
      expect(service.framesLayer!.listening()).toBe(false);
    });

    it('opens the linked element on double-click for pins and shapes', () => {
      const handlers = makeHandlers();
      handlers.onOpenLinkedObject = vi.fn();
      const pin = makePin({ id: 'p1', linkedElementId: 'el-1' });
      const shape: CanvasShape = {
        ...makeShape('rect'),
        id: 's1',
        linkedElementId: 'el-1',
      };
      service.initStage(container, [makeLayer()], [pin, shape], null, handlers);

      service.konvaNodes.get('p1')!.fire('dblclick');
      service.konvaNodes.get('s1')!.fire('dblclick');
      expect(handlers.onOpenLinkedObject).toHaveBeenCalledTimes(2);
    });

    it('does not wire link interactions on unlinked objects', () => {
      const handlers = makeHandlers();
      handlers.onOpenLinkedObject = vi.fn();
      service.initStage(
        container,
        [makeLayer()],
        [makePin({ id: 'p1' })],
        null,
        handlers
      );
      service.konvaNodes.get('p1')!.fire('dblclick');
      expect(handlers.onOpenLinkedObject).not.toHaveBeenCalled();
    });

    it('shows and clears a hover label for a linked object', () => {
      const handlers = makeHandlers();
      handlers.getElementName = vi.fn(() => 'Kingdom of Veyra');
      const pin = makePin({ id: 'p1', linkedElementId: 'el-1' });
      service.initStage(container, [makeLayer()], [pin], null, handlers);

      // Hover labels are positioned from the pointer; give the stage one.
      service.stage!.setPointersPositions({
        clientX: 10,
        clientY: 10,
      });

      service.konvaNodes.get('p1')!.fire('mouseenter');
      const label =
        service.previewLayer!.findOne<Konva.Label>('.linkHoverLabel');
      expect(label).toBeDefined();
      expect(label!.getText().text()).toBe('Kingdom of Veyra');

      service.konvaNodes.get('p1')!.fire('mouseleave');
      expect(service.previewLayer!.findOne('.linkHoverLabel')).toBeUndefined();
    });

    it('applies solid, linear and radial shape fills', () => {
      service.initStage(container, [makeLayer()], [], null, makeHandlers());

      const solid: CanvasShape = { ...makeShape('rect'), fill: '#ff0000' };
      const node = CanvasRendererService.createShapeNode(solid, {});
      expect(node.fill()).toBe('#ff0000');

      const linear: CanvasShape = {
        ...makeShape('rect'),
        fill: 'linear-gradient(90deg, #ff0000 0%, #0000ff 100%)',
      };
      CanvasRendererService.applyShapeFill(node, linear);
      expect(node.fillPriority()).toBe('linear-gradient');
      expect(node.fillLinearGradientColorStops()).toEqual([
        0,
        '#ff0000',
        1,
        '#0000ff',
      ]);

      const radial: CanvasShape = {
        ...makeShape('ellipse'),
        fill: 'radial-gradient(#fff 0%, #000 100%)',
      };
      CanvasRendererService.applyShapeFill(node, radial);
      expect(node.fillPriority()).toBe('radial-gradient');
      expect(node.fillRadialGradientColorStops()).toHaveLength(4);

      // Falling back to a plain colour clears the gradient stops.
      CanvasRendererService.applyShapeFill(node, solid);
      expect(node.fillPriority()).toBe('color');
      expect(node.fillLinearGradientColorStops()).toBeUndefined();
    });

    it('background images are non-listening and sort below their siblings', () => {
      const background = makeImage({ id: 'bg', isBackground: true });
      const text = makeText({ id: 'fg' });
      // Background last in the array — z-order must still put it first.
      service.initStage(
        container,
        [makeLayer()],
        [text, background],
        null,
        makeHandlers()
      );
      service.syncKonvaFromConfig(
        [makeLayer()],
        [text, background],
        null,
        makeHandlers()
      );

      const children = service.konvaLayers.get('L1')!.getChildren();
      expect(children[0]).toBe(service.konvaNodes.get('bg'));
      expect(service.konvaNodes.get('bg')!.listening()).toBe(false);
      expect(service.konvaNodes.get('bg')!.draggable()).toBe(false);
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
