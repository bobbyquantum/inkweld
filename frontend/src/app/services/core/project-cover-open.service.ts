import { Injectable, type Signal, signal } from '@angular/core';

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

/**
 * What the reader can do to the project while its cover is up, beyond going
 * in. These are the grid's own actions — the same ones the card's kebab menu
 * offers — handed over so the lifted cover does not have to reach for the
 * project, activation and dialog services itself. It is mounted in the app
 * shell, and everything it injects is loaded before the first page is.
 */
export interface CoverOpenActions {
  /** Pin the project to the top of the grid, or unpin it. */
  togglePin(): void;
  /** Download the project onto this device. */
  activate(): Promise<void>;
  /** Drop the project's data from this device, leaving it on the server. */
  deactivate(): Promise<void>;
  /** Delete the project outright. Resolves true once it is gone. */
  delete(): Promise<boolean>;
}

/** A project offered up to the overlay, with its live state and its actions. */
export interface CoverOpenProject {
  readonly title: string;
  readonly username: string;
  readonly description?: string | null;
  /**
   * Whether the project is on this device. Live, because the reader can
   * download it from the lifted cover and the cover has to notice.
   */
  readonly activated: Signal<boolean>;
  /** Whether it is pinned to the top of the grid. Live, for the same reason. */
  readonly pinned: Signal<boolean>;
  /** Someone else's project, shared with the reader: not theirs to delete. */
  readonly shared: boolean;
  readonly actions: CoverOpenActions;
  /**
   * Roughly how much the project occupies, in bytes, or null where nothing
   * can say — there is no size to ask for without a server.
   */
  readonly size: () => Promise<number | null>;
}

/** The project whose cover has been picked up, and where it came from. */
export interface CoverOpenRequest extends CoverOpenProject {
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
 * the grid and puts it on show beside the project's title, description and
 * size, and only then — on a click anywhere, or the begin button — does the
 * cover swing open and the editor load behind it. A project that is not on
 * this device yet offers to download itself instead, so the lifted cover is
 * also what the old activation dialog used to be. Backing out drops the cover
 * onto the card it came from.
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
   * run at once instead and the reader goes straight into the project. A
   * project that is not on this device has nowhere to go, so it stays up.
   */
  select(
    card: HTMLElement,
    project: CoverOpenProject,
    navigate: () => Promise<boolean>
  ): void {
    if (this._request()) {
      return;
    }

    const measured = card.getBoundingClientRect();
    const unmeasurable = measured.width < 1 || measured.height < 1;
    if (unmeasurable && project.activated()) {
      void navigate();
      return;
    }

    // A project that is not on this device has nowhere to go yet: the lifted
    // cover is the only place to download it from, so it goes up even with no
    // card to fly out of, from a card-shaped patch of the middle of the screen.
    const origin = unmeasurable
      ? centreOfScreen()
      : {
          top: measured.top,
          left: measured.left,
          width: measured.width,
          height: measured.height,
        };

    this.token++;
    this.navigate = navigate;
    this._stage.set('selecting');
    this._request.set({
      ...project,
      description: project.description ?? null,
      coverUrl: findCoverUrl(card),
      origin,
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

/** Proportions of a project card: the shape a cover flies out of. */
const PLACEHOLDER_CARD = { width: 200, height: 300 };

/** A card-sized patch of the middle of the screen, for when there is no card. */
function centreOfScreen(): CoverOpenRect {
  return {
    top: Math.round((globalThis.innerHeight - PLACEHOLDER_CARD.height) / 2),
    left: Math.round((globalThis.innerWidth - PLACEHOLDER_CARD.width) / 2),
    ...PLACEHOLDER_CARD,
  };
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
