import { describe, expect, it } from 'vitest';

import { ElementType } from '../../api-client';
import { isWorldbuildingType } from './worldbuilding.utils';

describe('worldbuilding.utils', () => {
  describe('isWorldbuildingType', () => {
    it('should return true for custom types', () => {
      expect(isWorldbuildingType('CUSTOM_MY_TYPE' as ElementType)).toBe(true);
      expect(isWorldbuildingType('CUSTOM_' as ElementType)).toBe(true);
      expect(isWorldbuildingType('CUSTOM_FOO_BAR' as ElementType)).toBe(true);
    });

    it('should return true for built-in worldbuilding types', () => {
      expect(isWorldbuildingType(ElementType.Character)).toBe(true);
      expect(isWorldbuildingType(ElementType.Location)).toBe(true);
      expect(isWorldbuildingType(ElementType.WbItem)).toBe(true);
      expect(isWorldbuildingType(ElementType.Map)).toBe(true);
      expect(isWorldbuildingType(ElementType.Relationship)).toBe(true);
      expect(isWorldbuildingType(ElementType.Philosophy)).toBe(true);
      expect(isWorldbuildingType(ElementType.Culture)).toBe(true);
      expect(isWorldbuildingType(ElementType.Species)).toBe(true);
      expect(isWorldbuildingType(ElementType.Systems)).toBe(true);
    });

    it('should return false for non-worldbuilding types', () => {
      expect(isWorldbuildingType(ElementType.Item)).toBe(false);
      expect(isWorldbuildingType(ElementType.Folder)).toBe(false);
    });

    it('should return false for strings that do not start with CUSTOM_', () => {
      expect(
        isWorldbuildingType('SOME_OTHER_TYPE' as unknown as ElementType)
      ).toBe(false);
      expect(
        isWorldbuildingType('custom_lowercase' as unknown as ElementType)
      ).toBe(false);
      expect(
        isWorldbuildingType('NOT_CUSTOM' as unknown as ElementType)
      ).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(isWorldbuildingType('' as unknown as ElementType)).toBe(false);
      expect(isWorldbuildingType('CUSTOM' as unknown as ElementType)).toBe(
        false
      );
    });
  });
});
