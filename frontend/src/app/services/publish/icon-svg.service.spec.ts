import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IconSvgService } from './icon-svg.service';

const BADGE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 -960 960 960"><path d="M140-80q-24 0-42-18Z"/></svg>';

describe('IconSvgService', () => {
  let service: IconSvgService;
  let fetchMock: ReturnType<typeof vi.fn>;

  const response = (
    ok: boolean,
    body = '',
    contentType = 'image/svg+xml'
  ): Response =>
    ({
      ok,
      headers: { get: () => contentType },
      text: () => Promise.resolve(body),
    }) as unknown as Response;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), IconSvgService],
    });
    service = TestBed.inject(IconSvgService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('should load an icon from the local assets and normalise it', async () => {
    fetchMock.mockResolvedValue(response(true, BADGE_SVG));

    const svg = await service.getSvg('badge');

    expect(fetchMock).toHaveBeenCalledWith('/assets/icons/outlined/badge.svg');
    expect(svg).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" focusable="false" aria-hidden="true"><path d="M140-80q-24 0-42-18Z"/></svg>'
    );
  });

  it('should fall back to the CDN when the local file is missing, and cache the result', async () => {
    fetchMock
      .mockResolvedValueOnce(response(false))
      .mockResolvedValueOnce(response(true, BADGE_SVG));

    const first = await service.getSvg('some_custom_icon');
    const second = await service.getSvg('some_custom_icon');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://cdn.jsdelivr.net/npm/@material-symbols/svg-400@0.47.1/outlined/some_custom_icon.svg'
    );
    expect(first).toContain('<path');
    expect(second).toBe(first);
  });

  it('should translate legacy Material Icons names to their Symbols equivalents', async () => {
    fetchMock.mockResolvedValue(response(true, BADGE_SVG));

    await service.getSvg('place');

    expect(fetchMock).toHaveBeenCalledWith(
      '/assets/icons/outlined/location_on.svg'
    );
  });

  it('should return null for invalid names without fetching', async () => {
    expect(await service.getSvg('../etc/passwd')).toBeNull();
    expect(await service.getSvg('Badge')).toBeNull();
    expect(await service.getSvg('')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should return null when both sources fail or the network throws', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));

    expect(await service.getSvg('badge')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  describe('sanitize', () => {
    it('should refuse markup that is not a plain path-only svg', () => {
      expect(
        IconSvgService.sanitize(
          '<svg viewBox="0 0 10 10"><script>alert(1)</script><path d="M0 0"/></svg>'
        )
      ).toBeNull();
      expect(
        IconSvgService.sanitize(
          '<svg viewBox="0 0 10 10"><path d="M0 0" onload="x()"/><image href="x"/></svg>'
        )
      ).toBeNull();
      expect(
        IconSvgService.sanitize(
          '<svg viewBox="0 0 10 10"><path d="url(x)"/></svg>'
        )
      ).toBeNull();
      expect(IconSvgService.sanitize('<div>nope</div>')).toBeNull();
      expect(IconSvgService.sanitize('<svg><path d="M0 0"/></svg>')).toBeNull();
    });

    it('should drop foreign attributes while keeping path data', () => {
      const out = IconSvgService.sanitize(
        '<svg viewBox="0 0 10 10" onload="x()" class="a"><path d="M0 0L5 5" fill="red"/></svg>'
      );
      expect(out).toBe(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" focusable="false" aria-hidden="true"><path d="M0 0L5 5"/></svg>'
      );
    });
  });
});
