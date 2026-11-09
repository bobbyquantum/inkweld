import {
  type TimePoint,
  type TimeSystem,
  unitDropdownOptions,
  unitMaxValueFor,
  unitMinValue,
} from '@models/time-system';

const INT_RE = /^-?\d+$/;

/**
 * Build a {@link TimePoint} from an array of string unit values, validating
 * that each unit is an integer. Returns `null` if any unit fails the check.
 */
export function unitsToTimePoint(
  units: string[],
  system: TimeSystem
): TimePoint | null {
  if (units.some(u => !INT_RE.test(String(u).trim()))) return null;
  return {
    systemId: system.id,
    units: units.map(u => String(u).trim()),
  };
}

/**
 * Re-export of {@link timePointToAbsolute} from `@models/time-system` so the
 * timeline dialogs can import both helpers from a single module.
 */
export { timePointToAbsolute as timePointToAbsoluteValue } from '@models/time-system';

/**
 * A unit value outside what its parent holds, such as day 31 of a 30-day
 * month, for the hint under a date editor.
 */
export interface UnitRangeProblem {
  /** Index of the unit that is out of range (never the top unit). */
  readonly index: number;
  /** Label of that unit, e.g. `Day`. */
  readonly unit: string;
  /** Label of its parent, e.g. `Month`. */
  readonly parent: string;
  /** The parent unit's value, as entered. */
  readonly parentValue: string;
  readonly min: number;
  readonly max: number;
}

/**
 * The first unit below the top whose value is outside what its parent's own
 * length allows (overrides included), or null. A unit that is empty or not
 * an integer, or whose parent isn't, is left to the form's own validators.
 */
export function unitRangeProblem(
  units: readonly string[],
  system: TimeSystem
): UnitRangeProblem | null {
  for (let i = 1; i < system.unitLabels.length; i++) {
    const raw = String(units[i] ?? '').trim();
    const parentValue = String(units[i - 1] ?? '').trim();
    if (!INT_RE.test(raw) || !INT_RE.test(parentValue)) return null;
    const min = unitMinValue(system, i);
    const max = unitMaxValueFor(system, i, parentValue);
    const value = Number(raw);
    if (max !== null && (value < min || value > max)) {
      return {
        index: i,
        unit: system.unitLabels[i],
        parent: system.unitLabels[i - 1],
        parentValue,
        min,
        max,
      };
    }
  }
  return null;
}

/**
 * Dropdown options for unit `i` of the date being edited: a unit below the
 * top lists only the values its parent (`units[i - 1]`) holds, so a 28-day
 * month offers 28 days.
 */
export function unitOptionsFor(
  system: TimeSystem,
  i: number,
  units: readonly string[] | undefined
): readonly { readonly value: string; readonly label: string }[] {
  const parent = i > 0 ? String(units?.[i - 1] ?? '').trim() : '';
  return INT_RE.test(parent)
    ? unitDropdownOptions(system, i, parent)
    : unitDropdownOptions(system, i);
}

export { INT_RE };
