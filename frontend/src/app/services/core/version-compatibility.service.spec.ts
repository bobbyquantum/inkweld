import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageContextService } from './storage-context.service';
import {
  CLIENT_PROTOCOL_VERSION,
  compareVersions,
  getClientVersion,
  parseVersion,
  VersionCompatibilityService,
} from './version-compatibility.service';

describe('Version Compatibility Functions', () => {
  describe('parseVersion', () => {
    it('should parse a valid semver string', () => {
      expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
      expect(parseVersion('0.1.0')).toEqual({ major: 0, minor: 1, patch: 0 });
      expect(parseVersion('10.20.30')).toEqual({
        major: 10,
        minor: 20,
        patch: 30,
      });
    });

    it('should handle version with prerelease/build metadata', () => {
      expect(parseVersion('1.2.3-beta')).toEqual({
        major: 1,
        minor: 2,
        patch: 3,
      });
      expect(parseVersion('1.2.3+build')).toEqual({
        major: 1,
        minor: 2,
        patch: 3,
      });
    });

    it('should return zeros for invalid version strings', () => {
      expect(parseVersion('invalid')).toEqual({ major: 0, minor: 0, patch: 0 });
      expect(parseVersion('')).toEqual({ major: 0, minor: 0, patch: 0 });
    });
  });

  describe('compareVersions', () => {
    it('should return 0 for equal versions', () => {
      expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
      expect(compareVersions('0.1.0', '0.1.0')).toBe(0);
    });

    it('should return -1 when first version is smaller', () => {
      expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
      expect(compareVersions('1.1.0', '1.2.0')).toBe(-1);
      expect(compareVersions('1.1.1', '1.1.2')).toBe(-1);
    });

    it('should return 1 when first version is larger', () => {
      expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
      expect(compareVersions('1.2.0', '1.1.0')).toBe(1);
      expect(compareVersions('1.1.2', '1.1.1')).toBe(1);
    });

    it('should handle major version differences', () => {
      expect(compareVersions('0.9.9', '1.0.0')).toBe(-1);
      expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
    });
  });

  describe('getClientVersion', () => {
    it('should return a version string', () => {
      const version = getClientVersion();
      expect(typeof version).toBe('string');
      expect(version).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  describe('CLIENT_PROTOCOL_VERSION', () => {
    it('should be a positive integer', () => {
      expect(typeof CLIENT_PROTOCOL_VERSION).toBe('number');
      expect(CLIENT_PROTOCOL_VERSION).toBeGreaterThan(0);
      expect(Number.isInteger(CLIENT_PROTOCOL_VERSION)).toBe(true);
    });
  });
});

describe('VersionCompatibilityService', () => {
  let service: VersionCompatibilityService;
  let storageContextMock: Partial<StorageContextService>;

  beforeEach(() => {
    storageContextMock = {
      updateConfigVersionInfo: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        VersionCompatibilityService,
        { provide: StorageContextService, useValue: storageContextMock },
      ],
    });

    service = TestBed.inject(VersionCompatibilityService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getClientVersion', () => {
    it('should return the client version', () => {
      const version = service.getClientVersion();
      expect(typeof version).toBe('string');
      expect(version).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  describe('getClientProtocolVersion', () => {
    it('should return the client protocol version', () => {
      expect(service.getClientProtocolVersion()).toBe(CLIENT_PROTOCOL_VERSION);
    });
  });

  describe('isVersionCompatible', () => {
    it('should return true when client version meets minimum', () => {
      expect(service.isVersionCompatible('1.0.0', '1.0.0')).toBe(true);
      expect(service.isVersionCompatible('2.0.0', '1.0.0')).toBe(true);
      expect(service.isVersionCompatible('1.1.0', '1.0.0')).toBe(true);
    });

    it('should return false when client version is below minimum', () => {
      expect(service.isVersionCompatible('0.9.0', '1.0.0')).toBe(false);
      expect(service.isVersionCompatible('1.0.0', '1.0.1')).toBe(false);
    });

    it('should return true when minVersion is null or undefined', () => {
      expect(service.isVersionCompatible('1.0.0', null)).toBe(true);
      expect(service.isVersionCompatible('1.0.0', undefined)).toBe(true);
    });
  });

  describe('isProtocolCompatible', () => {
    it('should return true for matching protocol versions', () => {
      expect(service.isProtocolCompatible(CLIENT_PROTOCOL_VERSION)).toBe(true);
    });

    it('should return false for mismatched protocol versions', () => {
      expect(service.isProtocolCompatible(CLIENT_PROTOCOL_VERSION + 1)).toBe(
        false
      );
      expect(service.isProtocolCompatible(CLIENT_PROTOCOL_VERSION - 1)).toBe(
        false
      );
    });
  });

  describe('checkProjectCompatibility', () => {
    it('should return compatible when no minVersion is set', () => {
      const result = service.checkProjectCompatibility(null);
      expect(result.compatible).toBe(true);
      expect(result.message).toBeUndefined();
    });

    it('should return compatible when client version meets requirement', () => {
      const result = service.checkProjectCompatibility('0.1.0');
      expect(result.compatible).toBe(true);
      expect(result.message).toBeUndefined();
    });

    it('should return incompatible with message when client version is too old', () => {
      const result = service.checkProjectCompatibility('99.0.0');
      expect(result.compatible).toBe(false);
      expect(result.message).toContain('99.0.0');
      expect(result.requiredVersion).toBe('99.0.0');
    });
  });

  describe('checkServerCompatibility', () => {
    it('should return compatible for a healthy server with matching versions', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            version: '0.1.0',
            protocolVersion: CLIENT_PROTOCOL_VERSION,
            minClientVersion: '0.1.0',
          }),
      });

      const result = await service.checkServerCompatibility(
        'http://localhost:8333'
      );

      expect(result.compatible).toBe(true);
      expect(result.protocolCompatible).toBe(true);
      expect(result.clientVersionCompatible).toBe(true);
      expect(result.serverInfo?.serverVersion).toBe('0.1.0');
    });

    it('should return incompatible for protocol mismatch', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            version: '0.1.0',
            protocolVersion: 999,
            minClientVersion: '0.1.0',
          }),
      });

      const result = await service.checkServerCompatibility(
        'http://localhost:8333'
      );

      expect(result.compatible).toBe(false);
      expect(result.protocolCompatible).toBe(false);
      expect(result.message).toContain('Protocol version mismatch');
    });

    it('should return incompatible for client version too old', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            version: '0.1.0',
            protocolVersion: CLIENT_PROTOCOL_VERSION,
            minClientVersion: '99.0.0',
          }),
      });

      const result = await service.checkServerCompatibility(
        'http://localhost:8333'
      );

      expect(result.compatible).toBe(false);
      expect(result.clientVersionCompatible).toBe(false);
      expect(result.message).toContain('too old');
    });

    it('should return incompatible when server is unreachable', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await service.checkServerCompatibility(
        'http://localhost:8333'
      );

      expect(result.compatible).toBe(false);
      expect(result.message).toContain('Network error');
    });

    it('should return incompatible when server returns error status', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await service.checkServerCompatibility(
        'http://localhost:8333'
      );

      expect(result.compatible).toBe(false);
      expect(result.message).toContain('500');
    });
  });

  describe('isVersionInfoStale', () => {
    it('should return true for undefined version info', () => {
      expect(service.isVersionInfoStale(undefined)).toBe(true);
    });

    it('should return false for recent version info', () => {
      const versionInfo = {
        serverVersion: '0.1.0',
        protocolVersion: 1,
        minClientVersion: '0.1.0',
        lastCheckedAt: new Date().toISOString(),
      };
      expect(service.isVersionInfoStale(versionInfo)).toBe(false);
    });

    it('should return true for old version info', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 2); // 2 days ago
      const versionInfo = {
        serverVersion: '0.1.0',
        protocolVersion: 1,
        minClientVersion: '0.1.0',
        lastCheckedAt: oldDate.toISOString(),
      };
      expect(service.isVersionInfoStale(versionInfo)).toBe(true);
    });
  });

  describe('checkAndUpdateProfileCompatibility', () => {
    it('should return compatible for local mode profile', async () => {
      const localProfile = {
        id: 'local',
        type: 'local' as const,
        addedAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
      };

      const result =
        await service.checkAndUpdateProfileCompatibility(localProfile);

      expect(result.compatible).toBe(true);
      expect(result.protocolCompatible).toBe(true);
      expect(result.clientVersionCompatible).toBe(true);
    });

    it('should return incompatible when serverUrl is missing', async () => {
      const serverProfile = {
        id: 'server-1',
        type: 'server' as const,
        addedAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
        // No serverUrl
      };

      const result =
        await service.checkAndUpdateProfileCompatibility(serverProfile);

      expect(result.compatible).toBe(false);
      expect(result.message).toBe('No server URL configured');
    });

    it('should check server compatibility and update version info', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            version: '0.1.0',
            protocolVersion: CLIENT_PROTOCOL_VERSION,
            minClientVersion: '0.1.0',
          }),
      });

      const serverProfile = {
        id: 'server-1',
        type: 'server' as const,
        serverUrl: 'http://localhost:8333',
        addedAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
      };

      const result =
        await service.checkAndUpdateProfileCompatibility(serverProfile);

      expect(result.compatible).toBe(true);
      expect(storageContextMock.updateConfigVersionInfo).toHaveBeenCalledWith(
        'server-1',
        expect.objectContaining({
          serverVersion: '0.1.0',
          protocolVersion: CLIENT_PROTOCOL_VERSION,
        })
      );
    });
  });

  describe('getCachedVersionInfo', () => {
    it('should return versionInfo from profile', () => {
      const versionInfo = {
        serverVersion: '0.1.0',
        protocolVersion: 1,
        minClientVersion: '0.1.0',
        lastCheckedAt: new Date().toISOString(),
      };
      const profile = {
        id: 'server-1',
        type: 'server' as const,
        serverUrl: 'http://localhost:8333',
        addedAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
        versionInfo,
      };

      expect(service.getCachedVersionInfo(profile)).toBe(versionInfo);
    });

    it('should return undefined when no versionInfo exists', () => {
      const profile = {
        id: 'server-1',
        type: 'server' as const,
        serverUrl: 'http://localhost:8333',
        addedAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
      };

      expect(service.getCachedVersionInfo(profile)).toBeUndefined();
    });
  });
});
