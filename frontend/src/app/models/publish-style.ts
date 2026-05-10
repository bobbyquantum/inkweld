/**
 * Publish Style Model
 *
 * Structured, per-publish-plan typography and layout customization for
 * exported documents (HTML, EPUB, PDF). Markdown ignores these styles.
 *
 * Design goals:
 * - Curated font tokens (no arbitrary user fonts) mapped per output format.
 * - Per-target style overrides: page, document nodes, marks, publish structure
 *   (chapter title, scene break, frontmatter/backmatter, TOC, worldbuilding).
 * - Worldbuilding renderer can be themed per schema/tab/field.
 * - All numeric values are unitless point sizes / em multipliers as documented
 *   per field. Generators convert to their native units.
 */

// ---------------------------------------------------------------------------
// Font tokens
// ---------------------------------------------------------------------------

/**
 * Curated font tokens. The resolver maps each token to a concrete CSS
 * font-family stack (HTML/EPUB) or Typst font name (PDF). Only these tokens
 * are accepted in the model; the UI exposes a finite picker.
 */
export type PublishFontToken =
  | 'serifClassic' // Georgia / Linux Libertine — friendly classic serif
  | 'serifBook' // Garamond-like — traditional book serif
  | 'serifManuscript' // Courier / monospaced manuscript style
  | 'sansClean' // Helvetica/Arial — clean sans
  | 'sansHumanist' // Lato/Open Sans — humanist sans
  | 'mono'; // Monospace fallback

/**
 * Mapping from font token to a concrete stack/name per output format.
 */
export interface PublishFontMapping {
  /** CSS font-family stack used in HTML / EPUB. */
  css: string;
  /** Typst font name (single or first preferred) used in PDF. */
  typst: string;
  /** Human readable label shown in pickers. */
  label: string;
}

/**
 * Curated font tokens. Each maps to a CSS family chain (used by HTML/EPUB
 * preview and output) and a Typst family name (used by PDF output).
 *
 * All six families are shipped as bundled `@fontsource/*` packages
 * (latin charset, regular + bold + italic + bold-italic). Bundled families
 * are listed first in the CSS chain so output is consistent with the PDF;
 * system fallbacks remain so missing glyphs (CJK, etc.) still render.
 *
 * Typst font names match the bundled family exactly so the PDF compiler
 * resolves them via the preloaded woff2 assets (see `pdf-generator.service`
 * `initTypst()`).
 */
export const PUBLISH_FONT_TOKENS: Record<PublishFontToken, PublishFontMapping> =
  {
    serifClassic: {
      css: '"Source Serif 4", Georgia, "Times New Roman", serif',
      typst: 'Source Serif 4',
      label: 'Classic Serif',
    },
    serifBook: {
      css: '"EB Garamond", Garamond, "Times New Roman", serif',
      typst: 'EB Garamond',
      label: 'Book Serif',
    },
    serifManuscript: {
      css: '"Courier Prime", "Courier New", Courier, monospace',
      typst: 'Courier Prime',
      label: 'Manuscript (Courier)',
    },
    sansClean: {
      css: '"Source Sans 3", Helvetica, Arial, sans-serif',
      typst: 'Source Sans 3',
      label: 'Clean Sans',
    },
    sansHumanist: {
      css: 'Lato, "Open Sans", "Segoe UI", sans-serif',
      typst: 'Lato',
      label: 'Humanist Sans',
    },
    mono: {
      css: '"Source Code Pro", Consolas, monospace',
      typst: 'Source Code Pro',
      label: 'Monospace',
    },
  };

// ---------------------------------------------------------------------------
// Primitive style fragments
// ---------------------------------------------------------------------------

export type FontWeight = 'normal' | 'bold' | 'light' | 'medium' | 'semibold';
export type FontStyle = 'normal' | 'italic';
export type TextAlign = 'left' | 'right' | 'center' | 'justify';
export type TextTransform = 'none' | 'uppercase' | 'lowercase' | 'capitalize';
export type TextDecoration = 'none' | 'underline' | 'line-through';

/**
 * Reusable text styling. All fields optional so partial overrides merge
 * cleanly. Sizes are in points, line-height is a unitless multiplier.
 */
export interface TextStyle {
  font?: PublishFontToken;
  fontSize?: number; // points
  weight?: FontWeight;
  style?: FontStyle;
  lineHeight?: number; // multiplier
  letterSpacing?: number; // em
  align?: TextAlign;
  transform?: TextTransform;
  decoration?: TextDecoration;
  /** Hex color or CSS color name. PDF supports named/RGB. */
  color?: string;
  /** Indent first line in em. */
  firstLineIndent?: number;
}

/**
 * Spacing/box style (margin/padding/border) in points.
 */
export interface BoxStyle {
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  /** Background hex color (HTML/EPUB only; ignored in PDF). */
  background?: string;
  /** Border thickness in points. 0 = no border. */
  borderWidth?: number;
  borderColor?: string;
  /** Border radius in points (HTML/EPUB only). */
  borderRadius?: number;
}

// ---------------------------------------------------------------------------
// Page setup (PDF + EPUB hints)
// ---------------------------------------------------------------------------

export type PageSize =
  | 'us-letter'
  | 'us-trade' // 6 x 9 in
  | 'a4'
  | 'a5'
  | 'b5'
  | 'pocket'; // 4.25 x 6.87 in

export interface PageStyle {
  size: PageSize;
  marginTop: number; // inches
  marginBottom: number;
  marginInside: number; // gutter
  marginOutside: number;
  /** Page numbering format for PDF. */
  pageNumbers: 'none' | 'numeric' | 'roman';
  /** Show running header with chapter title (PDF). */
  runningHeader: boolean;
}

// ---------------------------------------------------------------------------
// Document node + mark style maps
// ---------------------------------------------------------------------------

/**
 * Canonical ProseMirror node names we style. The resolver normalizes
 * snake_case / camelCase variants to these keys before lookup.
 */
export type DocNodeKey =
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'heading4'
  | 'heading5'
  | 'heading6'
  | 'blockquote'
  | 'codeBlock'
  | 'bulletList'
  | 'orderedList'
  | 'listItem'
  | 'horizontalRule'
  | 'image'
  | 'figure'
  | 'caption';

export type DocNodeStyles = Partial<
  Record<DocNodeKey, { text?: TextStyle; box?: BoxStyle }>
>;

/**
 * Canonical mark names. `comment` is excluded by default by generators.
 */
export type MarkKey =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'code'
  | 'link'
  | 'subscript'
  | 'superscript'
  | 'comment';

export type MarkStyles = Partial<Record<MarkKey, TextStyle>>;

// ---------------------------------------------------------------------------
// Publish-structure styles (chapter, scene break, TOC, frontmatter, etc.)
// ---------------------------------------------------------------------------

export interface ChapterTitleStyle {
  text: TextStyle;
  box: BoxStyle;
  /** Style of the chapter number prefix ("Chapter 1"). */
  numberPrefix?: TextStyle;
  /** Force a page break before the chapter (PDF/EPUB). */
  pageBreakBefore: boolean;
}

export interface SceneBreakStyle {
  text: TextStyle;
  box: BoxStyle;
}

export interface TocStyle {
  title: TextStyle;
  entry: TextStyle;
  /** Indent per nesting level, in em. */
  indentPerLevel: number;
}

export interface FrontBackMatterStyle {
  title: TextStyle;
  body: TextStyle;
  box: BoxStyle;
}

export interface PublishStructureStyles {
  chapterTitle: ChapterTitleStyle;
  sceneBreak: SceneBreakStyle;
  toc: TocStyle;
  frontmatter: FrontBackMatterStyle;
  backmatter: FrontBackMatterStyle;
}

// ---------------------------------------------------------------------------
// Worldbuilding styles
// ---------------------------------------------------------------------------

/**
 * Layout for a worldbuilding entry block.
 *
 * - card: bordered box with title + fields stacked
 * - compact: single line per field, no border
 * - detail: large title, full-width sections per tab/group
 * - appendix: minimal, optimized for back-of-book reference
 */
export type WorldbuildingLayout = 'card' | 'compact' | 'detail' | 'appendix';

export interface WorldbuildingStyles {
  /** Section title (e.g., "Worldbuilding"). */
  sectionTitle: TextStyle;
  /** Title for each entry (the entry's display name). */
  entryTitle: TextStyle;
  /** Box around each entry. */
  entryBox: BoxStyle;
  /** Tab / group heading inside an entry. */
  tabHeading: TextStyle;
  /** Field label (left side). */
  fieldLabel: TextStyle;
  /** Field value (right side / following label). */
  fieldValue: TextStyle;
  /** Default layout used for entries unless overridden per-item. */
  defaultLayout: WorldbuildingLayout;
  /** Per-schema overrides keyed by schemaId. */
  schemas?: Record<string, WorldbuildingSchemaOverride>;
}

export interface WorldbuildingSchemaOverride {
  entryTitle?: TextStyle;
  entryBox?: BoxStyle;
  layout?: WorldbuildingLayout;
  /** Per-tab overrides keyed by tab id. */
  tabs?: Record<string, { heading?: TextStyle }>;
  /** Per-field overrides keyed by dotted field key. */
  fields?: Record<string, { label?: TextStyle; value?: TextStyle }>;
}

// ---------------------------------------------------------------------------
// Top-level styles container
// ---------------------------------------------------------------------------

export interface PublishStyles {
  /** Optional preset name the styles were derived from (UI hint only). */
  preset?: string;
  /** Page setup (PDF primary, EPUB advisory). */
  page: PageStyle;
  /** Base text style applied to body paragraphs unless overridden. */
  baseText: TextStyle;
  /** Per-node style overrides. */
  nodes: DocNodeStyles;
  /** Per-mark style overrides. */
  marks: MarkStyles;
  /** Publish structure (chapters, TOC, scene breaks, front/back matter). */
  structure: PublishStructureStyles;
  /** Worldbuilding rendering styles. */
  worldbuilding: WorldbuildingStyles;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_PAGE_STYLE: PageStyle = {
  size: 'us-trade',
  marginTop: 0.75,
  marginBottom: 0.75,
  marginInside: 0.875,
  marginOutside: 0.625,
  pageNumbers: 'numeric',
  runningHeader: true,
};

export const DEFAULT_BASE_TEXT: TextStyle = {
  font: 'serifClassic',
  fontSize: 11,
  weight: 'normal',
  style: 'normal',
  lineHeight: 1.4,
  align: 'justify',
  firstLineIndent: 1.25,
  color: '#111111',
};

export const DEFAULT_DOC_NODE_STYLES: DocNodeStyles = {
  paragraph: {
    text: { firstLineIndent: 1.25 },
    box: { marginTop: 0, marginBottom: 0 },
  },
  heading1: {
    text: { fontSize: 22, weight: 'bold', align: 'left', firstLineIndent: 0 },
    box: { marginTop: 24, marginBottom: 12 },
  },
  heading2: {
    text: { fontSize: 18, weight: 'bold', align: 'left', firstLineIndent: 0 },
    box: { marginTop: 24, marginBottom: 12 },
  },
  heading3: {
    text: {
      fontSize: 14,
      weight: 'semibold',
      align: 'left',
      firstLineIndent: 0,
    },
    box: { marginTop: 14, marginBottom: 6 },
  },
  heading4: {
    text: {
      fontSize: 12,
      weight: 'semibold',
      style: 'italic',
      align: 'left',
      firstLineIndent: 0,
    },
    box: { marginTop: 12, marginBottom: 4 },
  },
  heading5: {
    text: {
      fontSize: 11,
      weight: 'bold',
      transform: 'uppercase',
      align: 'left',
      firstLineIndent: 0,
    },
    box: { marginTop: 10, marginBottom: 4 },
  },
  heading6: {
    text: {
      fontSize: 11,
      weight: 'semibold',
      style: 'italic',
      align: 'left',
      firstLineIndent: 0,
    },
    box: { marginTop: 10, marginBottom: 4 },
  },
  blockquote: {
    text: { style: 'italic', firstLineIndent: 0 },
    box: {
      marginTop: 10,
      marginBottom: 10,
      marginLeft: 24,
      marginRight: 24,
      paddingLeft: 12,
      borderWidth: 0,
    },
  },
  codeBlock: {
    text: { font: 'mono', fontSize: 10, firstLineIndent: 0, align: 'left' },
    box: {
      marginTop: 10,
      marginBottom: 10,
      paddingTop: 8,
      paddingBottom: 8,
      paddingLeft: 12,
      paddingRight: 12,
      background: '#f5f5f5',
      borderRadius: 4,
    },
  },
  bulletList: {
    box: { marginTop: 6, marginBottom: 6, marginLeft: 18 },
  },
  orderedList: {
    box: { marginTop: 6, marginBottom: 6, marginLeft: 18 },
  },
  listItem: {
    box: { marginTop: 2, marginBottom: 2 },
  },
  horizontalRule: {
    box: { marginTop: 12, marginBottom: 12 },
  },
  image: {
    box: { marginTop: 10, marginBottom: 10 },
  },
  figure: {
    box: { marginTop: 12, marginBottom: 12 },
  },
  caption: {
    text: {
      fontSize: 9,
      style: 'italic',
      align: 'center',
      firstLineIndent: 0,
    },
    box: { marginTop: 4, marginBottom: 8 },
  },
};

export const DEFAULT_MARK_STYLES: MarkStyles = {
  bold: { weight: 'bold' },
  italic: { style: 'italic' },
  underline: { decoration: 'underline' },
  strike: { decoration: 'line-through' },
  code: { font: 'mono' },
  link: { color: '#1a5fb4', decoration: 'underline' },
  subscript: { fontSize: 9 },
  superscript: { fontSize: 9 },
};

export const DEFAULT_STRUCTURE_STYLES: PublishStructureStyles = {
  chapterTitle: {
    text: {
      fontSize: 24,
      weight: 'bold',
      align: 'center',
      firstLineIndent: 0,
    },
    box: { marginTop: 48, marginBottom: 24 },
    numberPrefix: {
      fontSize: 12,
      weight: 'normal',
      transform: 'uppercase',
      align: 'center',
      letterSpacing: 0.15,
    },
    pageBreakBefore: true,
  },
  sceneBreak: {
    text: { align: 'center', firstLineIndent: 0 },
    box: { marginTop: 18, marginBottom: 18 },
  },
  toc: {
    title: {
      fontSize: 20,
      weight: 'bold',
      align: 'center',
      firstLineIndent: 0,
    },
    entry: {
      fontSize: 11,
      align: 'left',
      firstLineIndent: 0,
    },
    indentPerLevel: 1.5,
  },
  frontmatter: {
    title: {
      fontSize: 18,
      weight: 'bold',
      align: 'center',
      firstLineIndent: 0,
    },
    body: { fontSize: 11, align: 'center', firstLineIndent: 0 },
    box: { marginTop: 24, marginBottom: 24 },
  },
  backmatter: {
    title: {
      fontSize: 18,
      weight: 'bold',
      align: 'center',
      firstLineIndent: 0,
    },
    body: { fontSize: 11, align: 'left', firstLineIndent: 0 },
    box: { marginTop: 24, marginBottom: 24 },
  },
};

export const DEFAULT_WORLDBUILDING_STYLES: WorldbuildingStyles = {
  sectionTitle: {
    fontSize: 22,
    weight: 'bold',
    align: 'left',
    firstLineIndent: 0,
  },
  entryTitle: {
    fontSize: 14,
    weight: 'bold',
    align: 'left',
    firstLineIndent: 0,
  },
  entryBox: {
    marginTop: 12,
    marginBottom: 12,
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 12,
    paddingRight: 12,
    borderWidth: 0.5,
    borderColor: '#cccccc',
    borderRadius: 4,
  },
  tabHeading: {
    fontSize: 12,
    weight: 'semibold',
    transform: 'uppercase',
    align: 'left',
    letterSpacing: 0.1,
    firstLineIndent: 0,
  },
  fieldLabel: {
    fontSize: 10,
    weight: 'semibold',
    align: 'left',
    firstLineIndent: 0,
    color: '#444444',
  },
  fieldValue: {
    fontSize: 11,
    align: 'left',
    firstLineIndent: 0,
  },
  defaultLayout: 'card',
};

export const DEFAULT_PUBLISH_STYLES: PublishStyles = {
  preset: 'paperback',
  page: { ...DEFAULT_PAGE_STYLE },
  baseText: { ...DEFAULT_BASE_TEXT },
  nodes: structuredCloneSafe(DEFAULT_DOC_NODE_STYLES),
  marks: structuredCloneSafe(DEFAULT_MARK_STYLES),
  structure: structuredCloneSafe(DEFAULT_STRUCTURE_STYLES),
  worldbuilding: structuredCloneSafe(DEFAULT_WORLDBUILDING_STYLES),
};

/**
 * structuredClone with a vitest/JSDOM-safe fallback. Avoids cross-test
 * mutation of DEFAULT constants while staying environment-agnostic.
 */
function structuredCloneSafe<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Returns a fresh copy of the default styles. Use this when initializing
 * a new plan to avoid mutating shared module state.
 */
export function createDefaultPublishStyles(): PublishStyles {
  return structuredCloneSafe(DEFAULT_PUBLISH_STYLES);
}
