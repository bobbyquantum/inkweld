import { describe, it, expect } from 'bun:test';
import { PROTOCOL_VERSION, MIN_CLIENT_VERSION } from '../src/config/protocol';

describe('Protocol Configuration', () => {
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
