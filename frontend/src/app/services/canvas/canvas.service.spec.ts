import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type Element, ElementType } from '@inkweld/index';
import {
  applyCanvasEdit,
  type CanvasContents,
  type CanvasEdit,
  emptyCanvasContents,
} from '@models/canvas-edit';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import {
  type CanvasPin,
  type CanvasText,
  createDefaultCanvasConfig,
} from '../../models/canvas.model';
import { LoggerService } from '../core/logger.service';
import { ProjectStateService } from '../project/project-state.service';
import { CanvasService } from './canvas.service';

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeElement(overrides: Partial<Element> = {}): Element {
  return {
    id: 'canvas-1',
    name: 'Test Canvas',
    type: ElementType.Canvas,
    parentId: null,
    order: 0,
    level: 0,
    expandable: false,
    version: 1,
    metadata: {},
    ...overrides,
  };
}

function makeTextObject(overrides: Partial<CanvasText> = {}): CanvasText {
  return {
    id: 'obj-text-1',
    layerId: 'layer-1',
    type: 'text',
    x: 100,
    y: 200,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    visible: true,
    locked: false,
    text: 'Hello',
    fontSize: 16,
    fontFamily: 'Arial',
    fontStyle: 'normal',
    fill: '#000000',
    width: 200,
    align: 'left',
    ...overrides,
  };
}

function makePinObject(overrides: Partial<CanvasPin> = {}): CanvasPin {
  return {
    id: 'obj-pin-1',
    layerId: 'layer-1',
    type: 'pin',
    x: 50,
    y: 75,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    visible: true,
    locked: false,
    label: 'Test Pin',
    icon: 'place',
    color: '#E53935',
    ...overrides,
  };
}

/** Find a localStorage key by substring (keys are context-prefixed). */
function findStorageKey(fragment: string): string | undefined {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.includes(fragment)) return key;
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('CanvasService', () => {
  let service: CanvasService;
  const mockElements = signal<Element[]>([]);

  /**
   * Stand-in for the sync provider's canvas store: keeps contents per element
   * and exposes a stream so remote edits can be simulated.
   */
  const canvasStore = new Map<string, CanvasContents>();
  const canvasStreams = new Map<string, Subject<CanvasContents>>();

  function canvasStream(elementId: string): Subject<CanvasContents> {
    const existing = canvasStreams.get(elementId);
    if (existing) return existing;
    const subject = new Subject<CanvasContents>();
    canvasStreams.set(elementId, subject);
    return subject;
  }

  const mockProjectState = {
    elements: mockElements,
    updateElementMetadata: vi.fn(),
    project: vi.fn(() => null),
    getCanvasContents: vi.fn(
      (elementId: string) => canvasStore.get(elementId) ?? null
    ),
    canvasContents$: vi.fn((elementId: string) =>
      canvasStream(elementId).asObservable()
    ),
    applyCanvasEdit: vi.fn((elementId: string, edit: CanvasEdit) => {
      canvasStore.set(
        elementId,
        applyCanvasEdit(
          canvasStore.get(elementId) ?? emptyCanvasContents(),
          edit
        )
      );
    }),
    seedCanvasContents: vi.fn((elementId: string, contents: CanvasContents) => {
      if (!canvasStore.has(elementId)) canvasStore.set(elementId, contents);
    }),
  };

  const mockLogger = {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [translocoTestProvider()],
      providers: [
        CanvasService,
        { provide: ProjectStateService, useValue: mockProjectState },
        { provide: LoggerService, useValue: mockLogger },
      ],
    });

    service = TestBed.inject(CanvasService);
    mockElements.set([]);
    canvasStore.clear();
    canvasStreams.clear();
    vi.clearAllMocks();
    localStorage.clear();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // loadConfig
  // ─────────────────────────────────────────────────────────────────────────

  describe('loadConfig', () => {
    it('should create default config when element has no metadata', () => {
      mockElements.set([makeElement({ id: 'canvas-1' })]);
      const config = service.loadConfig('canvas-1');

      expect(config.elementId).toBe('canvas-1');
      expect(config.layers).toHaveLength(1);
      expect(config.layers[0].name).toBe('Layer 1');
      expect(config.objects).toHaveLength(0);
    });

    it('should create default config when element is not found', () => {
      mockElements.set([]);
      const config = service.loadConfig('missing-id');

      expect(config.elementId).toBe('missing-id');
      expect(config.layers).toHaveLength(1);
    });

    it('should restore config from element metadata', () => {
      const savedConfig = {
        layers: [
          {
            id: 'l1',
            name: 'Background',
            visible: true,
            locked: false,
            opacity: 1,
            order: 0,
          },
          {
            id: 'l2',
            name: 'Foreground',
            visible: true,
            locked: false,
            opacity: 0.8,
            order: 1,
          },
        ],
        objects: [makeTextObject({ layerId: 'l1' })],
      };

      mockElements.set([
        makeElement({
          id: 'canvas-1',
          metadata: { canvasConfig: JSON.stringify(savedConfig) },
        }),
      ]);

      const config = service.loadConfig('canvas-1');

      expect(config.elementId).toBe('canvas-1');
      expect(config.layers).toHaveLength(2);
      expect(config.layers[1].name).toBe('Foreground');
      expect(config.objects).toHaveLength(1);
    });

    it('should fallback to defaults when metadata is corrupt JSON', () => {
      mockElements.set([
        makeElement({
          id: 'canvas-1',
          metadata: { canvasConfig: 'NOT_VALID_JSON{{' },
        }),
      ]);

      const config = service.loadConfig('canvas-1');

      expect(config.elementId).toBe('canvas-1');
      expect(config.layers).toHaveLength(1);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should restore defaults for empty layers array in metadata', () => {
      const savedConfig = { layers: [], objects: [] };
      mockElements.set([
        makeElement({
          id: 'canvas-1',
          metadata: { canvasConfig: JSON.stringify(savedConfig) },
        }),
      ]);

      const config = service.loadConfig('canvas-1');

      // Should fill in default layer when array was empty
      expect(config.layers.length).toBeGreaterThanOrEqual(1);
    });

    it('should set the active config signal', () => {
      mockElements.set([makeElement({ id: 'canvas-1' })]);
      service.loadConfig('canvas-1');

      const active = service.activeConfig();
      expect(active).not.toBeNull();
      expect(active!.elementId).toBe('canvas-1');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // saveConfig
  // ─────────────────────────────────────────────────────────────────────────

  describe('saveConfig', () => {
    it('should send the change to the sync provider', () => {
      const config = createDefaultCanvasConfig('canvas-1');
      service.saveConfig(config);

      expect(mockProjectState.applyCanvasEdit).toHaveBeenCalledWith(
        'canvas-1',
        expect.objectContaining({ layers: config.layers })
      );
    });

    it('should update the active config signal', () => {
      const config = createDefaultCanvasConfig('canvas-1');
      service.saveConfig(config);

      expect(service.activeConfig()).toEqual(config);
    });

    it('should not write the whole canvas back on every edit', () => {
      mockElements.set([makeElement({ id: 'canvas-1' })]);
      service.loadConfig('canvas-1');
      service.addObject(makeTextObject({ id: 'a' }));
      service.addObject(makeTextObject({ id: 'b' }));
      mockProjectState.applyCanvasEdit.mockClear();

      service.updateObject('a', { x: 40 });

      const edit = mockProjectState.applyCanvasEdit.mock.calls[0][1];
      expect(edit.upserts?.map(o => o.id)).toEqual(['a']);
      expect(edit.deletes).toBeUndefined();
      expect(edit.layers).toBeUndefined();
    });

    it('should not touch element metadata', () => {
      service.saveConfig(createDefaultCanvasConfig('canvas-1'));
      expect(mockProjectState.updateElementMetadata).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Remote sync (regression: canvas edits from other users must appear live)
  // ─────────────────────────────────────────────────────────────────────────

  describe('remote sync', () => {
    function layer(name: string) {
      return {
        id: `l-${name}`,
        name,
        visible: true,
        locked: false,
        opacity: 1,
        order: 0,
      };
    }

    it('adopts contents pushed by another collaborator', () => {
      mockElements.set([makeElement({ id: 'canvas-1' })]);
      service.loadConfig('canvas-1');

      canvasStream('canvas-1').next({
        layers: [layer('Theirs')],
        objects: [makeTextObject({ id: 'remote-1' })],
      });

      expect(service.activeConfig()!.layers[0].name).toBe('Theirs');
      expect(service.activeConfig()!.objects.map(o => o.id)).toEqual([
        'remote-1',
      ]);
    });

    it('keeps a remote object when the next local edit is sent', () => {
      mockElements.set([makeElement({ id: 'canvas-1' })]);
      service.loadConfig('canvas-1');

      canvasStream('canvas-1').next({
        layers: [layer('Shared')],
        objects: [makeTextObject({ id: 'theirs' })],
      });
      mockProjectState.applyCanvasEdit.mockClear();

      service.addObject(makeTextObject({ id: 'mine' }));

      // Only our own object is sent — theirs is left alone rather than being
      // rewritten (and potentially clobbered) as part of a whole-canvas save.
      const edit = mockProjectState.applyCanvasEdit.mock.calls[0][1];
      expect(edit.upserts?.map(o => o.id)).toEqual(['mine']);
      expect(edit.deletes).toBeUndefined();
      expect(service.activeConfig()!.objects.map(o => o.id)).toEqual([
        'theirs',
        'mine',
      ]);
    });

    it('drops the undo history when remote work lands', () => {
      mockElements.set([makeElement({ id: 'canvas-1' })]);
      service.loadConfig('canvas-1');
      service.addObject(makeTextObject({ id: 'a' }));
      service.undo();
      expect(service.canRedo()).toBe(true);

      canvasStream('canvas-1').next({
        layers: [layer('Shared')],
        objects: [makeTextObject({ id: 'theirs' })],
      });

      // Every snapshot predates the remote change, so replaying one would
      // delete work the other author just added.
      expect(service.canRedo()).toBe(false);
      expect(service.canUndo()).toBe(false);
    });

    it('ignores updates for a canvas that is no longer bound', () => {
      mockElements.set([
        makeElement({ id: 'canvas-1' }),
        makeElement({ id: 'canvas-2', name: 'Second' }),
      ]);
      service.loadConfig('canvas-1');
      const stale = canvasStream('canvas-1');

      service.loadConfig('canvas-2');
      stale.next({ layers: [layer('Stale')], objects: [] });

      expect(service.activeConfig()!.elementId).toBe('canvas-2');
      expect(service.activeConfig()!.layers.some(l => l.name === 'Stale')).toBe(
        false
      );
    });

    it('waits for the project before deciding a canvas is empty', () => {
      // Canvas tab opens before the project's elements have loaded.
      mockElements.set([]);
      const config = service.loadConfig('canvas-1');
      expect(config.objects).toHaveLength(0);
      expect(mockProjectState.seedCanvasContents).not.toHaveBeenCalled();

      // Elements arrive; only now is the canvas read (and seeded if needed).
      mockElements.set([
        makeElement({
          id: 'canvas-1',
          metadata: {
            canvasConfig: JSON.stringify({
              layers: [layer('Loaded')],
              objects: [makeTextObject({ id: 'late' })],
            }),
          },
        }),
      ]);
      TestBed.flushEffects();

      expect(service.activeConfig()!.objects.map(o => o.id)).toEqual(['late']);
      expect(mockProjectState.seedCanvasContents).toHaveBeenCalled();
    });

    it('seeds a canvas from the legacy metadata blob on first open', () => {
      mockElements.set([
        makeElement({
          id: 'canvas-1',
          metadata: {
            canvasConfig: JSON.stringify({
              layers: [layer('Imported')],
              objects: [makeTextObject({ id: 'legacy' })],
            }),
          },
        }),
      ]);

      const config = service.loadConfig('canvas-1');

      expect(config.layers[0].name).toBe('Imported');
      expect(config.objects.map(o => o.id)).toEqual(['legacy']);
      expect(mockProjectState.seedCanvasContents).toHaveBeenCalledWith(
        'canvas-1',
        expect.objectContaining({ objects: expect.any(Array) })
      );
    });

    it('prefers synced contents over the legacy blob', () => {
      canvasStore.set('canvas-1', {
        layers: [layer('Synced')],
        objects: [],
      });
      mockElements.set([
        makeElement({
          id: 'canvas-1',
          metadata: {
            canvasConfig: JSON.stringify({
              layers: [layer('Legacy')],
              objects: [],
            }),
          },
        }),
      ]);

      expect(service.loadConfig('canvas-1').layers[0].name).toBe('Synced');
      expect(mockProjectState.seedCanvasContents).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Layer Operations
  // ─────────────────────────────────────────────────────────────────────────

  describe('addLayer', () => {
    it('should add a new layer and return its ID', () => {
      mockElements.set([makeElement()]);
      service.loadConfig('canvas-1');

      const layerId = service.addLayer('My Layer');

      expect(layerId).toBeTruthy();
      const config = service.activeConfig()!;
      expect(config.layers).toHaveLength(2);
      expect(config.layers[1].name).toBe('My Layer');
    });

    it('should auto-name layers when no name provided', () => {
      mockElements.set([makeElement()]);
      service.loadConfig('canvas-1');

      service.addLayer();

      const config = service.activeConfig()!;
      expect(config.layers[1].name).toBe('Layer 2');
    });

    it('should assign correct order to new layers', () => {
      mockElements.set([makeElement()]);
      service.loadConfig('canvas-1');

      service.addLayer('Second');
      service.addLayer('Third');

      const config = service.activeConfig()!;
      expect(config.layers[0].order).toBe(0);
      expect(config.layers[1].order).toBe(1);
      expect(config.layers[2].order).toBe(2);
    });

    it('should return empty string if no config loaded', () => {
      const result = service.addLayer();
      expect(result).toBe('');
    });
  });

  describe('removeLayer', () => {
    it('should remove a layer and its objects', () => {
      mockElements.set([makeElement()]);
      service.loadConfig('canvas-1');
      const newLayerId = service.addLayer('Layer 2');

      const textObj = makeTextObject({ layerId: newLayerId });
      service.addObject(textObj);

      service.removeLayer(newLayerId);

      const config = service.activeConfig()!;
      expect(config.layers).toHaveLength(1);
      expect(config.objects).toHaveLength(0);
    });

    it('should not remove the last remaining layer', () => {
      mockElements.set([makeElement()]);
      service.loadConfig('canvas-1');
      const layerId = service.activeConfig()!.layers[0].id;

      service.removeLayer(layerId);

      const config = service.activeConfig()!;
      expect(config.layers).toHaveLength(1);
    });

    it('should do nothing if no config loaded', () => {
      expect(() => service.removeLayer('nonexistent')).not.toThrow();
    });
  });

  describe('updateLayer', () => {
    it('should update layer properties', () => {
      mockElements.set([makeElement()]);
      service.loadConfig('canvas-1');
      const layerId = service.activeConfig()!.layers[0].id;

      service.updateLayer(layerId, { name: 'Renamed', opacity: 0.5 });

      const config = service.activeConfig()!;
      expect(config.layers[0].name).toBe('Renamed');
      expect(config.layers[0].opacity).toBe(0.5);
    });

    it('should preserve the layer ID even if update tries to change it', () => {
      mockElements.set([makeElement()]);
      service.loadConfig('canvas-1');
      const originalId = service.activeConfig()!.layers[0].id;

      service.updateLayer(originalId, { id: 'hacked-id' });

      expect(service.activeConfig()!.layers[0].id).toBe(originalId);
    });
  });

  describe('reorderLayers', () => {
    it('should reorder layers by given ID sequence', () => {
      mockElements.set([makeElement()]);
      service.loadConfig('canvas-1');
      const id1 = service.activeConfig()!.layers[0].id;
      const id2 = service.addLayer('Second');
      const id3 = service.addLayer('Third');

      // Reverse order
      service.reorderLayers([id3, id2, id1]);

      const sorted = service.getSortedLayers();
      expect(sorted[0].id).toBe(id3);
      expect(sorted[1].id).toBe(id2);
      expect(sorted[2].id).toBe(id1);
    });
  });

  describe('getSortedLayers', () => {
    it('should return layers sorted by order ascending', () => {
      mockElements.set([makeElement()]);
      service.loadConfig('canvas-1');
      service.addLayer('Second');
      service.addLayer('Third');

      const sorted = service.getSortedLayers();

      expect(sorted).toHaveLength(3);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].order).toBeGreaterThan(sorted[i - 1].order);
      }
    });

    it('should return empty array when no config loaded', () => {
      expect(service.getSortedLayers()).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Object Operations
  // ─────────────────────────────────────────────────────────────────────────

  describe('addObject', () => {
    it('should add an object to the config', () => {
      mockElements.set([makeElement()]);
      service.loadConfig('canvas-1');

      const obj = makeTextObject();
      service.addObject(obj);

      const config = service.activeConfig()!;
      expect(config.objects).toHaveLength(1);
      expect(config.objects[0].id).toBe('obj-text-1');
    });

    it('should do nothing if no config loaded', () => {
      expect(() => service.addObject(makeTextObject())).not.toThrow();
    });
  });

  describe('removeObject', () => {
    it('should remove an object by ID', () => {
      mockElements.set([makeElement()]);
      service.loadConfig('canvas-1');

      service.addObject(makeTextObject({ id: 'obj-1' }));
      service.addObject(makePinObject({ id: 'obj-2' }));

      service.removeObject('obj-1');

      const config = service.activeConfig()!;
      expect(config.objects).toHaveLength(1);
      expect(config.objects[0].id).toBe('obj-2');
    });
  });

  describe('updateObject', () => {
    it('should partially update an object', () => {
      mockElements.set([makeElement()]);
      service.loadConfig('canvas-1');
      service.addObject(makeTextObject({ id: 'obj-1' }));

      service.updateObject('obj-1', { x: 500, y: 600 });

      const obj = service.activeConfig()!.objects[0];
      expect(obj.x).toBe(500);
      expect(obj.y).toBe(600);
      expect(obj.type).toBe('text'); // unchanged
    });

    it('should preserve the object ID', () => {
      mockElements.set([makeElement()]);
      service.loadConfig('canvas-1');
      service.addObject(makeTextObject({ id: 'obj-1' }));

      service.updateObject('obj-1', { id: 'hacked' });

      expect(service.activeConfig()!.objects[0].id).toBe('obj-1');
    });
  });

  describe('moveObjectToLayer', () => {
    it('should change the layerId of an object', () => {
      mockElements.set([makeElement()]);
      service.loadConfig('canvas-1');
      const newLayerId = service.addLayer('Layer 2');

      service.addObject(makeTextObject({ id: 'obj-1' }));
      service.moveObjectToLayer('obj-1', newLayerId);

      expect(service.activeConfig()!.objects[0].layerId).toBe(newLayerId);
    });
  });

  describe('getObjectsForLayer', () => {
    it('should filter objects by layer ID', () => {
      mockElements.set([makeElement()]);
      service.loadConfig('canvas-1');
      const layer1 = service.activeConfig()!.layers[0].id;
      const layer2 = service.addLayer('Layer 2');

      service.addObject(makeTextObject({ id: 'obj-1', layerId: layer1 }));
      service.addObject(makePinObject({ id: 'obj-2', layerId: layer2 }));
      service.addObject(makeTextObject({ id: 'obj-3', layerId: layer1 }));

      const layer1Objects = service.getObjectsForLayer(layer1);
      expect(layer1Objects).toHaveLength(2);
      expect(layer1Objects.map(o => o.id)).toEqual(['obj-1', 'obj-3']);

      const layer2Objects = service.getObjectsForLayer(layer2);
      expect(layer2Objects).toHaveLength(1);
    });

    it('should return empty array when no config loaded', () => {
      expect(service.getObjectsForLayer('any')).toEqual([]);
    });
  });

  describe('updateObjectPositions', () => {
    it('should batch-update positions for multiple objects', () => {
      mockElements.set([makeElement()]);
      service.loadConfig('canvas-1');
      service.addObject(makeTextObject({ id: 'obj-1', x: 0, y: 0 }));
      service.addObject(makePinObject({ id: 'obj-2', x: 0, y: 0 }));

      service.updateObjectPositions([
        { id: 'obj-1', x: 100, y: 200 },
        { id: 'obj-2', x: 300, y: 400 },
      ]);

      const objects = service.activeConfig()!.objects;
      expect(objects[0].x).toBe(100);
      expect(objects[0].y).toBe(200);
      expect(objects[1].x).toBe(300);
      expect(objects[1].y).toBe(400);
    });
  });

  describe('reorderObject', () => {
    const setupReorderFixture = (): { layer1: string; layer2: string } => {
      mockElements.set([makeElement()]);
      service.loadConfig('canvas-1');
      const layer1 = service.activeConfig()!.layers[0].id;
      const layer2 = service.addLayer('Layer 2');
      service.addObject(makeTextObject({ id: 'a', layerId: layer1 }));
      service.addObject(makeTextObject({ id: 'b', layerId: layer1 }));
      service.addObject(makeTextObject({ id: 'x', layerId: layer2 }));
      service.addObject(makeTextObject({ id: 'c', layerId: layer1 }));
      return { layer1, layer2 };
    };

    it('moves object forward within its layer (skips other layers)', () => {
      setupReorderFixture();
      service.reorderObject('a', 'forward');
      const ids = service.activeConfig()!.objects.map(o => o.id);
      expect(ids).toEqual(['b', 'a', 'x', 'c']);
    });

    it('moves object backward within its layer', () => {
      setupReorderFixture();
      service.reorderObject('c', 'backward');
      const ids = service.activeConfig()!.objects.map(o => o.id);
      expect(ids).toEqual(['a', 'c', 'x', 'b']);
    });

    it('sends object to back of its layer', () => {
      setupReorderFixture();
      service.reorderObject('c', 'back');
      const ids = service.activeConfig()!.objects.map(o => o.id);
      expect(ids).toEqual(['c', 'a', 'b', 'x']);
    });

    it('brings object to front of its layer', () => {
      setupReorderFixture();
      service.reorderObject('a', 'front');
      const ids = service.activeConfig()!.objects.map(o => o.id);
      expect(ids).toEqual(['b', 'x', 'c', 'a']);
    });

    it('is a no-op at the front edge', () => {
      setupReorderFixture();
      const before = service.activeConfig()!.objects.map(o => o.id);
      service.reorderObject('c', 'forward');
      service.reorderObject('c', 'front');
      expect(service.activeConfig()!.objects.map(o => o.id)).toEqual(before);
    });

    it('is a no-op at the back edge', () => {
      setupReorderFixture();
      const before = service.activeConfig()!.objects.map(o => o.id);
      service.reorderObject('a', 'backward');
      service.reorderObject('a', 'back');
      expect(service.activeConfig()!.objects.map(o => o.id)).toEqual(before);
    });

    it('does nothing for unknown object id', () => {
      setupReorderFixture();
      const before = service.activeConfig()!.objects.map(o => o.id);
      service.reorderObject('nope', 'front');
      expect(service.activeConfig()!.objects.map(o => o.id)).toEqual(before);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Pin Helpers
  // ─────────────────────────────────────────────────────────────────────────

  describe('createPin', () => {
    it('should create a default pin object', () => {
      const pin = service.createPin('layer-1', 10, 20, 'My Pin');

      expect(pin.type).toBe('pin');
      expect(pin.layerId).toBe('layer-1');
      expect(pin.x).toBe(10);
      expect(pin.y).toBe(20);
      expect((pin as CanvasPin).label).toBe('My Pin');
      expect((pin as CanvasPin).color).toBe('#E53935');
      expect((pin as CanvasPin).icon).toBe('place');
    });

    it('should accept custom color and icon', () => {
      const pin = service.createPin('l1', 0, 0, 'Custom', {
        color: '#00FF00',
        icon: 'star',
      });

      expect((pin as CanvasPin).color).toBe('#00FF00');
      expect((pin as CanvasPin).icon).toBe('star');
    });

    it('should accept linkedElementId', () => {
      const pin = service.createPin('l1', 5, 10, 'Linked Pin', {
        linkedElementId: 'element-abc',
      });

      expect((pin as CanvasPin).linkedElementId).toBe('element-abc');
    });

    it('should leave linkedElementId undefined when not provided', () => {
      const pin = service.createPin('l1', 0, 0, 'No Link');

      expect((pin as CanvasPin).linkedElementId).toBeUndefined();
    });

    it('should accept relationshipId', () => {
      const pin = service.createPin('l1', 5, 10, 'Linked Pin', {
        linkedElementId: 'element-abc',
        relationshipId: 'rel-123',
      });

      expect((pin as CanvasPin).relationshipId).toBe('rel-123');
    });

    it('should leave relationshipId undefined when not provided', () => {
      const pin = service.createPin('l1', 0, 0, 'No Relationship');

      expect((pin as CanvasPin).relationshipId).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Viewport
  // ─────────────────────────────────────────────────────────────────────────

  describe('viewport persistence', () => {
    it('should save and load viewport from localStorage', () => {
      const viewport = { x: 100, y: -50, zoom: 1.5 };
      service.saveViewport('canvas-1', viewport);

      const loaded = service.loadViewport('canvas-1');
      expect(loaded).toEqual(viewport);
    });

    it('should return null for missing viewport', () => {
      expect(service.loadViewport('nonexistent')).toBeNull();
    });

    it('should return null for corrupt localStorage data', () => {
      localStorage.setItem('inkweld-canvas-state:bad', '{invalid}}}');
      expect(service.loadViewport('bad')).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Undo / redo
  // ─────────────────────────────────────────────────────────────────────────

  describe('undo/redo', () => {
    beforeEach(() => {
      mockElements.set([makeElement({ id: 'canvas-1' })]);
      service.loadConfig('canvas-1');
    });

    it('starts with nothing to undo or redo', () => {
      expect(service.canUndo()).toBe(false);
      expect(service.canRedo()).toBe(false);
      expect(service.undo()).toBe(false);
      expect(service.redo()).toBe(false);
    });

    it('undoes an added object', () => {
      service.addObject(makeTextObject({ id: 'text-1' }));
      expect(service.activeConfig()?.objects).toHaveLength(1);
      expect(service.canUndo()).toBe(true);

      expect(service.undo()).toBe(true);
      expect(service.activeConfig()?.objects).toHaveLength(0);
      expect(service.canRedo()).toBe(true);
    });

    it('redoes what was undone', () => {
      service.addObject(makeTextObject({ id: 'text-1' }));
      service.undo();

      expect(service.redo()).toBe(true);
      expect(service.activeConfig()?.objects).toHaveLength(1);
      expect(service.canRedo()).toBe(false);
    });

    it('walks back through several edits', () => {
      service.addObject(makeTextObject({ id: 'a' }));
      service.addObject(makeTextObject({ id: 'b' }));
      service.addLayer('Extra');

      service.undo();
      expect(service.activeConfig()?.layers).toHaveLength(1);
      service.undo();
      expect(service.activeConfig()?.objects.map(o => o.id)).toEqual(['a']);
      service.undo();
      expect(service.activeConfig()?.objects).toHaveLength(0);
      expect(service.canUndo()).toBe(false);
    });

    it('drops the redo branch once a new edit lands', () => {
      service.addObject(makeTextObject({ id: 'a' }));
      service.undo();
      service.addObject(makeTextObject({ id: 'b' }));

      expect(service.canRedo()).toBe(false);
    });

    it('collapses a coalesced gesture into one undo step', () => {
      service.addObject(makeTextObject({ id: 'a', x: 0 }));
      service.updateObject('a', { x: 10 }, { coalesceKey: 'drag-1' });
      service.updateObject('a', { x: 20 }, { coalesceKey: 'drag-1' });
      service.updateObject('a', { x: 30 }, { coalesceKey: 'drag-1' });

      service.undo();
      expect(service.activeConfig()?.objects[0].x).toBe(0);
    });

    it('keeps separate gestures separately undoable', () => {
      service.addObject(makeTextObject({ id: 'a', x: 0 }));
      service.updateObject('a', { x: 10 }, { coalesceKey: 'drag-1' });
      service.updateObject('a', { x: 20 }, { coalesceKey: 'drag-2' });

      service.undo();
      expect(service.activeConfig()?.objects[0].x).toBe(10);
    });

    it('forgets history when a different canvas is loaded', () => {
      service.addObject(makeTextObject({ id: 'a' }));
      expect(service.canUndo()).toBe(true);

      mockElements.set([
        makeElement({ id: 'canvas-1' }),
        makeElement({ id: 'canvas-2' }),
      ]);
      service.loadConfig('canvas-2');
      expect(service.canUndo()).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Batch object operations
  // ─────────────────────────────────────────────────────────────────────────

  describe('batch operations', () => {
    beforeEach(() => {
      mockElements.set([makeElement({ id: 'canvas-1' })]);
      service.loadConfig('canvas-1');
      service.addObject(makeTextObject({ id: 'a', x: 0 }));
      service.addObject(makeTextObject({ id: 'b', x: 0 }));
      service.addObject(makeTextObject({ id: 'c', x: 0 }));
    });

    it('removes several objects as one edit', () => {
      service.removeObjects(['a', 'c']);

      expect(service.activeConfig()?.objects.map(o => o.id)).toEqual(['b']);
      service.undo();
      expect(service.activeConfig()?.objects).toHaveLength(3);
    });

    it('ignores ids that are not on the canvas', () => {
      const before = service.activeConfig();
      service.removeObjects(['nope']);
      expect(service.activeConfig()).toBe(before);
    });

    it('ignores an empty removal', () => {
      const before = service.activeConfig();
      service.removeObjects([]);
      expect(service.activeConfig()).toBe(before);
    });

    it('updates several objects as one edit', () => {
      service.updateObjects([
        { id: 'a', updates: { x: 5 } },
        { id: 'b', updates: { x: 6 } },
      ]);

      const objects = service.activeConfig()?.objects ?? [];
      expect(objects[0].x).toBe(5);
      expect(objects[1].x).toBe(6);

      service.undo();
      expect(service.activeConfig()?.objects[0].x).toBe(0);
    });

    it('does not save when no object matched', () => {
      const before = service.activeConfig();
      service.updateObjects([{ id: 'missing', updates: { x: 1 } }]);
      expect(service.activeConfig()).toBe(before);
    });

    it('batches position updates', () => {
      service.updateObjectPositions([
        { id: 'a', x: 11, y: 12 },
        { id: 'b', x: 21, y: 22 },
      ]);

      const objects = service.activeConfig()?.objects ?? [];
      expect(objects[0]).toMatchObject({ x: 11, y: 12 });
      expect(objects[1]).toMatchObject({ x: 21, y: 22 });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Write throttling
  // ─────────────────────────────────────────────────────────────────────────

  describe('granular sync', () => {
    beforeEach(() => {
      mockElements.set([makeElement({ id: 'canvas-1' })]);
      service.loadConfig('canvas-1');
      mockProjectState.applyCanvasEdit.mockClear();
    });

    it('sends one upsert when an object is added', () => {
      service.addObject(makeTextObject({ id: 'a' }));

      expect(mockProjectState.applyCanvasEdit).toHaveBeenCalledTimes(1);
      const edit = mockProjectState.applyCanvasEdit.mock.calls[0][1];
      expect(edit.upserts?.map(o => o.id)).toEqual(['a']);
      expect(edit.order).toBeUndefined();
    });

    it('sends only the removed ids for an eraser sweep', () => {
      service.addObject(makeTextObject({ id: 'a' }));
      service.addObject(makeTextObject({ id: 'b' }));
      service.addObject(makeTextObject({ id: 'c' }));
      mockProjectState.applyCanvasEdit.mockClear();

      service.removeObjects(['a', 'c']);

      expect(mockProjectState.applyCanvasEdit).toHaveBeenCalledTimes(1);
      const edit = mockProjectState.applyCanvasEdit.mock.calls[0][1];
      expect(edit.deletes).toEqual(['a', 'c']);
      expect(edit.upserts).toBeUndefined();
    });

    it('sends the layer list only when a layer changed', () => {
      service.addObject(makeTextObject({ id: 'a' }));
      const objectEdit = mockProjectState.applyCanvasEdit.mock.calls[0][1];
      expect(objectEdit.layers).toBeUndefined();

      mockProjectState.applyCanvasEdit.mockClear();
      service.addLayer('Second');
      const layerEdit = mockProjectState.applyCanvasEdit.mock.calls[0][1];
      expect(layerEdit.layers).toHaveLength(2);
      expect(layerEdit.upserts).toBeUndefined();
    });

    it('sends the z-order only when objects are restacked', () => {
      service.addObject(makeTextObject({ id: 'a' }));
      service.addObject(makeTextObject({ id: 'b' }));
      mockProjectState.applyCanvasEdit.mockClear();

      service.reorderObject('a', 'front');

      const edit = mockProjectState.applyCanvasEdit.mock.calls[0][1];
      expect(edit.order).toEqual(['b', 'a']);
    });

    it('sends nothing when a save changes nothing', () => {
      const config = service.activeConfig()!;
      service.saveConfig({ ...config });
      expect(mockProjectState.applyCanvasEdit).not.toHaveBeenCalled();
    });

    it('flush is a no-op now that writes are immediate', () => {
      service.addObject(makeTextObject({ id: 'a' }));
      const callsBefore = mockProjectState.applyCanvasEdit.mock.calls.length;
      service.flush();
      expect(mockProjectState.applyCanvasEdit.mock.calls.length).toBe(
        callsBefore
      );
    });
  });

  describe('tool settings', () => {
    it('returns defaults when nothing is stored', () => {
      const settings = service.loadToolSettings();
      expect(settings.strokeWidth).toBeGreaterThan(0);
      expect(settings.stroke).toBeTruthy();
    });

    it('round-trips saved settings', () => {
      const settings = service.loadToolSettings();
      service.saveToolSettings({
        ...settings,
        stroke: '#ABCDEF',
        strokeWidth: 12,
        pressure: false,
      });

      const restored = service.loadToolSettings();
      expect(restored.stroke).toBe('#ABCDEF');
      expect(restored.strokeWidth).toBe(12);
      expect(restored.pressure).toBe(false);
    });

    it('falls back to defaults for corrupt storage', () => {
      service.saveToolSettings(service.loadToolSettings());
      const key = findStorageKey('canvas-tools');
      expect(key).toBeDefined();
      localStorage.setItem(key as string, 'not json');

      expect(() => service.loadToolSettings()).not.toThrow();
      expect(service.loadToolSettings().strokeWidth).toBeGreaterThan(0);
    });

    it('repairs partial or out-of-range stored settings', () => {
      service.saveToolSettings(service.loadToolSettings());
      const key = findStorageKey('canvas-tools') as string;
      localStorage.setItem(
        key,
        JSON.stringify({ strokeWidth: 9999, stroke: 42 })
      );

      const restored = service.loadToolSettings();
      expect(restored.strokeWidth).toBeLessThanOrEqual(96);
      expect(typeof restored.stroke).toBe('string');
      expect(restored.pressure).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Config Round-Trip
  // ─────────────────────────────────────────────────────────────────────────

  describe('config round-trip', () => {
    it('should save, close, and reopen a canvas', () => {
      mockElements.set([makeElement({ id: 'canvas-1' })]);
      service.loadConfig('canvas-1');

      service.addLayer('Annotations');
      service.addObject(makeTextObject({ id: 'text-1' }));

      const restored = service.loadConfig('canvas-1');
      expect(restored.layers).toHaveLength(2);
      expect(restored.objects).toHaveLength(1);
    });
  });
});
