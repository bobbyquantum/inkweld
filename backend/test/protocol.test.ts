import { describe, it, expect } from 'bun:test';
import {
  PROTOCOL_VERSION,
  MIN_CLIENT_VERSION,
  parseVersion,
  compareVersions,
  isClientVersionCompatible,
  isProtocolCompatible,
} from '../src/config/protocol';

describe('Protocol Configuration', () => {
  describe('Constants', () => {
    it('PROTOCOL_VERSION should be a positive integer', () => {
      expect(typeof PROTOCOL_VERSION).toBe('number');
      expect(PROTOCOL_VERSION).toBeGreaterThan(0);
      expect(Number.isInteger(PROTOCOL_VERSION)).toBe(true);
    });

    it('MIN_CLIENT_VERSION should be a valid semver string', () => {
      expect(typeof MIN_CLIENT_VERSION).toBe('string');
      expect(MIN_CLIENT_VERSION).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  describe('parseVersion', () => {
    it('should parse a valid semver string', () => {
      expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
      expect(parseVersion('0.1.0')).toEqual({ major: 0, minor: 1, patch: 0 });
      expect(parseVersion('10.20.30')).toEqual({ major: 10, minor: 20, patch: 30 });
    });

    it('should handle version with prerelease/build metadata', () => {
      expect(parseVersion('1.2.3-beta')).toEqual({ major: 1, minor: 2, patch: 3 });
      expect(parseVersion('1.2.3+build')).toEqual({ major: 1, minor: 2, patch: 3 });
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

  describe('isClientVersionCompatible', () => {
    it('should return true when client version meets minimum', () => {
      expect(isClientVersionCompatible('1.0.0', '1.0.0')).toBe(true);
      expect(isClientVersionCompatible('2.0.0', '1.0.0')).toBe(true);
      expect(isClientVersionCompatible('1.1.0', '1.0.0')).toBe(true);
    });

    it('should return false when client version is below minimum', () => {
      expect(isClientVersionCompatible('0.9.0', '1.0.0')).toBe(false);
      expect(isClientVersionCompatible('1.0.0', '1.0.1')).toBe(false);
    });

    it('should use MIN_CLIENT_VERSION as default', () => {
      expect(isClientVersionCompatible(MIN_CLIENT_VERSION)).toBe(true);
    });
  });

  describe('isProtocolCompatible', () => {
    it('should return true for matching protocol versions', () => {
      expect(isProtocolCompatible(PROTOCOL_VERSION)).toBe(true);
    });

    it('should return false for mismatched protocol versions', () => {
      expect(isProtocolCompatible(PROTOCOL_VERSION + 1)).toBe(false);
      expect(isProtocolCompatible(PROTOCOL_VERSION - 1)).toBe(false);
    });
  });
});
