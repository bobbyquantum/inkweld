import { describe, expect, it } from 'vitest';

import { adjustGradient, adjustHex, normalizeHex } from './color';

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

  describe('adjustHex', () => {
    it('should lighten a colour with a positive amount', () => {
      expect(adjustHex('#ff0000', 0.25)).toBe('#ff4040');
    });

    it('should darken a colour with a negative amount', () => {
      expect(adjustHex('#ff0000', -0.25)).toBe('#bf0000');
    });

    it('should clamp to white when lightening fully', () => {
      expect(adjustHex('#ff0000', 1)).toBe('#ffffff');
    });

    it('should clamp to black when darkening fully', () => {
      expect(adjustHex('#ff0000', -1)).toBe('#000000');
    });

    it('should return null for invalid input', () => {
      expect(adjustHex('nope', 0.25)).toBeNull();
    });
  });

  describe('adjustGradient', () => {
    it('should adjust every hex stop', () => {
      expect(adjustGradient('linear-gradient(#ff0000, #0000ff)', 0.25)).toBe(
        'linear-gradient(#ff4040, #4040ff)'
      );
    });

    it('should leave non-hex colours untouched', () => {
      expect(
        adjustGradient('linear-gradient(rgb(255,0,0), #0000ff)', 0.25)
      ).toBe('linear-gradient(rgb(255,0,0), #4040ff)');
    });

    it('should return the input unchanged for a non-gradient', () => {
      expect(adjustGradient('#ff0000', 0.25)).toBe('#ff0000');
    });
  });
});
