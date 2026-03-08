/**
 * Types for the Standard Ebooks → Inkweld converter.
 *
 * Standard Ebooks is a volunteer-driven project that produces
 * carefully formatted, open-source, free public domain ebooks.
 * See: https://standardebooks.org
 */

// ── Standard Ebooks parsed structures ──────────────────────────

/** Metadata extracted from content.opf */
export interface SEBookMetadata {
  title: string;
  author: string;
  language: string;
  description: string;
  /** Word count reported by SE, if available */
  wordCount?: number;
  /** Flesch reading ease score, if available */
  readingEase?: number;
  /** LCSH subject headings */
  subjects: string[];
  /** SE genre/category (e.g. "Fiction", "Nonfiction") */
  seSubjects: string[];
  /** Source URLs (Project Gutenberg, etc.) */
  sourceUrls: string[];
}

/** A file entry from the OPF spine (reading order) */
export interface SESpineItem {
  /** Manifest item ID */
  id: string;
  /** Relative href from epub root (e.g. "text/book-1.xhtml") */
  href: string;
  /** Whether this is linear content */
  linear: boolean;
}

/** Parsed TOC entry from toc.xhtml */
export interface SETocEntry {
  /** Display label (e.g. "Chapter I: The Art of Prophecy") */
  label: string;
  /** Href with optional fragment (e.g. "book-1.xhtml#chapter-1-1") */
  href: string;
  /** Nested children (e.g. chapters within a book/part) */
  children: SETocEntry[];
}

/** Semantic type of a parsed section */
export type SESectionType =
  | 'part'
  | 'chapter'
  | 'prologue'
  | 'epilogue'
  | 'dedication'
  | 'preface'
  | 'introduction'
  | 'foreword'
  | 'afterword'
  | 'appendix'
  | 'colophon'
  | 'imprint'
  | 'titlepage'
  | 'halftitlepage'
  | 'endnotes'
  | 'loi' // list of illustrations
  | 'uncopyright'
  | 'unknown';

/** A parsed section from an XHTML file */
export interface SESection {
  /** Section ID from the HTML (e.g. "chapter-1-1") */
  id: string;
  /** Semantic type derived from epub:type */
  sectionType: SESectionType;
  /** Display title extracted from heading elements */
  title: string;
  /** ProseMirror JSON content nodes */
  content: ProseMirrorNode[];
  /** Nested sub-sections (e.g. chapters within a part) */
  children: SESection[];
  /** The source file this came from */
  sourceFile: string;
}

// ── ProseMirror JSON structures ────────────────────────────────

/** A ProseMirror mark (inline formatting) */
export interface ProseMirrorMark {
  type: 'strong' | 'em' | 'u' | 's' | 'code' | 'link' | 'sup' | 'sub';
  attrs?: Record<string, unknown>;
}

/** A ProseMirror node */
export interface ProseMirrorNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: ProseMirrorNode[];
  text?: string;
  marks?: ProseMirrorMark[];
}

// ── Inkweld archive structures (simplified for generation) ─────

export interface InkweldElement {
  id: string;
  name: string;
  type: 'FOLDER' | 'ITEM';
  parentId: string | null;
  order: number;
  level: number;
  expandable: boolean;
  version: number;
  metadata: Record<string, string>;
}

export interface InkweldDocument {
  elementId: string;
  content: ProseMirrorNode[];
}

export interface InkweldManifest {
  version: number;
  exportedAt: string;
  appVersion: string;
  projectTitle: string;
  originalSlug: string;
}

export interface InkweldProject {
  title: string;
  description: string;
  slug: string;
  hasCover: boolean;
}

// ── Publish plan structures ─────────────────────────────────

/** Publish plan item types matching Inkweld's PublishPlanItemType */
export type InkweldPublishItemType =
  | 'element'
  | 'separator'
  | 'toc'
  | 'frontmatter'
  | 'backmatter'
  | 'worldbuilding';

export interface InkweldPublishPlanItem {
  id: string;
  type: InkweldPublishItemType;
  // Element item fields
  elementId?: string;
  includeChildren?: boolean;
  titleOverride?: string;
  isChapter?: boolean;
  // TOC fields
  title?: string;
  depth?: number;
  includePageNumbers?: boolean;
  // Frontmatter fields
  contentType?: string;
  // Separator fields
  style?: string;
}

export interface InkweldPublishPlan {
  id: string;
  name: string;
  format: 'EPUB' | 'PDF_SIMPLE' | 'MARKDOWN' | 'HTML';
  createdAt: string;
  updatedAt: string;
  metadata: {
    title: string;
    author: string;
    language: string;
    description?: string;
    keywords?: string[];
  };
  items: InkweldPublishPlanItem[];
  options: {
    chapterNumbering: string;
    sceneBreakText: string;
    includeWordCounts: boolean;
    includeToc: boolean;
    includeCover: boolean;
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
  };
}

// ── CLI options ────────────────────────────────────────────────

export interface ConvertOptions {
  /** GitHub repo URL or short name (e.g. "g-k-chesterton_the-napoleon-of-notting-hill") */
  source: string;
  /** Output directory for the .inkweld.zip */
  outputDir: string;
  /** Whether to include front/backmatter (titlepage, colophon, etc.) */
  includeFrontmatter: boolean;
  /** Whether to include endnotes as a separate document */
  includeEndnotes: boolean;
  /** Whether to keep the cloned repo after conversion */
  keepRepo: boolean;
}

// ── Parity gap tracking ────────────────────────────────────────

export type GapSeverity = 'info' | 'warning' | 'limitation';

export interface ParityGap {
  severity: GapSeverity;
  feature: string;
  description: string;
}
