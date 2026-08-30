import { computed, inject, Injectable, signal } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';
import {
  type TutorialProgress,
  type TutorialStep,
  type TutorialTour,
  type TutorialTourId,
  type TutorialTourStatus,
} from '@models/tutorial';

import { SettingsService } from './settings.service';
import { TUTORIAL_TOURS } from './tutorial-tours';

/** Settings key holding per-tour completion state (per storage profile). */
const TUTORIAL_PROGRESS_KEY = 'tutorialProgress';

/**
 * Unprefixed localStorage escape hatch: when set to `off`, tours never start
 * automatically (explicit starts still work). Used by the e2e fixtures so
 * unrelated tests aren't interrupted by the first-run offer.
 */
const AUTO_START_OVERRIDE_KEY = 'inkweld-tutorial-autostart';

/**
 * Drives the interactive guided tours that orient new users.
 *
 * Holds the active tour and step as signals; the visual layer is
 * `TutorialOverlayComponent` (mounted once in the app shell), which resolves
 * step anchors in the DOM and renders the spotlight + step card.
 *
 * Progress is persisted through {@link SettingsService}, so it is scoped to
 * the active profile (local vs each server) and works fully offline.
 */
@Injectable({
  providedIn: 'root',
})
export class TutorialService {
  private readonly settingsService = inject(SettingsService);
  private readonly router = inject(Router);

  private readonly _activeTour = signal<TutorialTour | null>(null);
  private readonly _stepIndex = signal(0);

  /** Indices of steps skipped because their anchor never appeared. */
  private readonly _skippedSteps = signal<ReadonlySet<number>>(new Set());

  /**
   * Direction of the last user navigation (1 = forward, -1 = back). Used to
   * keep skipping in the same direction when an optional step has no anchor.
   */
  private direction: 1 | -1 = 1;

  /** The tour currently being shown, or null when no tour is active. */
  readonly activeTour = this._activeTour.asReadonly();

  /** Index of the current step within the active tour. */
  readonly stepIndex = this._stepIndex.asReadonly();

  /** Whether a tour is currently showing. */
  readonly isActive = computed(() => this._activeTour() !== null);

  /** The current step definition, or null when no tour is active. */
  readonly currentStep = computed<TutorialStep | null>(() => {
    const tour = this._activeTour();
    return tour?.steps[this._stepIndex()] ?? null;
  });

  /** Total number of steps in the active tour. */
  readonly totalSteps = computed(() => this._activeTour()?.steps.length ?? 0);

  /**
   * 1-based position of the current step among the steps the user actually
   * sees (the intro and skipped steps are excluded), for the progress counter.
   */
  readonly displayedStepNumber = computed(() => {
    const index = this._stepIndex();
    let position = index;
    for (const skipped of this._skippedSteps()) {
      if (skipped < index) {
        position--;
      }
    }
    return position;
  });

  /**
   * Number of non-intro steps not (yet) known to be skipped. Shrinks as
   * unavailable steps are discovered, so the counter never overstates
   * progress that is left.
   */
  readonly displayedTotalSteps = computed(() => {
    const tour = this._activeTour();
    if (!tour) {
      return 0;
    }
    return tour.steps.length - 1 - this._skippedSteps().size;
  });

  constructor() {
    // A tour is bound to the screen it was defined for; leaving that screen
    // ends it. An untouched intro card closes without persisting (so the
    // offer can reappear), while an in-progress tour counts as dismissed.
    this.router.events.subscribe(event => {
      if (!(event instanceof NavigationStart) || !this.isActive()) {
        return;
      }
      if (this._stepIndex() === 0) {
        this.abort();
      } else {
        this.dismiss();
      }
    });
  }

  /** Whether the tour has never been completed or dismissed on this profile. */
  shouldOffer(tourId: TutorialTourId): boolean {
    return this.getProgress()[tourId] === undefined;
  }

  /**
   * Offer the tour automatically, unless the user has already seen it, a tour
   * is showing, the viewport is mobile, or auto-start is globally disabled.
   *
   * @returns true if the tour was started
   */
  maybeAutoStart(
    tourId: TutorialTourId,
    options: { isMobile: boolean }
  ): boolean {
    if (
      options.isMobile ||
      this.isActive() ||
      !this.shouldOffer(tourId) ||
      this.isAutoStartDisabled()
    ) {
      return false;
    }
    return this.start(tourId);
  }

  /**
   * Start (or restart) a tour from its intro step.
   *
   * @returns true if the tour was started
   */
  start(tourId: TutorialTourId): boolean {
    const tour = TUTORIAL_TOURS[tourId];
    if (!tour || tour.steps.length === 0) {
      return false;
    }
    this.direction = 1;
    this._stepIndex.set(0);
    this._skippedSteps.set(new Set());
    this._activeTour.set(tour);
    return true;
  }

  /** Advance to the next step; completes the tour from the last step. */
  next(): void {
    const tour = this._activeTour();
    if (!tour) {
      return;
    }
    this.direction = 1;
    if (this._stepIndex() >= tour.steps.length - 1) {
      this.complete();
    } else {
      this._stepIndex.update(index => index + 1);
    }
  }

  /** Go back one step (no-op on the first step). */
  previous(): void {
    if (!this.isActive() || this._stepIndex() === 0) {
      return;
    }
    this.direction = -1;
    this._stepIndex.update(index => index - 1);
  }

  /**
   * Skip past the current step in the direction of travel. Called by the
   * overlay when an optional step's anchor is not present on screen.
   */
  skipUnavailableStep(): void {
    const tour = this._activeTour();
    if (!tour) {
      return;
    }
    const skipped = new Set(this._skippedSteps());
    skipped.add(this._stepIndex());
    this._skippedSteps.set(skipped);

    const nextIndex = this._stepIndex() + this.direction;
    if (nextIndex >= tour.steps.length) {
      this.complete();
    } else if (nextIndex < 0) {
      this._stepIndex.set(0);
      this.direction = 1;
    } else {
      this._stepIndex.set(nextIndex);
    }
  }

  /** Close the tour and remember it as dismissed (never auto-offered again). */
  dismiss(): void {
    this.close('dismissed');
  }

  /** Close the tour and remember it as completed. */
  complete(): void {
    this.close('completed');
  }

  /**
   * Called by the overlay when the current step is actually shown. A step
   * skipped earlier (e.g. while its anchor was still loading) that renders on
   * a revisit is no longer counted as skipped.
   */
  markStepDisplayed(): void {
    const index = this._stepIndex();
    if (!this._skippedSteps().has(index)) {
      return;
    }
    const skipped = new Set(this._skippedSteps());
    skipped.delete(index);
    this._skippedSteps.set(skipped);
  }

  /** Close the tour without persisting anything (offer can reappear). */
  abort(): void {
    this._activeTour.set(null);
    this._stepIndex.set(0);
    this._skippedSteps.set(new Set());
    this.direction = 1;
  }

  private close(status: TutorialTourStatus): void {
    const tour = this._activeTour();
    if (tour) {
      this.setStatus(tour.id, status);
    }
    this.abort();
  }

  private setStatus(tourId: TutorialTourId, status: TutorialTourStatus): void {
    try {
      const progress = this.getProgress();
      this.settingsService.setSetting<TutorialProgress>(TUTORIAL_PROGRESS_KEY, {
        ...progress,
        [tourId]: status,
      });
    } catch {
      // Storage can be unavailable (private mode/quota); the tour still closes.
    }
  }

  private getProgress(): TutorialProgress {
    return this.settingsService.getSetting<TutorialProgress>(
      TUTORIAL_PROGRESS_KEY,
      {}
    );
  }

  private isAutoStartDisabled(): boolean {
    try {
      return localStorage.getItem(AUTO_START_OVERRIDE_KEY) === 'off';
    } catch {
      return false;
    }
  }
}
