/**
 * Decide whether a client may open a Yjs sync socket, from the versions it
 * puts in the socket URL. The Bun route and the Durable Object both call
 * this before any token or document work.
 *
 * A client whose Yjs data format differs from the server's must never sync:
 * an old ProseMirror binding that cannot read what a newer one wrote rewrites
 * the document to match its own view, deleting the newer content for every
 * collaborator. The client checks `/health` too, but it allows sync until
 * that check answers, and builds already in use can't be changed, so the
 * server refuses them here.
 */

import { MIN_CLIENT_VERSION, PROTOCOL_VERSION } from '../config/protocol';

/** Query parameter carrying the client's sync protocol version. */
export const SYNC_PROTOCOL_PARAM = 'syncProtocol';

/** Query parameter carrying the client's app version. */
export const CLIENT_VERSION_PARAM = 'clientVersion';

/**
 * Protocol assumed for a client that sends no {@link SYNC_PROTOCOL_PARAM}:
 * every build from before clients sent it speaks protocol 1. Never change
 * this, or bumping {@link PROTOCOL_VERSION} stops locking those builds out.
 */
export const LEGACY_SYNC_PROTOCOL = 1;

/** Wire reason sent as `access-denied:<reason>` before the close. */
export const VERSION_MISMATCH_REASON = 'version-mismatch';

export type SyncClientVerdict = { ok: true } | { ok: false; detail: string };

/** MAJOR.MINOR.PATCH of a version string, or null when it has none. */
function versionCore(version: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * Whether `version` is at least `minimum`, comparing MAJOR.MINOR.PATCH only
 * (as the frontend's `compareVersions` does).
 */
export function meetsMinimumVersion(version: string, minimum: string): boolean {
  const have = versionCore(version);
  const need = versionCore(minimum);
  if (!need) return true;
  if (!have) return false;
  for (let i = 0; i < 3; i++) {
    if (have[i] !== need[i]) return have[i] > need[i];
  }
  return true;
}

/**
 * Check the client versions in a sync socket's query string.
 *
 * - The protocol must equal {@link PROTOCOL_VERSION}; a missing one counts as
 *   {@link LEGACY_SYNC_PROTOCOL}. A client newer than the server is refused
 *   too: the server's own Yjs code would misread what it writes.
 * - The app version, when sent, must meet {@link MIN_CLIENT_VERSION}. Builds
 *   that don't send it are judged by their protocol alone.
 */
export function checkSyncClient(
  query: (name: string) => string | null | undefined,
  serverProtocol: number = PROTOCOL_VERSION,
  minClientVersion: string = MIN_CLIENT_VERSION
): SyncClientVerdict {
  const rawProtocol = query(SYNC_PROTOCOL_PARAM);
  let protocol = LEGACY_SYNC_PROTOCOL;
  if (rawProtocol !== null && rawProtocol !== undefined) {
    if (!/^\d{1,6}$/.test(rawProtocol)) {
      return { ok: false, detail: 'unreadable sync protocol' };
    }
    protocol = Number(rawProtocol);
  }
  if (protocol !== serverProtocol) {
    return {
      ok: false,
      detail: `sync protocol ${protocol}, server speaks ${serverProtocol}`,
    };
  }

  const clientVersion = query(CLIENT_VERSION_PARAM);
  if (clientVersion && !meetsMinimumVersion(clientVersion, minClientVersion)) {
    return {
      ok: false,
      detail: `client ${clientVersion.slice(0, 40)} is older than ${minClientVersion}`,
    };
  }
  return { ok: true };
}
