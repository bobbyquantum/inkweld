import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type {
  CanvasConfig,
  CanvasObject,
  CanvasPin,
  CanvasShape,
} from '@models/canvas.model';
import { RelationshipService } from '@services/relationship/relationship.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasService } from './canvas.service';
import { CanvasClipboardService } from './canvas-clipboard.service';

const makeShape = (id: string, layerId = 'L1', x = 10, y = 20): CanvasShape =>
  ({
    id,
    type: 'shape',
    shapeType: 'rect',
    layerId,
    x,
    y,
    width: 100,
    height: 50,
    fill: '#fff',
    stroke: '#000',
    strokeWidth: 1,
  }) as CanvasShape;

const makePin = (id: string, opts: Partial<CanvasPin> = {}): CanvasPin =>
  ({
    id,
    type: 'pin',
    layerId: 'L1',
    x: 5,
    y: 5,
    color: '#f00',
    label: '',
    linkedElementId: undefined,
    relationshipId: undefined,
    ...opts,
  }) as CanvasPin;

describe('CanvasClipboardService', () => {
  let service: CanvasClipboardService;
  let mockCanvas: {
    activeConfig: ReturnType<typeof signal>;
    addObject: ReturnType<typeof vi.fn>;
    removeObject: ReturnType<typeof vi.fn>;
  };
  let mockRel: {
    addRelationship: ReturnType<typeof vi.fn>;
    removeRelationship: ReturnType<typeof vi.fn>;
    getTypeById: ReturnType<typeof vi.fn>;
    addRawType: ReturnType<typeof vi.fn>;
  };
  let cfg: CanvasConfig;

  beforeEach(() => {
    cfg = {
      layers: [
        {
          id: 'L1',
          name: 'L1',
          order: 0,
          visible: true,
          locked: false,
          opacity: 1,
        },
      ],
      objects: [
        makeShape('s1'),
        makePin('p1', { linkedElementId: 'el-1', relationshipId: 'r-1' }),
      ],
    } as CanvasConfig;

    mockCanvas = {
      activeConfig: signal(cfg),
      addObject: vi.fn(),
      removeObject: vi.fn(),
    };
    mockRel = {
      addRelationship: vi.fn(() => ({ id: 'new-rel' })),
      removeRelationship: vi.fn(),
      getTypeById: vi.fn(() => ({})),
      addRawType: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        CanvasClipboardService,
        { provide: CanvasService, useValue: mockCanvas },
        { provide: RelationshipService, useValue: mockRel },
      ],
    });
    service = TestBed.inject(CanvasClipboardService);
  });

  describe('copy', () => {
    it('places a copy of the object on the clipboard', () => {
      service.copy('s1');
      expect(service.clipboard()?.id).toBe('s1');
      // It is a clone, not the same reference
      expect(service.clipboard()).not.toBe(cfg.objects[0]);
    });

    it('strips relationshipId from copied pins', () => {
      service.copy('p1');
      const c = service.clipboard() as CanvasPin;
      expect(c.type).toBe('pin');
      expect(c.relationshipId).toBeUndefined();
      expect(c.linkedElementId).toBe('el-1');
    });

    it('is a no-op for missing object id', () => {
      service.copy('nope');
      expect(service.clipboard()).toBeNull();
    });

    it('is a no-op when there is no active config', () => {
      (mockCanvas.activeConfig as any).set(null);
      service.copy('s1');
      expect(service.clipboard()).toBeNull();
    });
  });

  describe('cutObject', () => {
    it('returns true and removes the object on success', () => {
      const ok = service.cutObject('s1');
      expect(ok).toBe(true);
      expect(mockCanvas.removeObject).toHaveBeenCalledWith('s1');
      expect(service.clipboard()?.id).toBe('s1');
    });

    it('removes pin relationship before cutting a pin', () => {
      const ok = service.cutObject('p1');
      expect(ok).toBe(true);
      expect(mockRel.removeRelationship).toHaveBeenCalledWith('r-1');
    });

    it('returns false for missing object id', () => {
      const ok = service.cutObject('nope');
      expect(ok).toBe(false);
      expect(mockCanvas.removeObject).not.toHaveBeenCalled();
    });
  });

  describe('paste', () => {
    it('returns null when clipboard is empty', () => {
      const id = service.paste('L1', { x: 0, y: 0 }, 'el');
      expect(id).toBeNull();
      expect(mockCanvas.addObject).not.toHaveBeenCalled();
    });

    it('adds a new object offset from the paste position', () => {
      service.copy('s1');
      const newId = service.paste('L1', { x: 100, y: 100 }, 'el');
      expect(newId).toBeTruthy();
      const added = mockCanvas.addObject.mock.calls[0][0] as CanvasObject;
      expect(added.id).not.toBe('s1');
      expect(added.x).toBe(120);
      expect(added.y).toBe(120);
      expect(added.layerId).toBe('L1');
    });

    it('creates a fresh relationship when pasting a linked pin', () => {
      service.copy('p1');
      service.paste('L1', { x: 0, y: 0 }, 'host-el');
      expect(mockRel.addRelationship).toHaveBeenCalledWith(
        'host-el',
        'el-1',
        expect.any(String)
      );
      const added = mockCanvas.addObject.mock.calls[0][0] as CanvasPin;
      expect(added.relationshipId).toBe('new-rel');
    });

    it('clears the clipboard after pasting a cut object', () => {
      service.cutObject('s1');
      service.paste('L1', { x: 0, y: 0 }, 'el');
      expect(service.clipboard()).toBeNull();
    });

    it('keeps the clipboard after pasting a copied object', () => {
      service.copy('s1');
      service.paste('L1', { x: 0, y: 0 }, 'el');
      expect(service.clipboard()).not.toBeNull();
    });
  });

  describe('duplicate', () => {
    it('clones the object with a new id and offset', () => {
      const id = service.duplicate('s1');
      expect(id).toBeTruthy();
      const added = mockCanvas.addObject.mock.calls[0][0] as CanvasShape;
      expect(added.id).not.toBe('s1');
      expect(added.x).toBe(30);
      expect(added.y).toBe(40);
    });

    it('returns null for unknown id', () => {
      const id = service.duplicate('nope');
      expect(id).toBeNull();
      expect(mockCanvas.addObject).not.toHaveBeenCalled();
    });
  });
});
