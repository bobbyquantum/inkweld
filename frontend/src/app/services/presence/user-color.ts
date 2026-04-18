/**
 * Generate a consistent color for a username.
 *
 * Used to give each collaborator a stable, identifiable color across all
 * presence surfaces (document cursors, tab presence indicators, avatars, etc.).
 *
 * Returns a hex color string with consistent saturation and lightness so all
 * generated colors look visually balanced together.
 */
export function generateUserColor(username: string): string {
  if (!username) {
    return '#9e9e9e';
  }

  // Simple deterministic hash from the username
  let hash = 0;
  for (const char of username) {
    hash = (char.codePointAt(0) ?? 0) + ((hash << 5) - hash);
  }

  const hue = Math.abs(hash % 360);
  const saturation = 70;
  const lightness = 60;

  return hslToHex(hue, saturation, lightness);
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const h = hue / 360;
  const s = saturation / 100;
  const l = lightness / 100;

  let r: number;
  let g: number;
  let b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hue2rgb(p: number, q: number, tInput: number): number {
  let t = tInput;
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function toHex(value: number): string {
  const hex = Math.round(value * 255).toString(16);
  return hex.length === 1 ? '0' + hex : hex;
}
