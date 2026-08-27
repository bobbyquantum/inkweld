/** Identifiers for the guided tours available in the app. */
export type TutorialTourId = 'home' | 'project';

/** Persisted outcome of a tour for the current profile. */
export type TutorialTourStatus = 'completed' | 'dismissed';

/** Map of tour id → outcome, stored via SettingsService. */
export type TutorialProgress = Partial<
  Record<TutorialTourId, TutorialTourStatus>
>;

/**
 * A single step in a guided tour.
 *
 * Steps with no anchor render as a centered card (used for the intro/outro).
 * Anchored steps spotlight the first matching, visible element.
 */
export interface TutorialStep {
  /** Unique id within the tour (useful for debugging and tests). */
  id: string;
  /**
   * Candidate anchor `data-testid` values, tried in order; the first one
   * present and visible in the DOM wins. Multiple candidates cover layout
   * variants (e.g. expanded vs collapsed sidebar). Omit for a centered card.
   */
  anchorTestIds?: string[];
  /** Translation key for the step heading. */
  titleKey: string;
  /** Translation key for the step body. */
  bodyKey: string;
  /**
   * When true, the step is silently skipped if no anchor candidate appears
   * (e.g. server-only buttons in local mode, or a collapsed sidebar).
   * Required steps fall back to a centered card instead.
   */
  optional?: boolean;
}

/** An ordered guided tour. The first step should be an anchor-less intro. */
export interface TutorialTour {
  id: TutorialTourId;
  steps: TutorialStep[];
}
