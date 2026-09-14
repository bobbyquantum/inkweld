import { InjectionToken } from '@angular/core';

/**
 * Resolve a tour step's anchor: the first candidate `data-testid` that is
 * present and laid out. Zero-sized elements count as absent, which is how
 * collapsed sidebars and hidden buttons drop out of a tour.
 */
export function findTutorialAnchor(
  testIds: readonly string[]
): HTMLElement | null {
  for (const testId of testIds) {
    const el = document.querySelector(`[data-testid="${testId}"]`);
    if (el instanceof HTMLElement && isLaidOut(el)) {
      return el;
    }
  }
  return null;
}

function isLaidOut(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * Whether a step's anchor is on screen right now. Injected so
 * `TutorialService` can plan which steps a run will visit without reaching
 * into the DOM itself, and so tests can describe a layout without building one.
 */
export const TUTORIAL_ANCHOR_PRESENT = new InjectionToken<
  (testIds: readonly string[]) => boolean
>('TUTORIAL_ANCHOR_PRESENT', {
  factory: () => testIds => findTutorialAnchor(testIds) !== null,
});
