/**
 * Element Appearance Model
 *
 * Per-element background styling for the worldbuilding editor. Lets authors
 * give the left-hand navigation and the right-hand content their own
 * background (solid colour, CSS gradient, or image) that adapts to the
 * app's light/dark theme.
 *
 * Each of the two regions (menu / content) is configured independently and
 * can run in one of two modes:
 *  - `auto`: a single `value` that the renderer brightens/darkens to stay
 *    legible in the active theme (primarily relevant for images).
 *  - `manual`: distinct `light` and `dark` values, chosen by the author.
 */

/** What kind of background to render. */
export type BackgroundType = 'color' | 'gradient' | 'image';

/** How the background adapts to the active app theme. */
export type BackgroundMode = 'auto' | 'manual';

/**
 * A single region's background configuration.
 * Exactly one of `value` (auto) or `light`/`dark` (manual) is used,
 * depending on {@link BackgroundMode}.
 */
export interface BackgroundSetting {
  type: BackgroundType;
  mode: BackgroundMode;
  /** Auto mode: the single colour / gradient / image used in both themes. */
  value?: string;
  /** Auto mode: how strongly the value is lightened (light) / darkened (dark). 0-100. */
  intensity?: number;
  /** Manual mode: value used in the light theme. */
  light?: string;
  /** Manual mode: value used in the dark theme. */
  dark?: string;
}

/** Which regions of the editor can be themed. */
export type AppearanceRegion = 'menu' | 'content';

/**
 * The full per-element appearance configuration, keyed by region.
 * `undefined` values mean "no custom background" for that region.
 */
export interface ElementAppearance {
  menu?: BackgroundSetting;
  content?: BackgroundSetting;
}

/** Whether a background setting is empty (no value to render). */
export function isBackgroundEmpty(setting?: BackgroundSetting): boolean {
  if (!setting) return true;
  if (setting.mode === 'manual') {
    return !setting.light && !setting.dark;
  }
  return !setting.value;
}

/**
 * Sentinel written into the persistence payload to represent an explicit
 * delete of a region or value slot.
 *
 * `setNestedYjsMap` treats a *missing* key as "leave unchanged" (so saving one
 * region doesn't wipe its sibling). When the user clears a value or disables a
 * region, the panel emits this sentinel for the removed key so the backend
 * deletes it from the Yjs map instead of silently keeping the old value.
 */
export const APPEARANCE_DELETE = '\u0000__appearance_delete__\u0000';
