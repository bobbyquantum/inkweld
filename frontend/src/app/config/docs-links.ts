/**
 * Docs site for deployments that are not on an `inkweld.app` host
 * (self-hosted servers, localhost, the desktop app).
 */
const DEFAULT_DOCS_ORIGIN = 'https://preview.inkweld.org';

/**
 * Origin of the docs site that belongs with the app at `hostname`.
 *
 * The hosted app and its docs are deployed in pairs, `<sub>.inkweld.app` and
 * `<sub>.inkweld.org` (preview.inkweld.app → preview.inkweld.org, and
 * inkweld.app → inkweld.org), the reverse of how the docs site works out its
 * "Open App" link in `docs/site/docusaurus.config.ts`. Anything else uses
 * {@link DEFAULT_DOCS_ORIGIN}.
 */
export function docsOrigin(hostname: string): string {
  if (hostname === 'inkweld.app' || hostname.endsWith('.inkweld.app')) {
    return `https://${hostname.slice(0, -'app'.length)}org`;
  }
  return DEFAULT_DOCS_ORIGIN;
}

/** Absolute URL of `path` on the docs site for the current deployment */
export function docsUrl(path: string): string {
  return docsOrigin(globalThis.location?.hostname ?? '') + path;
}

/**
 * Privacy policy of the Inkweld app itself (not of any server it connects
 * to — those publish their own at `/privacy`). App stores require a link to it
 * inside the app, in every storage mode, so it is shown on the setup screen
 * and the About page.
 */
export const APP_PRIVACY_POLICY_PATH = '/privacy';
