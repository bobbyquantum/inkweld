/**
 * Home Assistant ingress support.
 *
 * When Inkweld runs as a Home Assistant app, the Supervisor proxies the UI at
 * `https://<ha>/api/hassio_ingress/<token>/…`. It strips that prefix before
 * forwarding, so the server still sees `/…`, and adds:
 *
 *   - `X-Ingress-Path`: the stripped prefix, used for `<base href>`
 *   - `X-Remote-User-Id` / `-Name` / `-Display-Name`: the signed-in HA user
 *
 * The Supervisor drops any copies of the user headers a browser sends, but a
 * client reaching the server directly (the app's optional exposed port) can
 * send whatever it likes. So the headers are trusted only when ingress is
 * enabled AND the TCP peer is the Supervisor's ingress proxy — never based on
 * `X-Forwarded-For`, which the client controls.
 *
 * Settings (read at call time with bracket notation, like client-ip.ts,
 * because `bun build --compile --minify` constant-folds dotted env reads):
 *   - `INGRESS_ENABLED=true` turns the feature on.
 *   - `INGRESS_TRUSTED_PROXY` is the proxy's address. Required: the Home
 *     Assistant app sets it to the Supervisor's fixed address on the hassio
 *     network. Without it no request is treated as ingress.
 *   - `INGRESS_ADMINS` is a comma-separated list of HA usernames that are
 *     Inkweld admins (see ingress-auth.service.ts).
 */
import type { Context } from 'hono';
import { getSocketAddress } from './client-ip';

/** `/api/hassio_ingress/<token>`; the token is URL-safe base64. */
const INGRESS_PATH_PATTERN = /^\/api\/hassio_ingress\/[A-Za-z0-9_-]{1,128}$/;

function env(name: string): string | undefined {
  if (typeof process === 'undefined' || !process.env) return undefined;
  return process.env[name];
}

export function isIngressEnabled(): boolean {
  const value = env('INGRESS_ENABLED');
  return value === 'true' || value === '1';
}

function trustedProxy(): string | undefined {
  return env('INGRESS_TRUSTED_PROXY')?.trim() || undefined;
}

/** Lower-cased HA usernames listed in `INGRESS_ADMINS`. */
export function ingressAdmins(): string[] {
  return (env('INGRESS_ADMINS') ?? '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
}

/** Strip the IPv4-mapped IPv6 prefix Bun reports on dual-stack sockets. */
function normalizeAddress(address: string): string {
  return address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address;
}

/** True when this request came through the Home Assistant ingress proxy. */
export function isIngressRequest(c: Context): boolean {
  if (!isIngressEnabled()) return false;
  const proxy = trustedProxy();
  const peer = getSocketAddress(c);
  return !!proxy && !!peer && normalizeAddress(peer) === normalizeAddress(proxy);
}

/**
 * The ingress prefix for this request, or null when the request did not come
 * through ingress or the header is not a well-formed ingress path. The value
 * ends up in served HTML, so anything unexpected is rejected outright.
 */
export function getIngressPath(c: Context): string | null {
  if (!isIngressRequest(c)) return null;
  const path = c.req.header('x-ingress-path')?.trim();
  return path && INGRESS_PATH_PATTERN.test(path) ? path : null;
}

export interface IngressUser {
  /** Stable HA user id (survives username changes). */
  id: string;
  /** HA login name; absent for users without a local login. */
  username: string | null;
  displayName: string | null;
}

/** The HA user the Supervisor authenticated, or null outside ingress. */
export function getIngressUser(c: Context): IngressUser | null {
  if (!isIngressRequest(c)) return null;
  const id = c.req.header('x-remote-user-id')?.trim();
  if (!id) return null;
  return {
    id,
    username: c.req.header('x-remote-user-name')?.trim() || null,
    displayName: c.req.header('x-remote-user-display-name')?.trim() || null,
  };
}

/**
 * Behind ingress, the HA user making the request is the person at the
 * keyboard, so a session is only valid for that user's linked account.
 * Otherwise a browser shared by two HA users would keep using whichever of
 * them signed in to Inkweld first. Always true outside ingress.
 */
export function ingressSessionMatches(
  c: Context,
  user: { homeAssistantUserId: string | null }
): boolean {
  const haUser = getIngressUser(c);
  return !haUser || user.homeAssistantUserId === haUser.id;
}
