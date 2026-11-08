import { GREGORIAN_SYSTEM, type TimeSystem } from '@models/time-system';
import { describe, expect, it } from 'vitest';

import {
  unitOptionsFor,
  unitRangeProblem,
  unitsToTimePoint,
} from './timeline-units';

/** 12 months of 36 days, but month 2 has 30 and month 10 has 40. */
const LONG_MONTH: TimeSystem = {
  id: 'long-month',
  name: 'Long Month',
  isBuiltIn: false,
  unitLabels: ['Year', 'Month', 'Day'],
  subdivisions: [12, 36],
  format: '{u0}-{u1}-{u2}',
  parseSeparator: '-',
  unitSubdivisionOverrides: [undefined, { '10': 40, '2': 30 }, undefined],
};

describe('timeline-units', () => {
  describe('unitsToTimePoint', () => {
    it('trims integer units into a point', () => {
      expect(unitsToTimePoint([' 1', '10 ', '40'], LONG_MONTH)).toEqual({
        systemId: 'long-month',
        units: ['1', '10', '40'],
      });
      expect(unitsToTimePoint(['1', 'x', '1'], LONG_MONTH)).toBeNull();
    });
  });

  describe('unitRangeProblem', () => {
    it('accepts days up to the month’s own length', () => {
      expect(unitRangeProblem(['1', '10', '40'], LONG_MONTH)).toBeNull();
      expect(unitRangeProblem(['1', '2', '30'], LONG_MONTH)).toBeNull();
    });

    it('names the unit, its parent and the range when a day is past the month', () => {
      expect(unitRangeProblem(['1', '2', '31'], LONG_MONTH)).toEqual({
        index: 2,
        unit: 'Day',
        parent: 'Month',
        parentValue: '2',
        min: 1,
        max: 30,
      });
      expect(unitRangeProblem(['1', '10', '41'], LONG_MONTH)?.max).toBe(40);
      expect(unitRangeProblem(['1', '13', '1'], LONG_MONTH)).toMatchObject({
        index: 1,
        max: 12,
      });
      expect(unitRangeProblem(['1', '3', '0'], LONG_MONTH)?.min).toBe(1);
    });

    it('leaves empty and non-integer units to the form validators', () => {
      expect(unitRangeProblem(['1', '', '99'], LONG_MONTH)).toBeNull();
      expect(unitRangeProblem(['1', '2', 'x'], LONG_MONTH)).toBeNull();
      expect(unitRangeProblem(['1999'], GREGORIAN_SYSTEM)).toBeNull();
    });
  });

  describe('unitOptionsFor', () => {
    it('lists the days the selected month holds', () => {
      expect(unitOptionsFor(LONG_MONTH, 2, ['1', '10', '1'])).toHaveLength(40);
      expect(unitOptionsFor(LONG_MONTH, 2, ['1', '2', '1'])).toHaveLength(30);
      expect(unitOptionsFor(LONG_MONTH, 2, ['1', '3', '1'])).toHaveLength(36);
    });

    it('falls back to every possible value without a usable parent', () => {
      expect(unitOptionsFor(LONG_MONTH, 2, undefined)).toHaveLength(40);
      expect(unitOptionsFor(LONG_MONTH, 2, ['1', '', '1'])).toHaveLength(40);
      expect(unitOptionsFor(GREGORIAN_SYSTEM, 1, ['2024', '1', '1'])).toEqual(
        expect.arrayContaining([{ value: '3', label: 'Mar' }])
      );
    });
  });
});
