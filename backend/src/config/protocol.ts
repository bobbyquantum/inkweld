/**
 * Protocol and version constants for Inkweld API
 */

/**
 * Sync protocol version: the shape of the Yjs data clients and server
 * exchange. Bump it in step with `CLIENT_PROTOCOL_VERSION`
 * (`frontend/src/app/services/core/sync-protocol.ts`) whenever a client of
 * the old version could misread what a new one writes, such as a Yjs major
 * upgrade. The sync socket then refuses clients of any other version
 * (`utils/sync-client-gate.ts`), including builds from before clients sent
 * their version, which count as protocol 1.
 */
export const PROTOCOL_VERSION = 1;

/**
 * Minimum client version required to connect to this server. Only
 * MAJOR.MINOR.PATCH is compared, so it cannot tell pre-releases of one
 * version apart (1.0.0-beta.3 and 1.0.0-beta.9 are both 1.0.0): to lock out
 * older betas, bump {@link PROTOCOL_VERSION} instead.
 */
export const MIN_CLIENT_VERSION = '0.1.0';
