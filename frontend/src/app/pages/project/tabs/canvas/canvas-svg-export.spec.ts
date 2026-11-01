import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  browserSvgOptions,
  browserTextMeasurer,
  downloadSvg,
} from './canvas-svg-export';

describe('browserTextMeasurer', () => {
  afterEach(() => vi.restoreAllMocks());

  function stubContext(metrics: Partial<TextMetrics>) {
    const context = {
      font: '',
      measureText: vi.fn(() => metrics),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as never
    );
    return context;
  }

  it('measures in the font the text is drawn in', () => {
    const context = stubContext({
      width: 120,
      fontBoundingBoxAscent: 30,
      fontBoundingBoxDescent: 8,
    });
    const measure = browserTextMeasurer();

    const result = measure?.('Hello', {
      family: 'EB Garamond',
      size: 40,
      bold: true,
      italic: true,
    });

    expect(context.font).toBe('italic bold 40px "EB Garamond"');
    expect(result).toEqual({ width: 120, ascent: 30, descent: 8 });
  });

  it('asks for a plain face when the text is plain', () => {
    const context = stubContext({ width: 10 });
    browserTextMeasurer()?.('x', {
      family: 'Lato',
      size: 10,
      bold: false,
      italic: false,
    });
    expect(context.font).toBe('normal normal 10px "Lato"');
  });

  it('estimates the height when the browser does not report it', () => {
    stubContext({ width: 10 });
    const result = browserTextMeasurer()?.('x', {
      family: 'Lato',
      size: 10,
      bold: false,
      italic: false,
    });
    expect(result).toEqual({ width: 10, ascent: 8, descent: 2 });
  });

  it('has nothing to offer without a 2D context', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(browserTextMeasurer()).toBeUndefined();
    expect(browserSvgOptions().measureText).toBeUndefined();
  });
});

describe('downloadSvg', () => {
  afterEach(() => vi.restoreAllMocks());

  it('offers the document as a file named after the element', async () => {
    let blob: Blob | undefined;
    vi.spyOn(URL, 'createObjectURL').mockImplementation(b => {
      blob = b as Blob;
      return 'blob:x';
    });
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockReturnValue();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockReturnValue();
    const anchors = vi.spyOn(document, 'createElement');

    downloadSvg({ layers: [], objects: [] }, 'My Map');

    expect(click).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith('blob:x');
    const anchor = anchors.mock.results.at(-1)?.value as HTMLAnchorElement;
    expect(anchor.download).toBe('My Map.svg');
    expect(blob?.type).toBe('image/svg+xml');
    expect(await blob?.text()).toContain('<svg');
  });

  it('crops to a region when given one', async () => {
    let blob: Blob | undefined;
    vi.spyOn(URL, 'createObjectURL').mockImplementation(b => {
      blob = b as Blob;
      return 'blob:x';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockReturnValue();

    downloadSvg({ layers: [], objects: [] }, 'Crop', {
      x: 1,
      y: 2,
      width: 30,
      height: 40,
    });

    expect(await blob?.text()).toContain('viewBox="1 2 30 40"');
  });
});
