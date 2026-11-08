/**
 * Time System & TimePoint Models
 *
 * Foundational types for the Timeline feature family (Timeline element type,
 * date fields on worldbuilding elements, auto-built timelines, eras).
 *
 * A {@link TimeSystem} describes a calendar: unit labels from most-significant
 * to least-significant (e.g. `["Year","Month","Day"]`) and the subdivisions
 * between each level (e.g. `[12, 30]`).
 *
 * Irregular lengths: {@link TimeSystem.unitSubdivisionOverrides} gives one
 * value of a unit its own count of the next unit, shorter or longer than the
 * regular `subdivisions` count (month 2 with 28 days, or month 10 with 40 in a
 * calendar of 36-day months). An override belongs to the value, not to the
 * date: month 10 has 40 days in every year, and there is no rule keyed on
 * another unit (no leap years). Every function here follows the overrides:
 *
 * - a date is valid only up to its parent's own length
 *   ({@link unitMaxValueFor}); {@link unitMaxValue} is the largest value a
 *   unit takes under any parent;
 * - {@link timePointToAbsolute} counts the real lengths, so dates stay in
 *   order and the last day of month 10 is one tick before the first day of
 *   month 11.
 *
 * An override only counts for a value its unit can take: a length for
 * month 13 in a 12-month calendar does nothing (see {@link checkTimeSystem}).
 * A calendar with no overrides converts exactly as `Σ units[i] × weight[i]`
 * with uniform weights. Absolute ticks are for ordering and layout only and
 * are never stored, so changing a calendar's lengths moves nothing on disk.
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
   * keyed by month value. An override may be shorter or longer than the
   * regular count; keys are matched by numeric value (`'02'` is month 2).
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
    Readonly<Record<string, number>> | undefined
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
  const name = system.name?.trim();
  if (!name) throw new Error('TimeSystem.name is required');
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
    readonly (Readonly<Record<string, number>> | undefined)[] | undefined
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

const INTEGER_RE = /^-?\d+$/;

/**
 * Returns true if `units` is a valid value for `system`: every unit is at
 * least its minimum, and every unit below the top fits in its parent's own
 * length (overrides included, see {@link unitMaxValueFor}).
 */
export function isValidTimePointFor(
  point: TimePoint,
  system: TimeSystem
): boolean {
  if (point.systemId !== system.id) return false;
  if (point.units.length !== system.unitLabels.length) return false;
  for (let i = 0; i < point.units.length; i++) {
    const u = point.units[i];
    if (!INTEGER_RE.test(u)) return false;
    const numValue = Number(u);
    if (!Number.isFinite(numValue)) return false;
    const min = unitMinValue(system, i);
    const max = unitMaxValueFor(system, i, point.units[i - 1] ?? '');
    if (numValue < min) return false;
    if (max !== null && numValue > max) return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Unit lengths
//
// The absolute layout. Unit `i` with value `v` starts `offsetOf(level i, v)`
// ticks into its parent, where
//
//   offsetOf(level, v) = v × regular + Σ (length(k) − regular)
//                        over the values k < v that have an override,
//
// so consecutive values sit back to back: `offsetOf(v + 1) − offsetOf(v)` is
// the length of `v`. A point's tick is the sum of its units' offsets. With no
// overrides `regular` is the uniform weight and the sum is the plain
// `Σ units[i] × weight[i]`, the same numbers as before overrides counted.
// ─────────────────────────────────────────────────────────────────────────────

/** A value of a unit with its own length, in smallest-unit ticks. */
interface IrregularValue {
  readonly value: bigint;
  readonly length: bigint;
}

/** How long each value of one unit is, in smallest-unit ticks. */
interface LevelLayout {
  /** Length of a value with no override. */
  readonly regular: bigint;
  /** Values the unit can take that have an override, ascending. */
  readonly irregular: readonly IrregularValue[];
}

/** The unit value `raw` as a bigint, or null when it is not an integer. */
function parseUnitValue(raw: string): bigint | null {
  return INTEGER_RE.test(raw) ? BigInt(raw) : null;
}

/**
 * The sub-unit count that `overrides` gives `value`, matched by numeric
 * value. The first valid key wins when two keys name the same number.
 */
function overrideCount(
  overrides: Readonly<Record<string, number>> | undefined,
  value: bigint
): number | undefined {
  if (!overrides) return undefined;
  for (const [key, count] of Object.entries(overrides)) {
    if (!Number.isInteger(count) || count <= 0) continue;
    if (parseUnitValue(key) === value) return count;
  }
  return undefined;
}

/**
 * The overrides of unit `i` for values it can take (`min` to `max`, `max`
 * null for the unbounded top unit), keyed by numeric value.
 */
function reachableOverrides(
  system: TimeSystem,
  i: number,
  min: bigint,
  max: bigint | null
): Map<bigint, number> {
  const out = new Map<bigint, number>();
  const overrides = system.unitSubdivisionOverrides?.[i];
  if (!overrides || i >= system.unitLabels.length - 1) return out;
  for (const [key, count] of Object.entries(overrides)) {
    if (!Number.isInteger(count) || count <= 0) continue;
    const value = parseUnitValue(key);
    if (value === null || value < min || (max !== null && value > max)) {
      continue;
    }
    if (!out.has(value)) out.set(value, count);
  }
  return out;
}

/** What one unit can hold: its value range and the overrides that apply. */
interface UnitShape {
  readonly min: bigint;
  /** Largest value under any parent; null for the top unit (unbounded). */
  readonly max: bigint | null;
  /** Sub-unit counts of the values that have an override. */
  readonly counts: ReadonlyMap<bigint, number>;
}

/** Each unit's value range, from the top down (a unit's range bounds its overrides). */
function unitShapes(system: TimeSystem): UnitShape[] {
  const shapes: UnitShape[] = [];
  let max: bigint | null = null;
  for (let i = 0; i < system.unitLabels.length; i++) {
    const min = BigInt(unitMinValue(system, i));
    const counts = reachableOverrides(system, i, min, max);
    shapes.push({ min, max, counts });
    const largest = largestCount(system.subdivisions[i], counts, min, max);
    max =
      largest === null ? null : BigInt(unitMinValue(system, i + 1) + largest - 1);
  }
  return shapes;
}

/**
 * The most sub-units any value of a unit holds: the largest override, or the
 * regular count when some value has none. Null when the regular count is not
 * a positive integer (an unchecked system; its children are then unbounded).
 */
function largestCount(
  regular: number | undefined,
  counts: ReadonlyMap<bigint, number>,
  min: bigint,
  max: bigint | null
): number | null {
  if (regular === undefined || !Number.isInteger(regular) || regular <= 0) {
    return null;
  }
  const everyValueOverridden =
    max !== null && BigInt(counts.size) >= max - min + 1n;
  let largest = everyValueOverridden ? 0 : regular;
  for (const count of counts.values()) largest = Math.max(largest, count);
  return largest;
}

/** The layout of every unit, smallest last. */
function calendarLayout(system: TimeSystem): LevelLayout[] {
  const shapes = unitShapes(system);
  const n = shapes.length;
  const layout = new Array<LevelLayout>(n);
  layout[n - 1] = { regular: 1n, irregular: [] };
  for (let i = n - 2; i >= 0; i--) {
    const child = layout[i + 1];
    const childMin = shapes[i + 1].min;
    // Ticks in `count` consecutive child values starting at the child's minimum.
    const span = (count: number) =>
      offsetOf(child, childMin + BigInt(count)) - offsetOf(child, childMin);
    const irregular = [...shapes[i].counts]
      .sort(([a], [b]) => compareBigInt(a, b))
      .map(([value, count]) => ({ value, length: span(count) }));
    layout[i] = { regular: span(system.subdivisions[i]), irregular };
  }
  return layout;
}

/** Ticks from the start of a parent to the start of `value` (see above). */
function offsetOf(level: LevelLayout, value: bigint): bigint {
  let offset = value * level.regular;
  for (const irregular of level.irregular) {
    if (irregular.value >= value) break;
    offset += irregular.length - level.regular;
  }
  return offset;
}

/** The value whose span holds offset `ticks`: the inverse of {@link offsetOf}. */
function valueAtOffset(level: LevelLayout, ticks: bigint): bigint {
  let shift = 0n;
  for (const { value, length } of level.irregular) {
    const start = value * level.regular + shift;
    if (ticks < start) break;
    if (ticks < start + length) return value;
    shift += length - level.regular;
  }
  return floorDiv(ticks - shift, level.regular);
}

/**
 * `out[i]` is the tick offset of the first value of every unit from `i`
 * down, i.e. how far the first smallest unit sits into a unit of level
 * `i - 1`. `out[n]` is 0.
 */
function minimumOffsets(system: TimeSystem, layout: readonly LevelLayout[]): bigint[] {
  const n = layout.length;
  const out = new Array<bigint>(n + 1).fill(0n);
  for (let i = n - 1; i >= 0; i--) {
    out[i] = out[i + 1] + offsetOf(layout[i], BigInt(unitMinValue(system, i)));
  }
  return out;
}

/** Sum of the offsets of `units`, which need not be in range. */
function ticksOf(layout: readonly LevelLayout[], units: readonly string[]): bigint {
  let total = 0n;
  for (let i = 0; i < units.length; i++) {
    total += offsetOf(layout[i], BigInt(units[i]));
  }
  return total;
}

function compareBigInt(a: bigint, b: bigint): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/**
 * Length of one unit `i` in smallest-unit ticks: of the given `value` (its
 * override, if it has one), or the regular length when `value` is omitted.
 * A month of 40 days in a calendar of 24-hour days is 960 ticks.
 */
export function unitLengthInTicks(
  system: TimeSystem,
  i: number,
  value?: string
): bigint {
  const level = calendarLayout(system)[i];
  if (!level) throw new Error(`TimeSystem has no unit ${i}`);
  const wanted = value === undefined ? null : parseUnitValue(value);
  return (
    level.irregular.find(irregular => irregular.value === wanted)?.length ??
    level.regular
  );
}

/**
 * Tick of the first smallest unit inside the unit that `prefix` names
 * (values of units `0` to `prefix.length - 1`, every lower unit at its
 * minimum): `['5', '10']` is the tick of day 1 of month 10 of year 5.
 * Values are not range-checked, so a ruler can step past the last valid
 * value; out-of-range values carry on the layout the way
 * {@link normalizeTimePoint} reads them.
 *
 * @throws if a value is not an integer string or `prefix` is longer than the
 * system's units.
 */
export function unitStartTick(
  system: TimeSystem,
  prefix: readonly string[]
): bigint {
  if (prefix.length > system.unitLabels.length) {
    throw new Error('unitStartTick: prefix is longer than the units');
  }
  if (!prefix.every(value => INTEGER_RE.test(value))) {
    throw new Error('unitStartTick: values must be integers');
  }
  const layout = calendarLayout(system);
  return ticksOf(layout, prefix) + minimumOffsets(system, layout)[prefix.length];
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversion / ordering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a {@link TimePoint} to a single orderable {@link BigInt} expressed
 * in the smallest unit of the system, counting each unit's real length (see
 * "Irregular lengths" in the module comment). Without overrides this is
 * `Σ units[i] × weight[i]`. The result orders points and lays out timelines;
 * nothing stores it.
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
  return ticksOf(calendarLayout(system), point.units);
}

/**
 * Convert an absolute smallest-unit tick back into the nearest canonical
 * {@link TimePoint} for the system.
 *
 * Unlike a simple division/modulo inverse, this respects per-unit minimums
 * (for example Month/Day values that start at 1), so adjacent ticks around
 * boundaries map to valid dates such as `2019-12-30` instead of invalid
 * values such as `2020-1-0`, and it follows overrides, so the tick after
 * day 40 of a 40-day month is day 1 of the next month.
 */
export function absoluteToTimePoint(
  tick: bigint,
  system: TimeSystem
): TimePoint {
  const layout = calendarLayout(system);
  const minimums = minimumOffsets(system, layout);
  const units: string[] = [];
  let remaining = tick;
  for (let i = 0; i < layout.length; i++) {
    const value = valueAtOffset(layout[i], remaining - minimums[i + 1]);
    units.push(value.toString());
    remaining -= offsetOf(layout[i], value);
  }
  return { systemId: system.id, units };
}

/**
 * Canonicalize a time point that may have overflowed bounded units (day 41
 * of a 40-day month becomes day 1 of the next month).
 * Returns `null` when the point does not belong to the system or cannot be
 * represented as a valid point after normalization.
 */
export function normalizeTimePoint(
  point: TimePoint,
  system: TimeSystem
): TimePoint | null {
  if (point.systemId !== system.id) return null;
  if (point.units.length !== system.unitLabels.length) return null;
  if (!point.units.every(unit => INTEGER_RE.test(unit))) return null;
  if (isValidTimePointFor(point, system)) return point;

  const tick = ticksOf(calendarLayout(system), point.units);
  const normalized = {
    ...point,
    units: absoluteToTimePoint(tick, system).units,
  } satisfies TimePoint;

  return isValidTimePointFor(normalized, system) ? normalized : null;
}

function floorDiv(value: bigint, divisor: bigint): bigint {
  let quotient = value / divisor;
  const remainder = value % divisor;
  if (remainder < 0n) quotient -= 1n;
  return quotient;
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
 * Largest value unit `i` takes under any parent, or `null` for the top-level
 * unit which is unbounded. Without overrides this is
 * `unitMin + subdivisions[i-1] - 1`; a longer override raises it (a 40-day
 * month in a calendar of 36-day months gives 40). Use {@link unitMaxValueFor}
 * when the parent's value is known.
 */
export function unitMaxValue(system: TimeSystem, i: number): number | null {
  if (i <= 0) return null;
  const max = unitShapes(system)[i]?.max ?? null;
  return max === null ? null : Number(max);
}

/**
 * Override-aware maximum for unit `i` when the parent unit's value is known.
 * Uses {@link effectiveSubdivision} so that, e.g., February in a Gregorian
 * calendar correctly reports 28 or 29 days rather than the generic 31.
 *
 * Falls back to the regular length when no override applies for
 * `parentValue`.
 */
export function unitMaxValueFor(
  system: TimeSystem,
  i: number,
  parentValue: string
): number | null {
  if (i <= 0) return null;
  const sub = effectiveSubdivision(system, i, parentValue);
  if (sub === null || !Number.isInteger(sub) || sub <= 0) return null;
  return unitMinValue(system, i) + sub - 1;
}

/**
 * Effective subdivision (count of sub-units) of unit `i` when the parent
 * unit (`i - 1`) has the given `parentValue`. Returns the override from
 * {@link TimeSystem.unitSubdivisionOverrides}`[i - 1]` for that value
 * (matched by number, so `'02'` finds the key `'2'`) when present, otherwise
 * falls back to the uniform {@link TimeSystem.subdivisions} value.
 *
 * Returns `null` for the top unit (no parent → no subdivision context).
 */
export function effectiveSubdivision(
  system: TimeSystem,
  i: number,
  parentValue: string
): number | null {
  if (i <= 0) return null;
  const parent = parseUnitValue(parentValue);
  const override =
    parent === null
      ? undefined
      : overrideCount(system.unitSubdivisionOverrides?.[i - 1], parent);
  return override ?? system.subdivisions[i - 1] ?? null;
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
 * For bounded units this enumerates `[unitMin, unitMax]`: up to
 * {@link unitMaxValueFor} when `parentValue` (the value of unit `i - 1`) is
 * given, so a 28-day month lists 28 days, otherwise up to
 * {@link unitMaxValue}. For unbounded (top-level) units, only the keys
 * defined in {@link TimeSystem.unitAliases} are returned (sorted numerically
 * when possible).
 */
export function unitDropdownOptions(
  system: TimeSystem,
  i: number,
  parentValue?: string
): readonly { readonly value: string; readonly label: string }[] {
  const aliases = system.unitAliases?.[i];
  const max =
    parentValue === undefined
      ? unitMaxValue(system, i)
      : unitMaxValueFor(system, i, parentValue);
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
  // Normalize leading '+' so points pass isValidTimePointFor (which uses /^-?\d+$/).
  const normalized = parts.map(p => (p.startsWith('+') ? p.slice(1) : p));
  return {
    systemId: system.id,
    units: normalized,
    ...(circa ? { circa: true } : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Warnings
// ─────────────────────────────────────────────────────────────────────────────

/** What a {@link TimeSystemWarning} is about. */
export type TimeSystemWarningCode =
  | 'format-no-units'
  | 'format-unknown-unit'
  | 'override-on-smallest-unit'
  | 'override-value-out-of-range';

/**
 * Something {@link assertValidTimeSystem} accepts but that is probably not
 * what the system's author meant: a format that shows nothing for a unit, or
 * a subdivision override that never applies.
 */
export interface TimeSystemWarning {
  code: TimeSystemWarningCode;
  /** Human-readable, in English. */
  message: string;
  /** Index of the unit the warning is about, where there is one. */
  unit?: number;
}

/**
 * Warnings for a time system that passes {@link assertValidTimeSystem}.
 * Every built-in template has none.
 */
export function checkTimeSystem(system: TimeSystem): TimeSystemWarning[] {
  return [...formatWarnings(system), ...overrideWarnings(system)];
}

/** Warnings about the display format: placeholders past the last unit, or none at all. */
function formatWarnings(system: TimeSystem): TimeSystemWarning[] {
  const last = system.unitLabels.length - 1;
  const tokens = [...system.format.matchAll(TOKEN_RE)];
  if (tokens.length === 0) {
    const units = last === 0 ? '{u0}' : `{u0} to {u${last}}`;
    return [
      {
        code: 'format-no-units',
        message: `The format "${system.format}" shows no unit values, so every date looks the same. Use ${units}.`,
      },
    ];
  }
  const seen = new Set<string>();
  const warnings: TimeSystemWarning[] = [];
  for (const [token, , index] of tokens) {
    const unit = Number(index);
    if (unit <= last || seen.has(token)) continue;
    seen.add(token);
    warnings.push({
      code: 'format-unknown-unit',
      unit,
      message: `The format uses ${token}, but the units are numbered 0 to ${last}, so it shows nothing.`,
    });
  }
  return warnings;
}

/** Warnings about `unitSubdivisionOverrides` that never apply. */
function overrideWarnings(system: TimeSystem): TimeSystemWarning[] {
  const last = system.unitLabels.length - 1;
  return (system.unitSubdivisionOverrides ?? []).flatMap((entry, unit) => {
    if (!entry || Object.keys(entry).length === 0) return [];
    if (unit >= last) {
      const label = system.unitLabels[unit];
      return [
        {
          code: 'override-on-smallest-unit' as const,
          unit,
          message: `${label} is the smallest unit, so the lengths in unitSubdivisionOverrides[${unit}] are ignored.`,
        },
      ];
    }
    const min = unitMinValue(system, unit);
    const max = unitMaxValue(system, unit);
    return Object.keys(entry).flatMap(key =>
      overrideKeyInRange(key, min, max)
        ? []
        : [overrideOutOfRange(system, unit, key, min, max)]
    );
  });
}

/** Whether `key` is a value the unit can take (`min` to `max`, `max` null for unbounded). */
function overrideKeyInRange(
  key: string,
  min: number,
  max: number | null
): boolean {
  const value = parseUnitValue(key);
  if (value === null || value < BigInt(min)) return false;
  return max === null || value <= BigInt(max);
}

/** The warning for an override of `unit` value `key`, a value the unit never takes. */
function overrideOutOfRange(
  system: TimeSystem,
  unit: number,
  key: string,
  min: number,
  max: number | null
): TimeSystemWarning {
  const label = system.unitLabels[unit];
  const range = max === null ? `start at ${min}` : `run from ${min} to ${max}`;
  return {
    code: 'override-value-out-of-range',
    unit,
    message: `unitSubdivisionOverrides[${unit}] sets a length for ${label} ${key}, but ${label} values ${range}, so it never applies.`,
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
  subdivisions: Object.freeze([]),
  format: '{u0}',
  parseSeparator: '-',
});

/** ISO-year single-unit system alias. */
export const ISO_YEAR_SYSTEM: TimeSystem = Object.freeze({
  id: 'iso-year',
  name: 'ISO Year',
  isBuiltIn: true,
  unitLabels: Object.freeze(['Year']),
  subdivisions: Object.freeze([]),
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
  subdivisions: Object.freeze([]),
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
