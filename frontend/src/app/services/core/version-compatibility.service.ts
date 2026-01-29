import { inject, Injectable, signal } from '@angular/core';

import { environment } from '../../../environments/environment';
import {
  ServerConfig,
  ServerVersionInfo,
  StorageContextService,
} from './storage-context.service';

/**
 * Expected health endpoint response shape for type safety
 */
interface HealthResponse {
  version?: string;
  protocolVersion?: number;
  minClientVersion?: string;
}

/**
 * Current client protocol version.
 * This must match the server's PROTOCOL_VERSION for full compatibility.
 */
export const CLIENT_PROTOCOL_VERSION = 1;

/**
 * Get the current client version from environment/package.json
 */
export function getClientVersion(): string {
  return environment.version || '0.1.0';
}

/**
 * Version comparison result
 */
export type VersionComparison = -1 | 0 | 1;

/**
 * Parse a semantic version string into its components
 */
export function parseVersion(version: string): {
  major: number;
  minor: number;
  patch: number;
} {
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
 * Compatibility check result
 */
export interface CompatibilityResult {
  /** Whether the client is compatible with the server */
  compatible: boolean;

  /** Whether the protocol versions match */
  protocolCompatible: boolean;

  /** Whether the client version meets the server's minimum requirement */
  clientVersionCompatible: boolean;

  /** Human-readable message describing any incompatibility */
  message?: string;

  /** Server version info (if available) */
  serverInfo?: ServerVersionInfo;
}

/**
 * Project compatibility result
 */
export interface ProjectCompatibilityResult {
  /** Whether the client can open this project */
  compatible: boolean;

  /** Human-readable message describing any incompatibility */
  message?: string;

  /** The minimum version required by the project */
  requiredVersion?: string;

  /** The current client version */
  clientVersion: string;
}

/**
 * Service for checking version compatibility between client and server,
 * and between client and projects.
 */
@Injectable({
  providedIn: 'root',
})
export class VersionCompatibilityService {
  private storageContext = inject(StorageContextService);

  /** Signal indicating if a compatibility check is in progress */
  readonly checking = signal(false);

  /** Signal with the last compatibility result for the active server */
  readonly lastResult = signal<CompatibilityResult | null>(null);

  /**
   * Get the current client version
   */
  getClientVersion(): string {
    return getClientVersion();
  }

  /**
   * Get the client protocol version
   */
  getClientProtocolVersion(): number {
    return CLIENT_PROTOCOL_VERSION;
  }

  /**
   * Check if a client version meets a minimum required version
   */
  isVersionCompatible(
    clientVersion: string,
    minVersion: string | null | undefined
  ): boolean {
    if (!minVersion) return true;
    return compareVersions(clientVersion, minVersion) >= 0;
  }

  /**
   * Check if protocol versions are compatible
   */
  isProtocolCompatible(serverProtocol: number): boolean {
    // For now, require exact match
    return serverProtocol === CLIENT_PROTOCOL_VERSION;
  }

  /**
   * Check compatibility with a server by fetching its health endpoint
   */
  async checkServerCompatibility(
    serverUrl: string
  ): Promise<CompatibilityResult> {
    this.checking.set(true);
    try {
      const response = await fetch(`${serverUrl}/api/v1/health`);
      if (!response.ok) {
        return {
          compatible: false,
          protocolCompatible: false,
          clientVersionCompatible: false,
          message: `Server returned status ${response.status}`,
        };
      }

      const data = (await response.json()) as HealthResponse;
      const serverInfo: ServerVersionInfo = {
        serverVersion: data.version || 'unknown',
        protocolVersion: data.protocolVersion ?? 1,
        minClientVersion: data.minClientVersion || '0.0.0',
        lastCheckedAt: new Date().toISOString(),
      };

      const clientVersion = this.getClientVersion();
      const protocolCompatible = this.isProtocolCompatible(
        serverInfo.protocolVersion
      );
      const clientVersionCompatible = this.isVersionCompatible(
        clientVersion,
        serverInfo.minClientVersion
      );
      const compatible = protocolCompatible && clientVersionCompatible;

      let message: string | undefined;
      if (!protocolCompatible) {
        message = `Protocol version mismatch: client=${CLIENT_PROTOCOL_VERSION}, server=${serverInfo.protocolVersion}. You may need to update your client.`;
      } else if (!clientVersionCompatible) {
        message = `Client version ${clientVersion} is too old. Server requires at least ${serverInfo.minClientVersion}.`;
      }

      const result: CompatibilityResult = {
        compatible,
        protocolCompatible,
        clientVersionCompatible,
        message,
        serverInfo,
      };

      this.lastResult.set(result);
      return result;
    } catch (error) {
      const result: CompatibilityResult = {
        compatible: false,
        protocolCompatible: false,
        clientVersionCompatible: false,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to connect to server',
      };
      this.lastResult.set(result);
      return result;
    } finally {
      this.checking.set(false);
    }
  }

  /**
   * Check compatibility and update the stored version info for a profile
   */
  async checkAndUpdateProfileCompatibility(
    profile: ServerConfig
  ): Promise<CompatibilityResult> {
    if (profile.type === 'local') {
      // Local mode is always compatible
      return {
        compatible: true,
        protocolCompatible: true,
        clientVersionCompatible: true,
      };
    }

    if (!profile.serverUrl) {
      return {
        compatible: false,
        protocolCompatible: false,
        clientVersionCompatible: false,
        message: 'No server URL configured',
      };
    }

    const result = await this.checkServerCompatibility(profile.serverUrl);

    // Update stored version info if we got server info
    if (result.serverInfo) {
      this.storageContext.updateConfigVersionInfo(
        profile.id,
        result.serverInfo
      );
    }

    return result;
  }

  /**
   * Check if the client can open a project based on its minClientVersion
   */
  checkProjectCompatibility(
    projectMinVersion: string | null | undefined
  ): ProjectCompatibilityResult {
    const clientVersion = this.getClientVersion();

    if (!projectMinVersion) {
      return {
        compatible: true,
        clientVersion,
      };
    }

    const compatible = this.isVersionCompatible(
      clientVersion,
      projectMinVersion
    );

    return {
      compatible,
      message: compatible
        ? undefined
        : `This project requires client version ${projectMinVersion} or later. You have ${clientVersion}.`,
      requiredVersion: projectMinVersion,
      clientVersion,
    };
  }

  /**
   * Get cached version info for a profile (without making a network request)
   */
  getCachedVersionInfo(profile: ServerConfig): ServerVersionInfo | undefined {
    return profile.versionInfo;
  }

  /**
   * Check if cached version info is stale (older than specified duration)
   */
  isVersionInfoStale(
    versionInfo: ServerVersionInfo | undefined,
    maxAgeMs: number = 24 * 60 * 60 * 1000 // 24 hours default
  ): boolean {
    if (!versionInfo) return true;
    const checkedAt = new Date(versionInfo.lastCheckedAt).getTime();
    return Date.now() - checkedAt > maxAgeMs;
  }
}
