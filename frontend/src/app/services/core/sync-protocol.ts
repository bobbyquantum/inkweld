import { environment } from '../../../environments/environment';

/**
 * Sync protocol version: the shape of the Yjs data this build reads and
 * writes. It must equal the server's `PROTOCOL_VERSION`
 * (`backend/src/config/protocol.ts`); bump both together whenever an older
 * build could misread what this one writes (a Yjs major upgrade, say). The
 * sync socket refuses a client of any other protocol, and Cloud Sync stops
 * on a folder written by a newer one (`cloud-sync-protocol.ts`).
 *
 * Kept free of Angular imports so plain modules (the WebSocket provider,
 * Cloud Sync) can use it without pulling services in.
 */
export const CLIENT_PROTOCOL_VERSION = 1;

/** Socket query parameter carrying {@link CLIENT_PROTOCOL_VERSION}. */
export const SYNC_PROTOCOL_PARAM = 'syncProtocol';

/** Socket query parameter carrying this build's app version. */
export const CLIENT_VERSION_PARAM = 'clientVersion';

/** `access-denied:<reason>` the server sends a client it won't sync with. */
export const VERSION_MISMATCH_REASON = 'version-mismatch';

/** The current client version from the build environment. */
export function getClientVersion(): string {
  return environment.version || '0.1.0';
}

/**
 * Add this build's protocol and app version to a sync socket URL. They go
 * right after the `?`, never at the end: y-websocket appends `/` + room
 * name to the URL, which the server reads as part of the last parameter
 * (the `documentId`).
 */
export function withSyncClientParams(wsUrl: string): string {
  const params =
    `${SYNC_PROTOCOL_PARAM}=${CLIENT_PROTOCOL_VERSION}&` +
    `${CLIENT_VERSION_PARAM}=${encodeURIComponent(getClientVersion())}`;
  const query = wsUrl.indexOf('?');
  if (query === -1) return `${wsUrl}?${params}`;
  const rest = wsUrl.slice(query + 1);
  return `${wsUrl.slice(0, query + 1)}${params}${rest ? `&${rest}` : ''}`;
}

const mismatchListeners = new Set<() => void>();

/**
 * Be told when a sync socket is refused for its version. Returns the
 * function that stops it. `VersionCompatibilityService` uses this to re-check
 * `/health` and look for an app update, whichever socket was refused.
 */
export function onSyncVersionMismatch(listener: () => void): () => void {
  mismatchListeners.add(listener);
  return () => mismatchListeners.delete(listener);
}

/** Called by the socket code when the server answers `version-mismatch`. */
export function reportSyncVersionMismatch(): void {
  for (const listener of [...mismatchListeners]) {
    try {
      listener();
    } catch (error) {
      console.error('[SyncProtocol] Version mismatch listener failed', error);
    }
  }
}
