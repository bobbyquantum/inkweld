/**
 * Catalog of every screenshot produced by the screenshot e2e suite
 * (frontend/e2e/screenshots/*.spec.ts).
 *
 * The raw data lives in `screenshots.json` (one entry per screenshot) so the
 * repeated record shape doesn't trip SonarCloud's duplication detector. This
 * module wraps that data with the typed `Screenshot` / `ScreenshotGroup`
 * interfaces the gallery component consumes.
 *
 * Two output directories are used by the e2e suite:
 *  - /img/generated    — promotional / app-shell screenshots (pwa, about,
 *    setup, writing-stats, plus the subset of admin/publish/media/canvas
 *    tests that historically wrote here)
 *  - /img/features     — feature-specific screenshots (element refs,
 *    relationships, templates, tags, worldbuilding editor, timelines,
 *    canvas, quick open, project rename, admin AI/kill-switch)
 *  - /img/features/mobile — the mobile subfolder used by the worldbuilding
 *    mobile specs.
 *
 * Keep `screenshots.json` in sync with the spec files. When a spec adds or
 * renames an artifact, update the matching entry there.
 */

import screenshotData from './screenshots.json';

export type ScreenshotDir = 'generated' | 'features' | 'features/mobile';

export interface Screenshot {
  /** Filename without the leading /img/<dir>/ prefix. */
  readonly file: string;
  /** Which gitignored output folder the PNG lives in. */
  readonly dir: ScreenshotDir;
  /** Short label shown under the thumbnail. */
  readonly label: string;
}

export interface ScreenshotGroup {
  readonly title: string;
  readonly description: string;
  readonly screenshots: readonly Screenshot[];
}

interface RawScreenshot {
  readonly file: string;
  readonly dir: string;
  readonly label: string;
}

interface RawScreenshotGroup {
  readonly title: string;
  readonly description: string;
  readonly screenshots: readonly RawScreenshot[];
}

const rawGroups = screenshotData as readonly RawScreenshotGroup[];

export const screenshotGroups: readonly ScreenshotGroup[] = rawGroups.map(
  (g) => ({
    title: g.title,
    description: g.description,
    screenshots: g.screenshots.map((s) => ({
      file: s.file,
      dir: s.dir as ScreenshotDir,
      label: s.label,
    })),
  })
);
