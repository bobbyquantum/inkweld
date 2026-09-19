import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  type OnDestroy,
  signal,
  untracked,
} from '@angular/core';
import {
  COVER_OPENED_MS,
  COVER_PAGE_WAIT_MS,
  COVER_RISE_MS,
  COVER_TURN_MS,
  COVER_VEIL_MS,
  type CoverOpenRect,
  type CoverOpenRequest,
  ProjectCoverOpenService,
} from '@services/core/project-cover-open.service';

/**
 * Stages of the transition:
 * - `closed`  — the cover is drawn over the card that was clicked
 * - `rising`  — the page fades to black and the cover flies to its stage
 * - `turning` — the cover swings open on its spine, uncovering the editor
 * - `opened`  — the opened book dissolves into the project page
 */
export type CoverOpenPhase = 'closed' | 'rising' | 'turning' | 'opened';

/**
 * Viewport width from which the opened cover takes only the right-hand half of
 * the screen. Narrower than this there is no room for a two-page spread, so
 * the cover spans the viewport and swings off the left edge instead. Matches
 * the breakpoint the project page switches to its mobile layout at.
 */
const SPREAD_MIN_WIDTH = 760;

/** How long to wait for an animation frame before assuming none are coming. */
const FRAME_FALLBACK_MS = 100;

/** Corner radius of a card in the project grid, in pixels. */
const CARD_RADIUS = 12;

/** Root font size the project grid's covers are typeset against, in pixels. */
const CARD_ROOT_FONT_SIZE = 16;

/** Resolved placement of the cover, in the viewport it was measured against. */
export interface CoverOpenGeometry {
  /** Left edge of the opened cover — the spine it turns on. */
  readonly stageLeft: number;
  readonly stageTop: number;
  readonly stageWidth: number;
  readonly stageHeight: number;
  /** Transform that puts the stage back over the card that was clicked. */
  readonly closed: string;
  /** Corner radius matching the card's once the closed transform is applied. */
  readonly radius: string;
  /** Root font size that draws the default cover's type at card size. */
  readonly typeScale: string;
  /** Depth of the 3D space the cover turns in. */
  readonly perspective: number;
  /** Width of the veil once the cover has taken the stage. */
  readonly spine: number;
}

/**
 * Work out where the cover has to travel from and to.
 *
 * The opened cover keeps the card's proportions — the largest book of that
 * shape that fits beside the spine — so the flight is a plain uniform zoom.
 * That matters for more than the silhouette: an unevenly scaled cover would
 * crop its artwork differently at each end and the clicked card would visibly
 * jump the moment it was replaced.
 *
 * The cover is laid out at its open size and scaled *down* over the card, so
 * artwork is rasterised for the book rather than blown up from a thumbnail.
 * Its type is laid out oversized by the same factor (`typeScale`) so it too
 * starts out the card's size and grows with everything else.
 */
export function computeCoverOpenGeometry(
  origin: CoverOpenRect,
  viewportWidth: number,
  viewportHeight: number
): CoverOpenGeometry {
  const spine =
    viewportWidth >= SPREAD_MIN_WIDTH ? Math.round(viewportWidth / 2) : 0;
  const available = Math.max(viewportWidth - spine, 1);

  const aspect = origin.width / origin.height;
  let stageHeight = Math.max(viewportHeight, 1);
  let stageWidth = stageHeight * aspect;
  if (stageWidth > available) {
    stageWidth = available;
    stageHeight = stageWidth / aspect;
  }

  const scale = origin.height / stageHeight;
  const stageTop = Math.round((viewportHeight - stageHeight) / 2);

  return {
    stageLeft: spine,
    stageTop,
    stageWidth: round(stageWidth),
    stageHeight: round(stageHeight),
    closed:
      `translate(${round(origin.left - spine)}px, ${round(origin.top - stageTop)}px) ` +
      `scale(${round(scale)})`,
    // The radius lives in the cover's own coordinates, so it has to be divided
    // back out of the scale to read as the card's 12px on screen.
    radius: `${round(CARD_RADIUS / scale)}px`,
    typeScale: `${round(CARD_ROOT_FONT_SIZE / scale)}px`,
    perspective: Math.round(stageWidth * 2),
    spine,
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * The book-opening transition into a project, mounted once in the app shell.
 *
 * Clicking a project in the grid hands this component the cover that was
 * clicked (see `ProjectCoverOpenService`). It redraws that cover over the
 * card, fades the page to black, flies the cover onto the right-hand half of
 * the screen and then swings it open on its spine — by which time the project
 * editor has loaded underneath, so the turn uncovers it.
 */
@Component({
  selector: 'app-project-cover-open',
  templateUrl: './project-cover-open.component.html',
  styleUrl: './project-cover-open.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectCoverOpenComponent implements OnDestroy {
  private readonly coverOpen = inject(ProjectCoverOpenService);

  protected readonly request = this.coverOpen.request;
  protected readonly phase = signal<CoverOpenPhase>('closed');
  protected readonly geometry = signal<CoverOpenGeometry | null>(null);

  protected readonly veilMs = COVER_VEIL_MS;
  protected readonly riseMs = COVER_RISE_MS;
  protected readonly turnMs = COVER_TURN_MS;
  protected readonly openedMs = COVER_OPENED_MS;

  /** True from the moment the cover leaves the card it was drawn over. */
  protected readonly isOpening = computed(() => this.phase() !== 'closed');
  protected readonly isTurning = computed(
    () => this.phase() === 'turning' || this.phase() === 'opened'
  );

  /** Identifies the running animation, so a superseded one stops stepping. */
  private run = 0;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private frame: number | null = null;

  constructor() {
    effect(() => {
      const request = this.request();
      untracked(() => {
        this.stop();
        if (request) {
          void this.play(request);
        }
      });
    });
  }

  ngOnDestroy(): void {
    this.stop();
  }

  /** Step the cover through the transition, bailing out if it is replaced. */
  private async play(request: CoverOpenRequest): Promise<void> {
    const run = ++this.run;
    this.geometry.set(
      computeCoverOpenGeometry(
        request.origin,
        globalThis.innerWidth,
        globalThis.innerHeight
      )
    );
    this.phase.set('closed');

    // Let the closed cover paint over the card before anything moves: the
    // browser needs to have committed the start value, or the cover skips
    // straight to its open size with no transition at all. One frame renders
    // it, the second guarantees those styles were taken.
    await this.nextFrame();
    if (run !== this.run) return;
    await this.nextFrame();
    if (run !== this.run) return;
    this.phase.set('rising');

    await this.wait(COVER_RISE_MS);
    if (run !== this.run) return;
    // Hold the cover closed until the editor is behind it, so the turn has
    // something to uncover.
    await Promise.race([
      request.pageReady.catch(() => undefined),
      this.wait(COVER_PAGE_WAIT_MS),
    ]);
    if (run !== this.run) return;
    this.phase.set('turning');

    await this.wait(COVER_TURN_MS);
    if (run !== this.run) return;
    this.phase.set('opened');

    await this.wait(COVER_OPENED_MS);
    if (run !== this.run) return;
    this.coverOpen.finish();
  }

  /** Abandon the running animation and release its pending callbacks. */
  private stop(): void {
    this.run++;
    this.clearPending();
  }

  /**
   * Resolve after `ms`. Waits are tracked as a set rather than one at a time
   * because the wait for the project page is raced against it arriving, and
   * the loser of that race is still pending when the turn starts.
   */
  private wait(ms: number): Promise<void> {
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        resolve();
      }, ms);
      this.timers.add(timer);
    });
  }

  /**
   * Resolve once the browser has had a frame to draw in. A hidden tab draws
   * no frames at all, so a timer backs the request up: nothing is animating
   * there anyway, and without it the cover would still be mid-turn when the
   * tab came back.
   */
  private nextFrame(): Promise<void> {
    return new Promise(resolve => {
      const done = (): void => {
        this.clearPending();
        resolve();
      };
      this.frame = requestAnimationFrame(done);
      this.timers.add(setTimeout(done, FRAME_FALLBACK_MS));
    });
  }

  /** Drop every frame and timer the animation is waiting on. */
  private clearPending(): void {
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
  }
}
