import {
  isValidTimePointFor,
  type TimePoint,
  type TimeSystem,
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
 * Convert a {@link TimePoint} to an absolute integer tick (smallest-unit
 * count) for comparison. Throws if the point does not belong to the given
 * system.
 */
export function timePointToAbsoluteValue(
  point: TimePoint,
  system: TimeSystem
): bigint {
  if (!isValidTimePointFor(point, system)) {
    throw new Error('TimePoint does not match TimeSystem');
  }
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

export { INT_RE };
