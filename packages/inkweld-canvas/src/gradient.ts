/**
 * Gradient fills and SVG escaping, shared by the app's renderer and the SVG
 * builder. Pure.
 */

// ─── Gradient fills ─────────────────────────────────────────────────────────
//
// Shape fills may hold a CSS gradient string (produced by the gradient
// designer). Konva and SVG export can't consume the CSS syntax directly, so
// it is parsed once here and mapped to each target.

/** One parsed gradient color stop. */
export interface GradientStop {
  /** 0–1 position along the gradient */
  offset: number;
  /** CSS color */
  color: string;
}

/** A parsed CSS gradient. */
export interface ParsedGradient {
  type: 'linear' | 'radial';
  /** CSS angle in degrees (0 = to top, 90 = to right). Linear only. */
  angle: number;
  stops: GradientStop[];
}

/** True when a fill value is a CSS gradient string. */
export function isGradientFill(fill: string | undefined): fill is string {
  return !!fill && /^(linear|radial)-gradient\(/.test(fill.trim());
}

/** Split a gradient body on top-level commas (rgba(...) commas don't count). */
function splitStops(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of body) {
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** A gradient stop whose position may still need to be inferred. */
interface PendingStop {
  color: string;
  offset: number | null;
}

/** CSS angle from the first gradient argument, or null when it's a stop. */
function parseGradientAngle(first: string | undefined): number | null {
  if (!first) return null;
  const angleMatch = /^(-?\d+(?:\.\d+)?)deg$/.exec(first);
  if (angleMatch) return Number.parseFloat(angleMatch[1]);
  // Direction/shape prefixes we don't model; skip the argument.
  if (/^(to |circle|ellipse|closest|farthest|at )/.test(first)) return 180;
  return null;
}

/** Parse `color [position%]` stop arguments. */
function parseGradientStops(parts: string[]): PendingStop[] {
  const stops: PendingStop[] = [];
  for (const part of parts) {
    if (!part) continue;
    // Anchored suffix match keeps this linear (no backtracking through the
    // color, which may itself contain digits and spaces).
    const positionMatch = /\s(-?\d+(?:\.\d+)?)%$/.exec(part);
    if (positionMatch) {
      stops.push({
        color: part.slice(0, positionMatch.index).trim(),
        offset:
          Math.min(Math.max(Number.parseFloat(positionMatch[1]), 0), 100) / 100,
      });
    } else {
      stops.push({ color: part, offset: null });
    }
  }
  return stops;
}

/** Distribute stops without explicit positions evenly between neighbours. */
function normalizeStopOffsets(stops: PendingStop[]): GradientStop[] {
  stops[0].offset ??= 0;
  const last = stops.at(-1)!;
  last.offset ??= 1;
  for (let i = 0; i < stops.length; i++) {
    if (stops[i].offset !== null) continue;
    let next = i;
    while (stops[next].offset === null) next++;
    const previous = stops[i - 1].offset as number;
    const step = ((stops[next].offset as number) - previous) / (next - i + 1);
    for (let j = i; j < next; j++) {
      stops[j].offset = previous + step * (j - i + 1);
    }
  }
  return stops as GradientStop[];
}

/**
 * Parse a CSS `linear-gradient(...)` / `radial-gradient(...)` string.
 * Tolerant: unknown prefixes (`to right`, `circle at center`) are skipped,
 * stops without explicit positions are distributed evenly. Returns null for
 * anything that doesn't yield at least two stops.
 */
export function parseCssGradient(fill: string): ParsedGradient | null {
  const match = /^(linear|radial)-gradient\((.*)\)$/s.exec(fill.trim());
  if (!match) return null;

  const type = match[1] as 'linear' | 'radial';
  const parts = splitStops(match[2]);

  const firstArgAngle = parseGradientAngle(parts[0]);
  const angle = firstArgAngle ?? 180; // CSS default: "to bottom"
  const stopParts = firstArgAngle === null ? parts : parts.slice(1);

  const stops = parseGradientStops(stopParts);
  if (stops.length < 2) return null;

  return { type, angle, stops: normalizeStopOffsets(stops) };
}

/**
 * The start/end points of a linear gradient across a `width`×`height` box
 * centred at `center`, for a CSS angle (0deg = to top, clockwise).
 */
export function linearGradientLine(
  angle: number,
  width: number,
  height: number,
  center: { x: number; y: number },
): { start: { x: number; y: number }; end: { x: number; y: number } } {
  const radians = (angle * Math.PI) / 180;
  const dx = Math.sin(radians);
  const dy = -Math.cos(radians);
  // CSS gradient-line length for a box (per spec).
  const length =
    (Math.abs(width * dx) + Math.abs(height * dy)) / 2 || Math.max(width, 1);
  return {
    start: { x: center.x - dx * length, y: center.y - dy * length },
    end: { x: center.x + dx * length, y: center.y + dy * length },
  };
}

/** Escape special XML/HTML characters for SVG output */
export function svgEsc(s: string): string {
  return s.replaceAll(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c] ?? c,
  );
}
