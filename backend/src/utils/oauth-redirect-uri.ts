/**
 * Which redirect URIs an MCP OAuth client may register and be sent to.
 *
 * Client registration is anonymous, and the consent page sends the browser
 * to the redirect URI on the app's own origin. A `javascript:` URI there
 * would run script as the signed-in user (the CSP blocks it today, but only
 * while it is enforced). OAuth 2.1 / RFC 8252 allow:
 *   - `https:` URIs,
 *   - `http:` only on loopback hosts (native apps listening on a port),
 *   - private-use schemes for native apps (`claude://`, `cursor://`, …),
 * never with a fragment, and never a scheme a browser treats as content or
 * script.
 */

const FORBIDDEN_SCHEMES = new Set([
  'javascript:',
  'data:',
  'vbscript:',
  'file:',
  'blob:',
  'about:',
  'filesystem:',
  'view-source:',
  'ws:',
  'wss:',
  'ftp:',
]);

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const PRIVATE_USE_SCHEME = /^[a-z][a-z\d+.-]*:$/;

export function isAllowedRedirectUri(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hash) return false;
  if (url.protocol === 'https:') return url.hostname !== '';
  if (url.protocol === 'http:') {
    return LOOPBACK_HOSTS.has(url.hostname) || url.hostname.endsWith('.localhost');
  }
  if (FORBIDDEN_SCHEMES.has(url.protocol)) return false;
  return PRIVATE_USE_SCHEME.test(url.protocol);
}

/** Whether a client's informational link (home page, logo, policy) is a web URL. */
export function isWebUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}
