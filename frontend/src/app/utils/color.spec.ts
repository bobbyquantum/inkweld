import { describe, expect, it } from 'vitest';

import { normalizeHex } from './color';

describe('color utils', () => {
  describe('normalizeHex', () => {
    it('should normalise a 6-digit hex', () => {
      expect(normalizeHex('#4FD8EB')).toBe('#4fd8eb');
      expect(normalizeHex('4fd8eb')).toBe('#4fd8eb');
    });

    it('should expand a 3-digit hex', () => {
      expect(normalizeHex('#fff')).toBe('#ffffff');
      expect(normalizeHex('abc')).toBe('#aabbcc');
    });

    it('should return null for invalid input', () => {
      expect(normalizeHex('red')).toBeNull();
      expect(normalizeHex('#12345')).toBeNull();
      expect(normalizeHex('')).toBeNull();
    });
  });
});
