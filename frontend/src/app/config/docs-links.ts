/**
 * The Inkweld docs site. Every deployment links to it — inkweld.app, its
 * preview, self-hosted servers and the desktop app — because there is one
 * docs site, built from `main` (`docs/site`, published to GitHub Pages).
 * preview.inkweld.org redirects here.
 */
export const DOCS_ORIGIN = 'https://inkweld.org';

/** Absolute URL of `path` on the docs site */
export function docsUrl(path: string): string {
  return DOCS_ORIGIN + path;
}

/**
 * Privacy policy of the Inkweld app itself (not of any server it connects
 * to — those publish their own at `/privacy`). App stores require a link to it
 * inside the app, in every storage mode, so it is shown on the setup screen
 * and the About page.
 */
export const APP_PRIVACY_POLICY_PATH = '/privacy';
