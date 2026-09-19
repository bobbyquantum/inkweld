import { Injectable, signal } from '@angular/core';

/**
 * Timings of the transition, in milliseconds. They live here rather than in
 * the overlay because the service starts the navigation in step with them;
 * the overlay reads them back for its own stylesheet.
 */

/** How long the page takes to fade out behind the lifted cover. */
export const COVER_VEIL_MS = 240;
/** How long the cover takes to fly from the grid onto its stage. */
export const COVER_RISE_MS = 420;
/** How long the cover takes to swing open on its spine. */
export const COVER_TURN_MS = 760;
/** How long the opened book takes to dissolve into the project page. */
export const COVER_OPENED_MS = 320;
/** How long the cover takes to drop back onto the card it came from. */
export const COVER_RETURN_MS = 360;
/**
 * Longest the cover is held mid-turn waiting for the project page. Past this
 * it finishes anyway: a page that slow is showing its own loading state,
 * which is a better thing to reveal than a stalled animation.
 */
export const COVER_PAGE_WAIT_MS = 2000;

/** Where the clicked cover sat in the viewport, measured at click time. */
export interface CoverOpenRect {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

/** The project whose cover has been picked up, and where it came from. */
export interface CoverOpenRequest {
  readonly title: string;
  readonly username: string;
  readonly description: string | null;
  /** Blob URL of the cover art, or null when the card drew the default cover. */
  readonly coverUrl: string | null;
  /** Rect of the card that was clicked. */
  readonly origin: CoverOpenRect;
}

/**
 * What the cover is doing:
 * - `selecting` — it has been lifted out of the grid and is on show
 * - `opening`   — the reader chose to go in; it is swinging open
 * - `returning` — the reader backed out; it is dropping onto its card
 */
export type CoverOpenStage = 'selecting' | 'opening' | 'returning';

/** Test id of the `<img>` a project card renders when it has cover art. */
const COVER_IMAGE_SELECTOR = '[data-testid="project-cover-image"]';

/**
 * Holds the project whose cover the reader picked up.
 *
 * Clicking a project in the grid does not open it. It lifts the cover out of
 * the grid and puts it on show beside the project's title and description,
 * and only then — on a click anywhere, or the begin button — does the cover
 * swing open and the editor load behind it. Backing out drops the cover onto
 * the card it came from.
 *
 * `ProjectCoverOpenComponent`, mounted once in the app shell, does the
 * drawing. Keeping the state here means it outlives the home page, which is
 * destroyed the moment the navigation lands.
 */
@Injectable({ providedIn: 'root' })
export class ProjectCoverOpenService {
  private readonly _request = signal<CoverOpenRequest | null>(null);
  private readonly _stage = signal<CoverOpenStage>('selecting');

  /** The cover on show, or null when the grid is untouched. */
  readonly request = this._request.asReadonly();
  /** What that cover is doing. */
  readonly stage = this._stage.asReadonly();

  /** Navigation into the project, held until the reader asks for it. */
  private navigate: (() => Promise<boolean>) | null = null;

  /**
   * Resolves once the project page has been reached, so the overlay can hold
   * the cover mid-turn until there is something behind it to uncover. Null
   * until the reader goes in.
   */
  pageReady: Promise<void> | null = null;

  /** Identifies the cover on show, so a stale navigation is ignored. */
  private token = 0;

  /**
   * Lift `card`'s cover out of the grid and put it on show.
   *
   * Nothing is navigated yet — `open()` does that. When the card cannot be
   * measured there is nothing to animate from, so the caller's navigation is
   * run at once instead and the reader goes straight into the project.
   */
  select(
    card: HTMLElement,
    project: { title: string; username: string; description?: string | null },
    navigate: () => Promise<boolean>
  ): void {
    if (this._request()) {
      return;
    }

    const rect = card.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) {
      void navigate();
      return;
    }

    this.token++;
    this.navigate = navigate;
    this._stage.set('selecting');
    this._request.set({
      title: project.title,
      username: project.username,
      description: project.description ?? null,
      coverUrl: findCoverUrl(card),
      origin: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      },
    });
  }

  /** Go in: the cover swings open and the project loads behind it. */
  open(): void {
    if (!this._request() || this._stage() !== 'selecting') {
      return;
    }
    this._stage.set('opening');

    const token = this.token;
    const navigate = this.navigate;
    this.navigate = null;
    if (!navigate) {
      return;
    }

    const pageReady = navigate().then(reached => {
      if (!reached) {
        throw new Error('Project navigation did not complete');
      }
    });
    // A navigation that never arrives (a guard, a failed lazy chunk) drops the
    // cover rather than leaving it hanging over the grid. The handler also
    // keeps the rejection from surfacing as an unhandled one before the
    // overlay has attached its own.
    void pageReady.catch(() => {
      if (this.token === token) {
        this.finish();
      }
    });
    this.pageReady = pageReady;
  }

  /** Back out: the cover drops onto the card it came from. */
  dismiss(): void {
    if (!this._request() || this._stage() !== 'selecting') {
      return;
    }
    this.navigate = null;
    this._stage.set('returning');
  }

  /** Clear the overlay once it has finished playing. */
  finish(): void {
    this.token++;
    this.navigate = null;
    this.pageReady = null;
    this._request.set(null);
    this._stage.set('selecting');
  }
}

/** Read the blob URL of the cover art the card is showing, if it has any. */
function findCoverUrl(card: HTMLElement): string | null {
  const image = card.querySelector<HTMLImageElement>(COVER_IMAGE_SELECTOR);
  // The card hides the image when it fails to load and falls back to the
  // default cover, so a hidden image counts as no cover art.
  if (!image?.src || image.style.display === 'none') {
    return null;
  }
  return image.src;
}
