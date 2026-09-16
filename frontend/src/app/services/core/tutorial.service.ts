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
import { TUTORIAL_ANCHOR_PRESENT } from './tutorial-anchors';
import { TUTORIAL_TOURS } from './tutorial-tours';

/** Settings key holding per-tour completion state (per storage profile). */
const TUTORIAL_PROGRESS_KEY = 'tutorialProgress';

/**
 * Settings key holding the user's opt-out from guided tours (per storage
 * profile). Absent means enabled.
 */
const TUTORIALS_ENABLED_KEY = 'tutorialsEnabled';

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
 * A run works from a *plan*: the ordered indices of the steps it will visit.
 * Optional steps whose anchor is not on screen are left out before the first
 * one is shown, so they never flash past and the progress counter stays fixed
 * for the whole run.
 *
 * Progress is persisted through {@link SettingsService}, so it is scoped to
 * the active profile (local vs each server) and works fully offline. So is
 * the blanket opt-out, which stops every tour — present and future — from
 * being offered while leaving the explicit entry points working.
 */
@Injectable({
  providedIn: 'root',
})
export class TutorialService {
  private readonly settingsService = inject(SettingsService);
  private readonly router = inject(Router);
  private readonly anchorPresent = inject(TUTORIAL_ANCHOR_PRESENT);

  private readonly _activeTour = signal<TutorialTour | null>(null);
  private readonly _stepIndex = signal(0);

  /** Indices of the steps this run visits, ascending. Empty when idle. */
  private readonly _plan = signal<readonly number[]>([]);

  private readonly _toursEnabled = signal(this.readToursEnabled());

  /**
   * Direction of the last user navigation (1 = forward, -1 = back). Used to
   * keep skipping in the same direction when a planned step turns out to have
   * no anchor after all.
   */
  private direction: 1 | -1 = 1;

  /** The tour currently being shown, or null when no tour is active. */
  readonly activeTour = this._activeTour.asReadonly();

  /** Index of the current step within the active tour. */
  readonly stepIndex = this._stepIndex.asReadonly();

  /** Whether a tour is currently showing. */
  readonly isActive = computed(() => this._activeTour() !== null);

  /**
   * Whether tours may be offered automatically. Turning this off is the
   * "don't show me these again" opt-out: it covers tours the user has not met
   * yet, and only the automatic offer — the account-menu and empty-state
   * entry points still start a tour on request.
   */
  readonly toursEnabled = this._toursEnabled.asReadonly();

  /** The current step definition, or null when no tour is active. */
  readonly currentStep = computed<TutorialStep | null>(() => {
    const tour = this._activeTour();
    return tour?.steps[this._stepIndex()] ?? null;
  });

  /**
   * 1-based position of the current step among the steps this run shows (the
   * intro is excluded), for the progress counter.
   */
  readonly displayedStepNumber = computed(() =>
    Math.max(this._plan().indexOf(this._stepIndex()), 0)
  );

  /** Number of steps after the intro that this run will show. */
  readonly displayedTotalSteps = computed(() =>
    Math.max(this._plan().length - 1, 0)
  );

  /** Whether the current step is the last one this run will show. */
  readonly isLastStep = computed(() => {
    const plan = this._plan();
    return plan.length > 0 && plan.at(-1) === this._stepIndex();
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
   * Offer the tour automatically, unless the user has opted out of tours or
   * already seen this one, a tour is showing, the viewport is mobile, or
   * auto-start is globally disabled.
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
      !this._toursEnabled() ||
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
    this.planSteps(tour);
    this._activeTour.set(tour);
    return true;
  }

  /** Advance to the next planned step; completes from the last one. */
  next(): void {
    const tour = this._activeTour();
    if (!tour) {
      return;
    }
    this.direction = 1;
    if (this._stepIndex() === 0) {
      // Re-plan on the way out of the intro, by which point lazily-rendered
      // anchors have settled. From here the counter is fixed.
      this.planSteps(tour);
    }
    this.moveFrom(this._stepIndex());
  }

  /** Go back one planned step (no-op on the intro). */
  previous(): void {
    if (!this.isActive() || this._stepIndex() === 0) {
      return;
    }
    this.direction = -1;
    this.moveFrom(this._stepIndex());
  }

  /**
   * Drop the current step from the plan and move past it in the direction of
   * travel. Called by the overlay when a planned step's anchor is not (or no
   * longer) on screen.
   */
  skipUnavailableStep(): void {
    const index = this._stepIndex();
    // The intro needs no anchor, so it is never skippable.
    if (!this.isActive() || index === 0) {
      return;
    }
    this._plan.update(plan => plan.filter(planned => planned !== index));
    this.moveFrom(index);
  }

  /** Close the tour and remember it as dismissed (never auto-offered again). */
  dismiss(): void {
    this.close('dismissed');
  }

  /** Close the tour and remember it as completed. */
  complete(): void {
    this.close('completed');
  }

  /** Close the tour without persisting anything (offer can reappear). */
  abort(): void {
    this._activeTour.set(null);
    this._stepIndex.set(0);
    this._plan.set([]);
    this.direction = 1;
  }

  /**
   * Turn the automatic offer on or off for every tour. Persisted alongside
   * per-tour progress, so it is scoped to the active profile.
   */
  setToursEnabled(enabled: boolean): void {
    this._toursEnabled.set(enabled);
    try {
      this.settingsService.setSetting<boolean>(TUTORIALS_ENABLED_KEY, enabled);
    } catch {
      // Storage can be unavailable (private mode/quota); keep the UI in step.
    }
  }

  /**
   * The "don't show tutorials" opt-out offered alongside the first tour:
   * closes the current one and stops any tour being offered from now on.
   */
  disableTours(): void {
    this.setToursEnabled(false);
    this.dismiss();
  }

  /**
   * Move to the planned step either side of `index`, according to the
   * direction of travel. Running off the end completes the tour; running off
   * the start lands back on the intro.
   */
  private moveFrom(index: number): void {
    const plan = this._plan();
    if (this.direction === -1) {
      // The plan ascends, so the step before `index` is the entry just ahead
      // of the first one at or past it.
      const boundary = plan.findIndex(planned => planned >= index);
      const previous = (boundary === -1 ? plan.length : boundary) - 1;
      this._stepIndex.set(previous >= 0 ? plan[previous] : 0);
      return;
    }
    const nextIndex = plan.find(planned => planned > index);
    if (nextIndex === undefined) {
      this.complete();
    } else {
      this._stepIndex.set(nextIndex);
    }
  }

  /** Work out which of the tour's steps this run will visit. */
  private planSteps(tour: TutorialTour): void {
    this._plan.set(
      tour.steps
        .map((step, index) => ({ step, index }))
        .filter(({ step, index }) => index === 0 || this.willShow(step))
        .map(({ index }) => index)
    );
  }

  /**
   * Whether a step earns a slot in the plan. Required steps always do — with
   * no anchor they fall back to a centered card — while optional ones only
   * count while their anchor is on screen.
   */
  private willShow(step: TutorialStep): boolean {
    if (!step.optional || !step.anchorTestIds?.length) {
      return true;
    }
    return this.anchorPresent(step.anchorTestIds);
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

  private readToursEnabled(): boolean {
    return this.settingsService.getSetting<boolean>(
      TUTORIALS_ENABLED_KEY,
      true
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
