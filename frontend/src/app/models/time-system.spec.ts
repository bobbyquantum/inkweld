import {
  assertValidTimeSystem,
  compareTimePoints,
  findTemplateSystem,
  formatTimePoint,
  GREGORIAN_SYSTEM,
  isTemplateSystemId,
  isValidTimePointFor,
  parseTimePoint,
  RELATIVE_YEARS_SYSTEM,
  TIME_SYSTEM_TEMPLATES,
  type TimePoint,
  timePointToAbsolute,
  type TimeSystem,
  unitDropdownOptions,
  unitInputModeFor,
  unitMaxValue,
  unitMinValue,
} from './time-system';

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

    it('accepts negative years', () => {
      const tp: TimePoint = {
        systemId: 'gregorian',
        units: ['-44', '3', '15'],
      };
      expect(isValidTimePointFor(tp, GREGORIAN_SYSTEM)).toBe(true);
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

    it('preserves sign for negative values', () => {
      const tp: TimePoint = {
        systemId: 'gregorian',
        units: ['-1', '0', '0'],
      };
      expect(timePointToAbsolute(tp, GREGORIAN_SYSTEM)).toBe(-360n);
    });

    it('handles magnitudes larger than Number.MAX_SAFE_INTEGER', () => {
      const bigYear = '1000000000000000000'; // 1e18
      const tp: TimePoint = {
        systemId: 'gregorian',
        units: [bigYear, '0', '0'],
      };
      const abs = timePointToAbsolute(tp, GREGORIAN_SYSTEM);
      expect(abs).toBe(BigInt(bigYear) * 360n);
    });

    it('throws on invalid point', () => {
      const tp: TimePoint = { systemId: 'other', units: ['1', '2', '3'] };
      expect(() => timePointToAbsolute(tp, GREGORIAN_SYSTEM)).toThrow();
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
});
