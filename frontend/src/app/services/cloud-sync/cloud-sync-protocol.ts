import { CLIENT_PROTOCOL_VERSION } from '../core/sync-protocol';
import {
  RemoteConflictError,
  RemoteFileNotFoundError,
  type RemoteStore,
} from './remote-store.interface';

/**
 * Cloud Sync has no server to refuse an incompatible build, so the folder
 * records the newest sync protocol that has written to it. A build with an
 * older protocol stops before reading anything: an old ProseMirror binding
 * that cannot read what a newer one wrote rewrites the document to match its
 * own view, deleting the newer content on every device.
 *
 * The marker is its own file at the folder root, not a manifest field:
 * builds from before it rebuild the manifest from the fields they know, so a
 * new field would be dropped, and they never list or delete anything outside
 * `/projects`. Those builds can't be stopped this way. A protocol bump must
 * also keep them away from what the new protocol writes (by writing the
 * documents under new paths, for example).
 */
export const CLOUD_SYNC_PROTOCOL_PATH = '/sync-protocol.json';

/** Protocol of a folder without a marker: every build before it wrote 1. */
export const LEGACY_CLOUD_SYNC_PROTOCOL = 1;

/** The folder was written by a build of a newer sync protocol. */
export class CloudSyncProtocolError extends Error {
  constructor(
    /** The folder's protocol, or null when its marker can't be read. */
    readonly remoteProtocol: number | null,
    readonly localProtocol: number
  ) {
    super(
      remoteProtocol === null
        ? 'The cloud folder was written by a version of Inkweld this one cannot read. Update the app to keep syncing.'
        : `The cloud folder was written by a newer version of Inkweld (sync protocol ${remoteProtocol}, this app has ${localProtocol}). Update the app to keep syncing.`
    );
    this.name = 'CloudSyncProtocolError';
  }
}

/** The protocol in a marker file, or null when it isn't a marker we read. */
export function parseCloudSyncProtocol(text: string): number | null {
  try {
    const parsed = JSON.parse(text) as { protocol?: unknown } | null;
    const protocol = parsed?.protocol;
    return typeof protocol === 'number' &&
      Number.isInteger(protocol) &&
      protocol > 0
      ? protocol
      : null;
  } catch {
    return null;
  }
}

/** Read the folder's protocol and the marker's version tag ('' when absent). */
async function readMarker(
  store: RemoteStore
): Promise<{ protocol: number | null; version: string }> {
  try {
    const file = await store.get(CLOUD_SYNC_PROTOCOL_PATH);
    return {
      protocol: parseCloudSyncProtocol(new TextDecoder().decode(file.content)),
      version: file.version,
    };
  } catch (error) {
    if (!(error instanceof RemoteFileNotFoundError)) throw error;
    return { protocol: LEGACY_CLOUD_SYNC_PROTOCOL, version: '' };
  }
}

/**
 * Make sure this build may sync the folder: throw
 * {@link CloudSyncProtocolError} when a newer protocol (or an unreadable
 * marker) wrote it, and raise the marker when this build's protocol is newer
 * than the folder's. Equal protocols write nothing, so while the protocol is
 * 1 no marker is ever created.
 *
 * Providers can't all create a file only if it is absent (Drive has no
 * conditional writes), so two builds raising a marker at once can leave it
 * lower than the newer one. Reading it back right after the write narrows
 * that window, and the newer build raises it again on every pass.
 */
export async function ensureCloudSyncProtocol(
  store: RemoteStore,
  localProtocol: number = CLIENT_PROTOCOL_VERSION,
  retries = 1
): Promise<void> {
  const marker = await readMarker(store);
  if (marker.protocol === null || marker.protocol > localProtocol) {
    throw new CloudSyncProtocolError(marker.protocol, localProtocol);
  }
  if (marker.protocol === localProtocol) return;
  try {
    await store.put(
      CLOUD_SYNC_PROTOCOL_PATH,
      JSON.stringify(
        { protocol: localProtocol, updatedAt: new Date().toISOString() },
        null,
        2
      ),
      marker.version ? { ifVersion: marker.version } : undefined
    );
  } catch (error) {
    // Another device wrote the marker in between: judge again by what it wrote.
    if (error instanceof RemoteConflictError && retries > 0) {
      await ensureCloudSyncProtocol(store, localProtocol, retries - 1);
      return;
    }
    throw error;
  }
  // A newer build may have written its marker over ours just now.
  const written = await readMarker(store);
  if (written.protocol === null || written.protocol > localProtocol) {
    throw new CloudSyncProtocolError(written.protocol, localProtocol);
  }
}
