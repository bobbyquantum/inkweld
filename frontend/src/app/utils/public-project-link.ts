/**
 * Addresses of public project links: `<app>/public/<username>/<slug>`.
 *
 * The page a link opens reads the project from one server. When the app and
 * its API share an origin (Docker, self-hosted), or a build is set up for one
 * API, that server is known and the link is just the path. Otherwise, when
 * the app is served from a different address than the project's server, the
 * link names its server: `…?server=<encoded API URL>`.
 */
import { stripTrailingSlashes } from '@utils/string-utils';

import { environment } from '../../environments/environment';
import { appOrigin, isHomeAssistantIngress } from './app-base';

/** The query parameter a link names its server in. */
export const PUBLIC_SERVER_PARAM = 'server';

/**
 * The server a public link that names none is read from: the page's own
 * origin under Home Assistant ingress, otherwise the API this build is set up
 * for, otherwise the page's origin.
 */
export function defaultPublicServerUrl(
  doc: Document | null = globalThis.document ?? null
): string {
  if (isHomeAssistantIngress(doc)) return appOrigin(doc);
  return stripTrailingSlashes(environment.apiUrl) || appOrigin(doc);
}

/**
 * A server URL as a link may name it: http(s) only, reduced to origin and
 * path without trailing slashes. Null for anything else.
 */
export function normalizePublicServer(value: string | null): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  return stripTrailingSlashes(`${url.origin}${url.pathname}`);
}

/** The server a link's query string names, or null when it names none. */
export function publicServerFromSearch(search: string): string | null {
  return normalizePublicServer(
    new URLSearchParams(search).get(PUBLIC_SERVER_PARAM)
  );
}

/**
 * The public link of `username/slug` on `serverUrl`. The server is written
 * into the link only when the page it opens could not work it out.
 */
export function publicProjectUrl(
  username: string,
  slug: string,
  serverUrl: string,
  doc: Document | null = globalThis.document ?? null
): string {
  const link = `${appOrigin(doc)}/public/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`;
  const server = normalizePublicServer(serverUrl);
  if (!server || server === defaultPublicServerUrl(doc)) return link;
  return `${link}?${PUBLIC_SERVER_PARAM}=${encodeURIComponent(server)}`;
}

/**
 * The `username/slug` key of a public project path (`/public/<u>/<s>…`,
 * still encoded), or null for any other path. Query and fragment are ignored.
 */
export function publicProjectKey(path: string): string | null {
  const route = path.split(/[?#]/, 1)[0];
  const [empty, prefix, username, slug] = route.split('/');
  if (empty !== '' || prefix !== 'public' || !username || !slug) return null;
  return `${username}/${slug}`;
}
