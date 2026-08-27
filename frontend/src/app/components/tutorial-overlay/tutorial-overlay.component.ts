import { A11yModule } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  type ElementRef,
  inject,
  InjectionToken,
  type OnDestroy,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@jsverse/transloco';
import { type TutorialStep } from '@models/tutorial';
import { TutorialService } from '@services/core/tutorial.service';

import { type CardPosition, computeCardPosition } from './tutorial-position';

/** How long to wait for a step's anchor to appear before giving up. */
export const TUTORIAL_ANCHOR_WAIT_MS = new InjectionToken<number>(
  'TUTORIAL_ANCHOR_WAIT_MS',
  { factory: () => 1500 }
);

/** Polling interval while waiting for a step's anchor to appear. */
const ANCHOR_POLL_MS = 100;

/**
 * Cap on the wait for OPTIONAL steps: their anchors are usually already on
 * screen (or never will be), so give up quickly to keep skip chains snappy.
 */
const OPTIONAL_ANCHOR_WAIT_MS = 600;

/**
 * Visual layer of the guided tours: renders a spotlight over the current
 * step's anchor element plus a positioned step card, or a centered card for
 * anchor-less steps. Mounted once in the app shell; renders nothing while no
 * tour is active.
 *
 * Anchors are looked up by `data-testid`, waiting briefly for lazily-rendered
 * elements. Optional steps whose anchor never appears are skipped; required
 * ones fall back to a centered card.
 */
@Component({
  selector: 'app-tutorial-overlay',
  imports: [A11yModule, MatButtonModule, MatIconModule, TranslocoModule],
  templateUrl: './tutorial-overlay.component.html',
  styleUrl: './tutorial-overlay.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class TutorialOverlayComponent implements OnDestroy {
  protected readonly tutorial = inject(TutorialService);
  private readonly anchorWaitMs = inject(TUTORIAL_ANCHOR_WAIT_MS);

  /** Bounding rect of the resolved anchor; null renders a centered card. */
  protected readonly anchorRect = signal<DOMRect | null>(null);

  /** Fixed-position coordinates for the card; null centers it via CSS. */
  protected readonly cardPosition = signal<CardPosition | null>(null);

  /** False while the card is being (re)measured, to avoid position flicker. */
  protected readonly cardReady = signal(false);

  private readonly cardElement =
    viewChild<ElementRef<HTMLElement>>('tutorialCard');

  private anchorEl: HTMLElement | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private measureFrame: number | null = null;
  private placementFrame: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private listenersAttached = false;

  private readonly scheduleRemeasure = (): void => {
    if (this.measureFrame !== null) {
      return;
    }
    this.measureFrame = requestAnimationFrame(() => {
      this.measureFrame = null;
      this.remeasureAnchor();
    });
  };

  constructor() {
    // Resolve the anchor whenever the step changes (or the tour closes).
    effect(() => {
      const step = this.tutorial.currentStep();
      untracked(() => {
        this.teardownStep();
        if (step) {
          this.cardReady.set(false);
          this.resolveStep(step);
        }
      });
    });
  }

  ngOnDestroy(): void {
    this.teardownStep();
  }

  protected onEscape(): void {
    if (this.tutorial.isActive()) {
      this.tutorial.dismiss();
    }
  }

  protected isIntroStep(): boolean {
    return this.tutorial.stepIndex() === 0;
  }

  protected isLastStep(): boolean {
    return this.tutorial.stepIndex() >= this.tutorial.totalSteps() - 1;
  }

  private resolveStep(step: TutorialStep): void {
    const testIds = step.anchorTestIds;
    if (!testIds || testIds.length === 0) {
      this.tutorial.markStepDisplayed();
      this.anchorRect.set(null);
      this.scheduleCardPlacement(null);
      return;
    }

    const waitMs = step.optional
      ? Math.min(OPTIONAL_ANCHOR_WAIT_MS, this.anchorWaitMs)
      : this.anchorWaitMs;
    const deadline = Date.now() + waitMs;
    const tryResolve = (): void => {
      const el = this.findAnchor(testIds);
      if (el) {
        this.stopPolling();
        this.attachAnchor(el);
        return;
      }
      if (Date.now() >= deadline) {
        this.stopPolling();
        if (step.optional) {
          this.tutorial.skipUnavailableStep();
        } else {
          // Required step without an anchor: show the card centered.
          this.tutorial.markStepDisplayed();
          this.anchorRect.set(null);
          this.scheduleCardPlacement(null);
        }
      }
    };

    tryResolve();
    if (!this.anchorEl && this.pollTimer === null) {
      this.pollTimer = setInterval(tryResolve, ANCHOR_POLL_MS);
    }
  }

  private findAnchor(testIds: string[]): HTMLElement | null {
    for (const testId of testIds) {
      const el = document.querySelector(`[data-testid="${testId}"]`);
      if (el instanceof HTMLElement && this.isVisible(el)) {
        return el;
      }
    }
    return null;
  }

  private isVisible(el: HTMLElement): boolean {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  private attachAnchor(el: HTMLElement): void {
    this.anchorEl = el;
    this.tutorial.markStepDisplayed();

    if (typeof el.scrollIntoView === 'function') {
      const reducedMotion =
        typeof matchMedia === 'function' &&
        matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
    }

    const rect = el.getBoundingClientRect();
    this.anchorRect.set(rect);
    this.scheduleCardPlacement(rect);

    if (!this.listenersAttached) {
      window.addEventListener('resize', this.scheduleRemeasure);
      document.addEventListener('scroll', this.scheduleRemeasure, true);
      this.listenersAttached = true;
    }
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.scheduleRemeasure);
      this.resizeObserver.observe(el);
    }
  }

  private remeasureAnchor(): void {
    const el = this.anchorEl;
    if (!el) {
      return;
    }
    if (!el.isConnected) {
      // The anchor left the DOM (layout change) — re-resolve the step.
      const step = this.tutorial.currentStep();
      this.teardownStep();
      if (step) {
        this.resolveStep(step);
      }
      return;
    }
    const rect = el.getBoundingClientRect();
    this.anchorRect.set(rect);
    this.scheduleCardPlacement(rect);
  }

  private scheduleCardPlacement(rect: DOMRect | null): void {
    if (this.placementFrame !== null) {
      cancelAnimationFrame(this.placementFrame);
    }
    this.placementFrame = requestAnimationFrame(() => {
      this.placementFrame = null;
      if (!rect) {
        this.cardPosition.set(null);
        this.cardReady.set(true);
        this.focusCard();
        return;
      }
      const card = this.cardElement()?.nativeElement;
      if (!card) {
        // Card not rendered yet — try again next frame.
        this.scheduleCardPlacement(rect);
        return;
      }
      this.cardPosition.set(
        computeCardPosition(
          rect,
          { width: card.offsetWidth, height: card.offsetHeight },
          { width: window.innerWidth, height: window.innerHeight }
        )
      );
      this.cardReady.set(true);
      this.focusCard();
    });
  }

  /**
   * Move focus to the step's primary button once the card is visible. The
   * CDK focus trap captures while the card is still hidden (unmeasured), so
   * its own initial focus attempt lands nowhere.
   */
  private focusCard(): void {
    const card = this.cardElement()?.nativeElement;
    if (!card || card.contains(document.activeElement)) {
      return;
    }
    card.querySelector<HTMLElement>('[cdkFocusInitial]')?.focus();
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private teardownStep(): void {
    this.stopPolling();
    if (this.measureFrame !== null) {
      cancelAnimationFrame(this.measureFrame);
      this.measureFrame = null;
    }
    if (this.placementFrame !== null) {
      cancelAnimationFrame(this.placementFrame);
      this.placementFrame = null;
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.listenersAttached) {
      window.removeEventListener('resize', this.scheduleRemeasure);
      document.removeEventListener('scroll', this.scheduleRemeasure, true);
      this.listenersAttached = false;
    }
    this.anchorEl = null;
    this.anchorRect.set(null);
    this.cardPosition.set(null);
  }
}
