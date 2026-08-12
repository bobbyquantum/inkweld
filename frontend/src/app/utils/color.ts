/**
 * Color helpers for the worldbuilding appearance pickers.
 */

/** Normalise a hex color (with or without leading #) to `#rrggbb`. */
export function normalizeHex(input: string): string | null {
  let hex = input.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    hex = hex
      .split('')
      .map(c => c + c)
      .join('');
  }
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  return `#${hex.toLowerCase()}`;
}
