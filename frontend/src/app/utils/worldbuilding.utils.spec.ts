import { describe, expect, it } from 'vitest';

import { ElementType } from '../../api-client';
import { isWorldbuildingType } from './worldbuilding.utils';

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
});
