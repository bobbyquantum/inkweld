/**
 * Publishing Plan Models
 *
 * Defines the structure for configurable export/publishing of projects.
 * Publishing plans allow users to:
 * - Select which elements to include
 * - Add front/back matter, TOC, glossary
 * - Configure output format and styling
 * - Save multiple plans for different audiences
 */

/**
 * Supported output formats for publishing
 *
 * PDF_SIMPLE: Basic PDF via jsPDF - good for text-heavy documents like novels
 * PDF_LAYOUT: (Future) Advanced PDF via pdfkit - for custom layouts, game content, print-ready
 */
export enum PublishFormat {
  EPUB = 'EPUB',
  PDF_SIMPLE = 'PDF_SIMPLE',
  // PDF_LAYOUT = 'PDF_LAYOUT', // Future: pdfkit-based with full layout control
  MARKDOWN = 'MARKDOWN',
  HTML = 'HTML',
}

/**
 * Types of items that can be included in a publish plan
 */
export enum PublishPlanItemType {
  Element = 'element',
  Separator = 'separator',
  TableOfContents = 'toc',
  Frontmatter = 'frontmatter',
  Backmatter = 'backmatter',
  Worldbuilding = 'worldbuilding',
}

/**
 * Separator styles
 */
export enum SeparatorStyle {
  PageBreak = 'page-break',
  SceneBreak = 'scene-break',
  ChapterBreak = 'chapter-break',
}

/**
 * Frontmatter content types
 */
export enum FrontmatterType {
  TitlePage = 'title-page',
  Copyright = 'copyright',
  Dedication = 'dedication',
  Epigraph = 'epigraph',
  Custom = 'custom',
}

/**
 * Backmatter content types
 */
export enum BackmatterType {
  Glossary = 'glossary',
  Index = 'index',
  AboutAuthor = 'about-author',
  Acknowledgments = 'acknowledgments',
  Custom = 'custom',
}

/**
 * Chapter numbering styles
 */
export enum ChapterNumbering {
  None = 'none',
  Numeric = 'numeric',
  Roman = 'roman',
  Written = 'written', // "Chapter One", "Chapter Two"
}

/**
 * Base interface for all publish plan items
 */
interface PublishPlanItemBase {
  id: string;
  type: PublishPlanItemType;
}

/**
 * Reference to a project element (document/folder)
 */
export interface ElementItem extends PublishPlanItemBase {
  type: PublishPlanItemType.Element;
  elementId: string;
  /** Include all children (for folders) */
  includeChildren: boolean;
  /** Override the element's name in the output */
  titleOverride?: string;
  /** Treat this element as a chapter start */
  isChapter?: boolean;
}

/**
 * Visual separator between sections
 */
export interface SeparatorItem extends PublishPlanItemBase {
  type: PublishPlanItemType.Separator;
  style: SeparatorStyle;
  /** Custom separator text (e.g., "* * *") */
  customText?: string;
}

/**
 * Table of contents
 */
export interface TableOfContentsItem extends PublishPlanItemBase {
  type: PublishPlanItemType.TableOfContents;
  title: string;
  /** How deep to show nested items (1 = chapters only, 2 = chapters + sections, etc.) */
  depth: number;
  /** Include page numbers (for PDF) */
  includePageNumbers: boolean;
}

/**
 * Frontmatter (before main content)
 */
export interface FrontmatterItem extends PublishPlanItemBase {
  type: PublishPlanItemType.Frontmatter;
  contentType: FrontmatterType;
  /** Custom HTML/content for custom type */
  customContent?: string;
  /** Title for custom frontmatter */
  customTitle?: string;
}

/**
 * Backmatter (after main content)
 */
export interface BackmatterItem extends PublishPlanItemBase {
  type: PublishPlanItemType.Backmatter;
  contentType: BackmatterType;
  /** Custom HTML/content for custom type */
  customContent?: string;
  /** Title for custom backmatter */
  customTitle?: string;
}

/**
 * Include worldbuilding content
 */
export interface WorldbuildingItem extends PublishPlanItemBase {
  type: PublishPlanItemType.Worldbuilding;
  /** Which categories to include (e.g., ['CHARACTER', 'LOCATION']) */
  categories: string[];
  /** How to format the worldbuilding content */
  format: 'appendix' | 'inline';
  /** Title for the worldbuilding section */
  title: string;
}

/**
 * Union type of all possible publish plan items
 */
export type PublishPlanItem =
  | ElementItem
  | SeparatorItem
  | TableOfContentsItem
  | FrontmatterItem
  | BackmatterItem
  | WorldbuildingItem;

/**
 * Book metadata for the published output
 */
export interface PublishMetadata {
  title: string;
  subtitle?: string;
  author: string;
  authorSort?: string; // "Lastname, Firstname" for sorting
  language: string; // ISO 639-1 code (e.g., 'en', 'es')
  publisher?: string;
  isbn?: string;
  /** Reference to cover image file ID in project */
  coverImageId?: string;
  copyright?: string;
  description?: string;
  keywords?: string[];
  series?: string;
  seriesNumber?: number;
}

/**
 * Styling and formatting options
 */
export interface PublishOptions {
  /** Chapter numbering style */
  chapterNumbering: ChapterNumbering;
  /** Custom scene break text (e.g., "* * *" or "---") */
  sceneBreakText: string;
  /** Include word count statistics */
  includeWordCounts: boolean;
  /** Include table of contents */
  includeToc: boolean;
  /** Include cover page */
  includeCover: boolean;
  /** Cover image reference */
  coverImage?: string;
  /** Font family for the output */
  fontFamily: string;
  /** Base font size in points */
  fontSize: number;
  /** Line height multiplier */
  lineHeight: number;
  /** Custom CSS for advanced styling */
  customCss?: string;
}

/**
 * Default publish options
 */
export const DEFAULT_PUBLISH_OPTIONS: PublishOptions = {
  chapterNumbering: ChapterNumbering.None,
  sceneBreakText: '* * *',
  includeWordCounts: false,
  includeToc: true,
  includeCover: true,
  fontFamily: 'Georgia, serif',
  fontSize: 12,
  lineHeight: 1.5,
};

/**
 * Default metadata
 */
export const DEFAULT_PUBLISH_METADATA: PublishMetadata = {
  title: '',
  author: '',
  language: 'en',
};

/**
 * Complete publish plan definition
 */
export interface PublishPlan {
  id: string;
  /** User-friendly name for the plan */
  name: string;
  /** Output format */
  format: PublishFormat;
  /** When the plan was created */
  createdAt: string;
  /** When the plan was last modified */
  updatedAt: string;
  /** Book/output metadata */
  metadata: PublishMetadata;
  /** Ordered list of items to include */
  items: PublishPlanItem[];
  /** Formatting options */
  options: PublishOptions;
}

/**
 * Progress update for publishing operations
 */
export interface PublishProgress {
  /** Current phase of the operation */
  phase: PublishPhase;
  /** Overall progress (0-100) */
  overallProgress: number;
  /** Progress within current phase (0-100) */
  phaseProgress: number;
  /** Human-readable status message */
  message: string;
  /** Detailed sub-message (e.g., "Syncing document 5 of 12") */
  detail?: string;
  /** Current item being processed */
  currentItem?: string;
  /** Total items to process in current phase */
  totalItems?: number;
  /** Items completed in current phase */
  completedItems?: number;
  /** Any warnings accumulated */
  warnings?: string[];
  /** Error if publishing failed */
  error?: string;
}

/**
 * Phases of the publishing process
 */
export enum PublishPhase {
  /** Initial setup */
  Initializing = 'initializing',
  /** Syncing documents from server (online mode) */
  SyncingDocuments = 'syncing-documents',
  /** Downloading images and files */
  SyncingAssets = 'syncing-assets',
  /** Converting documents to output format */
  ConvertingContent = 'converting-content',
  /** Building the final package */
  Packaging = 'packaging',
  /** Final cleanup and validation */
  Finalizing = 'finalizing',
  /** Complete */
  Complete = 'complete',
  /** Error occurred */
  Error = 'error',
}

/**
 * Result of a publishing operation
 */
export interface PublishResult {
  success: boolean;
  /** The generated file as a Blob */
  file?: Blob;
  /** Suggested filename */
  filename?: string;
  /** MIME type of the output */
  mimeType?: string;
  /** Any warnings during generation */
  warnings: string[];
  /** Error message if failed */
  error?: string;
  /** Statistics about the output */
  stats?: PublishStats;
}

/**
 * Statistics about the published output
 */
export interface PublishStats {
  /** Total word count */
  wordCount: number;
  /** Number of chapters */
  chapterCount: number;
  /** Number of documents included */
  documentCount: number;
  /** File size in bytes */
  fileSize: number;
  /** Time taken to generate (ms) */
  generationTimeMs: number;
}

/**
 * Creates a default publish plan
 */
export function createDefaultPublishPlan(
  projectTitle: string,
  authorName: string
): PublishPlan {
  return {
    id: crypto.randomUUID(),
    name: 'Default Export',
    format: PublishFormat.EPUB,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: {
      ...DEFAULT_PUBLISH_METADATA,
      title: projectTitle,
      author: authorName,
    },
    items: [],
    options: { ...DEFAULT_PUBLISH_OPTIONS },
  };
}

/**
 * Creates a quick export plan that includes all documents in order
 */
export function createQuickExportPlan(
  projectTitle: string,
  authorName: string,
  elementIds: string[]
): PublishPlan {
  const plan = createDefaultPublishPlan(projectTitle, authorName);
  plan.name = 'Quick Export';

  // Add title page
  plan.items.push({
    id: crypto.randomUUID(),
    type: PublishPlanItemType.Frontmatter,
    contentType: FrontmatterType.TitlePage,
  });

  // Add TOC
  plan.items.push({
    id: crypto.randomUUID(),
    type: PublishPlanItemType.TableOfContents,
    title: 'Contents',
    depth: 2,
    includePageNumbers: false,
  });

  // Add all elements
  for (const elementId of elementIds) {
    plan.items.push({
      id: crypto.randomUUID(),
      type: PublishPlanItemType.Element,
      elementId,
      includeChildren: false,
      isChapter: true,
    });
  }

  return plan;
}
