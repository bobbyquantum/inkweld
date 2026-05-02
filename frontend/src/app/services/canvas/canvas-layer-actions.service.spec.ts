import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasService } from './canvas.service';
import { CanvasLayerService } from './canvas-layer.service';
import {
  CanvasLayerActionsService,
  type LayerActionsCallbacks,
} from './canvas-layer-actions.service';

describe('CanvasLayerActionsService', () => {
  let service: CanvasLayerActionsService;
  let layer: any;
  let canvasService: any;
  let cb: LayerActionsCallbacks;

  beforeEach(() => {
    layer = {
      addLayer: vi.fn(() => 'new-layer'),
      toggleVisibility: vi.fn(),
      toggleLock: vi.fn(),
      renameLayer: vi.fn(() => Promise.resolve()),
      duplicateLayer: vi.fn(),
      deleteLayer: vi.fn(() => Promise.resolve(true)),
    };
    canvasService = {
      reorderLayers: vi.fn(),
      updateLayer: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        CanvasLayerActionsService,
        { provide: CanvasLayerService, useValue: layer },
        { provide: CanvasService, useValue: canvasService },
      ],
    });
    service = TestBed.inject(CanvasLayerActionsService);

    cb = {
      getActiveLayerId: vi.fn(() => 'L1'),
      setActiveLayerId: vi.fn(),
      getSortedLayers: vi.fn(() => [
        { id: 'L1', order: 0 } as any,
        { id: 'L2', order: 1 } as any,
        { id: 'L3', order: 2 } as any,
      ]),
    };
  });

  it('add: sets new layer active', () => {
    service.add(cb);
    expect(cb.setActiveLayerId).toHaveBeenCalledWith('new-layer');
  });

  it('toggleVisibility: stops propagation and delegates', () => {
    const e = { stopPropagation: vi.fn() } as unknown as Event;
    service.toggleVisibility('L1', e);
    expect(e.stopPropagation).toHaveBeenCalled();
    expect(layer.toggleVisibility).toHaveBeenCalledWith('L1');
  });

  it('toggleLock: stops propagation and delegates', () => {
    const e = { stopPropagation: vi.fn() } as unknown as Event;
    service.toggleLock('L1', e);
    expect(e.stopPropagation).toHaveBeenCalled();
    expect(layer.toggleLock).toHaveBeenCalledWith('L1');
  });

  it('rename delegates to renameLayer', async () => {
    await service.rename('L1');
    expect(layer.renameLayer).toHaveBeenCalledWith('L1');
  });

  it('duplicate delegates', () => {
    service.duplicate('L1');
    expect(layer.duplicateLayer).toHaveBeenCalledWith('L1');
  });

  it('delete: switches to first remaining when removing non-first', async () => {
    (cb.getSortedLayers as any).mockReturnValueOnce([{ id: 'L1', order: 0 }]);
    await service.delete('L2', cb);
    expect(cb.setActiveLayerId).toHaveBeenCalledWith('L1');
  });

  it('delete: switches to second when first equals deleted id', async () => {
    await service.delete('L1', cb);
    expect(cb.setActiveLayerId).toHaveBeenCalledWith('L2');
  });

  it('delete: no-op when deleteLayer returns false', async () => {
    layer.deleteLayer.mockResolvedValueOnce(false);
    await service.delete('L1', cb);
    expect(cb.setActiveLayerId).not.toHaveBeenCalled();
  });

  describe('moveUp / moveDown', () => {
    it('moveUp swaps with the previous (visually higher) entry', () => {
      service.moveUp('L2', cb);
      expect(canvasService.reorderLayers).toHaveBeenCalledWith([
        'L2',
        'L1',
        'L3',
      ]);
    });

    it('moveUp is a no-op at the top of the panel', () => {
      service.moveUp('L1', cb);
      expect(canvasService.reorderLayers).not.toHaveBeenCalled();
    });

    it('moveDown swaps with the next (visually lower) entry', () => {
      service.moveDown('L2', cb);
      expect(canvasService.reorderLayers).toHaveBeenCalledWith([
        'L1',
        'L3',
        'L2',
      ]);
    });

    it('moveDown is a no-op at the bottom of the panel', () => {
      service.moveDown('L3', cb);
      expect(canvasService.reorderLayers).not.toHaveBeenCalled();
    });
  });

  describe('setOpacity', () => {
    it('clamps to [0, 1] and updates the layer', () => {
      service.setOpacity('L1', 0.5);
      expect(canvasService.updateLayer).toHaveBeenLastCalledWith('L1', {
        opacity: 0.5,
      });
      service.setOpacity('L1', -1);
      expect(canvasService.updateLayer).toHaveBeenLastCalledWith('L1', {
        opacity: 0,
      });
      service.setOpacity('L1', 5);
      expect(canvasService.updateLayer).toHaveBeenLastCalledWith('L1', {
        opacity: 1,
      });
    });
  });
});
