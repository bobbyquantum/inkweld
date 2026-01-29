/**
 * Protocol and version constants for Inkweld API
 *
 * These constants define the communication protocol version between
 * the frontend client and backend server, enabling version compatibility
 * checking and graceful degradation.
 */

/**
 * Protocol version - incremented when breaking API/data schema changes are made.
 * Clients and servers with mismatched protocol versions may be incompatible.
 * This includes breaking changes to Yjs document structure, API contracts,
 * or WebSocket message formats.
 *
 * Version history:
 * - 1: Initial protocol version (January 2026)
 */
export const PROTOCOL_VERSION = 1;

/**
 * Minimum client version required to connect to this server.
 * Clients older than this version should be prompted to upgrade.
 * Uses semantic versioning (e.g., "0.1.0").
 */
export const MIN_CLIENT_VERSION = '0.1.0';

/**
 * Semantic version comparison result
 */
export type VersionComparison = -1 | 0 | 1;

/**
 * Parse a semantic version string into its components
 */
export function parseVersion(version: string): { major: number; minor: number; patch: number } {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return { major: 0, minor: 0, patch: 0 };
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

/**
 * Compare two semantic versions
 * @returns -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compareVersions(a: string, b: string): VersionComparison {
  const vA = parseVersion(a);
  const vB = parseVersion(b);

  if (vA.major !== vB.major) {
    return vA.major < vB.major ? -1 : 1;
  }
  if (vA.minor !== vB.minor) {
    return vA.minor < vB.minor ? -1 : 1;
  }
  if (vA.patch !== vB.patch) {
    return vA.patch < vB.patch ? -1 : 1;
  }
  return 0;
}

/**
 * Check if a client version meets the minimum required version
 */
export function isClientVersionCompatible(
  clientVersion: string,
  minVersion: string = MIN_CLIENT_VERSION
): boolean {
  return compareVersions(clientVersion, minVersion) >= 0;
}

/**
 * Check if protocol versions are compatible
 * Currently, only exact match is required, but this could be extended
 * to support backward compatibility ranges.
 */
export function isProtocolCompatible(
  clientProtocol: number,
  serverProtocol: number = PROTOCOL_VERSION
): boolean {
  // For now, require exact match. Could later support ranges like:
  // return clientProtocol >= MIN_SUPPORTED_PROTOCOL && clientProtocol <= serverProtocol;
  return clientProtocol === serverProtocol;
}
