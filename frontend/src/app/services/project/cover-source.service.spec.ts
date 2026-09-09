import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  type CanvasFrame,
  type CanvasShape,
  LIGHT_PAGE,
} from '@models/canvas.model';
import type { CanvasContents } from '@models/canvas-edit';
import { type CoverSource, coverSourceHash } from '@models/cover-source';
import { CanvasRasterizerService } from '@services/canvas/canvas-rasterizer.service';
import { LoggerService } from '@services/core/logger.service';
import { MediaSyncService } from '@services/local/media-sync.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  COVER_RENDER_IDLE_MS,
  CoverSourceService,
} from './cover-source.service';
import { ProjectService } from './project.service';
import { ProjectStateService } from './project-state.service';

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

function contents(objects = [shape()], frames = [frame]): CanvasContents {
  return {
    layers: [
      {
        id: 'L1',
        name: 'Layer',
        visible: true,
        locked: false,
        opacity: 1,
        order: 0,
      },
    ],
    objects,
    frames,
  };
}

const linked: CoverSource = {
  type: 'canvas',
  elementId: 'canvas-1',
  frameId: 'F1',
};

describe('CoverSourceService', () => {
  let service: CoverSourceService;
  const blob = new Blob(['jpeg'], { type: 'image/jpeg' });

  const projectState = {
    coverSource: signal<CoverSource | undefined>(undefined),
    coverMediaId: signal<string | undefined>(undefined),
    elements: signal<{ id: string; metadata?: Record<string, string> }[]>([]),
    project: signal<{ username: string; slug: string } | undefined>({
      username: 'alice',
      slug: 'novel',
    }),
    getCanvasContents: vi.fn<(id: string) => CanvasContents | null>(() => null),
    setCoverSource: vi.fn((source: CoverSource | undefined) => {
      projectState.coverSource.set(source);
    }),
    setRenderedCover: vi.fn((mediaId: string, source: CoverSource) => {
      projectState.coverMediaId.set(mediaId);
      projectState.coverSource.set(source);
    }),
  };
  const projectService = {
    uploadProjectCover: vi.fn(() => Promise.resolve('cover-42.jpg')),
  };
  const rasterizer = {
    renderRegion: vi.fn(() => Promise.resolve<Blob | null>(blob)),
  };
  const mediaSync = { mediaSyncVersion: signal(0) };
  const logger = {
    debug: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    projectState.coverSource.set(undefined);
    projectState.coverMediaId.set(undefined);
    projectState.elements.set([{ id: 'canvas-1' }]);
    projectState.getCanvasContents.mockReturnValue(null);
    rasterizer.renderRegion.mockResolvedValue(blob);

    TestBed.configureTestingModule({
      providers: [
        CoverSourceService,
        { provide: ProjectStateService, useValue: projectState },
        { provide: ProjectService, useValue: projectService },
        { provide: CanvasRasterizerService, useValue: rasterizer },
        { provide: MediaSyncService, useValue: mediaSync },
        { provide: LoggerService, useValue: logger },
      ],
    });
    service = TestBed.inject(CoverSourceService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Let pending promises settle without advancing timers. */
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };

  describe('link', () => {
    it('renders the cover on the canvas page colour when it has one', async () => {
      const c = { ...contents(), background: '#101010' };
      projectState.getCanvasContents.mockReturnValue(c);

      await service.link('canvas-1', 'F1');

      expect(rasterizer.renderRegion).toHaveBeenCalledWith(
        c,
        frame,
        expect.objectContaining({ background: '#101010' })
      );
    });

    it('links the frame, renders it and uploads the result with its hash', async () => {
      const c = contents();
      projectState.getCanvasContents.mockReturnValue(c);

      const ok = await service.link('canvas-1', 'F1');

      expect(ok).toBe(true);
      expect(projectState.setCoverSource).toHaveBeenCalledWith(linked);
      expect(rasterizer.renderRegion).toHaveBeenCalledWith(
        c,
        frame,
        expect.objectContaining({
          mimeType: 'image/jpeg',
          background: LIGHT_PAGE.background,
          pixelRatio: 1.6,
        })
      );
      expect(projectService.uploadProjectCover).toHaveBeenCalledWith(
        'alice',
        'novel',
        blob
      );
      expect(projectState.setRenderedCover).toHaveBeenCalledWith('cover-42', {
        ...linked,
        renderedHash: coverSourceHash(c, frame),
        renderedAt: expect.any(String),
      });
      expect(service.status()).toBe('idle');
    });

    it('does not upload a blank cover for an empty frame', async () => {
      projectState.getCanvasContents.mockReturnValue(contents([]));

      const ok = await service.link('canvas-1', 'F1');

      expect(ok).toBe(false);
      expect(rasterizer.renderRegion).not.toHaveBeenCalled();
      expect(projectService.uploadProjectCover).not.toHaveBeenCalled();
      expect(projectState.coverSource()).toEqual(linked);
    });

    it('reports an error when the browser refuses to render', async () => {
      projectState.getCanvasContents.mockReturnValue(contents());
      rasterizer.renderRegion.mockResolvedValue(null);

      const ok = await service.link('canvas-1', 'F1');

      expect(ok).toBe(false);
      expect(service.status()).toBe('error');
      expect(service.lastError()).toBe('render-failed');
      expect(projectService.uploadProjectCover).not.toHaveBeenCalled();
    });

    it('reports an upload failure without leaving the pipeline stuck', async () => {
      projectState.getCanvasContents.mockReturnValue(contents());
      projectService.uploadProjectCover.mockRejectedValueOnce(
        new Error('offline')
      );

      await service.link('canvas-1', 'F1');

      expect(service.status()).toBe('error');
      expect(service.lastError()).toBe('offline');
      expect(projectState.setRenderedCover).not.toHaveBeenCalled();
    });
  });

  describe('unlink', () => {
    it('clears the source and keeps the raster', () => {
      projectState.coverSource.set(linked);
      projectState.coverMediaId.set('cover-1');

      service.unlink();

      expect(projectState.setCoverSource).toHaveBeenCalledWith(undefined);
      expect(projectState.coverMediaId()).toBe('cover-1');
      expect(service.isCoverFrame('canvas-1', 'F1')).toBe(false);
    });
  });

  describe('notifyCanvasChanged', () => {
    const rendered = (c: CanvasContents): CoverSource => ({
      ...linked,
      renderedHash: coverSourceHash(c, frame),
    });

    it('ignores canvases that are not the cover source', () => {
      projectState.coverSource.set(linked);
      service.notifyCanvasChanged('other', contents());
      vi.advanceTimersByTime(COVER_RENDER_IDLE_MS * 2);
      expect(rasterizer.renderRegion).not.toHaveBeenCalled();
      expect(service.status()).toBe('idle');
    });

    it('debounces edits and renders once the canvas goes idle', async () => {
      projectState.coverSource.set(rendered(contents()));
      const edited = contents([shape({ x: 500 })]);

      service.notifyCanvasChanged('canvas-1', contents([shape({ x: 300 })]));
      service.notifyCanvasChanged('canvas-1', edited);
      expect(service.status()).toBe('pending');

      vi.advanceTimersByTime(COVER_RENDER_IDLE_MS - 1);
      expect(rasterizer.renderRegion).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      await settle();

      expect(rasterizer.renderRegion).toHaveBeenCalledTimes(1);
      expect(rasterizer.renderRegion).toHaveBeenCalledWith(
        edited,
        frame,
        expect.anything()
      );
      expect(projectService.uploadProjectCover).toHaveBeenCalledTimes(1);
      expect(projectState.setRenderedCover).toHaveBeenCalledWith(
        'cover-42',
        expect.objectContaining({
          renderedHash: coverSourceHash(edited, frame),
        })
      );
    });

    it('skips edits that leave the rendered inputs unchanged', () => {
      const c = contents();
      projectState.coverSource.set(rendered(c));

      // Same content, a frame border toggle — not part of the hash.
      service.notifyCanvasChanged(
        'canvas-1',
        contents([shape()], [{ ...frame, visible: false }])
      );
      vi.advanceTimersByTime(COVER_RENDER_IDLE_MS * 2);

      expect(rasterizer.renderRegion).not.toHaveBeenCalled();
      expect(service.status()).toBe('idle');
    });

    it('unlinks when the cover frame is deleted', () => {
      projectState.coverSource.set(linked);
      service.notifyCanvasChanged('canvas-1', contents([shape()], []));
      expect(projectState.setCoverSource).toHaveBeenCalledWith(undefined);
    });

    it('flush renders a pending edit immediately', async () => {
      projectState.coverSource.set(rendered(contents()));
      service.notifyCanvasChanged('canvas-1', contents([shape({ x: 999 })]));

      await service.flush();

      expect(rasterizer.renderRegion).toHaveBeenCalledTimes(1);
      expect(projectService.uploadProjectCover).toHaveBeenCalledTimes(1);
      // The debounce was cancelled; nothing renders twice.
      vi.advanceTimersByTime(COVER_RENDER_IDLE_MS * 2);
      await settle();
      expect(rasterizer.renderRegion).toHaveBeenCalledTimes(1);
    });

    it('flush is a no-op with nothing pending', async () => {
      await service.flush();
      expect(rasterizer.renderRegion).not.toHaveBeenCalled();
    });
  });

  describe('freshCoverBlob', () => {
    it('returns null when the cover is not canvas-linked', async () => {
      await expect(service.freshCoverBlob()).resolves.toBeNull();
      expect(rasterizer.renderRegion).not.toHaveBeenCalled();
    });

    it('renders fresh and refreshes a stale stored raster', async () => {
      const c = contents();
      projectState.getCanvasContents.mockReturnValue(c);
      projectState.coverSource.set({ ...linked, renderedHash: 'stale' });

      await expect(service.freshCoverBlob()).resolves.toBe(blob);
      expect(projectService.uploadProjectCover).toHaveBeenCalledTimes(1);
    });

    it('renders fresh without re-uploading when the raster is current', async () => {
      const c = contents();
      projectState.getCanvasContents.mockReturnValue(c);
      projectState.coverSource.set({
        ...linked,
        renderedHash: coverSourceHash(c, frame),
      });

      await expect(service.freshCoverBlob()).resolves.toBe(blob);
      expect(projectService.uploadProjectCover).not.toHaveBeenCalled();
    });

    it('falls back to the legacy metadata snapshot for never-opened canvases', async () => {
      const c = contents();
      projectState.elements.set([
        { id: 'canvas-1', metadata: { canvasConfig: JSON.stringify(c) } },
      ]);
      projectState.coverSource.set(linked);

      await expect(service.freshCoverBlob()).resolves.toBe(blob);
      expect(rasterizer.renderRegion).toHaveBeenCalledWith(
        expect.objectContaining({ objects: c.objects }),
        frame,
        expect.anything()
      );
    });
  });

  describe('staleness check on load', () => {
    it('re-renders when the stored hash no longer matches the canvas', async () => {
      const c = contents();
      projectState.getCanvasContents.mockReturnValue(c);

      // A collaborator's render is recorded, then the canvas changed.
      projectState.coverSource.set({ ...linked, renderedHash: 'old' });
      TestBed.tick();
      await settle();
      expect(rasterizer.renderRegion).not.toHaveBeenCalled();

      vi.advanceTimersByTime(2_000);
      await settle();

      expect(rasterizer.renderRegion).toHaveBeenCalledTimes(1);
      expect(projectService.uploadProjectCover).toHaveBeenCalledTimes(1);
    });

    it('does nothing when the raster is already current', async () => {
      const c = contents();
      projectState.getCanvasContents.mockReturnValue(c);
      projectState.coverSource.set({
        ...linked,
        renderedHash: coverSourceHash(c, frame),
      });
      TestBed.tick();
      vi.advanceTimersByTime(2_000);
      await settle();

      expect(rasterizer.renderRegion).not.toHaveBeenCalled();
    });

    it('does not retry the same failing state in a loop', async () => {
      const c = contents();
      projectState.getCanvasContents.mockReturnValue(c);
      rasterizer.renderRegion.mockResolvedValue(null);
      projectState.coverSource.set({ ...linked, renderedHash: 'old' });
      TestBed.tick();
      vi.advanceTimersByTime(2_000);
      await settle();
      expect(rasterizer.renderRegion).toHaveBeenCalledTimes(1);

      // Media sync bumps trigger another check; the same hash is not retried.
      mediaSync.mediaSyncVersion.set(1);
      TestBed.tick();
      vi.advanceTimersByTime(2_000);
      await settle();
      expect(rasterizer.renderRegion).toHaveBeenCalledTimes(1);
    });

    it('waits until the canvas element is present in the project', async () => {
      const c = contents();
      projectState.getCanvasContents.mockReturnValue(c);
      projectState.elements.set([]);
      projectState.coverSource.set({ ...linked, renderedHash: 'old' });
      TestBed.tick();
      vi.advanceTimersByTime(2_000);
      await settle();
      expect(rasterizer.renderRegion).not.toHaveBeenCalled();

      projectState.elements.set([{ id: 'canvas-1' }]);
      TestBed.tick();
      vi.advanceTimersByTime(2_000);
      await settle();
      expect(rasterizer.renderRegion).toHaveBeenCalledTimes(1);
    });
  });

  describe('race protection', () => {
    it('does not record a raster for a frame that was unlinked mid-render', async () => {
      const c = contents();
      projectState.getCanvasContents.mockReturnValue(c);
      let resolveRender: (b: Blob) => void = () => {};
      rasterizer.renderRegion.mockReturnValue(
        new Promise<Blob | null>(resolve => {
          resolveRender = resolve;
        })
      );

      const linking = service.link('canvas-1', 'F1');
      await settle();
      service.unlink();
      resolveRender(blob);
      await linking;

      expect(projectService.uploadProjectCover).not.toHaveBeenCalled();
      expect(projectState.setRenderedCover).not.toHaveBeenCalled();
    });
  });
});
