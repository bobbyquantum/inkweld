import {
  computed,
  DestroyRef,
  effect,
  inject,
  Injectable,
  signal,
  untracked,
} from '@angular/core';
import type { CanvasFrame } from '@models/canvas.model';
import {
  CANVAS_CONFIG_META_KEY,
  type CanvasContents,
  parseCanvasContents,
} from '@models/canvas-edit';
import {
  type CoverSource,
  coverSourceFrame,
  coverSourceHash,
  isCoverSourceFrame,
} from '@models/cover-source';
import { clampPixelRatio } from '@services/canvas/canvas-raster';
import { CanvasRasterizerService } from '@services/canvas/canvas-rasterizer.service';
import { LoggerService } from '@services/core/logger.service';
import { MediaSyncService } from '@services/local/media-sync.service';

import { ProjectService } from './project.service';
import { ProjectStateService } from './project-state.service';

/**
 * Idle time after the last canvas edit before the cover is re-rendered and
 * uploaded. Every upload replaces the cover file on the server (the URL is
 * cached immutably, so a new filename is minted each time), so this is
 * deliberately long enough to cover a burst of edits.
 */
export const COVER_RENDER_IDLE_MS = 15_000;

/** Delay before a staleness re-render on project open, letting media sync land. */
const STALE_CHECK_DELAY_MS = 2_000;

/** Target long edge of the cover raster; the server fits into 1600×2560. */
const COVER_TARGET_WIDTH_PX = 1600;

/** Cover renders are JPEG: no alpha, and far smaller than a painted PNG. */
const COVER_RASTER = {
  mimeType: 'image/jpeg',
  quality: 0.92,
  background: '#ffffff',
} as const;

export type CoverSourceStatus = 'idle' | 'pending' | 'rendering' | 'error';

/** A frame and the canvas contents it belongs to, ready to render. */
interface RenderInput {
  source: CoverSource;
  contents: CanvasContents;
  frame: CanvasFrame;
  hash: string;
}

/**
 * Keeps the project cover raster in step with the canvas frame it is linked
 * to (`projectMeta.coverSource`).
 *
 * Three triggers regenerate the raster:
 * - local canvas edits, debounced ({@link COVER_RENDER_IDLE_MS}) and flushed
 *   when the canvas tab closes;
 * - project open, when the stored hash no longer matches the canvas (a
 *   collaborator edited it, or an archive was imported);
 * - publish/export, which always renders fresh via {@link freshCoverBlob}.
 *
 * The raster is uploaded through the normal cover pipeline, so every
 * consumer of `coverMediaId` (home cards, other devices, EPUB, website) keeps
 * working unchanged, in both local and server mode.
 */
@Injectable({ providedIn: 'root' })
export class CoverSourceService {
  private readonly projectState = inject(ProjectStateService);
  private readonly projectService = inject(ProjectService);
  private readonly rasterizer = inject(CanvasRasterizerService);
  private readonly mediaSync = inject(MediaSyncService);
  private readonly logger = inject(LoggerService);
  private readonly destroyRef = inject(DestroyRef);

  /** What the render pipeline is doing, for the frames panel and dialog. */
  readonly status = signal<CoverSourceStatus>('idle');
  /** Why the last render failed, when `status` is `error`. */
  readonly lastError = signal<string | null>(null);

  /** The linked source, mirrored from project state. */
  readonly source = this.projectState.coverSource;

  /** Whether the source's canvas element exists in the loaded project. */
  private readonly sourceElementPresent = computed(() => {
    const source = this.source();
    if (!source) return false;
    return this.projectState.elements().some(e => e.id === source.elementId);
  });

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private staleTimer: ReturnType<typeof setTimeout> | null = null;
  /** Latest contents seen from the open canvas tab, awaiting the debounce. */
  private pendingContents: CanvasContents | null = null;
  /** Hash most recently attempted, so a failing render doesn't loop. */
  private lastAttemptedHash: string | null = null;
  private inFlight: Promise<Blob | null> | null = null;

  constructor() {
    // Staleness check: whenever the link, the element's presence or the
    // local media cache changes, compare the stored hash with the canvas.
    effect(() => {
      const source = this.source();
      const present = this.sourceElementPresent();
      this.mediaSync.mediaSyncVersion();
      untracked(() => {
        if (!source || !present) {
          this.clearStaleTimer();
          return;
        }
        this.scheduleStaleCheck();
      });
    });

    this.destroyRef.onDestroy(() => {
      this.clearDebounce();
      this.clearStaleTimer();
    });
  }

  // ── Linking ──────────────────────────────────────────────────────────────

  /** Whether `frameId` on `elementId` is the live cover frame. */
  isCoverFrame(elementId: string, frameId: string): boolean {
    return isCoverSourceFrame(this.source(), elementId, frameId);
  }

  /**
   * Make a frame the live cover. Renders straight away (through the debounce
   * bypass) so the user sees the result rather than waiting out the idle
   * period.
   */
  async link(elementId: string, frameId: string): Promise<boolean> {
    this.clearDebounce();
    this.lastAttemptedHash = null;
    this.lastError.set(null);
    this.projectState.setCoverSource({ type: 'canvas', elementId, frameId });
    const blob = await this.renderCurrent({ force: true });
    return blob !== null;
  }

  /** Stop generating the cover from the canvas. The last raster stays. */
  unlink(): void {
    this.clearDebounce();
    this.clearStaleTimer();
    this.pendingContents = null;
    this.status.set('idle');
    this.projectState.setCoverSource(undefined);
  }

  // ── Triggers ─────────────────────────────────────────────────────────────

  /**
   * Called by the canvas service after each local edit. Ignored unless the
   * edited canvas is the cover's source; otherwise schedules a debounced
   * render when the frame's rendered inputs changed.
   */
  notifyCanvasChanged(elementId: string, contents: CanvasContents): void {
    const source = this.source();
    if (source?.elementId !== elementId) return;

    const frame = coverSourceFrame(source, contents);
    if (!frame) {
      // The cover frame was deleted from under us.
      this.unlink();
      return;
    }

    const hash = coverSourceHash(contents, frame);
    if (hash === source.renderedHash) {
      this.clearDebounce();
      this.pendingContents = null;
      if (this.status() === 'pending') this.status.set('idle');
      return;
    }

    this.pendingContents = contents;
    this.status.set('pending');
    this.clearDebounce();
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.renderCurrent();
    }, COVER_RENDER_IDLE_MS);
  }

  /** Render now if an edit is waiting on the debounce (canvas tab closing). */
  async flush(): Promise<void> {
    if (!this.debounceTimer && !this.pendingContents) return;
    this.clearDebounce();
    await this.renderCurrent();
  }

  /**
   * A freshly rendered cover for publishing, or null when the cover is not
   * canvas-linked (callers fall back to the stored image). Also refreshes the
   * stored raster when it was stale.
   */
  async freshCoverBlob(): Promise<Blob | null> {
    if (!this.source()) return null;
    return this.renderCurrent({ force: true });
  }

  // ── Rendering ────────────────────────────────────────────────────────────

  /**
   * Render the linked frame and, when its hash differs from the stored one
   * (or `force`), upload it as the project cover. Resolves to the rendered
   * blob, or null when nothing could be rendered.
   */
  private renderCurrent(options?: { force?: boolean }): Promise<Blob | null> {
    if (this.inFlight) return this.inFlight;
    const run = this.doRender(options?.force ?? false).finally(() => {
      this.inFlight = null;
    });
    this.inFlight = run;
    return run;
  }

  private async doRender(force: boolean): Promise<Blob | null> {
    const input = this.resolveInput();
    this.pendingContents = null;
    if (!input) {
      if (this.status() !== 'idle') this.status.set('idle');
      return null;
    }

    const upToDate = input.hash === input.source.renderedHash;
    if (upToDate && !force) {
      this.status.set('idle');
      return null;
    }
    if (!force && this.lastAttemptedHash === input.hash) {
      // Already tried (and failed) this exact state; don't hammer.
      return null;
    }
    this.lastAttemptedHash = input.hash;

    // Nothing visible yet (a freshly created cover canvas): keep whatever
    // cover the project has rather than replacing it with a blank page.
    const hasContent = input.contents.objects.some(o => o.visible);
    if (!hasContent) {
      this.status.set('idle');
      return null;
    }

    this.status.set('rendering');
    this.lastError.set(null);
    try {
      const pixelRatio = clampPixelRatio(
        input.frame,
        Math.max(1, Math.min(3, COVER_TARGET_WIDTH_PX / input.frame.width))
      );
      const blob = await this.rasterizer.renderRegion(
        input.contents,
        input.frame,
        { ...COVER_RASTER, pixelRatio }
      );
      if (!blob) {
        this.fail('render-failed');
        return null;
      }

      // The user may have unlinked, or linked a different frame, while the
      // render was running. Don't overwrite a cover that is no longer ours.
      const current = this.source();
      if (
        !current ||
        current.elementId !== input.source.elementId ||
        current.frameId !== input.source.frameId
      ) {
        this.status.set('idle');
        return blob;
      }

      if (!upToDate) {
        await this.upload(blob, input);
      }
      this.status.set('idle');
      return blob;
    } catch (error) {
      this.logger.warn('CoverSource', 'Cover render failed', error);
      this.fail(error instanceof Error ? error.message : 'render-failed');
      return null;
    }
  }

  private async upload(blob: Blob, input: RenderInput): Promise<void> {
    const project = this.projectState.project();
    if (!project) throw new Error('No project loaded');

    const filename = await this.projectService.uploadProjectCover(
      project.username,
      project.slug,
      blob
    );
    const coverMediaId = filename.replace(/\.[^.]+$/, '');
    this.projectState.setRenderedCover(coverMediaId, {
      ...input.source,
      renderedHash: input.hash,
      renderedAt: new Date().toISOString(),
    });
    this.logger.debug(
      'CoverSource',
      `Cover re-rendered from canvas ${input.source.elementId} (${coverMediaId})`
    );
  }

  private fail(message: string): void {
    this.status.set('error');
    this.lastError.set(message);
  }

  /** The current source with the contents and frame it points at. */
  private resolveInput(): RenderInput | null {
    const source = this.source();
    if (!source) return null;

    const contents =
      this.pendingContents ?? this.readContents(source.elementId);
    if (!contents) return null;

    const frame = coverSourceFrame(source, contents);
    if (!frame) return null;

    return { source, contents, frame, hash: coverSourceHash(contents, frame) };
  }

  /**
   * A canvas's contents from the sync provider, falling back to the legacy
   * metadata snapshot for canvases that have never been opened since import.
   */
  private readContents(elementId: string): CanvasContents | null {
    const synced = this.projectState.getCanvasContents(elementId);
    if (synced && (synced.layers.length > 0 || synced.objects.length > 0)) {
      return synced;
    }
    const element = this.projectState.elements().find(e => e.id === elementId);
    return parseCanvasContents(element?.metadata?.[CANVAS_CONFIG_META_KEY]);
  }

  private scheduleStaleCheck(): void {
    this.clearStaleTimer();
    this.staleTimer = setTimeout(() => {
      this.staleTimer = null;
      // Edits in progress take precedence; they render on their own timer.
      if (this.debounceTimer) return;
      void this.renderCurrent();
    }, STALE_CHECK_DELAY_MS);
  }

  private clearDebounce(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private clearStaleTimer(): void {
    if (this.staleTimer) {
      clearTimeout(this.staleTimer);
      this.staleTimer = null;
    }
  }
}
