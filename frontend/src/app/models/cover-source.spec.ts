import { describe, expect, it } from 'vitest';

import type { CanvasFrame, CanvasObject, CanvasShape } from './canvas.model';
import type { CanvasContents } from './canvas-edit';
import {
  type CoverSource,
  coverSourceFrame,
  coverSourceHash,
  isCoverSourceFrame,
  parseCoverSource,
  serializeCoverSource,
} from './cover-source';

const frame: CanvasFrame = {
  id: 'F1',
  name: 'Cover',
  kind: 'canvas',
  x: 0,
  y: 0,
  width: 1000,
  height: 1600,
  visible: true,
};

function shape(overrides: Partial<CanvasShape> = {}): CanvasShape {
  return {
    id: 'S1',
    layerId: 'L1',
    type: 'shape',
    shapeType: 'rect',
    x: 10,
    y: 10,
    width: 100,
    height: 50,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    visible: true,
    locked: false,
    fill: '#f00',
    stroke: '#000',
    strokeWidth: 1,
    ...overrides,
  };
}

function contents(
  objects: CanvasObject[],
  layerOverrides: Partial<CanvasContents['layers'][number]> = {}
): CanvasContents {
  return {
    layers: [
      {
        id: 'L1',
        name: 'Layer',
        visible: true,
        locked: false,
        opacity: 1,
        order: 0,
        ...layerOverrides,
      },
    ],
    objects,
    frames: [frame],
  };
}

describe('cover-source model', () => {
  describe('parseCoverSource / serializeCoverSource', () => {
    const source: CoverSource = {
      type: 'canvas',
      elementId: 'el-1',
      frameId: 'F1',
      renderedHash: 'abc',
      renderedAt: '2026-01-01T00:00:00.000Z',
    };

    it('round-trips through a string', () => {
      expect(parseCoverSource(serializeCoverSource(source))).toEqual(source);
    });

    it('accepts an already-parsed object', () => {
      expect(parseCoverSource({ ...source })).toEqual(source);
    });

    it('drops optional fields of the wrong type', () => {
      expect(
        parseCoverSource({
          type: 'canvas',
          elementId: 'el-1',
          frameId: 'F1',
          renderedHash: 42,
        })
      ).toEqual({ type: 'canvas', elementId: 'el-1', frameId: 'F1' });
    });

    it.each([
      ['undefined', undefined],
      ['empty string', ''],
      ['garbage json', '{not json'],
      ['wrong type', JSON.stringify({ type: 'image', elementId: 'x' })],
      ['missing frame', JSON.stringify({ type: 'canvas', elementId: 'x' })],
      ['number', 5],
      ['null', null],
    ])('returns undefined for %s', (_label, raw) => {
      expect(parseCoverSource(raw)).toBeUndefined();
    });
  });

  describe('isCoverSourceFrame / coverSourceFrame', () => {
    const source: CoverSource = {
      type: 'canvas',
      elementId: 'el-1',
      frameId: 'F1',
    };

    it('matches only the linked element and frame', () => {
      expect(isCoverSourceFrame(source, 'el-1', 'F1')).toBe(true);
      expect(isCoverSourceFrame(source, 'el-1', 'F2')).toBe(false);
      expect(isCoverSourceFrame(source, 'el-2', 'F1')).toBe(false);
      expect(isCoverSourceFrame(undefined, 'el-1', 'F1')).toBe(false);
    });

    it('finds the frame in the contents, or nothing once deleted', () => {
      expect(coverSourceFrame(source, contents([]))).toEqual(frame);
      expect(
        coverSourceFrame(source, { layers: [], objects: [], frames: [] })
      ).toBeUndefined();
      expect(coverSourceFrame(source, null)).toBeUndefined();
      expect(coverSourceFrame(undefined, contents([]))).toBeUndefined();
    });
  });

  describe('coverSourceHash', () => {
    it('is deterministic, and a z-order change alters it', () => {
      const a = contents([shape({ id: 'A' }), shape({ id: 'B', x: 50 })]);
      const b = contents([shape({ id: 'B', x: 50 }), shape({ id: 'A' })]);
      // Same objects, same z-order → same hash. (Z-order is part of the hash,
      // so a genuine reorder must change it — tested below.)
      expect(coverSourceHash(a, frame)).toBe(coverSourceHash(a, frame));
      expect(coverSourceHash(a, frame)).not.toBe(coverSourceHash(b, frame));
    });

    it('changes when an object moves or the frame moves', () => {
      const base = contents([shape()]);
      const moved = contents([shape({ x: 200 })]);
      expect(coverSourceHash(base, frame)).not.toBe(
        coverSourceHash(moved, frame)
      );
      expect(coverSourceHash(base, frame)).not.toBe(
        coverSourceHash(base, { ...frame, x: 5 })
      );
    });

    it('ignores hidden objects and objects on hidden layers', () => {
      const visibleOnly = contents([shape()]);
      const withHidden = contents([
        shape(),
        shape({ id: 'H', visible: false }),
      ]);
      expect(coverSourceHash(visibleOnly, frame)).toBe(
        coverSourceHash(withHidden, frame)
      );

      const hiddenLayer = contents(
        [shape(), shape({ id: 'X', layerId: 'L2' })],
        {}
      );
      hiddenLayer.layers.push({
        id: 'L2',
        name: 'Hidden',
        visible: false,
        locked: false,
        opacity: 1,
        order: 1,
      });
      expect(coverSourceHash(hiddenLayer, frame)).toBe(
        coverSourceHash(visibleOnly, frame)
      );
    });

    it('changes when a visible layer changes opacity', () => {
      const opaque = contents([shape()]);
      const faded = contents([shape()], { opacity: 0.5 });
      expect(coverSourceHash(opaque, frame)).not.toBe(
        coverSourceHash(faded, frame)
      );
    });

    it('ignores the frame being shown or hidden', () => {
      const c = contents([shape()]);
      expect(coverSourceHash(c, frame)).toBe(
        coverSourceHash(c, { ...frame, visible: false })
      );
    });
  });
});
