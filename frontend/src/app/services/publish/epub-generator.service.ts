import { inject, Injectable } from '@angular/core';
import { type Element, ElementType } from '@inkweld/index';
import {
  createDefaultPublishStyles,
  type PublishStyles,
} from '@models/publish-style';
import { isPublishableByDefault } from '@models/scene-metadata';
import JSZip from '@progress/jszip-esm';
import { isWorldbuildingType } from '@utils/worldbuilding.utils';
import { BehaviorSubject, type Observable, Subject } from 'rxjs';

import {
  type BackmatterItem,
  BackmatterType,
  ChapterNumbering,
  type ElementItem,
  type FrontmatterItem,
  FrontmatterType,
  type PublishMetadata,
  type PublishOptions,
  type PublishPlan,
  type PublishPlanItem,
  PublishPlanItemType,
  type PublishStats,
  type SeparatorItem,
  SeparatorStyle,
  type TableOfContentsItem,
  type WorldbuildingItem,
} from '../../models/publish-plan';
import { LoggerService } from '../core/logger.service';
import { LocalStorageService } from '../local/local-storage.service';
import { CoverSourceService } from '../project/cover-source.service';
import { DocumentService } from '../project/document.service';
import { ProjectStateService } from '../project/project-state.service';
import {
  buildNavTree,
  coreImageExtension,
  dataUrlToBlob,
  detectImageType,
  epubTimestamp,
  escapeXml,
  firstHref,
  type FlatNavEntry,
  isRtlLanguage,
  type NavNode,
  navTreeDepth,
  normalizeIsbn,
  normalizeLanguage,
  stableUuid,
  textToParagraphs,
} from './epub-utils';
import { mediaIdFromSrc, sanitizeCssColor } from './html-generator.service';
import { PublishCssEmitterService } from './publish-css-emitter.service';
import { canonicalMarkName } from './publish-marks-helper';
import {
  type RenderedWorldbuildingEntry,
  WorldbuildingPublishRendererService,
} from './worldbuilding-publish-renderer.service';

function clampLevel(n: number): 1 | 2 | 3 | 4 | 5 | 6 {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(6, Math.round(n))) as 1 | 2 | 3 | 4 | 5 | 6;
}

/**
 * Progress information for EPUB generation
 */
export interface EpubProgress {
  /** Current phase */
  phase: EpubPhase;
  /** Overall progress (0-100) */
  overallProgress: number;
  /** Human-readable message */
  message: string;
  /** Detailed sub-message */
  detail?: string;
  /** Current item being processed */
  currentItem?: string;
  /** Total items */
  totalItems: number;
  /** Completed items */
  completedItems: number;
}

/**
 * Phases of EPUB generation
 */
export enum EpubPhase {
  Idle = 'idle',
  Initializing = 'initializing',
  ProcessingContent = 'processing-content',
  GeneratingToc = 'generating-toc',
  PackagingEpub = 'packaging-epub',
  Complete = 'complete',
  Error = 'error',
}

/**
 * Result of EPUB generation
 */
export interface EpubResult {
  success: boolean;
  /** The generated EPUB file */
  file?: Blob;
  /** Suggested filename */
  filename?: string;
  /** Statistics */
  stats?: PublishStats;
  /** Warnings */
  warnings: string[];
  /** Error message if failed */
  error?: string;
}

/** Which part of the book a content document belongs to. */
type BookPart = 'frontmatter' | 'bodymatter' | 'backmatter';

/** A heading found inside a chapter, for sub-entries in the navigation. */
interface ChapterHeading {
  level: number;
  id: string;
  text: string;
}

/**
 * Internal chapter representation: one XHTML content document.
 */
interface Chapter {
  /** Source id (element id for documents). */
  id: string;
  /** Title used in navigation and the document's `<title>`. */
  title: string;
  /** Filename prefix; the sequence number is appended during packaging. */
  kind: 'chapter' | 'frontmatter' | 'backmatter' | 'worldbuilding';
  /** Assigned in {@link EpubGeneratorService.assignFilenames}. */
  filename: string;
  /** Body markup (inside the `<section>`). */
  body: string;
  /** Nesting depth in the navigation; 0 is top level. */
  level: number;
  part: BookPart;
  /** Structural semantics for `epub:type` (e.g. `chapter`, `dedication`). */
  epubType: string;
  /** Whether the chapter gets a navigation entry. */
  inToc: boolean;
  /** Headings inside the chapter, for nested navigation entries. */
  headings: ChapterHeading[];
  /** The element title before chapter numbering was applied. */
  rawTitle?: string;
}

/**
 * A slot in reading order. Group entries exist only in the navigation (a
 * folder whose children were published); the visible table of contents
 * occupies its own slot where the plan placed it.
 */
type Slot =
  | { type: 'chapter'; chapter: Chapter }
  | { type: 'group'; title: string; level: number }
  | { type: 'toc'; item: TableOfContentsItem };

/** A packaged image resource. */
interface EpubImage {
  id: string;
  href: string;
  mediaType: string;
  blob: Blob;
}

/** Cell node names that can carry GFM column alignment. */
const TABLE_CELL_NAMES = new Set([
  'table_cell',
  'tablecell',
  'table_header',
  'tableheader',
]);

/** Block nodes that honour ngx-editor's `align` / `indent` attributes. */
const ALIGNABLE_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

/** Maximum indent level honoured from paragraph/heading `indent` attrs. */
const MAX_INDENT = 8;

/** Heading levels that become sub-entries in the book navigation. */
const MAX_NAV_HEADING_LEVEL = 3;

/** How long to wait for a remote image before leaving it out. */
const REMOTE_IMAGE_TIMEOUT_MS = 10_000;

/** Sentinel scheme for element references, resolved once filenames exist. */
const ELEMENT_REF_SCHEME = 'inkweld-element:';

/** Map an `align` attribute to a CSS class (whitelisted values only). */
function alignClass(node: ProseMirrorNode): string | null {
  if (typeof node !== 'object' || !node || !('attrs' in node)) return null;
  const attrs = node['attrs'] as Record<string, unknown> | null;
  const align = attrs?.['align'];
  if (
    align === 'left' ||
    align === 'center' ||
    align === 'right' ||
    align === 'justify'
  ) {
    return `ink-doc-align-${align}`;
  }
  return null;
}

/** ProseMirror node name → EPUB tag and class. */
const EPUB_NODE_TAG_MAP: Record<string, { tag: string; cls: string }> = {
  paragraph: { tag: 'p', cls: 'ink-doc-paragraph' },
  blockquote: { tag: 'blockquote', cls: 'ink-doc-blockquote' },
  bullet_list: { tag: 'ul', cls: 'ink-doc-bullet-list' },
  bulletlist: { tag: 'ul', cls: 'ink-doc-bullet-list' },
  ordered_list: { tag: 'ol', cls: 'ink-doc-ordered-list' },
  orderedlist: { tag: 'ol', cls: 'ink-doc-ordered-list' },
  list_item: { tag: 'li', cls: 'ink-doc-list-item' },
  listitem: { tag: 'li', cls: 'ink-doc-list-item' },
  hard_break: { tag: 'br', cls: '' },
  horizontal_rule: { tag: 'hr', cls: 'ink-doc-horizontal-rule' },
  code_block: { tag: 'pre', cls: 'ink-doc-code-block' },
  codeblock: { tag: 'pre', cls: 'ink-doc-code-block' },
  figure: { tag: 'figure', cls: 'ink-doc-figure' },
  caption: { tag: 'figcaption', cls: 'ink-doc-caption' },
  table: { tag: 'table', cls: 'ink-doc-table' },
  table_row: { tag: 'tr', cls: 'ink-doc-table-row' },
  tablerow: { tag: 'tr', cls: 'ink-doc-table-row' },
  table_cell: { tag: 'td', cls: 'ink-doc-table-cell' },
  tablecell: { tag: 'td', cls: 'ink-doc-table-cell' },
  table_header: { tag: 'th', cls: 'ink-doc-table-header' },
  tableheader: { tag: 'th', cls: 'ink-doc-table-header' },
};

/** Inline marks rendered as a plain wrapper element. */
const SIMPLE_MARK_WRAPPERS: Record<string, { tag: string; cls: string }> = {
  bold: { tag: 'strong', cls: 'ink-mark-bold' },
  italic: { tag: 'em', cls: 'ink-mark-italic' },
  underline: { tag: 'u', cls: 'ink-mark-underline' },
  strike: { tag: 's', cls: 'ink-mark-strike' },
  code: { tag: 'code', cls: 'ink-mark-code' },
  subscript: { tag: 'sub', cls: 'ink-mark-subscript' },
  superscript: { tag: 'sup', cls: 'ink-mark-superscript' },
};

/** The node's type name, lower-cased. Accepts both Yjs and ProseMirror shapes. */
function epubNodeName(node: object): string {
  if ('nodeName' in node) return String(node.nodeName).toLowerCase();
  if ('type' in node) return String(node.type).toLowerCase();
  return '';
}

/** Only http(s) and mailto links survive; anything else keeps just its text. */
function sanitizeLinkHref(href: unknown): string | null {
  if (typeof href !== 'string') return null;
  const trimmed = href.trim();
  return /^(?:https?:\/\/|mailto:)/i.test(trimmed) ? trimmed : null;
}

/** A positive integer attribute value above one (colspan/rowspan/start). */
function intAbove1(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 1 && n < 10000 ? n : null;
}

/**
 * Service for generating EPUB 3 files client-side.
 *
 * Uses JSZip to create the EPUB package and converts
 * ProseMirror/Yjs content to EPUB-compatible XHTML. The output targets
 * EPUBCheck-clean EPUB 3.3 with EPUB 2 fallbacks (NCX, `<guide>`, cover
 * `<meta>`) for older readers such as Kindle's converter.
 *
 * Provides detailed progress callbacks for UI feedback.
 */
@Injectable({
  providedIn: 'root',
})
export class EpubGeneratorService {
  private readonly logger = inject(LoggerService);
  private readonly documentService = inject(DocumentService);
  private readonly projectStateService = inject(ProjectStateService);
  private readonly coverSourceService = inject(CoverSourceService);
  private readonly localStorage = inject(LocalStorageService);
  private readonly cssEmitter = inject(PublishCssEmitterService);
  private readonly worldbuildingRenderer = inject(
    WorldbuildingPublishRendererService
  );

  // Per-run state, reset at the start of each generation.
  private coverImageData: { blob: Blob; mimeType: string } | null = null;
  private images: EpubImage[] = [];
  /** Image source string → packaged href (null when it could not load). */
  private resolvedImages = new Map<string, string | null>();
  private warnings: string[] = [];
  private headingCounter = 0;
  private currentHeadings: ChapterHeading[] = [];

  // Progress state
  private readonly progressSubject = new BehaviorSubject<EpubProgress>({
    phase: EpubPhase.Idle,
    overallProgress: 0,
    message: 'Ready',
    totalItems: 0,
    completedItems: 0,
  });

  private readonly completeSubject = new Subject<EpubResult>();
  private isCancelled = false;

  /** Observable stream of progress updates */
  readonly progress$: Observable<EpubProgress> =
    this.progressSubject.asObservable();

  /** Emits when generation is complete */
  readonly complete$: Observable<EpubResult> =
    this.completeSubject.asObservable();

  /**
   * Cancel ongoing generation
   */
  cancel(): void {
    this.isCancelled = true;
    this.updateProgress({
      phase: EpubPhase.Idle,
      message: 'Generation cancelled',
    });
  }

  /**
   * Generate an EPUB file from a publish plan.
   *
   * @param plan - The publish plan defining what to include
   * @returns Promise resolving to the generation result
   */
  async generateEpub(plan: PublishPlan): Promise<EpubResult> {
    this.isCancelled = false;
    this.resetRunState();
    const startTime = Date.now();
    const result: EpubResult = {
      success: false,
      warnings: this.warnings,
    };

    try {
      // Phase 1: Initialize
      this.updateProgress({
        phase: EpubPhase.Initializing,
        overallProgress: 5,
        message: 'Initializing EPUB generation...',
        totalItems: plan.items.length,
        completedItems: 0,
      });

      const zip = new JSZip();

      // Add mimetype (must be first, uncompressed)
      zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

      // Add container.xml
      this.addContainerXml(zip);

      // Load cover image if enabled
      if (plan.options.includeCover) {
        await this.loadCoverImage();
      }

      // Phase 2: Process content
      const slots = await this.processContent(plan, result);

      if (this.isCancelled) {
        result.error = 'Generation cancelled';
        this.completeSubject.next(result);
        return result;
      }

      // Phase 3: Generate TOC
      this.updateProgress({
        phase: EpubPhase.GeneratingToc,
        overallProgress: 80,
        message: 'Generating table of contents...',
      });

      const chapters = this.chaptersOf(slots);
      this.assignFilenames(chapters);
      this.resolveElementRefs(chapters);

      await this.addContentFiles(zip, slots, plan);

      // Phase 4: Package
      this.updateProgress({
        phase: EpubPhase.PackagingEpub,
        overallProgress: 90,
        message: 'Packaging EPUB file...',
      });

      const blob = await zip.generateAsync({
        type: 'blob',
        mimeType: 'application/epub+zip',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 },
      });

      // Calculate stats
      const wordCount = chapters.reduce(
        (sum, ch) => sum + this.countWords(ch.body),
        0
      );

      result.success = true;
      result.file = blob;
      result.filename = this.generateFilename(plan.metadata.title);
      result.stats = {
        wordCount,
        chapterCount: chapters.filter(
          ch =>
            (ch.kind === 'chapter' || ch.kind === 'worldbuilding') &&
            ch.level === 0
        ).length,
        documentCount: chapters.length,
        fileSize: blob.size,
        generationTimeMs: Date.now() - startTime,
      };

      this.updateProgress({
        phase: EpubPhase.Complete,
        overallProgress: 100,
        message: `EPUB generated: ${this.formatFileSize(blob.size)}`,
      });

      this.completeSubject.next(result);
      return result;
    } catch (error) {
      this.logger.error('EpubGenerator', 'Generation failed', error);
      result.error = error instanceof Error ? error.message : 'Unknown error';

      this.updateProgress({
        phase: EpubPhase.Error,
        message: result.error,
      });

      this.completeSubject.next(result);
      return result;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private Methods - Content Processing
  // ─────────────────────────────────────────────────────────────────────────────

  private resetRunState(): void {
    this.coverImageData = null;
    this.images = [];
    this.resolvedImages = new Map();
    this.warnings = [];
    this.headingCounter = 0;
    this.currentHeadings = [];
  }

  private updateProgress(updates: Partial<EpubProgress>): void {
    const current = this.progressSubject.getValue();
    this.progressSubject.next({ ...current, ...updates });
  }

  private chaptersOf(slots: Slot[]): Chapter[] {
    return slots.flatMap(s => (s.type === 'chapter' ? [s.chapter] : []));
  }

  /**
   * Process all items in the publish plan into reading-order slots.
   */
  private async processContent(
    plan: PublishPlan,
    result: EpubResult
  ): Promise<Slot[]> {
    const slots: Slot[] = [];
    const elements = this.projectStateService.elements();
    let chapterNumber = 0;
    let processedCount = 0;

    this.updateProgress({
      phase: EpubPhase.ProcessingContent,
      message: `Processing content (0/${plan.items.length})...`,
    });

    for (const item of plan.items) {
      if (this.isCancelled) break;

      this.updateProgress({
        detail: `Processing item ${processedCount + 1}...`,
        completedItems: processedCount,
      });

      try {
        if (item.type === PublishPlanItemType.Separator) {
          this.applySeparator(item, slots, plan.options);
        } else if (item.type === PublishPlanItemType.TableOfContents) {
          if (plan.options.includeToc !== false) {
            slots.push({ type: 'toc', item });
          }
        } else {
          const itemSlots = await this.processItem(
            item,
            elements,
            plan,
            chapterNumber
          );
          for (const slot of itemSlots) {
            if (
              slot.type === 'chapter' &&
              slot.chapter.part === 'bodymatter' &&
              slot.chapter.level === 0
            ) {
              chapterNumber++;
            }
            slots.push(slot);
          }
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        result.warnings.push(`Failed to process item: ${msg}`);
        this.logger.warn('EpubGenerator', 'Failed to process item', error);
      }

      processedCount++;
      const progress = 10 + (processedCount / plan.items.length) * 70;
      this.updateProgress({
        overallProgress: Math.round(progress),
        message: `Processing content (${processedCount}/${plan.items.length})...`,
      });
    }

    return slots;
  }

  /**
   * Process a single publish plan item
   */
  private async processItem(
    item: PublishPlanItem,
    elements: Element[],
    plan: PublishPlan,
    chapterNumber: number
  ): Promise<Slot[]> {
    switch (item.type) {
      case PublishPlanItemType.Element:
        return this.processElementItem(
          item,
          elements,
          plan.options,
          chapterNumber
        );

      case PublishPlanItemType.Frontmatter:
        return [this.chapterSlot(this.processFrontmatter(item, plan.metadata))];

      case PublishPlanItemType.Backmatter:
        return [this.chapterSlot(this.processBackmatter(item, plan.metadata))];

      case PublishPlanItemType.Worldbuilding:
        return (await this.processWorldbuilding(item, elements)).map(ch =>
          this.chapterSlot(ch)
        );

      default:
        return [];
    }
  }

  private chapterSlot(chapter: Chapter): Slot {
    return { type: 'chapter', chapter };
  }

  /**
   * Process an element (document) item
   */
  private async processElementItem(
    item: ElementItem,
    elements: Element[],
    options: PublishOptions,
    chapterNumber: number
  ): Promise<Slot[]> {
    const element = elements.find(e => e.id === item.elementId);
    if (!element) {
      throw new Error(`Element not found: ${item.elementId}`);
    }

    if (isWorldbuildingType(element.type)) {
      const chapter = await this.inlineWbChapter(
        element,
        item.titleOverride,
        0
      );
      return chapter ? [this.chapterSlot(chapter)] : [];
    }

    if (element.type === ElementType.Item) {
      const title = item.titleOverride || element.name;
      const formattedTitle = this.formatChapterTitle(
        title,
        chapterNumber,
        item.isChapter ?? false,
        options
      );
      // The element name is used for the navigation title only. Do NOT
      // inject an <h1> into the body — the user's document is responsible
      // for any visible heading.
      return [
        this.chapterSlot(
          await this.documentChapter(element, formattedTitle, 0, title)
        ),
      ];
    }

    if (element.type === ElementType.Folder && item.includeChildren) {
      return this.folderChildrenSlots(
        element,
        elements,
        item.titleOverride || element.name
      );
    }

    return [];
  }

  private async documentChapter(
    element: Element,
    title: string,
    level: number,
    rawTitle: string = title
  ): Promise<Chapter> {
    this.currentHeadings = [];
    const body = await this.getDocumentContent(element.id);
    return {
      id: element.id,
      title,
      rawTitle,
      kind: 'chapter',
      filename: '',
      body,
      level,
      part: 'bodymatter',
      epubType: 'chapter',
      inToc: true,
      headings: this.currentHeadings,
    };
  }

  private async inlineWbChapter(
    element: Element,
    titleOverride: string | undefined,
    level: number
  ): Promise<Chapter | null> {
    // Inline worldbuilding element (e.g. via "Add everything"): render
    // it as a one-entry chapter using the element's name for the spine
    // title.
    const synthetic = this.singleEntryWbItem(element.id);
    const wbHtml = await this.renderInlineWbHtml(synthetic, [element]);
    if (!wbHtml) return null;
    const title = titleOverride || element.name;
    return {
      id: element.id,
      title,
      kind: 'chapter',
      filename: '',
      body: wbHtml,
      level,
      part: 'bodymatter',
      epubType: 'chapter',
      inToc: true,
      headings: [],
    };
  }

  /**
   * A published folder becomes a navigation group holding its children, so
   * the reader's table of contents mirrors the project's structure.
   */
  private async folderChildrenSlots(
    element: Element,
    elements: Element[],
    title: string
  ): Promise<Slot[]> {
    const slots: Slot[] = [{ type: 'group', title, level: 0 }];
    const children = this.getChildElements(element, elements);
    for (const child of children) {
      const level = Math.max(1, child.level - element.level);
      if (
        child.type === ElementType.Item &&
        isPublishableByDefault(child.metadata)
      ) {
        slots.push(
          this.chapterSlot(await this.documentChapter(child, child.name, level))
        );
      } else if (child.type === ElementType.Folder) {
        slots.push({ type: 'group', title: child.name, level });
      } else if (isWorldbuildingType(child.type)) {
        const chapter = await this.inlineWbChapter(child, undefined, level);
        if (chapter) slots.push(this.chapterSlot(chapter));
      }
    }
    return slots;
  }

  /**
   * Get child elements of a folder
   */
  private getChildElements(parent: Element, allElements: Element[]): Element[] {
    // Find elements that have this parent or are at a deeper level
    const parentIndex = allElements.indexOf(parent);
    const children: Element[] = [];

    for (let i = parentIndex + 1; i < allElements.length; i++) {
      const elem = allElements[i];
      if (elem.level <= parent.level) break; // No longer a child
      children.push(elem);
    }

    return children;
  }

  /**
   * Load cover image from offline storage or project state
   */
  private async loadCoverImage(): Promise<void> {
    const project = this.projectStateService.project();
    if (!project) {
      this.logger.warn('EpubGenerator', 'No project context for cover image');
      return;
    }

    try {
      const coverBlob = await this.loadCoverBlob(project);

      if (!coverBlob) {
        this.logger.debug('EpubGenerator', 'No cover image found');
        return;
      }

      const mimeType = (await detectImageType(coverBlob)) ?? 'image/jpeg';
      if (!coreImageExtension(mimeType) || mimeType === 'image/svg+xml') {
        this.warnings.push(
          `Cover image type ${mimeType} is not supported by e-readers; the cover was left out`
        );
        return;
      }
      this.coverImageData = { blob: coverBlob, mimeType };
      this.logger.debug(
        'EpubGenerator',
        `Loaded cover image: ${coverBlob.size} bytes, type: ${mimeType}`
      );
    } catch (error) {
      this.logger.warn('EpubGenerator', 'Failed to load cover image', error);
    }
  }

  /**
   * Try multiple media IDs to find the cover blob:
   * 1. coverMediaId from Yjs (new system)
   * 2. project.coverImage filename stem (DB value)
   * 3. Legacy 'cover' key (backward compat)
   */
  private async loadCoverBlob(project: {
    username: string;
    slug: string;
    coverImage?: string | null;
  }): Promise<Blob | null> {
    // A live canvas cover renders fresh so the export never ships a stale
    // raster; falls through to the stored image when not canvas-linked.
    const live = await this.coverSourceService.freshCoverBlob();
    if (live) return live;

    const projectKey = `${project.username}/${project.slug}`;
    const idsToTry: string[] = [];

    const coverMediaId = this.projectStateService.coverMediaId();
    if (coverMediaId) idsToTry.push(coverMediaId);

    const stem = project.coverImage?.replace(/\.[^.]+$/, '');
    if (stem && !idsToTry.includes(stem)) idsToTry.push(stem);

    if (!idsToTry.includes('cover')) idsToTry.push('cover');

    for (const id of idsToTry) {
      const blob = await this.localStorage.getMedia(projectKey, id);
      if (blob) return blob;
    }
    return null;
  }

  /**
   * Build the full document ID used for IndexedDB storage.
   *
   * Documents are stored with keys in format: username:slug:documentId
   */
  private getFullDocumentId(elementId: string): string {
    // If already in full format, return as-is
    if (elementId.includes(':')) {
      return elementId;
    }

    // Build full ID from current project context
    const project = this.projectStateService.project();
    if (!project) {
      this.logger.warn(
        'EpubGenerator',
        'No current project context, using raw document ID'
      );
      return elementId;
    }

    return `${project.username}:${project.slug}:${elementId}`;
  }

  /**
   * Get document content as XHTML.
   *
   * Uses DocumentService.getDocumentContent() which handles both active
   * connections and IndexedDB fallback internally. Images are loaded and
   * packaged before the synchronous render pass.
   */
  private async getDocumentContent(elementId: string): Promise<string> {
    const fullDocId = this.getFullDocumentId(elementId);

    try {
      const content = await this.documentService.getDocumentContent(fullDocId);
      if (!content) {
        this.logger.warn(
          'EpubGenerator',
          `Document ${fullDocId} has no content`
        );
        return '<p>Document is empty</p>';
      }
      await this.resolveDocumentImages(content);
      return this.prosemirrorToHtml(content);
    } catch (error) {
      this.logger.warn(
        'EpubGenerator',
        `Failed to get document content: ${fullDocId}`,
        error
      );
      return '<p>Content unavailable</p>';
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private Methods - Images
  // ─────────────────────────────────────────────────────────────────────────────

  /** Load every image a document references ahead of rendering. */
  private async resolveDocumentImages(content: ProseMirrorNode): Promise<void> {
    const sources = new Set<string>();
    this.collectImageSources(content, sources);
    for (const src of sources) await this.resolveImage(src);
  }

  private collectImageSources(node: ProseMirrorNode, out: Set<string>): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const n of node) this.collectImageSources(n, out);
      return;
    }
    if (epubNodeName(node) === 'image') {
      const src = node.attrs?.['src'];
      if (typeof src === 'string' && src.trim()) out.add(src);
    }
    for (const child of this.getChildren(node)) {
      this.collectImageSources(child, out);
    }
  }

  /**
   * Package an image into `OEBPS/images/` and return its href relative to a
   * content document. EPUB requires images to live inside the container, so
   * project media, `data:` URLs and (when CORS allows) remote images are all
   * copied in. Results are cached per run so a shared image is stored once.
   */
  private async resolveImage(src: string): Promise<string | null> {
    if (this.resolvedImages.has(src)) return this.resolvedImages.get(src)!;

    let href: string | null = null;
    try {
      const blob = await this.loadImageBlob(src);
      if (blob) href = await this.packageImage(blob, src);
      else
        this.warnings.push(`Image could not be loaded: ${this.srcLabel(src)}`);
    } catch (error) {
      this.logger.warn('EpubGenerator', `Failed to load image ${src}`, error);
      this.warnings.push(`Image could not be loaded: ${this.srcLabel(src)}`);
    }
    this.resolvedImages.set(src, href);
    return href;
  }

  private async loadImageBlob(src: string): Promise<Blob | null> {
    const mediaId = mediaIdFromSrc(src);
    if (mediaId) {
      const project = this.projectStateService.project();
      if (!project) return null;
      return this.localStorage.getMedia(
        `${project.username}/${project.slug}`,
        mediaId
      );
    }
    if (src.trim().toLowerCase().startsWith('data:')) return dataUrlToBlob(src);
    if (/^https?:\/\//i.test(src.trim())) {
      // Bounded so one unresponsive host cannot stall the whole export.
      const response = await fetch(src.trim(), {
        signal: AbortSignal.timeout(REMOTE_IMAGE_TIMEOUT_MS),
      });
      return response.ok ? response.blob() : null;
    }
    return null;
  }

  private async packageImage(blob: Blob, src: string): Promise<string | null> {
    const mediaType = await detectImageType(blob);
    const ext = mediaType ? coreImageExtension(mediaType) : null;
    if (!mediaType || !ext) {
      this.warnings.push(
        `Image type ${mediaType ?? 'unknown'} is not supported by e-readers: ${this.srcLabel(src)}`
      );
      return null;
    }
    const n = this.images.length + 1;
    const href = `images/image_${String(n).padStart(3, '0')}.${ext}`;
    this.images.push({ id: `img${n}`, href, mediaType, blob });
    return href;
  }

  /** A short, log-friendly description of an image source. */
  private srcLabel(src: string): string {
    if (src.startsWith('data:')) return 'embedded image';
    return src.length > 80 ? `${src.slice(0, 77)}...` : src;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private Methods - Document Rendering
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Convert ProseMirror document export to XHTML
   */
  private prosemirrorToHtml(data: unknown): string {
    if (!data) return '';

    // Handle array format from Yjs XmlFragment
    if (Array.isArray(data)) {
      return data
        .map(node => this.nodeToHtml(node as ProseMirrorNode))
        .join('');
    }

    // Handle object format
    if (typeof data === 'object') {
      return this.nodeToHtml(data);
    }

    // Plain strings are text, never markup.
    if (typeof data === 'string') {
      return escapeXml(data);
    }

    return '';
  }

  /**
   * Convert a ProseMirror node to XHTML. Only known node types produce
   * elements, and only whitelisted attributes are emitted, so document JSON
   * can never inject arbitrary markup or break the XHTML content model.
   */
  private nodeToHtml(node: ProseMirrorNode): string {
    if (!node) return '';

    if (typeof node === 'string') return escapeXml(node);
    if (Array.isArray(node)) return node.map(n => this.nodeToHtml(n)).join('');

    const elementRefHtml = this.renderElementRefNode(node);
    if (elementRefHtml !== null) return elementRefHtml;

    const textHtml = this.renderMarkedTextNode(node);
    if (textHtml !== null) return textHtml;

    const lower = epubNodeName(node);
    if (lower === 'image') return this.renderImage(node);

    const children = this.getChildren(node);
    const childHtml = children.map(c => this.nodeToHtml(c)).join('');

    const mapped = this.getTagAndClass(node, lower);
    // Unknown node types (doc wrappers, future extensions) contribute their
    // content without a wrapper element of their own.
    if (!mapped) return childHtml;

    const { tagName, classNames } = mapped;
    const classAttr = classNames.length
      ? ` class="${classNames.join(' ')}"`
      : '';

    if (tagName === 'br') return '<br />';
    if (tagName === 'hr') return `<hr${classAttr} />`;

    const attrs = this.extraAttributes(tagName, node);
    let inner = childHtml;
    if (tagName === 'pre') inner = `<code>${childHtml}</code>`;
    if (tagName.length === 2 && tagName.startsWith('h')) {
      const id = this.recordHeading(Number(tagName[1]), node);
      attrs.unshift(` id="${id}"`);
    }
    return `<${tagName}${classAttr}${attrs.join('')}>${inner}</${tagName}>`;
  }

  /** Give a heading a stable anchor and remember it for the navigation. */
  private recordHeading(level: number, node: ProseMirrorNode): string {
    const id = `ink-h-${++this.headingCounter}`;
    const text = this.plainText(node).trim();
    if (text) this.currentHeadings.push({ level, id, text });
    return id;
  }

  private plainText(node: ProseMirrorNode): string {
    if (!node) return '';
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(n => this.plainText(n)).join('');
    if ('text' in node && typeof node['text'] === 'string') return node['text'];
    if (epubNodeName(node) === 'elementref') {
      const displayText = node.attrs?.['displayText'];
      return typeof displayText === 'string' ? displayText : '';
    }
    return this.getChildren(node)
      .map(c => this.plainText(c))
      .join('');
  }

  /**
   * Element references render as a link when the referenced element is part
   * of this book. The target file is not known yet, so a sentinel href is
   * written and rewritten in {@link resolveElementRefs}.
   */
  private renderElementRefNode(node: ProseMirrorNode): string | null {
    if (
      typeof node !== 'object' ||
      Array.isArray(node) ||
      epubNodeName(node) !== 'elementref'
    ) {
      return null;
    }

    const displayText = node.attrs?.['displayText'];
    if (typeof displayText !== 'string' || !displayText) return '';
    const text = escapeXml(displayText);
    const elementId = node.attrs?.['elementId'];
    if (typeof elementId !== 'string' || !elementId) return text;
    return `<a class="ink-mark-link ink-element-ref" href="${ELEMENT_REF_SCHEME}${escapeXml(elementId)}">${text}</a>`;
  }

  private renderMarkedTextNode(node: ProseMirrorNode): string | null {
    if (
      typeof node !== 'object' ||
      Array.isArray(node) ||
      typeof node.text !== 'string'
    ) {
      return null;
    }
    const name = epubNodeName(node);
    if (name !== 'text' && name !== '') return null;

    let result = escapeXml(String(node.text));
    for (const mark of this.getMarks(node)) {
      result = this.applyMark(result, mark);
    }
    return result;
  }

  private applyMark(
    text: string,
    mark: { type: string; attrs?: Record<string, unknown> }
  ): string {
    const name = canonicalMarkName(mark.type);
    if (name === 'link') {
      const href = sanitizeLinkHref(mark.attrs?.['href']);
      return href
        ? `<a class="ink-mark-link" href="${escapeXml(href)}">${text}</a>`
        : text;
    }
    if (name === 'text_color') {
      const color = sanitizeCssColor(mark.attrs?.['color']);
      return color
        ? `<span class="ink-mark-color" style="color: ${color};">${text}</span>`
        : text;
    }
    if (name === 'text_background_color') {
      const color = sanitizeCssColor(mark.attrs?.['backgroundColor']);
      return color
        ? `<span class="ink-mark-highlight" style="background-color: ${color};">${text}</span>`
        : text;
    }
    const wrapper = SIMPLE_MARK_WRAPPERS[name];
    if (wrapper) {
      return `<${wrapper.tag} class="${wrapper.cls}">${text}</${wrapper.tag}>`;
    }
    // Comments and unknown marks are not rendered.
    return text;
  }

  /**
   * Render an inline image from the per-run image cache. A missing image
   * renders as a visible placeholder so the gap is obvious in the output.
   */
  private renderImage(node: ProseMirrorNode): string {
    const attrs =
      typeof node === 'object' && node && !Array.isArray(node)
        ? (node.attrs ?? {})
        : {};
    const rawSrc = attrs['src'];
    const alt = typeof attrs['alt'] === 'string' ? attrs['alt'] : '';
    const title = typeof attrs['title'] === 'string' ? attrs['title'] : '';
    const href =
      typeof rawSrc === 'string'
        ? (this.resolvedImages.get(rawSrc) ?? null)
        : null;

    if (!href) {
      const label = alt ? `Image unavailable: ${alt}` : 'Image unavailable';
      return `<span class="ink-doc-image-missing">[${escapeXml(label)}]</span>`;
    }

    const titleAttr = title ? ` title="${escapeXml(title)}"` : '';
    return `<img class="ink-doc-image" src="${href}" alt="${escapeXml(alt)}"${titleAttr} />`;
  }

  private getTagAndClass(
    node: ProseMirrorNode,
    lower: string
  ): { tagName: string; classNames: string[] } | null {
    if (lower === 'heading') {
      const attrs =
        typeof node === 'object' && node && !Array.isArray(node)
          ? node.attrs
          : undefined;
      const level = clampLevel(Number(attrs?.['level'] ?? 1));
      return {
        tagName: `h${level}`,
        classNames: [
          `ink-doc-heading-${level}`,
          ...this.blockLayoutClasses(node),
        ],
      };
    }

    const mapped = EPUB_NODE_TAG_MAP[lower];
    if (!mapped) return null;

    const classNames = mapped.cls ? [mapped.cls] : [];
    if (TABLE_CELL_NAMES.has(lower)) {
      const align = alignClass(node);
      if (align) classNames.push(align);
    } else if (ALIGNABLE_TAGS.has(mapped.tag)) {
      classNames.push(...this.blockLayoutClasses(node));
    }
    return { tagName: mapped.tag, classNames };
  }

  /** Alignment and indent classes from ngx-editor's block attributes. */
  private blockLayoutClasses(node: ProseMirrorNode): string[] {
    const out: string[] = [];
    const align = alignClass(node);
    if (align) out.push(align);
    const attrs =
      typeof node === 'object' && node && !Array.isArray(node)
        ? node.attrs
        : undefined;
    const indent = Number(attrs?.['indent']);
    if (Number.isInteger(indent) && indent > 0) {
      out.push(`ink-doc-indent-${Math.min(indent, MAX_INDENT)}`);
    }
    return out;
  }

  /** The few attributes each tag may carry; everything else is dropped. */
  private extraAttributes(tagName: string, node: ProseMirrorNode): string[] {
    const attrs =
      typeof node === 'object' && node && !Array.isArray(node)
        ? (node.attrs ?? {})
        : {};
    const out: string[] = [];
    if (tagName === 'ol') {
      const start = intAbove1(attrs['order'] ?? attrs['start']);
      if (start) out.push(` start="${start}"`);
    }
    if (tagName === 'td' || tagName === 'th') {
      const colspan = intAbove1(attrs['colspan']);
      const rowspan = intAbove1(attrs['rowspan']);
      if (colspan) out.push(` colspan="${colspan}"`);
      if (rowspan) out.push(` rowspan="${rowspan}"`);
    }
    return out;
  }

  private getChildren(node: ProseMirrorNode): ProseMirrorNode[] {
    if (typeof node !== 'object' || !node || Array.isArray(node)) return [];

    if ('content' in node && Array.isArray(node.content)) {
      return node.content;
    }

    if ('children' in node && Array.isArray(node.children)) {
      return node.children;
    }

    return [];
  }

  private getMarks(
    node: ProseMirrorNode
  ): { type: string; attrs?: Record<string, unknown> }[] {
    if (typeof node !== 'object' || !node) return [];
    const marks = (node as Record<string, unknown>)['marks'];
    if (!Array.isArray(marks)) return [];
    return marks
      .map(m => {
        if (typeof m === 'string') return { type: m };
        if (typeof m === 'object' && m && 'type' in m) {
          const rec = m as Record<string, unknown>;
          const attrs = rec['attrs'];
          return {
            type: String(rec['type']),
            attrs:
              attrs && typeof attrs === 'object'
                ? (attrs as Record<string, unknown>)
                : undefined,
          };
        }
        return { type: '' };
      })
      .filter(m => m.type);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private Methods - Front/back matter, separators, worldbuilding
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Process frontmatter item
   */
  private processFrontmatter(
    item: FrontmatterItem,
    metadata: PublishMetadata
  ): Chapter {
    let body: string;
    let title: string;
    let epubType: string;

    switch (item.contentType) {
      case FrontmatterType.TitlePage:
        title = 'Title Page';
        epubType = 'titlepage';
        body = this.generateTitlePage(metadata);
        break;

      case FrontmatterType.Copyright:
        title = 'Copyright';
        epubType = 'copyright-page';
        body = this.generateCopyrightPage(metadata);
        break;

      case FrontmatterType.Dedication:
        title = 'Dedication';
        epubType = 'dedication';
        body = `<div class="ink-frontmatter ink-frontmatter-dedication">\n${
          textToParagraphs(item.customContent || '') || '<p>Dedication</p>'
        }\n</div>`;
        break;

      case FrontmatterType.Custom:
        title = item.customTitle || 'Frontmatter';
        epubType = 'preface';
        body = this.titledMatter(
          'frontmatter',
          item.customTitle,
          item.customContent
        );
        break;

      default:
        title = 'Frontmatter';
        epubType = 'preface';
        body = '';
    }

    return {
      id: `frontmatter-${item.id}`,
      title,
      kind: 'frontmatter',
      filename: '',
      body,
      level: 0,
      part: 'frontmatter',
      epubType,
      // Title and copyright pages are not usually listed in a contents page.
      inToc:
        item.contentType !== FrontmatterType.TitlePage &&
        item.contentType !== FrontmatterType.Copyright,
      headings: [],
    };
  }

  /**
   * Scene and chapter breaks belong to the end of the preceding chapter; a
   * content document holding only a break would show up as a near-blank
   * page. Page breaks need nothing: every content document starts a page.
   */
  private applySeparator(
    item: SeparatorItem,
    slots: Slot[],
    options: PublishOptions
  ): void {
    let markup: string;
    switch (item.style) {
      case SeparatorStyle.SceneBreak:
        markup = `<p class="ink-scene-break" role="separator">${escapeXml(
          item.customText || options.sceneBreakText || '* * *'
        )}</p>`;
        break;
      case SeparatorStyle.ChapterBreak:
        markup = '<hr class="ink-chapter-break" />';
        break;
      default:
        return;
    }

    for (let i = slots.length - 1; i >= 0; i--) {
      const slot = slots[i];
      if (slot.type === 'chapter') {
        slot.chapter.body += `\n${markup}`;
        return;
      }
    }
    // A break before any content has nothing to separate.
  }

  /**
   * Process backmatter item
   */
  private processBackmatter(
    item: BackmatterItem,
    metadata: PublishMetadata
  ): Chapter {
    let body: string;
    let title: string;
    let epubType: string;

    switch (item.contentType) {
      case BackmatterType.AboutAuthor:
        title = 'About the Author';
        epubType = 'contributors';
        body = this.titledMatter(
          'backmatter',
          title,
          item.customContent || metadata.author
        );
        break;

      case BackmatterType.Acknowledgments:
        title = 'Acknowledgments';
        epubType = 'acknowledgments';
        body = this.titledMatter('backmatter', title, item.customContent);
        break;

      case BackmatterType.Custom:
        title = item.customTitle || 'Backmatter';
        epubType = 'appendix';
        body = this.titledMatter(
          'backmatter',
          item.customTitle,
          item.customContent
        );
        break;

      default:
        title = 'Backmatter';
        epubType = 'appendix';
        body = '';
    }

    return {
      id: `backmatter-${item.id}`,
      title,
      kind: 'backmatter',
      filename: '',
      body,
      level: 0,
      part: 'backmatter',
      epubType,
      inToc: true,
      headings: [],
    };
  }

  /** A heading plus paragraphs of plain text, for front/back matter pages. */
  private titledMatter(
    part: 'frontmatter' | 'backmatter',
    title: string | undefined,
    text: string | undefined
  ): string {
    const heading = title
      ? `<h2 class="ink-${part}-title">${escapeXml(title)}</h2>\n`
      : '';
    return `<div class="ink-${part}">\n${heading}${textToParagraphs(text || '')}\n</div>`;
  }

  /**
   * Build a minimal {@link WorldbuildingItem} for a single worldbuilding
   * element added inline via the publish plan. Suppresses section title.
   */
  private singleEntryWbItem(elementId: string): WorldbuildingItem {
    return {
      id: `wb-inline-${elementId}`,
      type: PublishPlanItemType.Worldbuilding,
      categories: [],
      format: 'inline',
      title: '',
    };
  }

  /**
   * Render the inner XHTML for a single inline worldbuilding element,
   * wrapped in the standard `<section class="ink-wb-section">` so global
   * WB styles still apply. Returns an empty string when no entry is
   * produced.
   */
  private async renderInlineWbHtml(
    item: WorldbuildingItem,
    elements: Element[]
  ): Promise<string> {
    const entries = await this.worldbuildingRenderer.renderItem(item, elements);
    if (entries.length === 0) return '';
    const parts: string[] = [`<div class="ink-wb-section">`];
    for (const entry of entries) {
      parts.push(await this.renderWorldbuildingEntry(entry));
    }
    parts.push('</div>');
    return parts.join('\n');
  }

  /**
   * Process a Worldbuilding plan item into a single EPUB chapter (one file
   * containing all included entries).
   */
  private async processWorldbuilding(
    item: WorldbuildingItem,
    elements: Element[]
  ): Promise<Chapter[]> {
    const entries = await this.worldbuildingRenderer.renderItem(item, elements);
    if (entries.length === 0) return [];
    const title = item.title || 'Worldbuilding';
    const parts: string[] = [];
    parts.push(`<div class="ink-wb-section">`);
    if (item.title) {
      parts.push(
        `<h2 class="ink-wb-section-title">${escapeXml(item.title)}</h2>`
      );
    }
    for (const entry of entries) {
      parts.push(await this.renderWorldbuildingEntry(entry));
    }
    parts.push('</div>');
    return [
      {
        id: `worldbuilding-${item.id}`,
        title,
        kind: 'worldbuilding',
        filename: '',
        body: parts.join('\n'),
        level: 0,
        part: item.format === 'appendix' ? 'backmatter' : 'bodymatter',
        epubType: item.format === 'appendix' ? 'appendix' : 'chapter',
        inToc: true,
        headings: [],
      },
    ];
  }

  private async renderWorldbuildingEntry(
    entry: RenderedWorldbuildingEntry
  ): Promise<string> {
    const layoutClass = `ink-wb-layout-${this.cssSafe(entry.layout)}`;
    const schemaClass = entry.schemaId
      ? ` ink-wb-schema-${this.cssSafe(entry.schemaId)}`
      : '';
    const parts: string[] = [];
    parts.push(
      `<article class="ink-wb-entry ${layoutClass}${schemaClass}">`,
      `<h3 class="ink-wb-entry-title">${escapeXml(entry.title)}</h3>`
    );
    if (entry.imageRef) {
      const href = await this.resolveImage(entry.imageRef);
      if (href) {
        parts.push(
          `<img class="ink-wb-entry-image" src="${href}" alt="${escapeXml(entry.title)}" />`
        );
      }
    }
    if (entry.description) {
      parts.push(
        `<p class="ink-wb-entry-description">${escapeXml(entry.description)}</p>`
      );
    }
    for (const tab of entry.tabs) {
      parts.push(
        `<section class="ink-wb-tab" data-tab="${this.cssSafe(tab.key)}">`,
        `<h4 class="ink-wb-tab-heading">${escapeXml(tab.label)}</h4>`,
        '<dl class="ink-wb-fields">'
      );
      for (const f of tab.fields) {
        parts.push(
          `<dt class="ink-wb-field-label">${escapeXml(f.label)}</dt>`,
          `<dd class="ink-wb-field-value">${escapeXml(f.displayValue)}</dd>`
        );
      }
      parts.push('</dl>', '</section>');
    }
    parts.push('</article>');
    return parts.join('\n');
  }

  private cssSafe(s: string): string {
    return s.replaceAll(/[^a-zA-Z0-9_-]/g, '-');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private Methods - EPUB Structure
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Give every content document a unique filename. Numbering is global
   * across the whole book so two items can never write the same file.
   */
  private assignFilenames(chapters: Chapter[]): void {
    chapters.forEach((chapter, i) => {
      chapter.filename = `${chapter.kind}_${String(i + 1).padStart(3, '0')}.xhtml`;
    });
  }

  /**
   * Point element references at the chapter that holds the referenced
   * element, or drop the link (keeping its text) when that element is not
   * part of the book.
   */
  private resolveElementRefs(chapters: Chapter[]): void {
    const fileById = new Map<string, string>();
    for (const chapter of chapters) {
      if (!fileById.has(chapter.id)) fileById.set(chapter.id, chapter.filename);
    }
    const pattern = new RegExp(
      `<a class="ink-mark-link ink-element-ref" href="${ELEMENT_REF_SCHEME}([^"]*)">([^<]*)</a>`,
      'g'
    );
    for (const chapter of chapters) {
      chapter.body = chapter.body.replaceAll(
        pattern,
        (_match, escapedId: string, text: string) => {
          const id = this.unescapeXml(escapedId);
          const file = fileById.get(id);
          if (!file || file === chapter.filename) return text;
          return `<a class="ink-mark-link ink-element-ref" href="${file}">${text}</a>`;
        }
      );
    }
  }

  private unescapeXml(str: string): string {
    return str
      .replaceAll('&quot;', '"')
      .replaceAll('&#39;', "'")
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&amp;', '&');
  }

  /**
   * Add container.xml to the EPUB
   */
  private addContainerXml(zip: JSZip): void {
    const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

    zip.file('META-INF/container.xml', containerXml);
  }

  /**
   * Add all content files to the EPUB
   */
  private async addContentFiles(
    zip: JSZip,
    slots: Slot[],
    plan: PublishPlan
  ): Promise<void> {
    const metadata = plan.metadata;
    const language = normalizeLanguage(metadata.language);
    const chapters = this.chaptersOf(slots);
    const tocSlot = slots.find(s => s.type === 'toc');
    const toc = this.buildTableOfContents(slots);

    // Add cover image if available
    if (this.coverImageData) {
      const ext = this.getCoverImageExtension();
      zip.file(`OEBPS/images/cover.${ext}`, this.coverImageData.blob);

      // Add cover page XHTML
      zip.file(
        'OEBPS/cover.xhtml',
        this.generateCoverPage(ext, metadata.title, language)
      );
    }

    for (const image of this.images) {
      zip.file(`OEBPS/${image.href}`, image.blob);
    }

    // Add chapters
    for (const chapter of chapters) {
      zip.file(
        `OEBPS/${chapter.filename}`,
        this.wrapInXhtml(chapter, metadata.title, language)
      );
    }

    // Add stylesheet
    zip.file(
      'OEBPS/styles.css',
      this.generateStylesheet(plan.styles ?? createDefaultPublishStyles())
    );

    const identifier = await this.bookIdentifier(plan);

    // Add OPF (package) file
    zip.file(
      'OEBPS/content.opf',
      this.generateOpf(slots, metadata, identifier, language)
    );

    // Add NCX (navigation) file
    zip.file('OEBPS/toc.ncx', this.generateNcx(toc, metadata, identifier));

    // Add NAV (EPUB3 navigation) file
    zip.file(
      'OEBPS/nav.xhtml',
      this.generateNav(
        toc,
        chapters,
        language,
        tocSlot?.type === 'toc' ? tocSlot.item : null
      )
    );
  }

  /**
   * The package identifier. An ISBN wins; otherwise a UUID derived from the
   * project and plan, so every export of the same plan is recognised by
   * reading systems as the same book.
   */
  private async bookIdentifier(plan: PublishPlan): Promise<string> {
    const isbn = normalizeIsbn(plan.metadata.isbn);
    if (isbn) return `urn:isbn:${isbn}`;
    const project = this.projectStateService.project();
    const seed = `inkweld:${project?.username ?? ''}/${project?.slug ?? ''}:${plan.id}`;
    return `urn:uuid:${await stableUuid(seed)}`;
  }

  /**
   * Get file extension for cover image based on MIME type
   */
  private getCoverImageExtension(): string {
    if (!this.coverImageData) return 'jpg';
    return coreImageExtension(this.coverImageData.mimeType) ?? 'jpg';
  }

  /**
   * Generate cover page XHTML
   */
  private generateCoverPage(
    imageExt: string,
    bookTitle: string,
    language: string
  ): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"${this.langAttrs(language)}>
<head>
  <title>Cover</title>
  <style>
    html, body { margin: 0; padding: 0; height: 100%; }
    .ink-cover { height: 100%; margin: 0; padding: 0; text-align: center; page-break-after: always; }
    .ink-cover img { max-width: 100%; max-height: 100%; }
  </style>
</head>
<body epub:type="cover">
  <section class="ink-cover" epub:type="cover">
    <img role="doc-cover" src="images/cover.${imageExt}" alt="${escapeXml(`Cover of ${bookTitle}`)}"/>
  </section>
</body>
</html>`;
  }

  /**
   * Build the book's navigation tree from reading order. Folder groups nest
   * their children, and headings inside a chapter become its sub-entries.
   */
  private buildTableOfContents(slots: Slot[]): NavNode[] {
    const flat: FlatNavEntry[] = [];
    for (const slot of slots) {
      if (slot.type === 'group') {
        flat.push({ title: slot.title, level: slot.level });
        continue;
      }
      if (slot.type !== 'chapter') continue;
      const chapter = slot.chapter;
      if (!chapter.inToc || !chapter.title) continue;
      flat.push({
        title: chapter.title,
        href: chapter.filename,
        level: chapter.level,
      });
      flat.push(...this.headingEntries(chapter));
    }
    return buildNavTree(flat);
  }

  /**
   * Navigation entries for the headings inside a chapter, nested below it.
   * A leading heading that repeats the chapter's own title is skipped, since
   * documents commonly open with their title.
   */
  private headingEntries(chapter: Chapter): FlatNavEntry[] {
    const headings = chapter.headings.filter(
      h => h.level <= MAX_NAV_HEADING_LEVEL
    );
    const titles = [chapter.title, chapter.rawTitle]
      .filter(Boolean)
      .map(t => t!.trim().toLowerCase());
    if (headings.length && titles.includes(headings[0].text.toLowerCase())) {
      headings.shift();
    }
    if (headings.length === 0) return [];
    const minLevel = Math.min(...headings.map(h => h.level));
    return headings.map(h => ({
      title: h.text,
      href: `${chapter.filename}#${h.id}`,
      level: chapter.level + 1 + (h.level - minLevel),
    }));
  }

  /**
   * Generate OPF (package) file
   */
  private generateOpf(
    slots: Slot[],
    metadata: PublishMetadata,
    identifier: string,
    language: string
  ): string {
    const chapters = this.chaptersOf(slots);
    const hasCover = this.coverImageData !== null;
    const now = new Date();
    const coverExt = this.getCoverImageExtension();
    const coverMimeType = this.coverImageData?.mimeType || 'image/jpeg';

    // Build manifest items
    const manifestParts: string[] = [];

    // Add cover items if present
    if (hasCover) {
      manifestParts.push(
        `    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>`,
        `    <item id="cover-image" href="images/cover.${coverExt}" media-type="${coverMimeType}" properties="cover-image"/>`
      );
    }

    for (const image of this.images) {
      manifestParts.push(
        `    <item id="${image.id}" href="${image.href}" media-type="${image.mediaType}"/>`
      );
    }

    chapters.forEach((ch, i) => {
      manifestParts.push(
        `    <item id="chapter${i}" href="${ch.filename}" media-type="application/xhtml+xml"/>`
      );
    });

    const manifestItems = manifestParts.join('\n');

    // Build spine items in reading order (cover first if present)
    const spineParts: string[] = [];
    if (hasCover) {
      spineParts.push(`    <itemref idref="cover"/>`);
    }
    let chapterIndex = 0;
    for (const slot of slots) {
      if (slot.type === 'chapter') {
        spineParts.push(`    <itemref idref="chapter${chapterIndex++}"/>`);
      } else if (slot.type === 'toc') {
        spineParts.push(`    <itemref idref="nav"/>`);
      }
    }
    const spineItems = spineParts.join('\n');
    const rtl = isRtlLanguage(language)
      ? ' page-progression-direction="rtl"'
      : '';

    return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookId" xml:lang="${language}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
${this.opfMetadata(metadata, identifier, language, now, hasCover)}
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="css" href="styles.css" media-type="text/css"/>
${manifestItems}
  </manifest>
  <spine toc="ncx"${rtl}>
${spineItems}
  </spine>
${this.opfGuide(slots, hasCover)}
</package>`;
  }

  /** The `<metadata>` children: Dublin Core, refinements and a11y. */
  private opfMetadata(
    metadata: PublishMetadata,
    identifier: string,
    language: string,
    now: Date,
    hasCover: boolean
  ): string {
    const lines: string[] = [
      `<dc:identifier id="BookId">${escapeXml(identifier)}</dc:identifier>`,
      `<dc:title id="title">${escapeXml(metadata.title || 'Untitled')}</dc:title>`,
      `<meta refines="#title" property="title-type">main</meta>`,
    ];
    if (metadata.subtitle) {
      lines.push(
        `<dc:title id="subtitle">${escapeXml(metadata.subtitle)}</dc:title>`,
        `<meta refines="#subtitle" property="title-type">subtitle</meta>`
      );
    }
    if (metadata.author) {
      lines.push(
        `<dc:creator id="creator">${escapeXml(metadata.author)}</dc:creator>`,
        `<meta refines="#creator" property="role" scheme="marc:relators">aut</meta>`
      );
      if (metadata.authorSort) {
        lines.push(
          `<meta refines="#creator" property="file-as">${escapeXml(metadata.authorSort)}</meta>`
        );
      }
    }
    lines.push(
      `<dc:language>${language}</dc:language>`,
      `<dc:date>${now.toISOString().slice(0, 10)}</dc:date>`
    );
    if (metadata.publisher) {
      lines.push(
        `<dc:publisher>${escapeXml(metadata.publisher)}</dc:publisher>`
      );
    }
    if (metadata.description) {
      lines.push(
        `<dc:description>${escapeXml(metadata.description)}</dc:description>`
      );
    }
    if (metadata.copyright) {
      lines.push(`<dc:rights>${escapeXml(metadata.copyright)}</dc:rights>`);
    }
    for (const keyword of metadata.keywords ?? []) {
      if (keyword.trim()) {
        lines.push(`<dc:subject>${escapeXml(keyword.trim())}</dc:subject>`);
      }
    }
    if (metadata.series) {
      lines.push(
        `<meta property="belongs-to-collection" id="series">${escapeXml(metadata.series)}</meta>`,
        `<meta refines="#series" property="collection-type">series</meta>`
      );
      if (metadata.seriesNumber !== undefined) {
        lines.push(
          `<meta refines="#series" property="group-position">${metadata.seriesNumber}</meta>`
        );
      }
      // Calibre's EPUB 2 series metadata, read by Calibre and Kobo.
      lines.push(
        `<meta name="calibre:series" content="${escapeXml(metadata.series)}"/>`
      );
      if (metadata.seriesNumber !== undefined) {
        lines.push(
          `<meta name="calibre:series_index" content="${metadata.seriesNumber}"/>`
        );
      }
    }
    if (hasCover) {
      // EPUB 2 cover hint, still required by Kindle and older readers.
      lines.push(`<meta name="cover" content="cover-image"/>`);
    }
    lines.push(...this.accessibilityMetadata());
    lines.push(
      `<meta property="dcterms:modified">${epubTimestamp(now)}</meta>`
    );
    return lines.map(l => `    ${l}`).join('\n');
  }

  /**
   * Schema.org accessibility metadata (EPUB Accessibility 1.1). Stores and
   * library platforms surface these, and EPUBCheck/Ace report their absence.
   */
  private accessibilityMetadata(): string[] {
    const hasImages = this.images.length > 0 || this.coverImageData !== null;
    const lines = [
      `<meta property="schema:accessMode">textual</meta>`,
      ...(hasImages
        ? [`<meta property="schema:accessMode">visual</meta>`]
        : []),
      `<meta property="schema:accessModeSufficient">textual</meta>`,
      `<meta property="schema:accessibilityFeature">structuralNavigation</meta>`,
      `<meta property="schema:accessibilityFeature">tableOfContents</meta>`,
      `<meta property="schema:accessibilityFeature">readingOrder</meta>`,
      `<meta property="schema:accessibilityHazard">none</meta>`,
      `<meta property="schema:accessibilitySummary">This publication includes structural navigation and a table of contents, and its reading order matches the order of the text.</meta>`,
    ];
    return lines;
  }

  /** EPUB 2 `<guide>`; Kindle uses it to find the cover and the start. */
  private opfGuide(slots: Slot[], hasCover: boolean): string {
    const refs: string[] = [];
    if (hasCover) {
      refs.push(
        `    <reference type="cover" title="Cover" href="cover.xhtml"/>`
      );
    }
    if (slots.some(s => s.type === 'toc')) {
      refs.push(
        `    <reference type="toc" title="Table of Contents" href="nav.xhtml"/>`
      );
    }
    const start = this.startOfContent(this.chaptersOf(slots));
    if (start) {
      refs.push(
        `    <reference type="text" title="Start of Content" href="${start.filename}"/>`
      );
    }
    if (refs.length === 0) return '';
    return `  <guide>\n${refs.join('\n')}\n  </guide>`;
  }

  /** The first body chapter, where "start reading" should land. */
  private startOfContent(chapters: Chapter[]): Chapter | undefined {
    return chapters.find(c => c.part === 'bodymatter') ?? chapters[0];
  }

  /**
   * Generate NCX (navigation) file
   */
  private generateNcx(
    toc: NavNode[],
    metadata: PublishMetadata,
    identifier: string
  ): string {
    let playOrder = 0;
    const render = (nodes: NavNode[], indent: string): string =>
      nodes
        .map(node => {
          const href = firstHref(node);
          if (!href) return '';
          playOrder++;
          const children = render(node.children, `${indent}  `);
          return `
${indent}<navPoint id="navPoint-${playOrder}" playOrder="${playOrder}">
${indent}  <navLabel>
${indent}    <text>${escapeXml(node.title)}</text>
${indent}  </navLabel>
${indent}  <content src="${href}"/>${children}
${indent}</navPoint>`;
        })
        .join('');

    const navPoints = render(toc, '    ');

    return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${escapeXml(identifier)}"/>
    <meta name="dtb:depth" content="${Math.max(1, navTreeDepth(toc))}"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>${escapeXml(metadata.title)}</text>
  </docTitle>
  <navMap>${navPoints}
  </navMap>
</ncx>`;
  }

  /**
   * Generate NAV (EPUB3 navigation) file. It doubles as the visible table
   * of contents when the plan places one in reading order: levels deeper
   * than the plan's TOC depth stay available to the reader's navigation
   * but are hidden on the page.
   */
  private generateNav(
    toc: NavNode[],
    chapters: Chapter[],
    language: string,
    tocItem: TableOfContentsItem | null
  ): string {
    const title = tocItem?.title || 'Table of Contents';
    const visibleDepth = Math.max(1, tocItem?.depth ?? 1);

    const render = (nodes: NavNode[], indent: string): string =>
      nodes
        .map(node => {
          const label = node.href
            ? `<a href="${node.href}">${escapeXml(node.title)}</a>`
            : `<span>${escapeXml(node.title)}</span>`;
          const hidden =
            node.depth + 1 >= visibleDepth && tocItem ? ' hidden=""' : '';
          const children = node.children.length
            ? `\n${indent}  <ol${hidden}>\n${render(node.children, `${indent}    `)}\n${indent}  </ol>\n${indent}`
            : '';
          return `${indent}<li class="ink-toc-entry" data-level="${node.depth + 1}">${label}${children}</li>`;
        })
        .join('\n');

    const landmarks: string[] = [];
    if (this.coverImageData) {
      landmarks.push(
        `      <li><a epub:type="cover" href="cover.xhtml">Cover</a></li>`
      );
    }
    landmarks.push(
      `      <li><a epub:type="toc" href="nav.xhtml">${escapeXml(title)}</a></li>`
    );
    const start = this.startOfContent(chapters);
    if (start) {
      landmarks.push(
        `      <li><a epub:type="bodymatter" href="${start.filename}">Start of Content</a></li>`
      );
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"${this.langAttrs(language)}>
<head>
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body epub:type="frontmatter">
  <nav epub:type="toc" id="toc" role="doc-toc">
    <h1 class="ink-toc-title">${escapeXml(title)}</h1>
    <ol>
${render(toc, '      ')}
    </ol>
  </nav>
  <nav epub:type="landmarks" id="landmarks" hidden="">
    <h2>Landmarks</h2>
    <ol>
${landmarks.join('\n')}
    </ol>
  </nav>
</body>
</html>`;
  }

  /**
   * Generate stylesheet
   */
  private generateStylesheet(styles: PublishStyles): string {
    return [
      this.cssEmitter.emitEpubStylesheet(styles),
      // Structural rules the EPUB markup relies on regardless of styling.
      '.ink-doc-align-justify { text-align: justify; }',
      '.ink-doc-image { max-width: 100%; height: auto; }',
      'figure.ink-doc-figure { margin: 1em 0; text-align: center; page-break-inside: avoid; }',
      'h1, h2, h3, h4, h5, h6 { page-break-after: avoid; page-break-inside: avoid; }',
      'table, tr, img { page-break-inside: avoid; }',
      '.ink-scene-break { text-align: center; text-indent: 0; }',
      'nav#toc ol { list-style-type: none; padding-left: 0; }',
      'nav#toc ol ol { padding-left: 1.5em; }',
      'nav#toc a { text-decoration: none; }',
    ].join('\n');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private Methods - Utilities
  // ─────────────────────────────────────────────────────────────────────────────

  private langAttrs(language: string): string {
    const dir = isRtlLanguage(language) ? ' dir="rtl"' : '';
    return ` xml:lang="${language}" lang="${language}"${dir}`;
  }

  /**
   * Wrap a chapter's body in an XHTML content document with structural
   * semantics (`epub:type` plus the matching DPUB-ARIA role).
   */
  private wrapInXhtml(
    chapter: Chapter,
    bookTitle: string,
    language: string
  ): string {
    const title = chapter.title || bookTitle || 'Untitled';
    const role = this.ariaRole(chapter.epubType);
    const roleAttr = role ? ` role="${role}"` : '';
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"${this.langAttrs(language)}>
<head>
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body epub:type="${chapter.part}">
<section epub:type="${chapter.epubType}"${roleAttr} aria-label="${escapeXml(title)}">
${chapter.body}
</section>
</body>
</html>`;
  }

  /** DPUB-ARIA role for an `epub:type`, where a matching one exists. */
  private ariaRole(epubType: string): string | null {
    switch (epubType) {
      case 'chapter':
        return 'doc-chapter';
      case 'dedication':
        return 'doc-dedication';
      case 'preface':
        return 'doc-preface';
      case 'acknowledgments':
        return 'doc-acknowledgments';
      case 'appendix':
        return 'doc-appendix';
      default:
        return null;
    }
  }

  /**
   * Format chapter title with numbering
   */
  private formatChapterTitle(
    title: string,
    chapterNumber: number,
    isChapter: boolean,
    options: PublishOptions
  ): string {
    if (!isChapter || options.chapterNumbering === ChapterNumbering.None) {
      return title;
    }

    let prefix = '';
    switch (options.chapterNumbering) {
      case ChapterNumbering.Numeric:
        prefix = `Chapter ${chapterNumber + 1}: `;
        break;
      case ChapterNumbering.Roman:
        prefix = `Chapter ${this.toRoman(chapterNumber + 1)}: `;
        break;
      case ChapterNumbering.Written:
        prefix = `Chapter ${this.toWritten(chapterNumber + 1)}: `;
        break;
    }

    return prefix + title;
  }

  /**
   * Generate title page HTML
   */
  private generateTitlePage(metadata: PublishMetadata): string {
    const series = metadata.series
      ? `\n  <p class="ink-frontmatter-series">${escapeXml(
          metadata.seriesNumber === undefined
            ? metadata.series
            : `${metadata.series}, Book ${metadata.seriesNumber}`
        )}</p>`
      : '';
    return `<div class="ink-frontmatter ink-frontmatter-title">
  <h1 class="ink-frontmatter-title-text">${escapeXml(metadata.title)}</h1>
  ${metadata.subtitle ? `<p class="ink-frontmatter-subtitle">${escapeXml(metadata.subtitle)}</p>` : ''}
  <p class="ink-frontmatter-author">${escapeXml(metadata.author)}</p>${series}
</div>`;
  }

  /**
   * Generate copyright page HTML
   */
  private generateCopyrightPage(metadata: PublishMetadata): string {
    const year = new Date().getFullYear();
    return `<div class="ink-frontmatter ink-frontmatter-copyright">
  <p>${escapeXml(metadata.copyright || `Copyright © ${year} ${metadata.author}`)}</p>
  <p>All rights reserved.</p>
  ${metadata.publisher ? `<p>Published by ${escapeXml(metadata.publisher)}</p>` : ''}
  ${metadata.isbn ? `<p>ISBN: ${escapeXml(metadata.isbn)}</p>` : ''}
</div>`;
  }

  /**
   * Convert number to Roman numerals
   */
  private toRoman(num: number): string {
    const romanNumerals: [number, string][] = [
      [1000, 'M'],
      [900, 'CM'],
      [500, 'D'],
      [400, 'CD'],
      [100, 'C'],
      [90, 'XC'],
      [50, 'L'],
      [40, 'XL'],
      [10, 'X'],
      [9, 'IX'],
      [5, 'V'],
      [4, 'IV'],
      [1, 'I'],
    ];

    let result = '';
    let remaining = num;

    for (const [value, symbol] of romanNumerals) {
      while (remaining >= value) {
        result += symbol;
        remaining -= value;
      }
    }

    return result;
  }

  /**
   * Convert number to written form
   */
  private toWritten(num: number): string {
    const words = [
      '',
      'One',
      'Two',
      'Three',
      'Four',
      'Five',
      'Six',
      'Seven',
      'Eight',
      'Nine',
      'Ten',
      'Eleven',
      'Twelve',
      'Thirteen',
      'Fourteen',
      'Fifteen',
      'Sixteen',
      'Seventeen',
      'Eighteen',
      'Nineteen',
    ];
    const tens = [
      '',
      '',
      'Twenty',
      'Thirty',
      'Forty',
      'Fifty',
      'Sixty',
      'Seventy',
      'Eighty',
      'Ninety',
    ];

    if (num < 20) return words[num];
    if (num < 100) {
      return (
        tens[Math.floor(num / 10)] + (num % 10 ? '-' + words[num % 10] : '')
      );
    }
    return String(num);
  }

  /**
   * Generate filename from title
   */
  private generateFilename(title: string): string {
    const slug = title
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replaceAll(/^-|-$/g, '');
    return `${slug || 'book'}.epub`;
  }

  /**
   * Count words in XHTML body content
   */
  private countWords(html: string): number {
    const text = html.replaceAll(/<[^<>]*>/g, ' ');
    const words = text.split(/\s+/).filter(w => w.length > 0);
    return words.length;
  }

  /**
   * Format file size for display
   */
  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

/**
 * Type for ProseMirror node structure (exported from Yjs XmlFragment)
 */
type ProseMirrorNode =
  | string
  | ProseMirrorNode[]
  | {
      nodeName?: string;
      type?: string;
      text?: string;
      attrs?: Record<string, unknown>;
      content?: ProseMirrorNode[];
      children?: ProseMirrorNode[];
    };
