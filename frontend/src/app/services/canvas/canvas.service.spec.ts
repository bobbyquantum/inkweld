import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Element, ElementType } from '@inkweld/index';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CanvasObject,
  CanvasPin,
  CanvasText,
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

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('CanvasService', () => {
  let service: CanvasService;
  const mockElements = signal<Element[]>([]);

  const mockProjectState = {
    elements: mockElements,
    updateElementMetadata: vi.fn(),
    project: vi.fn(() => null),
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
        CanvasService,
        { provide: ProjectStateService, useValue: mockProjectState },
        { provide: LoggerService, useValue: mockLogger },
      ],
    });

    service = TestBed.inject(CanvasService);
    mockElements.set([]);
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
    it('should persist config to element metadata', () => {
      const config = createDefaultCanvasConfig('canvas-1');
      service.saveConfig(config);

      expect(mockProjectState.updateElementMetadata).toHaveBeenCalledWith(
        'canvas-1',
        expect.objectContaining({
          canvasConfig: expect.any(String),
        })
      );
    });

    it('should update the active config signal', () => {
      const config = createDefaultCanvasConfig('canvas-1');
      service.saveConfig(config);

      expect(service.activeConfig()).toEqual(config);
    });

    it('should serialize without elementId in the JSON payload', () => {
      const config = createDefaultCanvasConfig('canvas-1');
      service.saveConfig(config);

      const call = mockProjectState.updateElementMetadata.mock.calls[0] as [
        string,
        Record<string, string>,
      ];
      const serialized = JSON.parse(call[1]['canvasConfig']) as Record<
        string,
        unknown
      >;
      expect(serialized['elementId']).toBeUndefined();
      expect(serialized['layers']).toBeDefined();
      expect(serialized['objects']).toBeDefined();
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

      service.updateLayer(originalId, { id: 'hacked-id' } as never);

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

      service.updateObject('obj-1', { id: 'hacked' } as Partial<CanvasObject>);

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
      const pin = service.createPin('l1', 0, 0, 'Custom', '#00FF00', 'star');

      expect((pin as CanvasPin).color).toBe('#00FF00');
      expect((pin as CanvasPin).icon).toBe('star');
    });

    it('should accept linkedElementId', () => {
      const pin = service.createPin(
        'l1',
        5,
        10,
        'Linked Pin',
        '#E53935',
        'place',
        'element-abc'
      );

      expect((pin as CanvasPin).linkedElementId).toBe('element-abc');
    });

    it('should leave linkedElementId undefined when not provided', () => {
      const pin = service.createPin('l1', 0, 0, 'No Link');

      expect((pin as CanvasPin).linkedElementId).toBeUndefined();
    });

    it('should accept relationshipId', () => {
      const pin = service.createPin(
        'l1',
        5,
        10,
        'Linked Pin',
        '#E53935',
        'place',
        'element-abc',
        'rel-123'
      );

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
  // Config Round-Trip
  // ─────────────────────────────────────────────────────────────────────────

  describe('config round-trip', () => {
    it('should save, clear, and load config correctly', () => {
      // Capture saved metadata
      let savedMeta: Record<string, string> = {};
      mockProjectState.updateElementMetadata.mockImplementation(
        (_id: string, meta: Record<string, string>) => {
          savedMeta = { ...savedMeta, ...meta };

          // Simulate the metadata being stored on the element
          const current = mockElements();
          mockElements.set(
            current.map(el =>
              el.id === 'canvas-1'
                ? { ...el, metadata: { ...el.metadata, ...savedMeta } }
                : el
            )
          );
        }
      );

      mockElements.set([makeElement({ id: 'canvas-1' })]);
      service.loadConfig('canvas-1');

      // Make changes
      service.addLayer('Annotations');
      service.addObject(makeTextObject({ id: 'text-1' }));

      // Now load again — should restore from persisted metadata
      const restoredConfig = service.loadConfig('canvas-1');
      expect(restoredConfig.layers).toHaveLength(2);
      expect(restoredConfig.objects).toHaveLength(1);
    });
  });
});
