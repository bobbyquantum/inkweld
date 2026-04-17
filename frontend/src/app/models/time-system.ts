/**
 * Time System & TimePoint Models
 *
 * Foundational types for the Timeline feature family (Timeline element type,
 * date fields on worldbuilding elements, auto-built timelines, eras).
 *
 * A {@link TimeSystem} describes a calendar: unit labels from most-significant
 * to least-significant (e.g. `["Year","Month","Day"]`) and the subdivisions
 * between each level (e.g. `[12, 30]`). This is intentionally simple so that
 * custom fictional calendars can be modelled without leap-year-style
 * irregularities; irregular calendars can be added later via an optional
 * per-unit table.
 *
 * A {@link TimePoint} is a value in a system, stored as an array of decimal
 * strings so arbitrarily large magnitudes (epochs of billions of years) can
 * be represented. All ordering/arithmetic is performed with {@link BigInt}.
 *
 * These types are pure data and safe to serialize through Yjs, JSON, and the
 * project-archive format.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Core types
// ─────────────────────────────────────────────────────────────────────────────

export interface TimeSystem {
  /** Stable ID (e.g. `gregorian`, or a nanoid for user-defined systems) */
  id: string;
  /** Human-readable name */
  name: string;
  /** True for seeded systems that cannot be deleted */
  isBuiltIn: boolean;
  /**
   * Unit labels, most-significant first.
   * Must contain at least one entry.
   * Example: `["Year","Month","Day"]`.
   */
  unitLabels: readonly string[];
  /**
   * Number of units of level `i+1` inside one unit of level `i`.
   * `length` must equal `unitLabels.length - 1`.
   * Values must be positive integers.
   * Example (Gregorian approx.): `[12, 30]`.
   */
  subdivisions: readonly number[];
  /**
   * Display template using `{u0}`, `{u1}`, ... tokens where `uN` is the
   * Nth unit (0 = most significant). The `{aN}` token renders the alias for
   * that unit's value (see {@link unitAliases}), falling back to the numeric
   * value when no alias exists. Example: `"{u0}-{a1}-{u2}"`.
   */
  format: string;
  /**
   * Separator used by {@link parseTimePoint} to split simple string input.
   * Example: `-`.
   */
  parseSeparator: string;
  /**
   * Optional per-unit aliases — for example month names or season names.
   * `unitAliases[i]` is a map from a unit's stringified numeric value to a
   * display alias. Lookup uses the raw value as it appears in
   * {@link TimePoint.units} (so a Gregorian month of `"3"` looks up
   * `unitAliases[1]["3"]`).
   *
   * Each entry is optional; a missing entry (or missing key) means "no alias
   * for this unit/value — render numerically".
   *
   * When present, `unitAliases.length` MUST equal `unitLabels.length`.
   */
  unitAliases?: readonly (Readonly<Record<string, string>> | undefined)[];
  /**
   * Optional per-unit "allow zero" flags. When `unitAllowZero[i]` is true,
   * the unit's minimum value is 0 (e.g. for 0-indexed days). When omitted or
   * false, the minimum is 1 (the conventional human calendar choice).
   *
   * This affects dropdown option generation and numeric-input bounds in
   * editors. It does NOT change ordering arithmetic in
   * {@link timePointToAbsolute}, which still treats values as raw integers.
   *
   * When present, `unitAllowZero.length` MUST equal `unitLabels.length`.
   */
  unitAllowZero?: readonly boolean[];
  /**
   * Optional per-unit input mode used by editors (timeline event/era
   * dialogs). `'numeric'` (default) renders a number input; `'dropdown'`
   * renders a select listing every valid value with its alias when known.
   *
   * For non-top-level units the dropdown lists
   * `[unitMin, unitMin + subdivisions[i-1] - 1]`. For the top-level unit a
   * dropdown is only meaningful when {@link unitAliases} defines explicit
   * keys (the unit is otherwise unbounded); editors fall back to numeric
   * input in that case.
   *
   * When present, `unitInputMode.length` MUST equal `unitLabels.length`.
   */
  unitInputMode?: readonly ('numeric' | 'dropdown')[];
  /**
   * Optional per-unit subdivision overrides. `unitSubdivisionOverrides[i]`
   * is a map from a unit's stringified numeric value to the number of
   * sub-units (i.e. units of level `i+1`) inside one occurrence of unit `i`
   * with that value. Use this to express irregular calendars such as
   * Gregorian months: `unitSubdivisionOverrides[1] = { '2': 28, '4': 30, ... }`
   * keyed by month value.
   *
   * A missing entry (or missing key) means "use the default
   * {@link subdivisions} value for this position". The leaf unit cannot
   * have a meaningful entry (no further sub-units), so
   * `unitSubdivisionOverrides[unitLabels.length - 1]` should be omitted.
   *
   * When present, `unitSubdivisionOverrides.length` MUST equal
   * `unitLabels.length` and every override value MUST be a positive integer.
   */
  unitSubdivisionOverrides?: readonly (
    | Readonly<Record<string, number>>
    | undefined
  )[];
}

export interface TimePoint {
  /** The {@link TimeSystem.id} this point belongs to. */
  systemId: string;
  /**
   * Unit values, most-significant first, as decimal strings so large
   * magnitudes survive JSON without loss. Length must match the system's
   * `unitLabels`. Example (3 Jan 1999): `["1999","1","3"]`.
   */
  units: readonly string[];
  /** Optional user label (e.g. "Founding Day"). */
  label?: string;
  /** If true, the value is approximate ("circa"). */
  circa?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

/** Runtime validation of a {@link TimeSystem}. Throws on invalid input. */
export function assertValidTimeSystem(system: TimeSystem): void {
  if (!system.id) throw new Error('TimeSystem.id is required');
  if (!system.name) throw new Error('TimeSystem.name is required');
  if (system.unitLabels.length === 0) {
    throw new Error('TimeSystem.unitLabels must have at least one entry');
  }
  if (system.subdivisions.length !== system.unitLabels.length - 1) {
    throw new Error(
      'TimeSystem.subdivisions length must equal unitLabels.length - 1'
    );
  }
  for (const s of system.subdivisions) {
    if (!Number.isInteger(s) || s <= 0) {
      throw new Error('TimeSystem.subdivisions must be positive integers');
    }
  }
  assertPerUnitArrayLength(system, 'unitAliases', system.unitAliases);
  assertPerUnitArrayLength(system, 'unitAllowZero', system.unitAllowZero);
  assertPerUnitArrayLength(system, 'unitInputMode', system.unitInputMode);
  assertPerUnitArrayLength(
    system,
    'unitSubdivisionOverrides',
    system.unitSubdivisionOverrides
  );
  assertSubdivisionOverrideValues(system.unitSubdivisionOverrides);
}

function assertSubdivisionOverrideValues(
  overrides:
    | readonly (Readonly<Record<string, number>> | undefined)[]
    | undefined
): void {
  if (!overrides) return;
  for (const entry of overrides) {
    if (!entry) continue;
    for (const v of Object.values(entry)) {
      if (!Number.isInteger(v) || v <= 0) {
        throw new Error(
          'TimeSystem.unitSubdivisionOverrides values must be positive integers'
        );
      }
    }
  }
}

/**
 * Helper: ensure a per-unit optional array, when present, has exactly one
 * entry per unit label. Centralises the "length must equal unitLabels.length"
 * check used by every per-unit field on {@link TimeSystem}.
 */
function assertPerUnitArrayLength(
  system: TimeSystem,
  fieldName:
    | 'unitAliases'
    | 'unitAllowZero'
    | 'unitInputMode'
    | 'unitSubdivisionOverrides',
  value: readonly unknown[] | undefined
): void {
  if (value === undefined) return;
  if (value.length !== system.unitLabels.length) {
    throw new Error(
      `TimeSystem.${fieldName} length must equal unitLabels.length`
    );
  }
}

/** Returns true if `units` is a valid value for `system`. */
export function isValidTimePointFor(
  point: TimePoint,
  system: TimeSystem
): boolean {
  if (point.systemId !== system.id) return false;
  if (point.units.length !== system.unitLabels.length) return false;
  for (const u of point.units) {
    if (!/^-?\d+$/.test(u)) return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversion / ordering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a {@link TimePoint} to a single orderable {@link BigInt} expressed
 * in the smallest unit of the system. Uniform subdivisions are assumed (no
 * irregular months/leap years in v1).
 *
 * @throws if `point` is not valid for `system`.
 */
export function timePointToAbsolute(
  point: TimePoint,
  system: TimeSystem
): bigint {
  if (!isValidTimePointFor(point, system)) {
    throw new Error('TimePoint does not match TimeSystem');
  }
  // Weight of unit i in smallest-unit counts.
  // Weight of the last unit is 1; each step up multiplies by the subdivision.
  const n = system.unitLabels.length;
  const weights: bigint[] = new Array<bigint>(n);
  weights[n - 1] = 1n;
  for (let i = n - 2; i >= 0; i--) {
    weights[i] = weights[i + 1] * BigInt(system.subdivisions[i]);
  }
  let total = 0n;
  for (let i = 0; i < n; i++) {
    total += BigInt(point.units[i]) * weights[i];
  }
  return total;
}

/** Strictly compare two time points in the same system. Returns -1, 0, or 1. */
export function compareTimePoints(
  a: TimePoint,
  b: TimePoint,
  system: TimeSystem
): -1 | 0 | 1 {
  if (a.systemId !== system.id || b.systemId !== system.id) {
    throw new Error('compareTimePoints: points must share the given system');
  }
  const av = timePointToAbsolute(a, system);
  const bv = timePointToAbsolute(b, system);
  if (av < bv) return -1;
  if (av > bv) return 1;
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Editor helpers (input-mode / value bounds)
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum allowed value for unit `i` (0 if `unitAllowZero[i]`, else 1). */
export function unitMinValue(system: TimeSystem, i: number): number {
  return system.unitAllowZero?.[i] ? 0 : 1;
}

/**
 * Maximum allowed value for unit `i`, or `null` for the top-level unit which
 * is unbounded. For non-top units, the maximum is
 * `unitMin + subdivisions[i-1] - 1`.
 *
 * TODO: add a parent-value-aware overload `unitMaxValueFor(system, i,
 * parentValue)` that uses {@link effectiveSubdivision} for callers that need
 * override-aware bounds (e.g. a Gregorian February editor).
 */
export function unitMaxValue(system: TimeSystem, i: number): number | null {
  if (i <= 0) return null;
  const sub = system.subdivisions[i - 1];
  if (!Number.isInteger(sub) || sub <= 0) return null;
  return unitMinValue(system, i) + sub - 1;
}

/**
 * Effective subdivision (count of sub-units) of unit `i` when the parent
 * unit (`i - 1`) has the given `parentValue`. Returns the entry from
 * {@link TimeSystem.unitSubdivisionOverrides}`[i - 1][parentValue]` when
 * present, otherwise falls back to the uniform {@link TimeSystem.subdivisions}
 * value.
 *
 * Returns `null` for the top unit (no parent → no subdivision context).
 */
export function effectiveSubdivision(
  system: TimeSystem,
  i: number,
  parentValue: string
): number | null {
  if (i <= 0) return null;
  const override = system.unitSubdivisionOverrides?.[i - 1]?.[parentValue];
  if (Number.isInteger(override) && (override as number) > 0) {
    return override as number;
  }
  return system.subdivisions[i - 1] ?? null;
}

/**
 * Resolved input mode for unit `i` in editors. Falls back to `'numeric'` when
 * the requested mode is `'dropdown'` but the unit is unbounded and has no
 * aliases (a dropdown would render an empty/useless list in that case).
 */
export function unitInputModeFor(
  system: TimeSystem,
  i: number
): 'numeric' | 'dropdown' {
  const requested = system.unitInputMode?.[i] ?? 'numeric';
  if (requested !== 'dropdown') return 'numeric';
  const max = unitMaxValue(system, i);
  if (max === null) {
    // Top-level: only meaningful with explicit aliases.
    const aliases = system.unitAliases?.[i];
    if (!aliases || Object.keys(aliases).length === 0) return 'numeric';
  }
  return 'dropdown';
}

/**
 * Build dropdown options for unit `i`. Each option's `value` is the string
 * that should be stored in {@link TimePoint.units}; `label` is the alias when
 * one exists, otherwise the numeric value.
 *
 * For bounded units this enumerates `[unitMin, unitMax]`. For unbounded
 * (top-level) units, only the keys defined in {@link TimeSystem.unitAliases}
 * are returned (sorted numerically when possible).
 */
export function unitDropdownOptions(
  system: TimeSystem,
  i: number
): readonly { readonly value: string; readonly label: string }[] {
  const aliases = system.unitAliases?.[i];
  const max = unitMaxValue(system, i);
  if (max === null) {
    if (!aliases) return [];
    return Object.keys(aliases)
      .sort((a, b) => {
        const na = Number(a);
        const nb = Number(b);
        if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
        return a.localeCompare(b);
      })
      .map(value => ({ value, label: aliases[value] ?? value }));
  }
  const min = unitMinValue(system, i);
  const out: { value: string; label: string }[] = [];
  for (let v = min; v <= max; v++) {
    const key = String(v);
    out.push({ value: key, label: aliases?.[key] ?? key });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Format / parse
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN_RE = /\{([ua])(\d+)\}/g;

/** Render a {@link TimePoint} using its system's format template. */
export function formatTimePoint(point: TimePoint, system: TimeSystem): string {
  if (!isValidTimePointFor(point, system)) {
    throw new Error('TimePoint does not match TimeSystem');
  }
  const body = system.format.replaceAll(
    TOKEN_RE,
    (_m, kind: string, idx: string) => {
      const i = Number(idx);
      if (i < 0 || i >= point.units.length) return '';
      const value = point.units[i];
      if (kind === 'a') {
        const alias = system.unitAliases?.[i]?.[value];
        return alias ?? value;
      }
      return value;
    }
  );
  const label = point.label ? ` — ${point.label}` : '';
  const prefix = point.circa ? '~' : '';
  return prefix + body + label;
}

/**
 * Parse a plain "N{sep}N{sep}..." string into a {@link TimePoint}.
 *
 * A leading `~` marks the value as {@link TimePoint.circa}.
 *
 * Returns `null` if the input cannot be parsed. Callers decide whether to
 * surface an error; silent failure keeps this function usable for typing
 * feedback in form controls.
 */
export function parseTimePoint(
  input: string,
  system: TimeSystem
): TimePoint | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  let rest = trimmed;
  let circa = false;
  if (rest.startsWith('~')) {
    circa = true;
    rest = rest.slice(1).trim();
  }
  const rawParts = rest.split(system.parseSeparator).map(p => p.trim());
  // When the separator is '-' (or '+'), a leading negative/positive sign on
  // the first unit produces a spurious empty string at rawParts[0].
  // Merge it back: e.g. ['', '100', '5', '15'] → ['-100', '5', '15'].
  const parts =
    rawParts[0] === '' && rawParts.length > 1
      ? [system.parseSeparator + rawParts[1], ...rawParts.slice(2)]
      : rawParts;
  if (parts.length !== system.unitLabels.length) return null;
  for (const p of parts) {
    if (!/^[+-]?\d+$/.test(p)) return null;
  }
  return {
    systemId: system.id,
    units: parts,
    ...(circa ? { circa: true } : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Built-in systems
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// System templates
//
// These are *templates* users can install into a project — they are NOT
// automatically available. A project starts with zero time systems; the user
// must either clone a template or design a custom system via the Time System
// Designer.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gregorian-like calendar with uniform 30-day months. Adequate for timeline
 * ordering; irregular month lengths & leap years are deferred.
 *
 * Ships with month-name aliases for unit 1 and a format template that uses
 * `{a1}` to render months by name (e.g. `"1999-Mar-3"`).
 */
export const GREGORIAN_SYSTEM: TimeSystem = Object.freeze({
  id: 'gregorian',
  name: 'Gregorian (simplified)',
  isBuiltIn: true,
  unitLabels: Object.freeze(['Year', 'Month', 'Day']),
  subdivisions: Object.freeze([12, 30]),
  format: '{u0}-{a1}-{u2}',
  parseSeparator: '-',
  unitAliases: Object.freeze([
    undefined,
    Object.freeze({
      '1': 'Jan',
      '2': 'Feb',
      '3': 'Mar',
      '4': 'Apr',
      '5': 'May',
      '6': 'Jun',
      '7': 'Jul',
      '8': 'Aug',
      '9': 'Sep',
      '10': 'Oct',
      '11': 'Nov',
      '12': 'Dec',
    }),
    undefined,
  ]),
});

/** A single-unit system: integer years only. Useful for rough chronicles. */
export const RELATIVE_YEARS_SYSTEM: TimeSystem = Object.freeze({
  id: 'relative-years',
  name: 'Relative Years',
  isBuiltIn: true,
  unitLabels: Object.freeze(['Year']),
  subdivisions: Object.freeze([]) as readonly number[],
  format: '{u0}',
  parseSeparator: '-',
});

/** ISO-year single-unit system alias. */
export const ISO_YEAR_SYSTEM: TimeSystem = Object.freeze({
  id: 'iso-year',
  name: 'ISO Year',
  isBuiltIn: true,
  unitLabels: Object.freeze(['Year']),
  subdivisions: Object.freeze([]) as readonly number[],
  format: '{u0}',
  parseSeparator: '-',
});

/** Example fantasy calendar: 4 seasons × 90 days. */
export const FANTASY_SEASONS_SYSTEM: TimeSystem = Object.freeze({
  id: 'fantasy-seasons',
  name: 'Fantasy: Seasons (4 × 90)',
  isBuiltIn: true,
  unitLabels: Object.freeze(['Year', 'Season', 'Day']),
  subdivisions: Object.freeze([4, 90]),
  format: 'Y{u0} {a1}/{u2}',
  parseSeparator: '-',
  unitAliases: Object.freeze([
    undefined,
    Object.freeze({
      '1': 'Spring',
      '2': 'Summer',
      '3': 'Autumn',
      '4': 'Winter',
    }),
    undefined,
  ]),
});

/** Example fantasy calendar: 13 moons × 28 days. */
export const FANTASY_LUNAR_SYSTEM: TimeSystem = Object.freeze({
  id: 'fantasy-lunar',
  name: 'Fantasy: 13 Moons × 28 Days',
  isBuiltIn: true,
  unitLabels: Object.freeze(['Year', 'Moon', 'Day']),
  subdivisions: Object.freeze([13, 28]),
  format: '{u0}.{u1}.{u2}',
  parseSeparator: '.',
});

/** Sci-fi: "stardate"-style flat counter with decimals approximated as two units. */
export const STARDATE_SYSTEM: TimeSystem = Object.freeze({
  id: 'stardate',
  name: 'Sci-Fi: Stardate',
  isBuiltIn: true,
  unitLabels: Object.freeze(['Stardate', 'Fraction']),
  subdivisions: Object.freeze([1000]),
  format: '{u0}.{u1}',
  parseSeparator: '.',
});

/** Sci-fi: mission-relative days since epoch. */
export const MISSION_DAY_SYSTEM: TimeSystem = Object.freeze({
  id: 'mission-day',
  name: 'Sci-Fi: Mission Day',
  isBuiltIn: true,
  unitLabels: Object.freeze(['Day']),
  subdivisions: Object.freeze([]) as readonly number[],
  format: 'T+{u0}',
  parseSeparator: '-',
});

/**
 * All seed templates shipped with the app. A user opens the Time Systems
 * settings section to install one of these (or design a custom system).
 */
export const TIME_SYSTEM_TEMPLATES: readonly TimeSystem[] = Object.freeze([
  GREGORIAN_SYSTEM,
  ISO_YEAR_SYSTEM,
  RELATIVE_YEARS_SYSTEM,
  FANTASY_SEASONS_SYSTEM,
  FANTASY_LUNAR_SYSTEM,
  STARDATE_SYSTEM,
  MISSION_DAY_SYSTEM,
]);

export function isTemplateSystemId(id: string): boolean {
  return TIME_SYSTEM_TEMPLATES.some(s => s.id === id);
}

export function findTemplateSystem(id: string): TimeSystem | undefined {
  return TIME_SYSTEM_TEMPLATES.find(s => s.id === id);
}

/** Default minimum-value TimePoint for a system (respects unitAllowZero). */
export function zeroTimePoint(system: TimeSystem): TimePoint {
  return {
    systemId: system.id,
    units: system.unitLabels.map((_, i) => String(unitMinValue(system, i))),
  };
}
