import { describe, it, expect } from 'bun:test';

/**
 * Tests for the pagination validation logic used in user.routes.ts:
 *   const rawLimit = Number.parseInt(c.req.query('limit') || '20', 10);
 *   const rawOffset = Number.parseInt(c.req.query('offset') || '0', 10);
 *   const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 20, 1), 100);
 *   const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);
 */
function parseLimit(input: string | undefined): number {
  const raw = Number.parseInt(input || '20', 10);
  return Math.min(Math.max(Number.isFinite(raw) ? raw : 20, 1), 100);
}

function parseOffset(input: string | undefined): number {
  const raw = Number.parseInt(input || '0', 10);
  return Math.max(Number.isFinite(raw) ? raw : 0, 0);
}

describe('Pagination Validation', () => {
  describe('parseLimit', () => {
    it('should use default of 20 when undefined', () => {
      expect(parseLimit(undefined)).toBe(20);
    });

    it('should parse valid limits', () => {
      expect(parseLimit('10')).toBe(10);
      expect(parseLimit('50')).toBe(50);
      expect(parseLimit('1')).toBe(1);
      expect(parseLimit('100')).toBe(100);
    });

    it('should clamp to minimum of 1', () => {
      expect(parseLimit('0')).toBe(1);
      expect(parseLimit('-5')).toBe(1);
      expect(parseLimit('-100')).toBe(1);
    });

    it('should clamp to maximum of 100', () => {
      expect(parseLimit('101')).toBe(100);
      expect(parseLimit('500')).toBe(100);
      expect(parseLimit('999999')).toBe(100);
    });

    it('should fallback to 20 for non-numeric input', () => {
      expect(parseLimit('abc')).toBe(20);
      expect(parseLimit('')).toBe(20);
    });

    it('should fallback to 20 for Infinity', () => {
      expect(parseLimit('Infinity')).toBe(20);
    });
  });

  describe('parseOffset', () => {
    it('should use default of 0 when undefined', () => {
      expect(parseOffset(undefined)).toBe(0);
    });

    it('should parse valid offsets', () => {
      expect(parseOffset('0')).toBe(0);
      expect(parseOffset('10')).toBe(10);
      expect(parseOffset('100')).toBe(100);
    });

    it('should clamp negative values to 0', () => {
      expect(parseOffset('-1')).toBe(0);
      expect(parseOffset('-100')).toBe(0);
    });

    it('should fallback to 0 for non-numeric input', () => {
      expect(parseOffset('abc')).toBe(0);
      expect(parseOffset('')).toBe(0);
    });

    it('should fallback to 0 for Infinity', () => {
      expect(parseOffset('Infinity')).toBe(0);
    });
  });
});
