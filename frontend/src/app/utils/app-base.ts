/**
 * Helpers for running under a URL prefix.
 *
 * The app normally lives at `/`, but behind Home Assistant ingress it is
 * served at `/api/hassio_ingress/<token>/`: the server rewrites `<base href>`
 * to that prefix and adds an `inkweld-ingress` meta tag (see
 * `injectIngressBase` in the backend's spa-utils.ts). Angular's router and
 * relative URLs (`assets/…`, `fetch('x')`) follow `<base href>` on their own;
 * anything built from a root-absolute path has to go through {@link appUrl}.
 */

/** Selects the meta tag the server adds for Home Assistant ingress. */
const INGRESS_META_SELECTOR = 'meta[name="inkweld-ingress"]';

/**
 * Path the app is served under, without a trailing slash: `''` at the root,
 * `/api/hassio_ingress/<token>` behind ingress.
 */
export function appBasePath(
  doc: Document | null = globalThis.document ?? null
): string {
  // Only an explicit <base href> sets a prefix; without one, baseURI is the
  // current page URL, which includes the route.
  const baseURI = doc?.querySelector('base[href]') ? doc.baseURI : '';
  if (!baseURI) return '';
  try {
    return new URL(baseURI).pathname.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

/**
 * Turn an app path (`/`, `/setup`, `/alice/novel/settings`) into a URL that
 * stays inside the app's prefix, for full-page navigations and new windows.
 */
export function appUrl(
  path: string,
  doc: Document | null = globalThis.document ?? null
): string {
  return `${appBasePath(doc)}/${path.replace(/^\/+/, '')}`;
}

/**
 * The origin plus prefix this page was served from: the address of the
 * Inkweld server that served it.
 */
export function appOrigin(
  doc: Document | null = globalThis.document ?? null
): string {
  const baseURI = doc?.baseURI;
  if (!baseURI) return '';
  try {
    return new URL(baseURI).origin + appBasePath(doc);
  } catch {
    return '';
  }
}

/** True when the server marked this page as served through HA ingress. */
export function isHomeAssistantIngress(
  doc: Document | null = globalThis.document ?? null
): boolean {
  return !!doc?.querySelector(INGRESS_META_SELECTOR);
}
