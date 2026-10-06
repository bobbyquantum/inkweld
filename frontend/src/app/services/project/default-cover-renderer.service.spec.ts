import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DefaultCoverRendererService,
  wrapCoverText,
} from './default-cover-renderer.service';

describe('wrapCoverText', () => {
  const measure = (s: string) => s.length * 10;

  it('wraps on word boundaries', () => {
    expect(wrapCoverText('the quick brown fox', 100, measure)).toEqual([
      'the quick',
      'brown fox',
    ]);
  });

  it('splits a word wider than the line', () => {
    expect(wrapCoverText('abcdefghij', 50, measure)).toEqual([
      'abcde',
      'fghij',
    ]);
  });

  it('returns no lines for blank text', () => {
    expect(wrapCoverText('   ', 100, measure)).toEqual([]);
  });
});

describe('DefaultCoverRendererService', () => {
  let service: DefaultCoverRendererService;
  const fillText = vi.fn();
  const drawImage = vi.fn();

  beforeEach(() => {
    fillText.mockClear();
    drawImage.mockClear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(DefaultCoverRendererService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function stubCanvas(ctx: unknown, blob: Blob | null): void {
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ctx,
      toBlob: (cb: (b: Blob | null) => void) => cb(blob),
    };
    vi.spyOn(document, 'createElement').mockReturnValue(
      canvas as unknown as HTMLElement
    );
  }

  function stubImage(loads: boolean): void {
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_: string) {
        queueMicrotask(() => (loads ? this.onload?.() : this.onerror?.()));
      }
    }
    vi.stubGlobal('Image', FakeImage);
  }

  const ctx = () => ({
    fillRect: vi.fn(),
    drawImage,
    fillText,
    measureText: (s: string) => ({ width: s.length * 10 }),
  });

  it('draws the artwork, title and author into a JPEG', async () => {
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    stubCanvas(ctx(), blob);
    stubImage(true);

    expect(await service.render('My Novella', 'alice')).toBe(blob);
    expect(drawImage).toHaveBeenCalled();
    const drawn = fillText.mock.calls.map(c => c[0]);
    expect(drawn).toContain('My Novella');
    expect(drawn).toContain('alice');
  });

  it('still renders text when the artwork cannot load', async () => {
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    stubCanvas(ctx(), blob);
    stubImage(false);

    expect(await service.render('Title', '')).toBe(blob);
    expect(drawImage).not.toHaveBeenCalled();
  });

  it('returns null without a 2d context', async () => {
    stubCanvas(null, null);
    expect(await service.render('Title', 'a')).toBeNull();
  });
});
