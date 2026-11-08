import { describe, expect, it } from 'vitest';
import {
  absoluteToTimePoint,
  assertValidTimeSystem,
  checkTimeSystem,
  compareTimePoints,
  effectiveSubdivision,
  findTemplateSystem,
  formatTimePoint,
  GREGORIAN_SYSTEM,
  isTemplateSystemId,
  isValidTimePointFor,
  normalizeTimePoint,
  parseTimePoint,
  RELATIVE_YEARS_SYSTEM,
  TIME_SYSTEM_TEMPLATES,
  type TimePoint,
  timePointToAbsolute,
  type TimeSystem,
  unitDropdownOptions,
  unitInputModeFor,
  unitLengthInTicks,
  unitMaxValue,
  unitMaxValueFor,
  unitMinValue,
  unitStartTick,
} from '../src/time-system';

describe('time-system', () => {
  describe('built-in systems', () => {
    it('exposes the expected built-ins', () => {
      const ids = TIME_SYSTEM_TEMPLATES.map(s => s.id);
      expect(ids).toContain('gregorian');
      expect(ids).toContain('iso-year');
      expect(ids).toContain('relative-years');
    });

    it('marks built-ins via isTemplateSystemId', () => {
      expect(isTemplateSystemId('gregorian')).toBe(true);
      expect(isTemplateSystemId('relative-years')).toBe(true);
      expect(isTemplateSystemId('not-a-real-id')).toBe(false);
    });

    it('resolves built-ins by id', () => {
      expect(findTemplateSystem('gregorian')).toBe(GREGORIAN_SYSTEM);
      expect(findTemplateSystem('missing')).toBeUndefined();
    });

    it.each<TimeSystem>(TIME_SYSTEM_TEMPLATES as TimeSystem[])(
      'passes validation: %s',
      (system: TimeSystem) => {
        expect(() => assertValidTimeSystem(system)).not.toThrow();
      }
    );
  });

  describe('assertValidTimeSystem', () => {
    it('requires an id', () => {
      expect(() =>
        assertValidTimeSystem({ ...GREGORIAN_SYSTEM, id: '' })
      ).toThrow(/id/);
    });

    it('requires a name', () => {
      expect(() =>
        assertValidTimeSystem({ ...GREGORIAN_SYSTEM, name: '' })
      ).toThrow(/name/);
    });

    it('requires at least one unit label', () => {
      expect(() =>
        assertValidTimeSystem({
          ...GREGORIAN_SYSTEM,
          unitLabels: [],
          subdivisions: [],
        })
      ).toThrow(/unitLabels/);
    });

    it('requires subdivisions.length === unitLabels.length - 1', () => {
      expect(() =>
        assertValidTimeSystem({
          ...GREGORIAN_SYSTEM,
          unitLabels: ['Year', 'Month', 'Day'],
          subdivisions: [12],
        })
      ).toThrow(/subdivisions length/);
    });

    it('rejects non-positive subdivisions', () => {
      expect(() =>
        assertValidTimeSystem({
          ...GREGORIAN_SYSTEM,
          subdivisions: [12, 0],
        })
      ).toThrow(/positive integers/);
      expect(() =>
        assertValidTimeSystem({
          ...GREGORIAN_SYSTEM,
          subdivisions: [12, -1],
        })
      ).toThrow(/positive integers/);
    });

    it('throws when unitAliases length does not match unitLabels length', () => {
      expect(() =>
        assertValidTimeSystem({
          ...GREGORIAN_SYSTEM,
          unitAliases: [undefined, { '1': 'Jan' }],
        })
      ).toThrow(/unitAliases length/);
    });

    it('accepts a system with correctly-sized unitAliases', () => {
      expect(() =>
        assertValidTimeSystem({
          ...GREGORIAN_SYSTEM,
          unitAliases: [undefined, { '1': 'Jan' }, undefined],
        })
      ).not.toThrow();
    });
  });

  describe('isValidTimePointFor', () => {
    it('accepts matching length and integer strings', () => {
      const tp: TimePoint = {
        systemId: 'gregorian',
        units: ['1999', '1', '3'],
      };
      expect(isValidTimePointFor(tp, GREGORIAN_SYSTEM)).toBe(true);
    });

    it('rejects negative years', () => {
      const tp: TimePoint = {
        systemId: 'gregorian',
        units: ['-44', '3', '15'],
      };
      expect(isValidTimePointFor(tp, GREGORIAN_SYSTEM)).toBe(false);
    });

    it('rejects mismatched systemId', () => {
      const tp: TimePoint = {
        systemId: 'other',
        units: ['1999', '1', '3'],
      };
      expect(isValidTimePointFor(tp, GREGORIAN_SYSTEM)).toBe(false);
    });

    it('rejects wrong unit length', () => {
      const tp: TimePoint = { systemId: 'gregorian', units: ['1999'] };
      expect(isValidTimePointFor(tp, GREGORIAN_SYSTEM)).toBe(false);
    });

    it('rejects non-integer strings', () => {
      const tp: TimePoint = {
        systemId: 'gregorian',
        units: ['1999', 'x', '3'],
      };
      expect(isValidTimePointFor(tp, GREGORIAN_SYSTEM)).toBe(false);
    });
  });

  describe('timePointToAbsolute', () => {
    it('returns the total in smallest units', () => {
      const tp: TimePoint = {
        systemId: 'gregorian',
        units: ['1', '2', '3'],
      };
      // 1 year * 12 * 30 + 2 months * 30 + 3 days = 423
      expect(timePointToAbsolute(tp, GREGORIAN_SYSTEM)).toBe(423n);
    });

    it('handles a single-unit system', () => {
      const tp: TimePoint = { systemId: 'relative-years', units: ['42'] };
      expect(timePointToAbsolute(tp, RELATIVE_YEARS_SYSTEM)).toBe(42n);
    });

    it('throws for negative values outside allowed range', () => {
      const tp: TimePoint = {
        systemId: 'gregorian',
        units: ['-1', '1', '1'],
      };
      expect(() => timePointToAbsolute(tp, GREGORIAN_SYSTEM)).toThrow(
        /does not match TimeSystem/
      );
    });

    it('handles magnitudes larger than Number.MAX_SAFE_INTEGER', () => {
      const bigYear = '1000000000000000000'; // 1e18
      const tp: TimePoint = {
        systemId: 'gregorian',
        units: [bigYear, '1', '1'],
      };
      const abs = timePointToAbsolute(tp, GREGORIAN_SYSTEM);
      expect(abs).toBe(BigInt(bigYear) * 360n + 31n);
    });

    it('throws on invalid point', () => {
      const tp: TimePoint = { systemId: 'other', units: ['1', '2', '3'] };
      expect(() => timePointToAbsolute(tp, GREGORIAN_SYSTEM)).toThrow();
    });
  });

  describe('absoluteToTimePoint', () => {
    it('returns canonical unit values that respect one-based lower units', () => {
      const point = absoluteToTimePoint(423n, GREGORIAN_SYSTEM);

      expect(point).toEqual({
        systemId: 'gregorian',
        units: ['1', '2', '3'],
      });
      expect(isValidTimePointFor(point, GREGORIAN_SYSTEM)).toBe(true);
    });

    it('borrows across one-based month and day boundaries', () => {
      const point = absoluteToTimePoint(2020n * 360n + 30n, GREGORIAN_SYSTEM);

      expect(point.units).toEqual(['2019', '12', '30']);
      expect(isValidTimePointFor(point, GREGORIAN_SYSTEM)).toBe(true);
    });

    it('round-trips valid Gregorian points through absolute ticks', () => {
      const source: TimePoint = {
        systemId: 'gregorian',
        units: ['2024', '12', '30'],
      };
      const tick = timePointToAbsolute(source, GREGORIAN_SYSTEM);

      expect(absoluteToTimePoint(tick, GREGORIAN_SYSTEM)).toEqual(source);
    });
  });

  describe('normalizeTimePoint', () => {
    it('repairs overflowed bounded units by canonicalizing their tick value', () => {
      const repaired = normalizeTimePoint(
        { systemId: 'gregorian', units: ['2020', '1', '0'] },
        GREGORIAN_SYSTEM
      );

      expect(repaired?.units).toEqual(['2019', '12', '30']);
      expect(repaired && isValidTimePointFor(repaired, GREGORIAN_SYSTEM)).toBe(
        true
      );
    });

    it('returns null when normalization cannot produce a valid point', () => {
      const repaired = normalizeTimePoint(
        { systemId: 'gregorian', units: ['0', '1', '0'] },
        GREGORIAN_SYSTEM
      );

      expect(repaired).toBeNull();
    });
  });

  describe('compareTimePoints', () => {
    const earlier: TimePoint = {
      systemId: 'gregorian',
      units: ['1999', '1', '1'],
    };
    const later: TimePoint = {
      systemId: 'gregorian',
      units: ['1999', '1', '2'],
    };
    const same: TimePoint = {
      systemId: 'gregorian',
      units: ['1999', '1', '1'],
    };

    it('returns -1 when a < b', () => {
      expect(compareTimePoints(earlier, later, GREGORIAN_SYSTEM)).toBe(-1);
    });

    it('returns 1 when a > b', () => {
      expect(compareTimePoints(later, earlier, GREGORIAN_SYSTEM)).toBe(1);
    });

    it('returns 0 when equal', () => {
      expect(compareTimePoints(earlier, same, GREGORIAN_SYSTEM)).toBe(0);
    });

    it('throws when points are from a different system', () => {
      const other: TimePoint = { systemId: 'other', units: ['1', '1', '1'] };
      expect(() =>
        compareTimePoints(earlier, other, GREGORIAN_SYSTEM)
      ).toThrow();
    });
  });

  describe('formatTimePoint', () => {
    it('renders using the template (with month alias)', () => {
      const tp: TimePoint = {
        systemId: 'gregorian',
        units: ['1999', '1', '3'],
      };
      // Gregorian's default format uses `{a1}` so January renders as `Jan`.
      expect(formatTimePoint(tp, GREGORIAN_SYSTEM)).toBe('1999-Jan-3');
    });

    it('prefixes circa values with ~', () => {
      const tp: TimePoint = {
        systemId: 'gregorian',
        units: ['1999', '1', '3'],
        circa: true,
      };
      expect(formatTimePoint(tp, GREGORIAN_SYSTEM)).toBe('~1999-Jan-3');
    });

    it('appends an em-dash label when present', () => {
      const tp: TimePoint = {
        systemId: 'gregorian',
        units: ['1999', '1', '3'],
        label: "New Year's",
      };
      expect(formatTimePoint(tp, GREGORIAN_SYSTEM)).toBe(
        "1999-Jan-3 — New Year's"
      );
    });

    it('falls back to the raw value when no alias is defined for the key', () => {
      const system: TimeSystem = {
        ...GREGORIAN_SYSTEM,
        // Drop the alias for month 13 (synthetic, beyond normal range).
        unitAliases: [undefined, { '1': 'Jan' }, undefined],
        format: '{u0}-{a1}-{u2}',
      };
      const tp: TimePoint = {
        systemId: 'gregorian',
        units: ['1999', '7', '3'],
      };
      expect(formatTimePoint(tp, system)).toBe('1999-7-3');
    });

    it('renders `{uN}` unchanged even when an alias exists for the unit', () => {
      const system: TimeSystem = {
        ...GREGORIAN_SYSTEM,
        // Force the numeric form even though aliases are present.
        format: '{u0}-{u1}-{u2}',
      };
      const tp: TimePoint = {
        systemId: 'gregorian',
        units: ['1999', '1', '3'],
      };
      expect(formatTimePoint(tp, system)).toBe('1999-1-3');
    });

    it('throws on invalid point', () => {
      const tp: TimePoint = { systemId: 'other', units: ['1', '2', '3'] };
      expect(() => formatTimePoint(tp, GREGORIAN_SYSTEM)).toThrow();
    });
  });

  describe('parseTimePoint', () => {
    it('parses a valid gregorian string', () => {
      const tp = parseTimePoint('1999-1-3', GREGORIAN_SYSTEM);
      expect(tp).toEqual({ systemId: 'gregorian', units: ['1999', '1', '3'] });
    });

    it('flags a leading ~ as circa', () => {
      const tp = parseTimePoint('~1200-6-1', GREGORIAN_SYSTEM);
      expect(tp).toEqual({
        systemId: 'gregorian',
        units: ['1200', '6', '1'],
        circa: true,
      });
    });

    it('round-trips format → parse', () => {
      const original: TimePoint = {
        systemId: 'gregorian',
        units: ['1999', '1', '3'],
      };
      // Parse expects purely numeric units, so we round-trip through the
      // numeric-only format rather than the default Gregorian format that
      // renders month names via `{a1}`.
      const numericOnly: TimeSystem = {
        ...GREGORIAN_SYSTEM,
        format: '{u0}-{u1}-{u2}',
      };
      const rendered = formatTimePoint(original, numericOnly);
      const parsed = parseTimePoint(rendered, numericOnly);
      expect(parsed).toEqual(original);
    });

    it('returns null for wrong part count', () => {
      expect(parseTimePoint('1999-1', GREGORIAN_SYSTEM)).toBeNull();
      expect(parseTimePoint('1999-1-3-4', GREGORIAN_SYSTEM)).toBeNull();
    });

    it('returns null for non-numeric parts', () => {
      expect(parseTimePoint('1999-Jan-3', GREGORIAN_SYSTEM)).toBeNull();
    });

    it('returns null for empty input', () => {
      expect(parseTimePoint('', GREGORIAN_SYSTEM)).toBeNull();
      expect(parseTimePoint('   ', GREGORIAN_SYSTEM)).toBeNull();
    });

    it('parses a negative first unit when separator is the same as minus sign', () => {
      expect(parseTimePoint('-100-5-15', GREGORIAN_SYSTEM)).toEqual({
        systemId: 'gregorian',
        units: ['-100', '5', '15'],
      });
    });
  });

  describe('custom systems', () => {
    const fantasyCalendar: TimeSystem = {
      id: 'third-age',
      name: 'Third Age',
      isBuiltIn: false,
      unitLabels: ['Age', 'Year', 'Day'],
      subdivisions: [3000, 400],
      format: 'TA{u0}.{u1}.{u2}',
      parseSeparator: '.',
    };

    it('validates a bespoke system', () => {
      expect(() => assertValidTimeSystem(fantasyCalendar)).not.toThrow();
    });

    it('renders using custom format', () => {
      const tp: TimePoint = {
        systemId: 'third-age',
        units: ['3', '2931', '1'],
      };
      expect(formatTimePoint(tp, fantasyCalendar)).toBe('TA3.2931.1');
    });

    it('parses with a custom separator after stripping the TA prefix', () => {
      // The parser does not understand the `TA` prefix; callers are
      // expected to strip it. This asserts that expectation is explicit.
      expect(parseTimePoint('TA3.2931.1', fantasyCalendar)).toBeNull();
      expect(parseTimePoint('3.2931.1', fantasyCalendar)).toEqual({
        systemId: 'third-age',
        units: ['3', '2931', '1'],
      });
    });

    it('orders across top units correctly', () => {
      const early: TimePoint = {
        systemId: 'third-age',
        units: ['2', '2999', '400'],
      };
      const late: TimePoint = {
        systemId: 'third-age',
        units: ['3', '1', '1'],
      };
      expect(compareTimePoints(early, late, fantasyCalendar)).toBe(-1);
    });
  });

  describe('per-unit editor helpers', () => {
    const base: TimeSystem = {
      id: 'h',
      name: 'Helpers',
      isBuiltIn: false,
      unitLabels: ['Year', 'Month', 'Day'],
      subdivisions: [12, 30],
      format: '{u0}-{u1}-{u2}',
      parseSeparator: '-',
    };

    it('unitMinValue defaults to 1 and respects allowZero', () => {
      const sys: TimeSystem = {
        ...base,
        unitAllowZero: [false, true, false],
      };
      expect(unitMinValue(sys, 0)).toBe(1);
      expect(unitMinValue(sys, 1)).toBe(0);
      expect(unitMinValue(sys, 2)).toBe(1);
      expect(unitMinValue(base, 1)).toBe(1);
    });

    it('unitMaxValue is null for top-level and shifts with allowZero', () => {
      expect(unitMaxValue(base, 0)).toBeNull();
      expect(unitMaxValue(base, 1)).toBe(12);
      expect(unitMaxValue(base, 2)).toBe(30);
      const zeroBased: TimeSystem = {
        ...base,
        unitAllowZero: [false, true, true],
      };
      expect(unitMaxValue(zeroBased, 1)).toBe(11);
      expect(unitMaxValue(zeroBased, 2)).toBe(29);
    });

    it('unitInputModeFor falls back to numeric for unbounded units without aliases', () => {
      const sys: TimeSystem = {
        ...base,
        unitInputMode: ['dropdown', 'dropdown', 'numeric'],
      };
      expect(unitInputModeFor(sys, 0)).toBe('numeric');
      expect(unitInputModeFor(sys, 1)).toBe('dropdown');
      expect(unitInputModeFor(sys, 2)).toBe('numeric');
    });

    it('unitInputModeFor honours dropdown for unbounded units when aliases exist', () => {
      const sys: TimeSystem = {
        ...base,
        unitInputMode: ['dropdown', 'numeric', 'numeric'],
        unitAliases: [{ '1': 'First', '2': 'Second' }, undefined, undefined],
      };
      expect(unitInputModeFor(sys, 0)).toBe('dropdown');
    });

    it('unitDropdownOptions enumerates bounded ranges and applies aliases', () => {
      const sys: TimeSystem = {
        ...base,
        unitAliases: [undefined, { '1': 'Jan', '2': 'Feb' }, undefined],
      };
      const months = unitDropdownOptions(sys, 1);
      expect(months).toHaveLength(12);
      expect(months[0]).toEqual({ value: '1', label: 'Jan' });
      expect(months[1]).toEqual({ value: '2', label: 'Feb' });
      expect(months[2]).toEqual({ value: '3', label: '3' });
    });

    it('unitDropdownOptions sorts unbounded alias keys numerically', () => {
      const sys: TimeSystem = {
        ...base,
        unitAliases: [{ '10': 'Ten', '2': 'Two', '1': 'One' }],
      };
      const opts = unitDropdownOptions(sys, 0);
      expect(opts.map(o => o.value)).toEqual(['1', '2', '10']);
      expect(opts.map(o => o.label)).toEqual(['One', 'Two', 'Ten']);
    });

    it('assertValidTimeSystem rejects mismatched per-unit array lengths', () => {
      expect(() =>
        assertValidTimeSystem({ ...base, unitAllowZero: [true, false] })
      ).toThrow(/unitAllowZero length/);
      expect(() =>
        assertValidTimeSystem({
          ...base,
          unitInputMode: ['numeric', 'dropdown'],
        })
      ).toThrow(/unitInputMode length/);
    });
  });

  describe('effectiveSubdivision', () => {
    const systemWithOverrides: TimeSystem = {
      ...GREGORIAN_SYSTEM,
      unitSubdivisionOverrides: [
        // overrides for month→day subdivision (index 1, keyed by month value)
        {},
        { '2': 28 },
      ],
    };

    it('returns override when present', () => {
      expect(effectiveSubdivision(systemWithOverrides, 2, '2')).toBe(28);
    });

    it('falls back to uniform subdivision when no override', () => {
      expect(effectiveSubdivision(systemWithOverrides, 2, '1')).toBe(
        GREGORIAN_SYSTEM.subdivisions[1]
      );
    });

    it('returns null for top unit', () => {
      expect(effectiveSubdivision(systemWithOverrides, 0, '1')).toBeNull();
    });
  });

  describe('unitMaxValueFor', () => {
    const systemWithOverrides: TimeSystem = {
      ...GREGORIAN_SYSTEM,
      unitSubdivisionOverrides: [{}, { '2': 28 }],
    };

    it('returns null for top unit', () => {
      expect(unitMaxValueFor(systemWithOverrides, 0, '1')).toBeNull();
    });

    it('returns override-aware max when override applies', () => {
      // February (month 2) has 28 days: max = unitMin(2) + 28 - 1
      const min = systemWithOverrides.unitAllowZero?.[2] ? 0 : 1;
      expect(unitMaxValueFor(systemWithOverrides, 2, '2')).toBe(min + 28 - 1);
    });

    it('falls back to the regular max when no override applies', () => {
      expect(unitMaxValueFor(systemWithOverrides, 2, '1')).toBe(30);
    });
  });

  describe('irregular lengths', () => {
    // 12 months of 36 days, but month 2 has 30 and month 10 has 40.
    const longMonth: TimeSystem = {
      id: 'long-month',
      name: 'Long Month',
      isBuiltIn: false,
      unitLabels: ['Year', 'Month', 'Day'],
      subdivisions: [12, 36],
      format: '{u0}-{u1}-{u2}',
      parseSeparator: '-',
      unitSubdivisionOverrides: [undefined, { '10': 40, '2': 30 }, undefined],
    };
    const at = (units: string[]): TimePoint => ({ systemId: longMonth.id, units });
    const tick = (units: string[]) => timePointToAbsolute(at(units), longMonth);

    // Year 3 has a 13th month; days 0-based; day 5 has 30 hours; the regular day 24.
    const irregular: TimeSystem = {
      id: 'irregular',
      name: 'Irregular',
      isBuiltIn: false,
      unitLabels: ['Year', 'Month', 'Day', 'Hour'],
      subdivisions: [3, 6, 4],
      format: '{u0}/{u1}/{u2} {u3}',
      parseSeparator: '/',
      unitAllowZero: [true, false, true, false],
      unitSubdivisionOverrides: [{ '3': 4, '-2': 1 }, { '2': 8, '4': 2 }, { '5': 7, '0': 1 }, undefined],
    };

    /** Every valid point of `system` from `fromYear` to `toYear`, in date order. */
    function enumerate(system: TimeSystem, fromYear: number, toYear: number): string[][] {
      const out: string[][] = [];
      const walk = (prefix: string[]) => {
        const i = prefix.length;
        if (i === system.unitLabels.length) {
          out.push(prefix);
          return;
        }
        const min = unitMinValue(system, i);
        const max = i === 0 ? toYear : unitMaxValueFor(system, i, prefix[i - 1])!;
        for (let v = i === 0 ? fromYear : min; v <= max; v++) walk([...prefix, String(v)]);
      };
      walk([]);
      return out;
    }

    it('accepts days up to a longer override and rejects days past a shorter one', () => {
      expect(isValidTimePointFor(at(['1', '10', '40']), longMonth)).toBe(true);
      expect(isValidTimePointFor(at(['1', '10', '41']), longMonth)).toBe(false);
      expect(isValidTimePointFor(at(['1', '2', '30']), longMonth)).toBe(true);
      expect(isValidTimePointFor(at(['1', '2', '31']), longMonth)).toBe(false);
      expect(isValidTimePointFor(at(['1', '3', '37']), longMonth)).toBe(false);
    });

    it('matches override keys by number', () => {
      expect(isValidTimePointFor(at(['1', '02', '31']), longMonth)).toBe(false);
      expect(effectiveSubdivision(longMonth, 2, '010')).toBe(40);
      const padded: TimeSystem = { ...longMonth, unitSubdivisionOverrides: [undefined, { '010': 40 }, undefined] };
      expect(unitMaxValueFor(padded, 2, '10')).toBe(40);
      expect(checkTimeSystem(padded)).toEqual([]);
    });

    it('ignores override counts that are not positive integers in an unchecked system', () => {
      const unchecked: TimeSystem = {
        ...longMonth,
        unitSubdivisionOverrides: [undefined, { '10': 0, '3': 2.5 }, undefined],
      };
      expect(effectiveSubdivision(unchecked, 2, '10')).toBe(36);
      expect(unitMaxValue(unchecked, 2)).toBe(36);
      expect(unitLengthInTicks(unchecked, 0)).toBe(12n * 36n);
      expect(effectiveSubdivision(longMonth, 2, 'ten')).toBe(36);
      expect(unitMaxValue(longMonth, 5)).toBeNull();
      expect(unitMaxValueFor({ ...longMonth, subdivisions: [12, 0] }, 2, '1')).toBeNull();
    });

    it('lays out overrides in value order whatever order the keys are in', () => {
      const system: TimeSystem = {
        ...longMonth,
        unitSubdivisionOverrides: [undefined, { '7': 30, '3': 40, '11': 20, '5': 36 }, undefined],
      };
      const points = enumerate(system, 1, 2);
      const ticks = points.map(units => timePointToAbsolute({ systemId: system.id, units }, system));
      for (let k = 1; k < ticks.length; k++) expect(ticks[k] - ticks[k - 1]).toBe(1n);
      expect(unitLengthInTicks(system, 0)).toBe(12n * 36n + 4n - 6n - 16n);
    });

    it('reports the largest value under any parent as unitMaxValue', () => {
      expect(unitMaxValue(longMonth, 2)).toBe(40);
      expect(unitMaxValue({ ...longMonth, unitSubdivisionOverrides: [undefined, { '2': 28 }, undefined] }, 2)).toBe(36);
      // Every season is overridden, so the regular 90 never occurs.
      const seasons: TimeSystem = {
        ...longMonth,
        subdivisions: [4, 90],
        unitSubdivisionOverrides: [undefined, { '1': 80, '2': 85, '3': 85, '4': 80 }, undefined],
      };
      expect(unitMaxValue(seasons, 2)).toBe(85);
      expect(unitMaxValue(irregular, 1)).toBe(4);
      expect(unitMaxValue(irregular, 2)).toBe(7);
      expect(unitMaxValue(irregular, 3)).toBe(7);
    });

    it('lists dropdown options for the parent value when it is given', () => {
      expect(unitDropdownOptions(longMonth, 2, '10')).toHaveLength(40);
      expect(unitDropdownOptions(longMonth, 2, '2')).toHaveLength(30);
      expect(unitDropdownOptions(longMonth, 2, '1')).toHaveLength(36);
      expect(unitDropdownOptions(longMonth, 2)).toHaveLength(40);
      expect(unitDropdownOptions(longMonth, 0, '1')).toEqual([]);
    });

    it('formats and parses dates in a longer month', () => {
      expect(formatTimePoint(at(['5', '10', '40']), longMonth)).toBe('5-10-40');
      const parsed = parseTimePoint('5-10-40', longMonth);
      expect(parsed && isValidTimePointFor(parsed, longMonth)).toBe(true);
      expect(() => formatTimePoint(at(['5', '2', '31']), longMonth)).toThrow(/does not match/);
    });

    it('orders dates by the real month lengths', () => {
      expect(tick(['1', '10', '40']) - tick(['1', '10', '36'])).toBe(4n);
      expect(tick(['1', '11', '1']) - tick(['1', '10', '40'])).toBe(1n);
      expect(tick(['1', '3', '1']) - tick(['1', '2', '30'])).toBe(1n);
      // 12 × 36, less 6 days in month 2, plus 4 in month 10.
      expect(tick(['2', '1', '1']) - tick(['1', '1', '1'])).toBe(430n);
      expect(compareTimePoints(at(['1', '10', '40']), at(['1', '11', '1']), longMonth)).toBe(-1);
    });

    it('gives consecutive ticks to consecutive dates, at every level', () => {
      for (const system of [longMonth, irregular]) {
        const points = enumerate(system, unitMinValue(system, 0), unitMinValue(system, 0) + 4);
        const ticks = points.map(units => timePointToAbsolute({ systemId: system.id, units }, system));
        for (let k = 1; k < ticks.length; k++) expect(ticks[k] - ticks[k - 1]).toBe(1n);
        for (const [k, units] of points.entries()) {
          expect(absoluteToTimePoint(ticks[k], system).units).toEqual(units);
        }
      }
    });

    it('converts ticks back to valid dates', () => {
      expect(absoluteToTimePoint(tick(['1', '10', '40']) + 1n, longMonth).units).toEqual(['1', '11', '1']);
      expect(absoluteToTimePoint(tick(['1', '2', '30']) + 1n, longMonth).units).toEqual(['1', '3', '1']);
      expect(absoluteToTimePoint(tick(['1', '1', '1']) - 1n, longMonth).units).toEqual(['0', '12', '36']);
    });

    it('rolls overflowed dates over by the real lengths', () => {
      expect(normalizeTimePoint(at(['1', '10', '41']), longMonth)?.units).toEqual(['1', '11', '1']);
      expect(normalizeTimePoint(at(['1', '2', '31']), longMonth)?.units).toEqual(['1', '3', '1']);
      expect(normalizeTimePoint(at(['1', '13', '1']), longMonth)?.units).toEqual(['2', '1', '1']);
      expect(normalizeTimePoint(at(['1', '10', '40']), longMonth)?.units).toEqual(['1', '10', '40']);
    });

    it('counts top-level overrides at any magnitude', () => {
      const bigYear = '1000000000000000000';
      const system: TimeSystem = {
        ...longMonth,
        unitSubdivisionOverrides: [{ [bigYear]: 13 }, undefined, undefined],
      };
      const start = (y: string) => timePointToAbsolute({ systemId: system.id, units: [y, '1', '1'] }, system);
      const next = (BigInt(bigYear) + 1n).toString();
      expect(start(next) - start(bigYear)).toBe(13n * 36n);
      expect(isValidTimePointFor({ systemId: system.id, units: [bigYear, '13', '36'] }, system)).toBe(true);
      expect(isValidTimePointFor({ systemId: system.id, units: [next, '13', '1'] }, system)).toBe(false);
    });

    it('reports unit lengths and start ticks', () => {
      expect(unitLengthInTicks(longMonth, 0)).toBe(430n);
      expect(unitLengthInTicks(longMonth, 1)).toBe(36n);
      expect(unitLengthInTicks(longMonth, 1, '10')).toBe(40n);
      expect(unitLengthInTicks(longMonth, 2)).toBe(1n);
      // Month 2 holds days 0 to 7: day 0 has 1 hour, day 5 has 7, the other six 4.
      expect(unitLengthInTicks(irregular, 1, '2')).toBe(1n + 7n + 6n * 4n);
      expect(unitStartTick(longMonth, ['1', '11'])).toBe(tick(['1', '11', '1']));
      expect(unitStartTick(longMonth, ['2'])).toBe(tick(['2', '1', '1']));
      expect(unitStartTick(longMonth, ['1', '13'])).toBe(tick(['2', '1', '1']));
      expect(() => unitStartTick(longMonth, ['x'])).toThrow(/integers/);
      expect(() => unitStartTick(longMonth, ['1', '1', '1', '1'])).toThrow(/longer/);
      expect(() => unitLengthInTicks(longMonth, 3)).toThrow(/no unit 3/);
    });

    it('converts every template exactly as Σ units × uniform weights', () => {
      for (const system of TIME_SYSTEM_TEMPLATES) {
        const weights = system.unitLabels.map((_, i) =>
          system.subdivisions.slice(i).reduce((w, s) => w * BigInt(s), 1n)
        );
        for (let t = -500n; t < 20000n; t += 13n) {
          const point = absoluteToTimePoint(t, system);
          const plain = point.units.reduce((sum, u, i) => sum + BigInt(u) * weights[i], 0n);
          expect(plain).toBe(t);
          if (isValidTimePointFor(point, system)) {
            expect(timePointToAbsolute(point, system)).toBe(t);
          }
        }
        for (let i = 0; i < system.unitLabels.length; i++) {
          expect(unitLengthInTicks(system, i)).toBe(weights[i]);
        }
      }
    });
  });
});

describe('checkTimeSystem', () => {
  const months: TimeSystem = {
    id: 'months',
    name: 'Months',
    isBuiltIn: false,
    unitLabels: ['Year', 'Month', 'Day'],
    subdivisions: [12, 30],
    format: '{u0}-{a1}-{u2}',
    parseSeparator: '-',
  };
  const codes = (system: TimeSystem) => checkTimeSystem(system).map(w => w.code);

  it('has nothing to say about the templates', () => {
    for (const template of TIME_SYSTEM_TEMPLATES) {
      expect(checkTimeSystem(template)).toEqual([]);
    }
  });

  it('warns about format units past the last one, once each', () => {
    const warnings = checkTimeSystem({
      ...months,
      format: '{u0}-{u1}-{u2} {u7} {a5} {u7}',
    });
    expect(warnings).toEqual([
      expect.objectContaining({ code: 'format-unknown-unit', unit: 7 }),
      expect.objectContaining({ code: 'format-unknown-unit', unit: 5 }),
    ]);
    expect(warnings[0].message).toContain('{u7}');
    expect(warnings[0].message).toContain('numbered 0 to 2');
  });

  it('warns about a format that shows no unit', () => {
    const [warning] = checkTimeSystem({ ...months, format: 'Someday' });
    expect(warning.code).toBe('format-no-units');
    expect(warning.message).toContain('{u0} to {u2}');
    expect(
      checkTimeSystem({
        ...months,
        unitLabels: ['Turn'],
        subdivisions: [],
        format: 'Now',
      })[0].message
    ).toContain('Use {u0}.');
  });

  it('warns about overrides for values a unit never takes', () => {
    const warnings = checkTimeSystem({
      ...months,
      unitSubdivisionOverrides: [{ '0': 6, '-3': 4 }, { '13': 20, '2': 28 }, undefined],
    });
    expect(warnings.map(w => [w.code, w.unit])).toEqual([
      ['override-value-out-of-range', 0],
      ['override-value-out-of-range', 0],
      ['override-value-out-of-range', 1],
    ]);
    expect(warnings[0].message).toContain('Year values start at 1');
    expect(warnings[2].message).toContain('Month values run from 1 to 12');
  });

  it('takes allowZero into account for override values', () => {
    expect(
      codes({
        ...months,
        unitAllowZero: [false, true, false],
        unitSubdivisionOverrides: [undefined, { '0': 20, '11': 20 }, undefined],
      })
    ).toEqual([]);
    expect(
      codes({
        ...months,
        unitAllowZero: [false, true, false],
        unitSubdivisionOverrides: [undefined, { '12': 20 }, undefined],
      })
    ).toEqual(['override-value-out-of-range']);
  });

  it('has nothing to say about overrides longer or shorter than the regular length', () => {
    const system: TimeSystem = {
      ...months,
      unitSubdivisionOverrides: [undefined, { '10': 40, '2': 28 }, undefined],
    };
    expect(checkTimeSystem(system)).toEqual([]);
    expect(isValidTimePointFor({ systemId: 'months', units: ['1', '10', '40'] }, system)).toBe(
      true
    );
  });

  it('counts the values a longer parent override makes possible', () => {
    // Year 5 has a 13th month, so a length for month 13 applies.
    expect(
      codes({
        ...months,
        unitSubdivisionOverrides: [{ '5': 13 }, { '13': 20 }, undefined],
      })
    ).toEqual([]);
    // Day 31 only exists because month 1 has 31 days.
    const hours: TimeSystem = {
      ...months,
      unitLabels: ['Year', 'Month', 'Day', 'Hour'],
      subdivisions: [12, 30, 24],
      format: '{u0}-{u1}-{u2} {u3}h',
    };
    expect(
      codes({ ...hours, unitSubdivisionOverrides: [undefined, { '1': 31 }, { '31': 20 }, undefined] })
    ).toEqual([]);
    const [warning] = checkTimeSystem({
      ...hours,
      unitSubdivisionOverrides: [undefined, undefined, { '31': 20 }, undefined],
    });
    expect(warning).toMatchObject({ code: 'override-value-out-of-range', unit: 2 });
    expect(warning.message).toContain('Day values run from 1 to 30');
  });

  it('warns that overrides on the smallest unit are ignored', () => {
    const [warning] = checkTimeSystem({
      ...months,
      unitSubdivisionOverrides: [undefined, undefined, { '1': 5 }],
    });
    expect(warning).toMatchObject({ code: 'override-on-smallest-unit', unit: 2 });
    expect(warning.message).toContain('Day is the smallest unit');
    expect(
      codes({ ...months, unitSubdivisionOverrides: [undefined, undefined, {}] })
    ).toEqual([]);
  });
});
