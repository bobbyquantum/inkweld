/**
 * Addresses of Inkweld servers: telling two servers apart, and telling
 * whether a URL belongs to a given server.
 *
 * A server is its origin plus the path it is served under. Behind Home
 * Assistant ingress or a reverse proxy prefix that path is part of the
 * address, so `https://example.com/a` and `https://example.com/b` are two
 * different servers.
 */

import { stripTrailingSlashes } from '@utils/string-utils';

/**
 * The http(s) scheme for each scheme a server is reached on. A server's
 * WebSockets use its origin with `ws:` / `wss:`, so those count as the same
 * origin.
 */
const SERVER_SCHEMES: Readonly<Partial<Record<string, 'http:' | 'https:'>>> = {
  'http:': 'http:',
  'https:': 'https:',
  'ws:': 'http:',
  'wss:': 'https:',
};

interface ServerLocation {
  /** http(s) scheme, lowercase host and the port unless it is the default */
  origin: string;
  /** Path without trailing slashes: '' at the root */
  path: string;
}

/** `%2F`, `%5C` and `%2E`: escapes that decode to path syntax */
const ENCODED_PATH_SYNTAX = /%(?:2f|5c|2e)/gi;

/**
 * True when `path` has a `.` or `..` segment once `%2F`, `%5C` and `%2E` are
 * decoded. The URL parser keeps `..%2F` inside the segment it is in, but a
 * proxy that decodes the path before routing reads it as a step up, which
 * can leave a path prefix.
 */
function hasEncodedDotSegment(path: string): boolean {
  const decoded = path.replaceAll(ENCODED_PATH_SYNTAX, escape =>
    decodeURIComponent(escape)
  );
  return decoded
    .split(/[/\\]/)
    .some(segment => segment === '.' || segment === '..');
}

function locate(url: string, base?: string): ServerLocation | null {
  let parsed: URL;
  try {
    parsed = new URL(url, base);
  } catch {
    return null;
  }
  const scheme = SERVER_SCHEMES[parsed.protocol];
  if (!scheme) return null;
  return {
    origin: `${scheme}//${parsed.host}`,
    path: stripTrailingSlashes(parsed.pathname),
  };
}

/**
 * The normalised address of a server: lowercase scheme and host, the port
 * unless it is the default one, and the path without trailing slashes.
 * Two URLs with the same address point at the same server.
 */
export function serverAddress(url: string): string {
  const location = locate(url);
  return location
    ? `${location.origin}${location.path}`
    : stripTrailingSlashes(url.toLowerCase());
}

/**
 * True when `url` points into the server at `serverUrl`: the same origin
 * and, for a server under a path prefix, a path inside that prefix (the
 * prefix itself or anything below it) with no encoded `.` or `..` segment
 * that a proxy decoding the path could route elsewhere. Relative URLs are
 * resolved against `baseUri`, the page's base URL, the way the browser
 * resolves them when it sends a request. A URL that cannot be resolved
 * belongs to no server.
 */
export function isUrlOnServer(
  url: string,
  serverUrl: string,
  baseUri?: string
): boolean {
  const server = locate(serverUrl, baseUri);
  const target = locate(url, baseUri);
  if (!server || !target || server.origin !== target.origin) return false;
  // A server at the root of its origin owns every path on it
  if (server.path === '') return true;
  return (
    (target.path === server.path ||
      target.path.startsWith(`${server.path}/`)) &&
    !hasEncodedDotSegment(target.path)
  );
}
