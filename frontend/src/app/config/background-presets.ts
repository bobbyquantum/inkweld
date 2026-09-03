/**
 * Built-in background presets a user can choose for the post-auth surfaces.
 *
 * All but `bundled` are CSS gradients rather than image files. That is
 * deliberate: shipping a handful of full-screen photos would add megabytes of
 * binary assets to the repo (the one bundled image is already 3MB), while
 * gradients cost nothing, render instantly, work offline, and look right in
 * both themes without a scrim fight.
 *
 * The ids are mirrored in the backend (`BACKGROUND_PRESET_IDS` in
 * `backend/src/services/appearance.service.ts`) so a stored preference can be
 * validated server-side. Keep the two lists in step.
 */
export interface BackgroundPreset {
  id: string;
  /** i18n key for the human-readable name. */
  labelKey: string;
  /**
   * CSS `background-image` value. `none` means "no image" — the surface falls
   * back to {@link BackgroundPreset.color}.
   */
  image: string;
  /** CSS colour painted behind the image. */
  color: string;
}

export const BACKGROUND_PRESETS: readonly BackgroundPreset[] = [
  {
    id: 'bundled',
    labelKey: 'settings.background.presets.bundled',
    image: "url('/home_background.png')",
    color: 'transparent',
  },
  {
    id: 'midnight',
    labelKey: 'settings.background.presets.midnight',
    image: 'linear-gradient(160deg, #0b1021 0%, #1b2a4a 55%, #24405f 100%)',
    color: '#0b1021',
  },
  {
    id: 'dusk',
    labelKey: 'settings.background.presets.dusk',
    image: 'linear-gradient(160deg, #2b1b3d 0%, #6b3f5e 50%, #c97b6a 100%)',
    color: '#2b1b3d',
  },
  {
    id: 'forest',
    labelKey: 'settings.background.presets.forest',
    image: 'linear-gradient(160deg, #0f2018 0%, #1f4534 55%, #3c6b4a 100%)',
    color: '#0f2018',
  },
  {
    id: 'parchment',
    labelKey: 'settings.background.presets.parchment',
    image: 'linear-gradient(160deg, #f4ecd8 0%, #e6d5b8 55%, #cdb894 100%)',
    color: '#f4ecd8',
  },
  {
    id: 'slate',
    labelKey: 'settings.background.presets.slate',
    image: 'linear-gradient(160deg, #1c1f24 0%, #2f353d 55%, #454d57 100%)',
    color: '#1c1f24',
  },
  {
    id: 'none',
    // No image at all — the theme's own surface colour shows through, which is
    // the closest thing to "plain" and the cheapest to render.
    labelKey: 'settings.background.presets.none',
    image: 'none',
    color: 'var(--mat-app-background-color)',
  },
];

export function findBackgroundPreset(id: string): BackgroundPreset | undefined {
  return BACKGROUND_PRESETS.find(preset => preset.id === id);
}
