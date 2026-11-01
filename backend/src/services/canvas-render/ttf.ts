/**
 * Reads what text layout needs from a TrueType or OpenType font: how far each
 * character advances, and how tall the font is. The rasteriser draws the text
 * but cannot lay it out, so the server has to measure lines itself to wrap them
 * where the canvas does.
 */

export interface FontMetrics {
  /** The font's own family name, which the rasteriser looks it up by. */
  family: string;
  unitsPerEm: number;
  /** Height above the baseline, in font units, positive. */
  ascent: number;
  /** Depth below the baseline, in font units, positive. */
  descent: number;
  /** Advance width in font units. */
  advance(codePoint: number): number;
  hasGlyph(codePoint: number): boolean;
}

interface FontTables {
  view: DataView;
  offset(tag: string): number;
  has(tag: string): boolean;
}

function readTables(bytes: Uint8Array): FontTables {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(4);
  const tables = new Map<string, number>();
  for (let i = 0; i < count; i++) {
    const entry = 12 + i * 16;
    const tag = String.fromCodePoint(
      view.getUint8(entry),
      view.getUint8(entry + 1),
      view.getUint8(entry + 2),
      view.getUint8(entry + 3)
    );
    tables.set(tag, view.getUint32(entry + 8));
  }
  return {
    view,
    has: (tag) => tables.has(tag),
    offset: (tag) => {
      const offset = tables.get(tag);
      if (offset === undefined) throw new Error(`Font has no ${tag} table`);
      return offset;
    },
  };
}

/** A character-to-glyph lookup from a format 4 cmap subtable (the BMP). */
function readCmapFormat4(view: DataView, table: number): (cp: number) => number {
  const segCount = view.getUint16(table + 6) / 2;
  const endCodes = table + 14;
  const startCodes = endCodes + segCount * 2 + 2;
  const idDeltas = startCodes + segCount * 2;
  const idRangeOffsets = idDeltas + segCount * 2;

  return (codePoint) => {
    if (codePoint > 0xffff) return 0;
    for (let segment = 0; segment < segCount; segment++) {
      if (codePoint > view.getUint16(endCodes + segment * 2)) continue;
      const start = view.getUint16(startCodes + segment * 2);
      if (codePoint < start) return 0;
      const delta = view.getInt16(idDeltas + segment * 2);
      const rangeOffsetAt = idRangeOffsets + segment * 2;
      const rangeOffset = view.getUint16(rangeOffsetAt);
      if (rangeOffset === 0) return (codePoint + delta) & 0xffff;
      const glyph = view.getUint16(rangeOffsetAt + rangeOffset + (codePoint - start) * 2);
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
    }
    return 0;
  };
}

/** A character-to-glyph lookup from a format 12 cmap subtable (all of Unicode). */
function readCmapFormat12(view: DataView, table: number): (cp: number) => number {
  const groups = view.getUint32(table + 12);
  return (codePoint) => {
    for (let group = 0; group < groups; group++) {
      const entry = table + 16 + group * 12;
      const start = view.getUint32(entry);
      if (codePoint >= start && codePoint <= view.getUint32(entry + 4)) {
        return view.getUint32(entry + 8) + codePoint - start;
      }
    }
    return 0;
  };
}

function readCharacterMap(tables: FontTables): (cp: number) => number {
  const { view } = tables;
  const cmap = tables.offset('cmap');
  const count = view.getUint16(cmap + 2);
  let format4: number | null = null;
  for (let i = 0; i < count; i++) {
    const entry = cmap + 4 + i * 8;
    const subtable = cmap + view.getUint32(entry + 4);
    const format = view.getUint16(subtable);
    if (format === 12) return readCmapFormat12(view, subtable);
    if (format === 4) format4 ??= subtable;
  }
  if (format4 === null) throw new Error('Font has no usable cmap subtable');
  return readCmapFormat4(view, format4);
}

/**
 * The family name as the rasteriser's font database sees it: the Windows
 * English name, which is not always what the font is sold as. Our Source Sans
 * files, cut from a variable font, are called "Source Sans 3 ExtraLight".
 */
export function readFontFamily(bytes: Uint8Array): string {
  const tables = readTables(bytes);
  const { view } = tables;
  const name = tables.offset('name');
  const count = view.getUint16(name + 2);
  const strings = name + view.getUint16(name + 4);
  for (let i = 0; i < count; i++) {
    const record = name + 6 + i * 12;
    const platform = view.getUint16(record);
    const nameId = view.getUint16(record + 6);
    if (platform === 3 && nameId === 1) {
      const length = view.getUint16(record + 8);
      const start = strings + view.getUint16(record + 10);
      let family = '';
      for (let at = 0; at < length; at += 2) {
        family += String.fromCodePoint(view.getUint16(start + at));
      }
      return family;
    }
  }
  throw new Error('Font has no family name');
}

/**
 * Vertical metrics as a browser reads them, since canvas text is placed from
 * `fontBoundingBox*`: the OS/2 typographic values when the font asks for them
 * (USE_TYPO_METRICS), otherwise the hhea ones.
 */
function readVerticalMetrics(tables: FontTables): {
  ascent: number;
  descent: number;
} {
  const { view } = tables;
  if (tables.has('OS/2')) {
    const os2 = tables.offset('OS/2');
    const useTypoMetrics = (view.getUint16(os2 + 62) & (1 << 7)) !== 0;
    if (useTypoMetrics) {
      return {
        ascent: view.getInt16(os2 + 68),
        descent: -view.getInt16(os2 + 70),
      };
    }
  }
  const hhea = tables.offset('hhea');
  return {
    ascent: view.getInt16(hhea + 4),
    descent: -view.getInt16(hhea + 6),
  };
}

export function parseFontMetrics(bytes: Uint8Array): FontMetrics {
  const tables = readTables(bytes);
  const { view } = tables;
  const glyphOf = readCharacterMap(tables);
  const hmtx = tables.offset('hmtx');
  const longMetrics = view.getUint16(tables.offset('hhea') + 34);

  return {
    family: readFontFamily(bytes),
    unitsPerEm: view.getUint16(tables.offset('head') + 18),
    ...readVerticalMetrics(tables),
    hasGlyph: (codePoint) => glyphOf(codePoint) !== 0,
    advance: (codePoint) => {
      // Glyphs past the long metrics all share the last advance.
      const glyph = Math.min(glyphOf(codePoint), longMetrics - 1);
      return view.getUint16(hmtx + glyph * 4);
    },
  };
}
