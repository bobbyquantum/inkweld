import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  type ElementRef,
  inject,
  type OnDestroy,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@jsverse/transloco';
import {
  COVER_OPENED_MS,
  COVER_PAGE_WAIT_MS,
  COVER_RETURN_MS,
  COVER_RISE_MS,
  COVER_TURN_MS,
  COVER_VEIL_MS,
  type CoverOpenRect,
  ProjectCoverOpenService,
} from '@services/core/project-cover-open.service';

/**
 * Stages of the transition:
 * - `closed`    — the cover is drawn over the card that was clicked
 * - `selected`  — it has flown out of the grid and is on show
 * - `turning`   — it is swinging open on its hinge
 * - `opened`    — the opened book dissolves into the project page
 * - `returning` — it is dropping back onto the card it came from
 */
export type CoverOpenPhase =
  'closed' | 'selected' | 'turning' | 'opened' | 'returning';

/**
 * Viewport width from which the cover shares the screen with the project's
 * details. Narrower than this there is no room beside it, so the cover takes
 * the width and its button sits underneath.
 */
const DETAILS_MIN_WIDTH = 760;

/** How much of the viewport's height the cover takes when there is room. */
const COVER_HEIGHT_RATIO = 0.9;

/** Room left under the cover for the title and button on a narrow screen. */
const NARROW_ACTIONS_HEIGHT = 132;

/** Breathing room around the cover on a narrow screen, in pixels. */
const NARROW_MARGIN = 20;

/** How long to wait for an animation frame before assuming none are coming. */
const FRAME_FALLBACK_MS = 100;

/** Corner radius of a card in the project grid, in pixels. */
const CARD_RADIUS = 12;

/** Root font size the project grid's covers are typeset against, in pixels. */
const CARD_ROOT_FONT_SIZE = 16;

/** Resolved placement of the cover, in the viewport it was measured against. */
export interface CoverOpenGeometry {
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
  /** Whether the project's details have room beside the cover. */
  readonly hasDetails: boolean;
}

/**
 * Work out where the cover goes when it is lifted out of the grid.
 *
 * It keeps the card's proportions — an unevenly scaled cover would crop its
 * artwork differently at each end, and the card would visibly jump the moment
 * the overlay replaced it — and hangs on the left of the screen, which is the
 * edge it hinges on. Wide enough and the project's details sit beside it;
 * narrower, it takes the width and leaves room underneath for its button.
 */
export function computeCoverOpenGeometry(
  origin: CoverOpenRect,
  viewportWidth: number,
  viewportHeight: number
): CoverOpenGeometry {
  const aspect = origin.width / origin.height;
  const hasDetails = viewportWidth >= DETAILS_MIN_WIDTH;

  let stageHeight: number;
  let stageWidth: number;
  let stageLeft: number;

  if (hasDetails) {
    // Flush to the left edge: that edge is the hinge, so the cover swings
    // straight off the screen rather than across the details beside it.
    stageHeight = Math.max(viewportHeight * COVER_HEIGHT_RATIO, 1);
    stageWidth = stageHeight * aspect;
    const half = Math.max(viewportWidth / 2, 1);
    if (stageWidth > half) {
      stageWidth = half;
      stageHeight = stageWidth / aspect;
    }
    stageLeft = 0;
  } else {
    const available = Math.max(
      viewportHeight - NARROW_ACTIONS_HEIGHT - NARROW_MARGIN * 2,
      1
    );
    stageHeight = available;
    stageWidth = stageHeight * aspect;
    const widest = Math.max(viewportWidth - NARROW_MARGIN * 2, 1);
    if (stageWidth > widest) {
      stageWidth = widest;
      stageHeight = stageWidth / aspect;
    }
    stageLeft = Math.round((viewportWidth - stageWidth) / 2);
  }

  const stageTop = hasDetails
    ? Math.round((viewportHeight - stageHeight) / 2)
    : NARROW_MARGIN;
  const scale = origin.height / stageHeight;

  return {
    stageLeft,
    stageTop,
    stageWidth: round(stageWidth),
    stageHeight: round(stageHeight),
    closed:
      `translate(${round(origin.left - stageLeft)}px, ${round(origin.top - stageTop)}px) ` +
      `scale(${round(scale)})`,
    // The radius lives in the cover's own coordinates, so it has to be divided
    // back out of the scale to read as the card's 12px on screen.
    radius: `${round(CARD_RADIUS / scale)}px`,
    typeScale: `${round(CARD_ROOT_FONT_SIZE / scale)}px`,
    perspective: Math.round(stageWidth * 2),
    hasDetails,
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Whether the reader has asked the platform for reduced motion. */
function prefersReducedMotion(): boolean {
  return (
    globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  );
}

/**
 * The cover a reader has picked up, and the book opening they get when they
 * go in. Mounted once in the app shell.
 *
 * Clicking a project in the grid lifts its cover out and puts it on show
 * beside the title and description (underneath them, on a narrow screen).
 * Clicking again — anywhere, or the begin button — swings the cover open on
 * its left edge while the project loads behind it. Backing out drops the
 * cover onto the card it came from.
 */
@Component({
  selector: 'app-project-cover-open',
  imports: [MatButtonModule, MatIconModule, TranslocoModule],
  templateUrl: './project-cover-open.component.html',
  styleUrl: './project-cover-open.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectCoverOpenComponent implements OnDestroy {
  private readonly coverOpen = inject(ProjectCoverOpenService);

  protected readonly request = this.coverOpen.request;
  protected readonly phase = signal<CoverOpenPhase>('closed');
  protected readonly geometry = signal<CoverOpenGeometry | null>(null);

  /**
   * Zero when the reader asked for reduced motion. The state itself is not
   * decoration — it is where the project's details and its begin button live,
   * so it still appears; it just appears at once instead of travelling.
   */
  private readonly motion = prefersReducedMotion() ? 0 : 1;

  protected readonly veilMs = COVER_VEIL_MS * this.motion;
  protected readonly riseMs = COVER_RISE_MS * this.motion;
  protected readonly turnMs = COVER_TURN_MS * this.motion;
  protected readonly openedMs = COVER_OPENED_MS * this.motion;
  protected readonly returnMs = COVER_RETURN_MS * this.motion;

  /** True from the moment the cover leaves the card it was drawn over. */
  protected readonly isLifted = computed(() => this.phase() !== 'closed');
  protected readonly isTurning = computed(
    () => this.phase() === 'turning' || this.phase() === 'opened'
  );
  /** The details only show while the cover is waiting to be opened. */
  protected readonly showDetails = computed(
    () => this.phase() === 'selected' && (this.geometry()?.hasDetails ?? false)
  );

  private readonly beginButton =
    viewChild<ElementRef<HTMLButtonElement>>('beginButton');

  /** Identifies the running animation, so a superseded one stops stepping. */
  private run = 0;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private frame: number | null = null;

  constructor() {
    effect(() => {
      const request = this.request();
      const stage = this.coverOpen.stage();
      untracked(() => {
        if (!request) {
          this.stop();
          this.phase.set('closed');
          return;
        }
        if (stage === 'selecting' && this.phase() === 'closed') {
          void this.lift(request);
        } else if (stage === 'opening' && this.phase() === 'selected') {
          void this.turn();
        } else if (stage === 'returning' && this.phase() === 'selected') {
          void this.returnToCard();
        }
      });
    });
  }

  ngOnDestroy(): void {
    this.stop();
  }

  /** Go in. Also what a click anywhere over the overlay does. */
  protected begin(event?: Event): void {
    // The button sits inside the backdrop that opens on any click; without
    // this the one press would be counted twice.
    event?.stopPropagation();
    this.coverOpen.open();
  }

  /** Back out, putting the cover down where it came from. */
  protected close(event: Event): void {
    event.stopPropagation();
    this.coverOpen.dismiss();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.coverOpen.dismiss();
    }
  }

  /** Lift the cover out of the grid and hold it there. */
  private async lift(request: {
    readonly origin: CoverOpenRect;
  }): Promise<void> {
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
    this.phase.set('selected');

    await this.wait(this.riseMs);
    if (run !== this.run) return;
    this.beginButton()?.nativeElement.focus({ preventScroll: true });
  }

  /** Swing the cover open, uncovering the project page behind it. */
  private async turn(): Promise<void> {
    const run = ++this.run;
    this.phase.set('turning');
    // Hold the cover mid-turn until the editor is behind it, so the swing has
    // something to uncover.
    await Promise.race([
      this.coverOpen.pageReady?.catch(() => undefined) ?? Promise.resolve(),
      this.wait(COVER_PAGE_WAIT_MS),
    ]);
    if (run !== this.run) return;

    await this.wait(this.turnMs);
    if (run !== this.run) return;
    this.phase.set('opened');

    await this.wait(this.openedMs);
    if (run !== this.run) return;
    this.coverOpen.finish();
  }

  /** Drop the cover back onto the card it was lifted from. */
  private async returnToCard(): Promise<void> {
    const run = ++this.run;
    this.phase.set('returning');

    await this.wait(this.returnMs);
    if (run !== this.run) return;
    this.coverOpen.finish();
  }

  /** Abandon the running animation and release its pending callbacks. */
  private stop(): void {
    this.run++;
    this.clearPending();
  }

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
   * there anyway, and without it the cover would sit half-lifted until the
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
