import { describe, expect, it } from 'vitest';

import { hexToHsv, hsvToHex, normalizeHex } from './color';

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

  describe('hexToHsv', () => {
    it('should convert red', () => {
      expect(hexToHsv('#ff0000')).toEqual({ h: 0, s: 100, v: 100 });
    });

    it('should convert white and black', () => {
      expect(hexToHsv('#ffffff')).toEqual({ h: 0, s: 0, v: 100 });
      expect(hexToHsv('#000000')).toEqual({ h: 0, s: 0, v: 0 });
    });

    it('should return null for invalid input', () => {
      expect(hexToHsv('nope')).toBeNull();
    });
  });

  describe('hsvToHex', () => {
    it('should convert red', () => {
      expect(hsvToHex(0, 100, 100)).toBe('#ff0000');
    });

    it('should convert white and black', () => {
      expect(hsvToHex(0, 0, 100)).toBe('#ffffff');
      expect(hsvToHex(0, 0, 0)).toBe('#000000');
    });

    it('should round-trip a colour', () => {
      const hex = '#4fd8eb';
      const hsv = hexToHsv(hex)!;
      expect(hsvToHex(hsv.h, hsv.s, hsv.v)).toBe(hex);
    });
  });
});
