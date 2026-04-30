import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasLayerService } from './canvas-layer.service';
import {
  CanvasLayerActionsService,
  type LayerActionsCallbacks,
} from './canvas-layer-actions.service';

describe('CanvasLayerActionsService', () => {
  let service: CanvasLayerActionsService;
  let layer: any;
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

    TestBed.configureTestingModule({
      providers: [
        CanvasLayerActionsService,
        { provide: CanvasLayerService, useValue: layer },
      ],
    });
    service = TestBed.inject(CanvasLayerActionsService);

    cb = {
      getActiveLayerId: vi.fn(() => 'L1'),
      setActiveLayerId: vi.fn(),
      getSortedLayers: vi.fn(() => [
        { id: 'L1', order: 0 } as any,
        { id: 'L2', order: 1 } as any,
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
});
