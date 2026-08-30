import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  InjectionToken,
  type OnDestroy,
  signal,
  untracked,
} from '@angular/core';
import { MatDialog, type MatDialogRef } from '@angular/material/dialog';
import { TutorialCardDialogComponent } from '@dialogs/tutorial-card-dialog/tutorial-card-dialog.component';
import { type TutorialStep } from '@models/tutorial';
import { TutorialService } from '@services/core/tutorial.service';

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
 * Anchor-resolution layer of the guided tours: while a tour is active, it
 * resolves the current step's anchor element and renders the page-blocking
 * scrim plus the spotlight ring. The step card itself is shown through a
 * MatDialog (`TutorialCardDialogComponent`), which receives the anchor rect
 * live and positions its own pane. The overlay is mounted once in the app
 * shell and renders nothing while no tour is active.
 *
 * Anchors are looked up by `data-testid`, waiting briefly for lazily-rendered
 * elements. Optional steps whose anchor never appears are skipped; required
 * ones fall back to a centered card.
 */
@Component({
  selector: 'app-tutorial-overlay',
  templateUrl: './tutorial-overlay.component.html',
  styleUrl: './tutorial-overlay.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TutorialOverlayComponent implements OnDestroy {
  protected readonly tutorial = inject(TutorialService);
  private readonly anchorWaitMs = inject(TUTORIAL_ANCHOR_WAIT_MS);
  private readonly dialog = inject(MatDialog);

  /** Bounding rect of the resolved anchor; null renders a centered card. */
  protected readonly anchorRect = signal<DOMRect | null>(null);

  private dialogRef: MatDialogRef<TutorialCardDialogComponent> | null = null;

  private anchorEl: HTMLElement | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private measureFrame: number | null = null;
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
          this.resolveStep(step);
        }
      });
    });

    // Mirror the tour lifecycle onto the step-card dialog: one dialog per
    // tour, kept open across steps and repositioned by the card itself.
    effect(() => {
      if (this.tutorial.isActive()) {
        untracked(() => this.openCardDialog());
      } else {
        untracked(() => this.closeCardDialog());
      }
    });
  }

  ngOnDestroy(): void {
    this.closeCardDialog();
    this.teardownStep();
  }

  private openCardDialog(): void {
    if (this.dialogRef) {
      return;
    }
    const ref = this.dialog.open(TutorialCardDialogComponent, {
      // The spotlight scrim rendered by this component is the backdrop.
      hasBackdrop: false,
      // The tutorial service owns what navigation means for the tour (an
      // untouched intro aborts silently; anything else counts as dismissed).
      closeOnNavigation: false,
      panelClass: 'tutorial-card-dialog',
      ariaModal: true,
      // Signals stay live across the ref, so the card re-places itself as
      // the anchor moves.
      data: { anchorRect: this.anchorRect },
    });
    // A close this component did not initiate (Escape) dismisses the tour.
    ref.afterClosed().subscribe(() => {
      this.dialogRef = null;
      if (this.tutorial.isActive()) {
        this.tutorial.dismiss();
      }
    });
    this.dialogRef = ref;
  }

  private closeCardDialog(): void {
    this.dialogRef?.close();
    this.dialogRef = null;
  }

  private resolveStep(step: TutorialStep): void {
    const testIds = step.anchorTestIds;
    if (!testIds || testIds.length === 0) {
      this.tutorial.markStepDisplayed();
      this.anchorRect.set(null);
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

    this.anchorRect.set(el.getBoundingClientRect());

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
    this.anchorRect.set(el.getBoundingClientRect());
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
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.listenersAttached) {
      window.removeEventListener('resize', this.scheduleRemeasure);
      document.removeEventListener('scroll', this.scheduleRemeasure, true);
      this.listenersAttached = false;
    }
    this.anchorEl = null;
    this.anchorRect.set(null);
  }
}
