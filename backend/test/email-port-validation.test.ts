import { describe, it, expect } from 'bun:test';

/**
 * Tests for the SMTP port validation logic used in email.service.ts:
 *   const parsedPort = Number.parseInt(port, 10);
 *   const portNum = Number.isFinite(parsedPort) && parsedPort >= 1 && parsedPort <= 65535
 *     ? parsedPort : 587;
 *
 * We replicate the exact logic here to verify edge cases.
 */
function parseSmtpPort(port: string): number {
  const parsedPort = Number.parseInt(port, 10);
  return Number.isFinite(parsedPort) && parsedPort >= 1 && parsedPort <= 65535 ? parsedPort : 587;
}

describe('SMTP Port Validation', () => {
  it('should parse a valid port number', () => {
    expect(parseSmtpPort('25')).toBe(25);
    expect(parseSmtpPort('465')).toBe(465);
    expect(parseSmtpPort('587')).toBe(587);
    expect(parseSmtpPort('2525')).toBe(2525);
  });

  it('should accept boundary values', () => {
    expect(parseSmtpPort('1')).toBe(1);
    expect(parseSmtpPort('65535')).toBe(65535);
  });

  it('should fallback to 587 for port 0', () => {
    expect(parseSmtpPort('0')).toBe(587);
  });

  it('should fallback to 587 for negative ports', () => {
    expect(parseSmtpPort('-1')).toBe(587);
    expect(parseSmtpPort('-25')).toBe(587);
  });

  it('should fallback to 587 for ports above 65535', () => {
    expect(parseSmtpPort('65536')).toBe(587);
    expect(parseSmtpPort('99999')).toBe(587);
  });

  it('should fallback to 587 for non-numeric strings', () => {
    expect(parseSmtpPort('abc')).toBe(587);
    expect(parseSmtpPort('')).toBe(587);
    expect(parseSmtpPort('not-a-number')).toBe(587);
  });

  it('should fallback to 587 for Infinity', () => {
    expect(parseSmtpPort('Infinity')).toBe(587);
    expect(parseSmtpPort('-Infinity')).toBe(587);
  });

  it('should parse leading digits from mixed strings', () => {
    // parseInt('25abc') returns 25, which is valid
    expect(parseSmtpPort('25abc')).toBe(25);
    // parseInt('587.5') returns 587, which is valid
    expect(parseSmtpPort('587.5')).toBe(587);
  });
});
