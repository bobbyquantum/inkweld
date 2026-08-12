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

/**
 * Lighten or darken a hex colour by a fixed amount.
 *
 * `amount` is a signed fraction of the way toward white (positive) or black
 * (negative). Used by auto-mode backgrounds so a single chosen colour stays
 * legible in both themes: lightened in light mode, darkened in dark mode.
 * Returns `null` for invalid input.
 */
export function adjustHex(input: string, amount: number): string | null {
  const hex = normalizeHex(input);
  if (!hex) return null;
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const channel = (i: number) => Number.parseInt(hex.slice(i, i + 2), 16);
  const mix = (c: number) =>
    amount >= 0 ? clamp(c + (255 - c) * amount) : clamp(c + c * amount);
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(mix(channel(1)))}${toHex(mix(channel(3)))}${toHex(
    mix(channel(5))
  )}`;
}

/**
 * Adjust every hex colour stop in a CSS `linear-gradient(...)` string by the
 * given amount (see {@link adjustHex}). Non-hex colours (rgb/hsl/named) are
 * left untouched. Returns the original string when it is not a linear
 * gradient or contains no hex stops.
 */
export function adjustGradient(input: string, amount: number): string {
  const trimmed = input.trim();
  if (!/^linear-gradient\(/i.test(trimmed) || !trimmed.endsWith(')')) {
    return input;
  }
  return trimmed.replace(/#[0-9a-f]{3,8}\b/gi, match => {
    const adjusted = adjustHex(match, amount);
    return adjusted ?? match;
  });
}
