import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasService } from './canvas.service';
import { CanvasExportService } from './canvas-export.service';
import { CanvasRendererService } from './canvas-renderer.service';

describe('CanvasExportService', () => {
  let service: CanvasExportService;
  let renderer: { stage: { toDataURL: ReturnType<typeof vi.fn> } | null };
  let canvasService: { activeConfig: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    renderer = {
      stage: { toDataURL: vi.fn(() => 'data:image/png;base64,abc') },
    };
    canvasService = { activeConfig: vi.fn(() => null) };

    TestBed.configureTestingModule({
      providers: [
        CanvasExportService,
        { provide: CanvasRendererService, useValue: renderer },
        { provide: CanvasService, useValue: canvasService },
      ],
    });
    service = TestBed.inject(CanvasExportService);
  });

  it('exports PNG with default pixelRatio 2', () => {
    const clickSpy = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValueOnce({
      click: clickSpy,
    } as unknown as HTMLAnchorElement);

    service.exportAsPng('mycanvas');

    expect(renderer.stage!.toDataURL).toHaveBeenCalledWith({ pixelRatio: 2 });
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

  it('does nothing when stage is null', () => {
    renderer.stage = null;
    expect(() => service.exportAsPng('x')).not.toThrow();
  });

  it('does nothing for SVG when no active config', () => {
    expect(() => service.exportAsSvg('x')).not.toThrow();
  });
});
