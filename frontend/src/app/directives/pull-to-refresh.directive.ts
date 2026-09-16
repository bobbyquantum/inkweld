import {
  computed,
  Directive,
  ElementRef,
  inject,
  input,
  type OnDestroy,
  signal,
} from '@angular/core';

/** Fraction of the finger's travel that the indicator actually moves. */
const RESISTANCE = 0.5;
/** Furthest the indicator travels from the top of the scroller, in px. */
const MAX_PULL = 80;
/** Pull distance that arms the refresh, in px. */
const TRIGGER_DISTANCE = 56;
/** Where the indicator rests while the refresh runs, in px. */
const REST_DISTANCE = 48;
/** Finger travel before we commit to a pull rather than a scroll, in px. */
const TOUCH_SLOP = 8;
/**
 * Shortest time the indicator stays up once the refresh starts, in ms.
 *
 * Local and cloud mode finish in well under a frame, so without a floor the
 * spinner is torn down before it ever paints and the gesture reads as having
 * done nothing at all.
 */
const MIN_REFRESH_MS = 500;

/** Phase of the gesture, used to style the indicator. */
export type PullToRefreshState = 'idle' | 'pulling' | 'armed' | 'refreshing';

/**
 * Pull-to-refresh for a scrolling element, on touch layouts.
 *
 * Chrome's own swipe-to-refresh is switched off app-wide (`overscroll-behavior-y`
 * on `html`) because in the TWA it reloads everything, so a deliberate refresh
 * gesture has to be provided by us.
 *
 * The host element carries the live pull offset in `--pull-distance` rather
 * than a signal: dragging is then one style write per frame instead of a change
 * detection pass over everything the scroller contains. Only the four discrete
 * phases go through signals.
 *
 * The indicator itself is the host's business -- read {@link state} and friends
 * off the exported directive.
 */
@Directive({
  selector: '[appPullToRefresh]',
  exportAs: 'pullToRefresh',
})
export class PullToRefreshDirective implements OnDestroy {
  /**
   * Work to run once the gesture completes. The indicator stays put until the
   * returned promise settles; reporting failures is the action's own business.
   */
  readonly action = input.required<() => Promise<unknown>>({
    alias: 'appPullToRefresh',
  });

  /** Ignores the gesture entirely while true -- set this on desktop layouts. */
  readonly pullToRefreshDisabled = input(false);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  private readonly phase = signal<PullToRefreshState>('idle');

  /** Current phase of the gesture. */
  readonly state = this.phase.asReadonly();

  /** True whenever the indicator should be on screen. */
  readonly active = computed(() => this.phase() !== 'idle');

  /**
   * True while the finger is down, when the indicator has to track it exactly
   * and so must not animate.
   */
  readonly dragging = computed(
    () => this.phase() === 'pulling' || this.phase() === 'armed'
  );

  /** Identifier of the touch we are following; null when not tracking one. */
  private touchId: number | null = null;
  /** Set once the drag has committed to being a pull rather than a scroll. */
  private engaged = false;
  private startX = 0;
  private startY = 0;

  constructor() {
    const el = this.host.nativeElement;
    el.addEventListener('touchstart', this.onTouchStart, { passive: true });
    // Not passive: cancelling the move is what stops the scroller taking the
    // gesture back off us halfway through a pull.
    el.addEventListener('touchmove', this.onTouchMove, { passive: false });
    el.addEventListener('touchend', this.onTouchEnd);
    el.addEventListener('touchcancel', this.onTouchCancel);
  }

  ngOnDestroy(): void {
    const el = this.host.nativeElement;
    el.removeEventListener('touchstart', this.onTouchStart);
    el.removeEventListener('touchmove', this.onTouchMove);
    el.removeEventListener('touchend', this.onTouchEnd);
    el.removeEventListener('touchcancel', this.onTouchCancel);
  }

  private readonly onTouchStart = (event: TouchEvent): void => {
    if (this.pullToRefreshDisabled() || this.phase() === 'refreshing') return;
    // Multi-touch is someone pinching or scrolling, not pulling.
    if (event.touches.length !== 1) return;
    if (this.host.nativeElement.scrollTop > 0) return;

    const touch = event.touches[0];
    this.touchId = touch.identifier;
    this.startX = touch.clientX;
    this.startY = touch.clientY;
    this.engaged = false;
  };

  private readonly onTouchMove = (event: TouchEvent): void => {
    if (this.touchId === null) return;
    const touch = findTouch(event.touches, this.touchId);
    if (!touch) return;

    const dx = touch.clientX - this.startX;
    const dy = touch.clientY - this.startY;

    if (!this.engaged) {
      // Sideways or upward first: it is a scroll, so stay out of the way for
      // the rest of this gesture.
      if (Math.abs(dx) > TOUCH_SLOP || dy < -TOUCH_SLOP) {
        this.touchId = null;
        return;
      }
      if (dy < TOUCH_SLOP) return;
      // A second finger arrived, or the content moved under us while we were
      // making up our mind.
      if (event.touches.length !== 1 || this.host.nativeElement.scrollTop > 0) {
        this.touchId = null;
        return;
      }
      this.engaged = true;
    }

    event.preventDefault();
    const distance = Math.min(Math.max(dy, 0) * RESISTANCE, MAX_PULL);
    this.setDistance(distance);
    this.phase.set(distance >= TRIGGER_DISTANCE ? 'armed' : 'pulling');
  };

  private readonly onTouchEnd = (event: TouchEvent): void => {
    if (this.touchId === null) return;
    if (!findTouch(event.changedTouches, this.touchId)) return;

    const armed = this.phase() === 'armed';
    this.touchId = null;
    this.engaged = false;

    if (armed) {
      void this.runRefresh();
    } else {
      this.reset();
    }
  };

  private readonly onTouchCancel = (): void => {
    if (this.touchId === null) return;
    this.touchId = null;
    this.engaged = false;
    this.reset();
  };

  private async runRefresh(): Promise<void> {
    this.phase.set('refreshing');
    this.setDistance(REST_DISTANCE);
    // allSettled rather than all: the action reports its own failures, and
    // either way the indicator has to come down -- but not before the floor
    // has elapsed, or a fast refresh never shows the user anything.
    await Promise.allSettled([
      this.action()(),
      new Promise(resolve => setTimeout(resolve, MIN_REFRESH_MS)),
    ]);
    this.reset();
  }

  private reset(): void {
    this.setDistance(0);
    this.phase.set('idle');
  }

  private setDistance(distance: number): void {
    this.host.nativeElement.style.setProperty(
      '--pull-distance',
      `${distance}px`
    );
  }
}

/** Finds the tracked touch in a list, since indices are not stable. */
function findTouch(touches: TouchList, id: number): Touch | undefined {
  return Array.from(touches).find(touch => touch.identifier === id);
}
