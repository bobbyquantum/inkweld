import {
  type TimePoint,
  type TimeSystem,
  timePointToAbsolute,
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
export { timePointToAbsolute as timePointToAbsoluteValue };

export { INT_RE };
