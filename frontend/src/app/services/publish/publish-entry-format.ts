import {
  type BackgroundSetting,
  isBackgroundEmpty,
} from '@models/element-appearance';
import { adjustGradient, adjustHex } from '@utils/color';

/**
 * Formatting shared by the PDF and HTML renderings of worldbuilding entries:
 * how fields pack into rows, how long-text values break into paragraphs,
 * and how an authored background looks on a printed (light) page.
 */

/**
 * Where each field starts in its row of a 12-column grid, as the number of
 * empty columns to leave before it (0 when it follows straight on). A field
 * that does not fit in what is left of a row starts a new one; so does a run
 * of same-width fields (six ability scores) that would fit on a row of its
 * own but not in what is left of this one.
 */
export function packFieldRows(spans: readonly number[]): number[] {
  const starts: number[] = [];
  let used = 0;
  spans.forEach((span, index) => {
    let gap = 0;
    if (used > 0) {
      const runStart = index === 0 || spans[index - 1] !== span;
      let run = 0;
      for (let i = index; i < spans.length && spans[i] === span; i++) {
        run += span;
      }
      const runFitsRow = run <= 12;
      if (used + span > 12 || (runStart && runFitsRow && used + run > 12)) {
        gap = 12 - used;
        used = 0;
      }
    }
    starts.push(gap);
    used = (used + span) % 12;
  });
  return starts;
}

/** Small words allowed in lower case inside a stat-block name. */
const JOINING_WORDS = new Set([
  'of',
  'the',
  'and',
  'a',
  'an',
  'in',
  'on',
  'to',
  'with',
  'or',
]);

/**
 * Split a stat-block style line ("Gaff Hook. Melee Weapon Attack: …") into
 * its lead-in name and the rest. The name must be short and in title case
 * (small joining words and a parenthetical such as "(Recharge 5-6)" are
 * allowed), so an ordinary sentence ("He left. Then …") is not matched.
 */
export function statBlockLeadIn(
  line: string
): { name: string; rest: string } | null {
  const match = /^(.{1,48}?)\.\s+(\S.*)$/.exec(line);
  if (!match) return null;
  const name = match[1];
  const words = name.replace(/\s*\([^)]{1,30}\)\s*$/, '').split(/\s+/);
  if (words.length === 0 || words.length > 6) return null;
  const titleCase = words.every(
    (word, i) =>
      /^[A-Z0-9][\w'’-]*$/.test(word) || (i > 0 && JOINING_WORDS.has(word))
  );
  return titleCase ? { name: `${name}.`, rest: match[2] } : null;
}

/** One line of a long-text value, as it should be set. */
export type LongTextLine =
  | { kind: 'bullet'; text: string }
  | { kind: 'paragraph'; text: string; lead?: string };

/**
 * Break a multi-line long-text value into lines to set: each line is a
 * paragraph, a line starting with `- ` (or `•`) is a bullet, and a line
 * opening with a stat-block name gets that name as its lead-in. Returns null
 * for a single-line value, which is set as it is.
 */
export function splitLongText(value: string): LongTextLine[] | null {
  if (!value.includes('\n')) return null;
  return value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map((line): LongTextLine => {
      const bullet = /^[-•*]\s+(.*)$/.exec(line);
      if (bullet) return { kind: 'bullet', text: bullet[1] };
      const lead = statBlockLeadIn(line);
      return lead
        ? { kind: 'paragraph', lead: lead.name, text: lead.rest }
        : { kind: 'paragraph', text: line };
    });
}

/** An entry's authored background as it should appear on a printed page. */
export type PrintBackground =
  | { type: 'color'; color: string }
  | { type: 'gradient'; css: string }
  | { type: 'image'; src: string };

/**
 * The background an entry shows in the light theme, which is what a printed
 * page (and the published HTML) uses. Auto mode lightens the chosen colour or
 * gradient exactly as the editor does (by the square of the intensity), so
 * the published entry matches what the author saw. Manual mode uses the
 * light value. Returns null when there is nothing to draw.
 */
export function printBackground(
  setting: BackgroundSetting | undefined
): PrintBackground | null {
  if (!setting || isBackgroundEmpty(setting)) return null;
  const value =
    setting.mode === 'manual' ? setting.light || setting.dark : setting.value;
  if (!value) return null;
  const raw = (setting.intensity ?? 25) / 100;
  const amount = setting.mode === 'auto' ? raw * raw : 0;
  switch (setting.type) {
    case 'color': {
      const color = adjustHex(value, amount);
      return color ? { type: 'color', color } : null;
    }
    case 'gradient':
      return /^linear-gradient\(/i.test(value.trim())
        ? { type: 'gradient', css: adjustGradient(value, amount) }
        : null;
    case 'image':
      return { type: 'image', src: value };
    default:
      return null;
  }
}

/** CSS `to <side>` keywords as CSS angles. */
const CSS_SIDE_ANGLES: Record<string, number> = {
  top: 0,
  'top right': 45,
  right: 90,
  'bottom right': 135,
  bottom: 180,
  'bottom left': 225,
  left: 270,
  'top left': 315,
};

/**
 * Convert a CSS `linear-gradient(...)` with hex colour stops to a Typst
 * `gradient.linear(...)`, or null when it cannot be expressed safely. CSS
 * measures the angle clockwise from "to top"; Typst measures it from "to
 * right" with y pointing down, so the angle shifts by 90°.
 */
export function typstLinearGradient(css: string): string | null {
  const match = /^linear-gradient\((.*)\)$/i.exec(css.trim());
  if (!match) return null;
  const parts = match[1].split(',').map(part => part.trim());
  let cssAngle = 180;
  const direction = parts[0];
  const degrees = /^(-?\d+(?:\.\d+)?)deg$/i.exec(direction);
  const side = /^to\s+(.+)$/i.exec(direction);
  if (degrees) {
    cssAngle = Number(degrees[1]);
    parts.shift();
  } else if (side) {
    const words = side[1].toLowerCase().split(/\s+/).sort().join(' ');
    const key = Object.keys(CSS_SIDE_ANGLES).find(
      k => k.split(' ').sort().join(' ') === words
    );
    if (key === undefined) return null;
    cssAngle = CSS_SIDE_ANGLES[key];
    parts.shift();
  }
  const parsed: { color: string; at?: number }[] = [];
  for (const part of parts) {
    const stop = /^(#[0-9a-f]{3,8})(?:\s+(\d+(?:\.\d+)?)%)?$/i.exec(part);
    if (!stop) return null;
    parsed.push({
      color: stop[1],
      at: stop[2] === undefined ? undefined : Number(stop[2]),
    });
  }
  if (parsed.length < 2) return null;
  // Typst wants every stop positioned or none of them.
  const positioned = parsed.every(stop => stop.at !== undefined);
  const stops = parsed.map(stop =>
    positioned ? `(rgb("${stop.color}"), ${stop.at}%)` : `rgb("${stop.color}")`
  );
  const angle = (((cssAngle - 90) % 360) + 360) % 360;
  return `gradient.linear(${stops.join(', ')}, angle: ${angle}deg)`;
}
