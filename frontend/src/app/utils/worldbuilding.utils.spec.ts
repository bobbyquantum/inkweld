import { describe, expect, it } from 'vitest';

import { ElementType } from '../../api-client';
import {
  formatWorldbuildingFields,
  isWorldbuildingType,
} from './worldbuilding.utils';

describe('worldbuilding.utils', () => {
  describe('isWorldbuildingType', () => {
    it('should return true for WORLDBUILDING ElementType', () => {
      expect(isWorldbuildingType(ElementType.Worldbuilding)).toBe(true);
    });

    it('should return true for WORLDBUILDING string', () => {
      expect(isWorldbuildingType('WORLDBUILDING')).toBe(true);
    });

    it('should return false for non-worldbuilding types', () => {
      expect(isWorldbuildingType(ElementType.Item)).toBe(false);
      expect(isWorldbuildingType(ElementType.Folder)).toBe(false);
    });

    it('should return false for other strings', () => {
      expect(isWorldbuildingType('SOME_OTHER_TYPE')).toBe(false);
      expect(isWorldbuildingType('CHARACTER')).toBe(false);
      expect(isWorldbuildingType('LOCATION')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(isWorldbuildingType('')).toBe(false);
      expect(isWorldbuildingType('worldbuilding')).toBe(false); // lowercase
    });
  });

  describe('formatWorldbuildingFields', () => {
    it('should format string fields', () => {
      expect(formatWorldbuildingFields({ name: 'Elara', role: 'Mage' })).toBe(
        'name: Elara, role: Mage'
      );
    });

    it('should format number and boolean fields', () => {
      expect(formatWorldbuildingFields({ age: 25, active: true })).toBe(
        'age: 25, active: true'
      );
    });

    it('should format array fields', () => {
      expect(formatWorldbuildingFields({ tags: ['fire', 'ice'] })).toBe(
        'tags: fire, ice'
      );
    });

    it('should skip empty, null, and undefined values', () => {
      expect(
        formatWorldbuildingFields({ a: '', b: null, c: undefined, d: 'ok' })
      ).toBe('d: ok');
    });

    it('should skip internal fields and timestamps', () => {
      expect(
        formatWorldbuildingFields({
          _internal: 'x',
          lastModified: '2024',
          name: 'test',
        })
      ).toBe('name: test');
    });

    it('should skip objects and empty arrays', () => {
      expect(
        formatWorldbuildingFields({ nested: { a: 1 }, empty: [], name: 'ok' })
      ).toBe('name: ok');
    });

    it('should return empty string for empty input', () => {
      expect(formatWorldbuildingFields({})).toBe('');
    });
  });
});
