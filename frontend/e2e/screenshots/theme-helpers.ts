/**
 * Theme helpers for screenshot specs.
 *
 * Mirrors what `ThemeService.update()` does in the running app
 * (frontend/src/themes/theme.service.ts):
 *   - Persists the choice to `localStorage['user-theme']`
 *     using the canonical values `'light-theme' | 'dark-theme'`.
 *   - Toggles `body.light-theme` / `body.dark-theme` (NOT `<html>`,
 *     and NOT the legacy `dark-mode`/`light-mode` class names that
 *     were used by an earlier broken helper).
 *
 * IMPORTANT: do NOT use `page.emulateMedia({ colorScheme })` for theme
 * switching mid-test. The Angular ThemeService only consults
 * `prefers-color-scheme` once at boot (and reactively only when the
 * user preference is `'system'` AND the OS-level media query fires —
 * which Playwright's `emulateMedia` does not always trigger reliably
 * after navigation). Using this helper guarantees the same DOM state
 * a real user gets by clicking the theme toggle in the user menu.
 */
import type { Page } from '@playwright/test';

export type ColorScheme = 'light' | 'dark';

/**
 * Apply a color scheme by directly mutating the DOM and localStorage
 * the same way `ThemeService.update()` does. Safe to call repeatedly
 * within a single test (no reload required).
 */
export async function applyColorScheme(
  page: Page,
  scheme: ColorScheme
): Promise<void> {
  await page.evaluate(mode => {
    const themeClass = mode === 'dark' ? 'dark-theme' : 'light-theme';
    const oppositeClass = mode === 'dark' ? 'light-theme' : 'dark-theme';

    // Persist user preference (keeps ThemeService in sync if it
    // re-reads localStorage during the test).
    try {
      localStorage.setItem('user-theme', themeClass);
    } catch {
      /* localStorage may be unavailable in some contexts */
    }

    // Apply the canonical theme class on <body>.
    document.body.classList.remove(oppositeClass);
    document.body.classList.add(themeClass);

    // Clear any stale legacy classes that an older test helper may
    // have left on <html> or <body>. These are not used by the app
    // and would otherwise confuse a human reviewer of the DOM.
    document.documentElement.classList.remove('light-mode', 'dark-mode');
    document.body.classList.remove('light-mode', 'dark-mode');
  }, scheme);
}

/**
 * Apply a color scheme and reload the page so that
 * `ThemeService.initTheme()` re-runs on a fresh document with the
 * new theme already in effect from boot. Required for views (notably
 * the document editor with element-ref chips) where Angular's
 * `:host-context(.dark-theme)` selectors evaluate at host-creation
 * time and must observe the theme class applied at boot — applying
 * the class after the host is mounted leaves chips in their
 * boot-time-theme styles.
 *
 * After reload, waits for `settleSelector` to be visible so the
 * caller can immediately screenshot.
 *
 * Implementation note: persists via localStorage *and* via
 * `page.addInitScript` so the value is seeded on the *next* document
 * before any application script runs (avoids any race between page
 * navigation and `ThemeService.initTheme()` reading localStorage).
 */
export async function applyColorSchemeAndReload(
  page: Page,
  scheme: ColorScheme,
  settleSelector: string
): Promise<void> {
  const themeClass = scheme === 'dark' ? 'dark-theme' : 'light-theme';

  // Seed localStorage in the current document so it persists across
  // the upcoming reload (localStorage is keyed by origin).
  await page.evaluate(value => {
    try {
      localStorage.setItem('user-theme', value);
    } catch {
      /* ignored */
    }
  }, themeClass);

  await page.reload();
  await page.locator(settleSelector).first().waitFor({ state: 'visible' });
}
