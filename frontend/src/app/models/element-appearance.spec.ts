import { describe, expect, it } from 'vitest';

import { isBackgroundEmpty } from './element-appearance';

describe('element-appearance model', () => {
  describe('isBackgroundEmpty', () => {
    it('should treat undefined as empty', () => {
      expect(isBackgroundEmpty(undefined)).toBe(true);
    });

    it('should treat an auto setting without a value as empty', () => {
      expect(isBackgroundEmpty({ type: 'color', mode: 'auto' })).toBe(true);
    });

    it('should treat a manual setting without light/dark as empty', () => {
      expect(isBackgroundEmpty({ type: 'color', mode: 'manual' })).toBe(true);
    });

    it('should treat an auto setting with a value as non-empty', () => {
      expect(
        isBackgroundEmpty({ type: 'color', mode: 'auto', value: '#fff' })
      ).toBe(false);
    });

    it('should treat a manual setting with light value as non-empty', () => {
      expect(
        isBackgroundEmpty({ type: 'image', mode: 'manual', light: 'a.png' })
      ).toBe(false);
    });

    it('should treat a manual setting with dark value as non-empty', () => {
      expect(
        isBackgroundEmpty({ type: 'image', mode: 'manual', dark: 'a.png' })
      ).toBe(false);
    });
  });
});
