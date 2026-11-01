/**
 * The fonts the server draws canvas text in: the same files the app ships, so
 * text in those families matches. Any other family a canvas names exists only
 * on somebody's own machine, so it gets the closest of these, and a warning.
 */

import {
  CANVAS_BUNDLED_FONTS,
  type CanvasFontSpec,
  type MeasuredText,
  type TextMeasurer,
} from '@inkweld/canvas';
import { type FontMetrics, parseFontMetrics } from './ttf';

/** One face in the font pack, before its bytes are read. */
export interface FontPackEntry {
  /** The family a canvas names it by. */
  family: string;
  bold: boolean;
  italic: boolean;
  offset: number;
  length: number;
}

/**
 * `canvas-fonts.pack.bin` holds every face in one file, so each runtime has one
 * asset to load: a little-endian uint32 header length, a JSON array of
 * {@link FontPackEntry}, then the font files one after another.
 */
export function readFontPack(pack: Uint8Array): {
  entries: FontPackEntry[];
  faces: Uint8Array;
} {
  const view = new DataView(pack.buffer, pack.byteOffset, pack.byteLength);
  const headerLength = view.getUint32(0, true);
  const header = new TextDecoder().decode(pack.subarray(4, 4 + headerLength));
  return {
    entries: JSON.parse(header) as FontPackEntry[],
    faces: pack.subarray(4 + headerLength),
  };
}

/** A face that has been read. */
interface LoadedFace {
  bytes: Uint8Array;
  metrics: FontMetrics;
}

/** Families people ask for, and the shipped font closest in look. */
const SUBSTITUTES: readonly [RegExp, string][] = [
  [/garamond/, 'EB Garamond'],
  [/courier|typewriter/, 'Courier Prime'],
  [/mono|consolas|menlo|monaco|code/, 'Source Code Pro'],
  [/sans|arial|helvetica|verdana|tahoma|segoe|roboto|calibri/, 'Source Sans 3'],
  [
    /serif|georgia|times|palatino|baskerville|cambria|didot|antiqua|minion|caslon/,
    'Source Serif 4',
  ],
];

const DEFAULT_FAMILY = 'Source Sans 3';

/** A browser always has these, so it never looks further down a stack. */
const GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'math',
  'emoji',
  'fangsong',
]);

/** The names in a CSS font stack, without their quotes. */
function stackNames(family: string): string[] {
  return family.split(',').map((name) => name.trim().replaceAll(/^["']|["']$/g, ''));
}

export class CanvasFontSet {
  private readonly loaded = new Map<string, LoadedFace>();
  private readonly families = new Set<string>();

  constructor(
    private readonly entries: readonly FontPackEntry[],
    private readonly faces: Uint8Array
  ) {
    for (const entry of entries) this.families.add(entry.family);
  }

  /**
   * The shipped family a canvas's font is drawn in. A browser takes the first
   * name in a stack that it has, and here that is the first one that ships.
   */
  familyFor(requested: string): string {
    const stack = stackNames(requested).map((name) => name.toLowerCase());
    const generic = stack.findIndex((name) => GENERIC_FAMILIES.has(name));
    const names = generic === -1 ? stack : stack.slice(0, generic + 1);
    for (const name of names) {
      const shipped = [...this.families].find((family) => family.toLowerCase() === name);
      if (shipped) return shipped;
    }
    for (const name of names) {
      const match = SUBSTITUTES.find(([pattern]) => pattern.test(name));
      if (match) return match[1];
    }
    return DEFAULT_FAMILY;
  }

  private face(font: CanvasFontSpec): LoadedFace {
    const family = this.familyFor(font.family);
    const key = `${family}|${font.bold}|${font.italic}`;
    const existing = this.loaded.get(key);
    if (existing) return existing;

    const entry = this.entries.find(
      (e) => e.family === family && e.bold === font.bold && e.italic === font.italic
    );
    if (!entry) throw new Error(`No font face for ${key}`);
    const bytes = this.faces.subarray(entry.offset, entry.offset + entry.length);
    const face = { bytes, metrics: parseFontMetrics(bytes) };
    this.loaded.set(key, face);
    return face;
  }

  /** Measures text in the face it will be drawn in. */
  readonly measure: TextMeasurer = (text, font): MeasuredText => {
    const { metrics } = this.face(font);
    let units = 0;
    for (const char of text) units += metrics.advance(char.codePointAt(0) ?? 0);
    const scale = font.size / metrics.unitsPerEm;
    return {
      width: units * scale,
      ascent: metrics.ascent * scale,
      descent: metrics.descent * scale,
    };
  };

  /** The name the rasteriser knows a face's family by. */
  rasteriserFamily(requested: string): string {
    return this.face({
      family: requested,
      size: 1,
      bold: false,
      italic: false,
    }).metrics.family;
  }

  /** The characters in `text` that the face it is drawn in cannot show. */
  missingCharacters(text: string, font: CanvasFontSpec): string[] {
    const { metrics } = this.face(font);
    const missing = new Set<string>();
    for (const char of text) {
      if (char.trim() && !metrics.hasGlyph(char.codePointAt(0) ?? 0)) {
        missing.add(char);
      }
    }
    return [...missing];
  }

  /** The bytes of every face used so far, for the rasteriser to load. */
  usedFaces(): Uint8Array[] {
    return [...this.loaded.values()].map((face) => face.bytes);
  }
}

/** Why a family is not drawn as named, in words, or null when it is. */
export function fontSubstitutionWarning(fonts: CanvasFontSet, requested: string): string | null {
  const family = fonts.familyFor(requested);
  if (family.toLowerCase() === stackNames(requested)[0]?.toLowerCase()) return null;
  return `The font "${requested}" is not one that ships with Inkweld, so this image uses ${family}. In the app it depends on what the viewer has installed, and text may wrap differently. For the same result everywhere, use ${CANVAS_BUNDLED_FONTS.join(', ')}.`;
}
