import { type CanvasObject, isBackgroundImage } from '@models/canvas.model';

/** Get Material icon name for a canvas object type */
export function getObjectIcon(obj: CanvasObject): string {
  switch (obj.type) {
    case 'image':
      return isBackgroundImage(obj) ? 'wallpaper' : 'image';
    case 'text':
      return 'title';
    case 'path':
      return 'draw';
    case 'shape':
      return 'crop_square';
    case 'pin':
      return 'place';
    default:
      return 'category';
  }
}

/** Get a display label for an unnamed canvas object */
export function getObjectLabel(obj: CanvasObject): string {
  switch (obj.type) {
    case 'image':
      return isBackgroundImage(obj) ? 'Background' : 'Image';
    case 'text':
      return obj.text.substring(0, 30) || 'Text';
    case 'path':
      return `Path (${Math.floor(obj.points.length / 2)} pts)`;
    case 'shape':
      return obj.shapeType;
    case 'pin':
      return obj.label.trim() || 'Pin';
    default:
      return 'Object';
  }
}

/** Check if two axis-aligned bounding boxes overlap */
export function rectsIntersect(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

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
  let angle = 180; // CSS default: "to bottom"

  const stopParts = [...parts];
  const first = stopParts[0];
  if (first) {
    const angleMatch = /^(-?\d+(?:\.\d+)?)deg$/.exec(first);
    if (angleMatch) {
      angle = Number.parseFloat(angleMatch[1]);
      stopParts.shift();
    } else if (/^(to |circle|ellipse|closest|farthest|at )/.test(first)) {
      stopParts.shift();
    }
  }

  const stops: (GradientStop | { color: string; offset: number | null })[] = [];
  for (const part of stopParts) {
    const positionMatch = /^(.*?)\s+(-?\d+(?:\.\d+)?)%$/.exec(part);
    if (positionMatch) {
      stops.push({
        color: positionMatch[1].trim(),
        offset:
          Math.min(Math.max(Number.parseFloat(positionMatch[2]), 0), 100) / 100,
      });
    } else if (part) {
      stops.push({ color: part, offset: null });
    }
  }
  if (stops.length < 2) return null;

  // Distribute stops without explicit positions evenly.
  if (stops[0].offset === null) stops[0].offset = 0;
  if (stops[stops.length - 1].offset === null) {
    stops[stops.length - 1].offset = 1;
  }
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

  return { type, angle, stops: stops as GradientStop[] };
}

/**
 * The start/end points of a linear gradient across a `width`×`height` box
 * centred at `center`, for a CSS angle (0deg = to top, clockwise).
 */
export function linearGradientLine(
  angle: number,
  width: number,
  height: number,
  center: { x: number; y: number }
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
    c =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c] ?? c
  );
}
