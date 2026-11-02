import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type {
  CanvasImage,
  CanvasShape,
  CanvasText,
} from '@models/canvas.model';
import type { CanvasContents } from '@models/canvas-edit';
import { LoggerService } from '@services/core/logger.service';
import { LocalStorageService } from '@services/local/local-storage.service';
import { ProjectStateService } from '@services/project/project-state.service';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { installCanvas2dStub } from '../../../testing/canvas-2d-stub';
import {
  CanvasRasterizerService,
  settleCanvasFonts,
} from './canvas-rasterizer.service';

// jsdom has no 2D canvas; Konva needs a context to construct nodes and a
// toDataURL to export. Both are stubbed to deterministic values.
const DATA_URL = 'data:image/jpeg;base64,/9j/4AAQ';

const base = {
  layerId: 'L1',
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  visible: true,
  locked: false,
};

const rectShape: CanvasShape = {
  ...base,
  id: 'S1',
  type: 'shape',
  shapeType: 'rect',
  width: 100,
  height: 100,
  fill: '#f00',
  stroke: '#000',
  strokeWidth: 1,
};

const text: CanvasText = {
  ...base,
  id: 'T1',
  type: 'text',
  text: 'Title',
  fontSize: 48,
  fontFamily: 'Georgia',
  fontStyle: 'bold italic',
  fill: '#000',
  width: 0,
  align: 'left',
};

const image: CanvasImage = {
  ...base,
  id: 'I1',
  type: 'image',
  src: 'media://img-1',
  width: 200,
  height: 100,
};

function contents(objects: CanvasContents['objects']): CanvasContents {
  return {
    layers: [
      {
        id: 'L1',
        name: 'L',
        visible: true,
        locked: false,
        opacity: 1,
        order: 0,
      },
    ],
    objects,
  };
}

const rect = { x: 0, y: 0, width: 300, height: 480 };

describe('CanvasRasterizerService', () => {
  let service: CanvasRasterizerService;
  let toDataURL: ReturnType<typeof vi.fn>;
  const localStorage = { getMediaUrl: vi.fn() };
  const fontsLoad = vi.fn(() => Promise.resolve([]));

  beforeAll(() => {
    installCanvas2dStub();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    toDataURL = vi.fn(() => DATA_URL);
    HTMLCanvasElement.prototype.toDataURL = toDataURL as never;
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { load: fontsLoad },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      blob: () => Promise.resolve(new Blob(['jpeg'], { type: 'image/jpeg' })),
    } as Response);

    TestBed.configureTestingModule({
      providers: [
        CanvasRasterizerService,
        {
          provide: ProjectStateService,
          useValue: { project: signal({ username: 'a', slug: 'b' }) },
        },
        { provide: LocalStorageService, useValue: localStorage },
        {
          provide: LoggerService,
          useValue: {
            warn: vi.fn(),
            debug: vi.fn(),
            info: vi.fn(),
            error: vi.fn(),
          },
        },
      ],
    });
    service = TestBed.inject(CanvasRasterizerService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders shapes to a blob and cleans up the offscreen container', async () => {
    const before = document.body.children.length;

    const blob = await service.renderRegion(contents([rectShape]), rect, {
      mimeType: 'image/jpeg',
      background: '#fff',
    });

    expect(blob).toBeInstanceOf(Blob);
    expect(blob?.type).toBe('image/jpeg');
    expect(toDataURL).toHaveBeenCalled();
    expect(document.body.children).toHaveLength(before);
  });

  it('asks the browser for every font family the canvas text uses', async () => {
    await service.renderRegion(contents([text]), rect);
    expect(fontsLoad).toHaveBeenCalledWith('italic bold 48px "Georgia"');
  });

  it('waits for images to settle before rendering', async () => {
    let resolveSrc: (url: string) => void = () => {};
    localStorage.getMediaUrl.mockReturnValue(
      new Promise<string>(resolve => {
        resolveSrc = resolve;
      })
    );

    const pending = service.renderRegion(contents([image]), rect);
    await Promise.resolve();
    expect(toDataURL).not.toHaveBeenCalled();

    // Media is missing locally → the node settles as a failed load.
    resolveSrc('');
    const blob = await pending;

    expect(toDataURL).toHaveBeenCalled();
    expect(blob).toBeInstanceOf(Blob);
  });

  it('draws nothing for a render cancelled while it waited its turn', async () => {
    const controller = new AbortController();
    controller.abort();

    const blob = await service.renderRegion(
      contents([rectShape]),
      rect,
      {},
      { signal: controller.signal }
    );

    expect(blob).toBeNull();
    expect(toDataURL).not.toHaveBeenCalled();
  });

  it('draws nothing for a render cancelled while images and fonts load', async () => {
    const controller = new AbortController();
    fontsLoad.mockImplementationOnce(() => {
      controller.abort();
      return Promise.resolve([]);
    });

    const blob = await service.renderRegion(
      contents([text]),
      rect,
      {},
      { signal: controller.signal }
    );

    expect(blob).toBeNull();
    expect(toDataURL).not.toHaveBeenCalled();
  });

  it('says which images could not be loaded', async () => {
    localStorage.getMediaUrl.mockResolvedValue(null);
    const onFailedImages = vi.fn();

    await service.renderRegion(contents([image]), rect, {}, { onFailedImages });

    expect(onFailedImages).toHaveBeenCalledWith(['I1']);
  });

  it('stops waiting for a font that never arrives', async () => {
    vi.useFakeTimers();
    try {
      fontsLoad.mockImplementationOnce(() => new Promise(() => undefined));
      const settled = vi.fn();
      void settleCanvasFonts(contents([text])).then(settled);

      await vi.advanceTimersByTimeAsync(14_000);
      expect(settled).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(settled).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns null when the browser refuses to render', async () => {
    toDataURL.mockReturnValue('data:,');
    await expect(
      service.renderRegion(contents([rectShape]), rect)
    ).resolves.toBeNull();
  });

  it('serialises concurrent renders', async () => {
    const order: string[] = [];
    toDataURL.mockImplementation(() => {
      order.push('render');
      return DATA_URL;
    });
    const a = service.renderRegion(contents([rectShape]), rect);
    const b = service.renderRegion(contents([rectShape]), rect);
    await Promise.all([a, b]);
    expect(order).toEqual(['render', 'render']);
  });
});
