import { TestBed } from '@angular/core/testing';
import type { CanvasFrame } from '@models/canvas.model';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { CanvasService } from './canvas.service';
import { CanvasExportService } from './canvas-export.service';
import { CanvasRendererService } from './canvas-renderer.service';

interface MockStage {
  toDataURL: ReturnType<typeof vi.fn>;
  batchDraw: ReturnType<typeof vi.fn>;
  width: ReturnType<typeof vi.fn>;
  height: ReturnType<typeof vi.fn>;
  x: ReturnType<typeof vi.fn>;
  y: ReturnType<typeof vi.fn>;
  scaleX: ReturnType<typeof vi.fn>;
  scaleY: ReturnType<typeof vi.fn>;
  size: ReturnType<typeof vi.fn>;
  scale: ReturnType<typeof vi.fn>;
  position: ReturnType<typeof vi.fn>;
}

function makeStage(): MockStage {
  return {
    toDataURL: vi.fn(() => 'data:image/png;base64,abc'),
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
  };
}

const frame: CanvasFrame = {
  id: 'f1',
  name: 'Cover',
  kind: 'canvas',
  x: 100,
  y: 200,
  width: 400,
  height: 640,
  visible: true,
};

describe('CanvasExportService', () => {
  let service: CanvasExportService;
  let renderer: {
    stage: MockStage | null;
    selectionLayer: null;
    previewLayer: null;
    framesLayer: null;
  };
  let canvasService: { activeConfig: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    renderer = {
      stage: makeStage(),
      selectionLayer: null,
      previewLayer: null,
      framesLayer: null,
    };
    canvasService = { activeConfig: vi.fn(() => null) };

    TestBed.configureTestingModule({
      imports: [translocoTestProvider()],
      providers: [
        CanvasExportService,
        { provide: CanvasRendererService, useValue: renderer },
        { provide: CanvasService, useValue: canvasService },
      ],
    });
    service = TestBed.inject(CanvasExportService);
  });

  it('exports the viewport with default pixelRatio 2 when the canvas is empty', () => {
    const clickSpy = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValueOnce({
      click: clickSpy,
    } as unknown as HTMLAnchorElement);

    service.exportAsPng('mycanvas');

    expect(renderer.stage!.toDataURL).toHaveBeenCalledWith({ pixelRatio: 2 });
    expect(renderer.stage!.size).not.toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
  });

  it('exports high-res PNG with pixelRatio 3', () => {
    const clickSpy = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValueOnce({
      click: clickSpy,
    } as unknown as HTMLAnchorElement);

    service.exportAsHighResPng('mycanvas');

    expect(renderer.stage!.toDataURL).toHaveBeenCalledWith({ pixelRatio: 3 });
  });

  it('exports the whole area fitted around visible content', () => {
    canvasService.activeConfig.mockReturnValue({
      elementId: 'e1',
      layers: [
        {
          id: 'L1',
          name: 'Layer 1',
          visible: true,
          locked: false,
          opacity: 1,
          order: 0,
        },
      ],
      objects: [
        {
          id: 's1',
          layerId: 'L1',
          type: 'shape',
          shapeType: 'rect',
          x: 100,
          y: 200,
          width: 300,
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
    });
    const clickSpy = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValueOnce({
      click: clickSpy,
    } as unknown as HTMLAnchorElement);

    service.exportAsPng('mycanvas');

    const stage = renderer.stage!;
    // Content bounds plus the 20px viewBox padding on every side…
    expect(stage.size).toHaveBeenCalledWith({ width: 340, height: 140 });
    expect(stage.position).toHaveBeenCalledWith({ x: -80, y: -180 });
    // …and the stage restored afterwards.
    expect(stage.size).toHaveBeenLastCalledWith({ width: 800, height: 600 });
    expect(stage.scale).toHaveBeenLastCalledWith({ x: 1.5, y: 1.5 });
    expect(stage.position).toHaveBeenLastCalledWith({ x: 10, y: 20 });
    expect(clickSpy).toHaveBeenCalled();
  });

  it('falls back to the viewport when no object would render', () => {
    canvasService.activeConfig.mockReturnValue({
      elementId: 'e1',
      layers: [
        {
          id: 'L1',
          name: 'Layer 1',
          visible: false,
          locked: false,
          opacity: 1,
          order: 0,
        },
      ],
      objects: [
        {
          id: 's1',
          layerId: 'L1',
          type: 'shape',
          shapeType: 'rect',
          x: 100,
          y: 200,
          width: 300,
          height: 100,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          visible: true,
          locked: false,
          stroke: '#000',
          strokeWidth: 1,
        },
        {
          id: 'p1',
          layerId: 'L1',
          type: 'pin',
          x: 10,
          y: 10,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          visible: false,
          locked: false,
          label: 'Hidden pin',
          color: '#f00',
        },
      ],
    });
    const clickSpy = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValueOnce({
      click: clickSpy,
    } as unknown as HTMLAnchorElement);

    service.exportAsPng('mycanvas');

    // The hidden-layer shape and hidden pin must not produce a blank
    // default region — the export uses the current viewport instead.
    expect(renderer.stage!.size).not.toHaveBeenCalled();
    expect(renderer.stage!.toDataURL).toHaveBeenCalledWith({ pixelRatio: 2 });
    expect(clickSpy).toHaveBeenCalled();
  });

  it('still exports the whole area when only a visible pin remains', () => {
    canvasService.activeConfig.mockReturnValue({
      elementId: 'e1',
      layers: [
        {
          id: 'L1',
          name: 'Layer 1',
          visible: false,
          locked: false,
          opacity: 1,
          order: 0,
        },
      ],
      objects: [
        {
          id: 'p1',
          layerId: 'L1',
          type: 'pin',
          x: 10,
          y: 10,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          visible: true,
          locked: false,
          label: 'Pin',
          color: '#f00',
        },
      ],
    });
    const clickSpy = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValueOnce({
      click: clickSpy,
    } as unknown as HTMLAnchorElement);

    service.exportAsPng('mycanvas');

    // Pins render above every layer, so the fitted-region path is used.
    expect(renderer.stage!.size).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
  });

  it('exports a frame region exactly', () => {
    const clickSpy = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValueOnce({
      click: clickSpy,
    } as unknown as HTMLAnchorElement);

    service.exportFrameAsPng(frame);

    const stage = renderer.stage!;
    expect(stage.size).toHaveBeenCalledWith({ width: 400, height: 640 });
    expect(stage.scale).toHaveBeenCalledWith({ x: 1, y: 1 });
    expect(stage.position).toHaveBeenCalledWith({ x: -100, y: -200 });
    expect(stage.size).toHaveBeenLastCalledWith({ width: 800, height: 600 });
    expect(clickSpy).toHaveBeenCalled();
  });

  it('restores the stage even when export throws', () => {
    canvasService.activeConfig.mockReturnValue({
      elementId: 'e1',
      layers: [],
      objects: [],
      frames: [frame],
    });
    const stage = renderer.stage!;
    stage.toDataURL.mockImplementation(() => {
      throw new Error('boom');
    });

    expect(() => service.exportFrameAsPng(frame)).toThrow('boom');
    expect(stage.size).toHaveBeenLastCalledWith({ width: 800, height: 600 });
    expect(stage.position).toHaveBeenLastCalledWith({ x: 10, y: 20 });
  });

  it('does nothing when stage is null', () => {
    renderer.stage = null;
    expect(() => service.exportAsPng('x')).not.toThrow();
    expect(() => service.exportFrameAsPng(frame)).not.toThrow();
  });

  it('does nothing for SVG when no active config', () => {
    expect(() => service.exportAsSvg('x')).not.toThrow();
  });
});
