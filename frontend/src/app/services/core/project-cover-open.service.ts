import { Injectable, signal } from '@angular/core';

/**
 * Timings of the transition, in milliseconds. They live here rather than in
 * the overlay because the service has to start the navigation in step with
 * them; the overlay reads them back for its own stylesheet.
 */

/** How long the page takes to fade to black behind the lifted cover. */
export const COVER_VEIL_MS = 240;
/** How long the cover takes to fly from the grid onto its stage. */
export const COVER_RISE_MS = 420;
/** How long the cover takes to swing open on its spine. */
export const COVER_TURN_MS = 760;
/** How long the opened book takes to dissolve into the project page. */
export const COVER_OPENED_MS = 320;
/**
 * Longest the closed cover is held waiting for the project page to activate.
 * Past this the cover turns anyway: a page that slow is showing its own
 * loading state, which is a better thing to reveal than a stalled animation.
 */
export const COVER_PAGE_WAIT_MS = 2000;

/** Where the clicked cover sat in the viewport, measured at click time. */
export interface CoverOpenRect {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Everything the overlay needs to redraw the clicked cover and open it. The
 * artwork is passed as the blob URL the card was already showing rather than
 * re-resolved from storage: it guarantees the overlay's first frame matches
 * the card pixel for pixel, and it keeps the media services out of the app
 * shell's bootstrap graph.
 */
export interface CoverOpenRequest {
  /** Project title, drawn on the default cover. */
  readonly title: string;
  /** Project owner, drawn above the title on the default cover. */
  readonly username: string;
  /** Blob URL of the cover art, or null when the card drew the default cover. */
  readonly coverUrl: string | null;
  /** Rect of the card that was clicked. */
  readonly origin: CoverOpenRect;
  /**
   * Resolves once the project page has been activated behind the cover, so
   * the turn reveals the editor rather than the grid it was launched from.
   * Rejects if the navigation never got there.
   */
  readonly pageReady: Promise<void>;
}

/** Test id of the `<img>` a project card renders when it has cover art. */
const COVER_IMAGE_SELECTOR = '[data-testid="project-cover-image"]';

/**
 * Drives the book-opening transition between the project grid and the project
 * editor. The home page hands over the card that was clicked and the
 * navigation to run behind it; `ProjectCoverOpenComponent`, mounted once in
 * the app shell, does the drawing. Keeping the state here means the animation
 * outlives the home page, which is destroyed the moment the route changes.
 */
@Injectable({ providedIn: 'root' })
export class ProjectCoverOpenService {
  private readonly _request = signal<CoverOpenRequest | null>(null);

  /** The cover currently being opened, or null while the overlay is idle. */
  readonly request = this._request.asReadonly();

  /** Identifies the running animation so late navigation results are ignored. */
  private token = 0;

  /**
   * Open a project, playing its cover over the page while `navigate` runs.
   *
   * `navigate` is always called — exactly once, immediately if the transition
   * is not playing, otherwise once the veil has hidden the page underneath.
   * The transition is skipped when the user asked for reduced motion, when
   * another cover is already opening, or when the card has no measurable size.
   */
  open(
    card: HTMLElement,
    project: { title: string; username: string },
    navigate: () => Promise<boolean>
  ): void {
    const origin = this.measure(card);
    if (!origin) {
      void navigate();
      return;
    }

    const token = ++this.token;
    // Hold the page swap until the veil is black. Navigating on the click
    // instead would dissolve the grid into the editor in plain sight, behind
    // a cover that has barely left its card.
    const pageReady = new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        navigate().then(reached => {
          if (reached) {
            resolve();
          } else {
            reject(new Error('Project navigation did not complete'));
          }
        }, reject);
      }, COVER_VEIL_MS);
    });
    // A navigation that never arrives (a guard, a failed lazy chunk) drops the
    // overlay rather than leaving a black screen over the grid. The handler
    // also keeps the rejection from surfacing as an unhandled one before the
    // overlay has rendered and attached its own.
    void pageReady.catch(() => this.abandon(token));

    this._request.set({
      title: project.title,
      username: project.username,
      coverUrl: findCoverUrl(card),
      origin,
      pageReady,
    });
  }

  /** The card's viewport rect, or null when the cover should not play. */
  private measure(card: HTMLElement): CoverOpenRect | null {
    if (this._request() || prefersReducedMotion()) {
      return null;
    }
    const rect = card.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) {
      return null;
    }
    return {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    };
  }

  /** Clear the overlay once it has finished playing. */
  finish(): void {
    this.token++;
    this._request.set(null);
  }

  /** Drop the overlay immediately, leaving whatever page is on screen. */
  cancel(): void {
    this.finish();
  }

  /** Cancel, but only if `token` is still the animation on screen. */
  private abandon(token: number): void {
    if (this.token === token) {
      this.cancel();
    }
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

/** Whether the user has asked the platform for reduced motion. */
function prefersReducedMotion(): boolean {
  return (
    globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  );
}
