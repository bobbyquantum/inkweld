import type Konva from 'konva';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { installCanvas2dStub } from '../../../testing/canvas-2d-stub';
import {
  clampPixelRatio,
  dataUrlToBlob,
  MAX_EXPORT_PIXELS,
  MAX_EXPORT_SIDE_PX,
  renderStageRegion,
} from './canvas-raster';

installCanvas2dStub();

function makeLayer(visible = true) {
  const layer = {
    _visible: visible,
    visible: vi.fn((v?: boolean) => {
      if (v === undefined) return layer._visible;
      layer._visible = v;
      return layer;
    }),
  };
  return layer as unknown as Konva.Layer & { _visible: boolean };
}

function makeStage(dataUrl = 'data:image/png;base64,abc') {
  const added: unknown[] = [];
  const stage = {
    toDataURL: vi.fn(() => dataUrl),
    batchDraw: vi.fn(),
    width: vi.fn(() => 800),
    height: vi.fn(() => 600),
    x: vi.fn(() => 10),
    y: vi.fn(() => 20),
    scaleX: vi.fn(() => 1.5),
    scaleY: vi.fn(() => 1.5),
    size: vi.fn(),
    scale: vi.fn(),
    position: vi.fn(),
    add: vi.fn((layer: unknown) => {
      added.push(layer);
    }),
    _added: added,
  };
  return stage as unknown as Konva.Stage & typeof stage;
}

const rect = { x: 100, y: 200, width: 400, height: 640 };

describe('canvas-raster', () => {
  afterEach(() => vi.restoreAllMocks());

  describe('clampPixelRatio', () => {
    it('returns the requested ratio for small regions', () => {
      expect(clampPixelRatio({ ...rect }, 2)).toBe(2);
    });

    it('caps by the longest side', () => {
      const wide = { x: 0, y: 0, width: MAX_EXPORT_SIDE_PX, height: 10 };
      expect(clampPixelRatio(wide, 3)).toBe(1);
    });

    it('caps by total pixel area', () => {
      const side = Math.sqrt(MAX_EXPORT_PIXELS);
      const big = { x: 0, y: 0, width: side, height: side };
      expect(clampPixelRatio(big, 2)).toBeCloseTo(1, 5);
    });
  });

  describe('renderStageRegion', () => {
    it('fits the stage to the region, renders, and restores it', () => {
      const stage = makeStage();
      const url = renderStageRegion(stage, rect, { pixelRatio: 2 });

      expect(url).toBe('data:image/png;base64,abc');
      expect(stage.size).toHaveBeenCalledWith({ width: 400, height: 640 });
      expect(stage.position).toHaveBeenCalledWith({ x: -100, y: -200 });
      expect(stage.toDataURL).toHaveBeenCalledWith(
        expect.objectContaining({ pixelRatio: 2, mimeType: 'image/png' })
      );
      // Restored afterwards.
      expect(stage.size).toHaveBeenLastCalledWith({ width: 800, height: 600 });
      expect(stage.scale).toHaveBeenLastCalledWith({ x: 1.5, y: 1.5 });
      expect(stage.position).toHaveBeenLastCalledWith({ x: 10, y: 20 });
    });

    it('hides visible chrome layers during the render and shows them again', () => {
      const stage = makeStage();
      const visible = makeLayer(true);
      const hidden = makeLayer(false);
      stage.toDataURL.mockImplementation(() => {
        expect(visible._visible).toBe(false);
        expect(hidden._visible).toBe(false);
        return 'data:image/png;base64,abc';
      });

      renderStageRegion(stage, rect, {}, [visible, null, hidden]);

      expect(visible._visible).toBe(true);
      // A layer that was already hidden stays hidden.
      expect(hidden._visible).toBe(false);
    });

    it('paints a background layer for JPEG output and removes it afterwards', () => {
      const stage = makeStage();
      const url = renderStageRegion(stage, rect, {
        mimeType: 'image/jpeg',
        quality: 0.9,
        background: '#ffffff',
      });

      expect(url).not.toBeNull();
      expect(stage.add).toHaveBeenCalledTimes(1);
      const layer = stage._added[0] as Konva.Layer;
      expect(layer.getChildren()).toHaveLength(0); // destroyed → emptied
      expect(stage.toDataURL).toHaveBeenCalledWith(
        expect.objectContaining({ mimeType: 'image/jpeg', quality: 0.9 })
      );
    });

    it('returns null when the browser refuses to render', () => {
      expect(renderStageRegion(makeStage('data:,'), rect)).toBeNull();
      expect(renderStageRegion(makeStage(''), rect)).toBeNull();
    });

    it('returns null and still restores the stage when toDataURL throws', () => {
      const stage = makeStage();
      stage.toDataURL.mockImplementation(() => {
        throw new Error('tainted');
      });
      expect(renderStageRegion(stage, rect)).toBeNull();
      expect(stage.size).toHaveBeenLastCalledWith({ width: 800, height: 600 });
    });
  });

  describe('dataUrlToBlob', () => {
    it('decodes a data URL without going through fetch (CSP-safe)', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const blob = await dataUrlToBlob('data:image/jpeg;base64,eA==');
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(blob.type).toBe('image/jpeg');
      expect(blob.size).toBe(1);
    });
  });
});
