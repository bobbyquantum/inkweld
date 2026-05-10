import { inject, Injectable } from '@angular/core';
import { type Element, ElementType } from '@inkweld/index';
import {
  createDefaultPublishStyles,
  type PublishStyles,
} from '@models/publish-style';
import JSZip from '@progress/jszip-esm';
import { BehaviorSubject, type Observable, Subject } from 'rxjs';

import {
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
  type WorldbuildingItem,
} from '../../models/publish-plan';
import { isWorldbuildingType } from '../../utils/worldbuilding.utils';
import { LoggerService } from '../core/logger.service';
import { LocalStorageService } from '../local/local-storage.service';
import { DocumentService } from '../project/document.service';
import { ProjectStateService } from '../project/project-state.service';
import { PublishCssEmitterService } from './publish-css-emitter.service';
import { applyMarks, MARK_TAGS } from './publish-marks-helper';
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

/**
 * Internal chapter representation
 */
interface Chapter {
  id: string;
  title: string;
  filename: string;
  content: string;
  order: number;
  level: number;
}

/**
 * Table of contents entry
 */
interface TocEntry {
  title: string;
  href: string;
  level: number;
  children?: TocEntry[];
}

/**
 * Service for generating EPUB files client-side.
 *
 * Uses JSZip to create the EPUB package and converts
 * ProseMirror/Yjs content to EPUB-compatible XHTML.
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
  private readonly localStorage = inject(LocalStorageService);
  private readonly cssEmitter = inject(PublishCssEmitterService);
  private readonly worldbuildingRenderer = inject(
    WorldbuildingPublishRendererService
  );

  // Cover image data (set during generation)
  private coverImageData: { blob: Blob; mimeType: string } | null = null;

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
    this.coverImageData = null;
    const startTime = Date.now();
    const result: EpubResult = {
      success: false,
      warnings: [],
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
      const chapters = await this.processContent(plan, result);

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

      const toc = this.buildTableOfContents(chapters, plan);

      // Add all content files
      this.addContentFiles(zip, chapters, toc, plan);

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
        (sum, ch) => sum + this.countWords(ch.content),
        0
      );

      result.success = true;
      result.file = blob;
      result.filename = this.generateFilename(plan.metadata.title);
      result.stats = {
        wordCount,
        chapterCount: chapters.filter(ch => ch.level === 0).length,
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

  private updateProgress(updates: Partial<EpubProgress>): void {
    const current = this.progressSubject.getValue();
    this.progressSubject.next({ ...current, ...updates });
  }

  /**
   * Process all items in the publish plan
   */
  private async processContent(
    plan: PublishPlan,
    result: EpubResult
  ): Promise<Chapter[]> {
    const chapters: Chapter[] = [];
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
        const itemChapters = await this.processItem(
          item,
          elements,
          plan,
          chapterNumber
        );

        for (const chapter of itemChapters) {
          if (chapter.level === 0) chapterNumber++;
          chapters.push(chapter);
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

    return chapters;
  }

  /**
   * Process a single publish plan item
   */
  private async processItem(
    item: PublishPlanItem,
    elements: Element[],
    plan: PublishPlan,
    chapterNumber: number
  ): Promise<Chapter[]> {
    switch (item.type) {
      case PublishPlanItemType.Element:
        return this.processElementItem(
          item,
          elements,
          plan.options,
          chapterNumber
        );

      case PublishPlanItemType.Frontmatter:
        return [this.processFrontmatter(item, plan.metadata, chapterNumber)];

      case PublishPlanItemType.Separator:
        return [this.processSeparator(item, chapterNumber)];

      case PublishPlanItemType.TableOfContents:
        // TOC is handled separately during packaging
        return [];

      case PublishPlanItemType.Backmatter:
        return [this.processBackmatter(item, plan.metadata, chapterNumber)];

      case PublishPlanItemType.Worldbuilding:
        return this.processWorldbuilding(item, elements, chapterNumber);

      default:
        return [];
    }
  }

  /**
   * Process an element (document) item
   */
  private async processElementItem(
    item: ElementItem,
    elements: Element[],
    options: PublishOptions,
    chapterNumber: number
  ): Promise<Chapter[]> {
    const element = elements.find(e => e.id === item.elementId);
    if (!element) {
      throw new Error(`Element not found: ${item.elementId}`);
    }

    const chapters: Chapter[] = [];

    if (isWorldbuildingType(element.type)) {
      // Inline worldbuilding element (e.g. via "Add everything"): render
      // it as a one-entry chapter using the element's name for the spine
      // title.
      const synthetic = this.singleEntryWbItem(element.id);
      const wbHtml = await this.renderInlineWbHtml(synthetic, [element]);
      if (wbHtml) {
        const title = item.titleOverride || element.name;
        chapters.push({
          id: element.id,
          title,
          filename: `chapter_${String(chapters.length + 1).padStart(3, '0')}.xhtml`,
          content: this.wrapInXhtml(title, wbHtml),
          order: chapters.length,
          level: 0,
        });
      }
    } else if (element.type === ElementType.Item) {
      // Process document
      const content = await this.getDocumentContent(element.id);
      const title = item.titleOverride || element.name;
      const formattedTitle = this.formatChapterTitle(
        title,
        chapterNumber,
        item.isChapter ?? false,
        options
      );

      // Use the element name only for the EPUB navigation/spine title.
      // Do NOT inject an <h1> into the XHTML body — the user's document
      // is responsible for any visible heading.
      chapters.push({
        id: element.id,
        title: formattedTitle,
        filename: `chapter_${String(chapters.length + 1).padStart(3, '0')}.xhtml`,
        content: this.wrapInXhtml(formattedTitle, content),
        order: chapters.length,
        level: 0,
      });
    } else if (element.type === ElementType.Folder && item.includeChildren) {
      // Process folder and children
      const children = this.getChildElements(element, elements);

      for (const child of children) {
        if (child.type === ElementType.Item) {
          const content = await this.getDocumentContent(child.id);
          const title = child.name;

          chapters.push({
            id: child.id,
            title,
            filename: `chapter_${String(chapters.length + 1).padStart(3, '0')}.xhtml`,
            content: this.wrapInXhtml(title, content),
            order: chapters.length,
            level: child.level - element.level,
          });
        } else if (isWorldbuildingType(child.type)) {
          const synthetic = this.singleEntryWbItem(child.id);
          const wbHtml = await this.renderInlineWbHtml(synthetic, [child]);
          if (wbHtml) {
            const title = child.name;
            chapters.push({
              id: child.id,
              title,
              filename: `chapter_${String(chapters.length + 1).padStart(3, '0')}.xhtml`,
              content: this.wrapInXhtml(title, wbHtml),
              order: chapters.length,
              level: child.level - element.level,
            });
          }
        }
      }
    }

    return chapters;
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

      if (coverBlob) {
        this.coverImageData = {
          blob: coverBlob,
          mimeType: coverBlob.type || 'image/jpeg',
        };
        this.logger.debug(
          'EpubGenerator',
          `Loaded cover image: ${coverBlob.size} bytes, type: ${coverBlob.type}`
        );
      } else {
        this.logger.debug('EpubGenerator', 'No cover image found');
      }
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
   * Get document content as HTML
   *
   * Uses DocumentService.getDocumentContent() which handles both active
   * connections and IndexedDB fallback internally.
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

  /**
   * Convert ProseMirror document export to HTML
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

    // Handle primitives (string, number, boolean)
    if (typeof data === 'string') {
      return data;
    }

    return '';
  }

  /**
   * Convert a ProseMirror node to HTML
   */
  private nodeToHtml(node: ProseMirrorNode): string {
    if (!node) return '';

    if (typeof node === 'string') return this.escapeHtml(node);
    if (Array.isArray(node)) return node.map(n => this.nodeToHtml(n)).join('');

    const elementRefHtml = this.renderElementRefNode(node);
    if (elementRefHtml !== null) return elementRefHtml;

    const textHtml = this.renderMarkedTextNode(node);
    if (textHtml !== null) return textHtml;

    // Element node from ProseMirror/Yjs
    const { tagName, classNames } = this.getTagAndClass(node);
    const attributes = this.getAttributes(node);
    const children = this.getChildren(node);

    const classAttr = classNames.length
      ? ` class="${classNames.join(' ')}"`
      : '';

    // Self-closing tags
    if (['br', 'hr', 'img'].includes(tagName)) {
      return `<${tagName}${classAttr}${attributes} />`;
    }

    const childHtml = children.map(c => this.nodeToHtml(c)).join('');
    return `<${tagName}${classAttr}${attributes}>${childHtml}</${tagName}>`;
  }

  private renderElementRefNode(node: ProseMirrorNode): string | null {
    if (
      !(
        typeof node === 'object' &&
        'type' in node &&
        node.type === 'elementRef'
      )
    ) {
      return null;
    }

    const attrs =
      'attrs' in node ? (node['attrs'] as Record<string, unknown>) : null;
    const displayText = attrs?.['displayText'] as string | undefined;
    return displayText ? this.escapeHtml(displayText) : '';
  }

  private renderMarkedTextNode(node: ProseMirrorNode): string | null {
    if (
      !(
        typeof node === 'object' &&
        'type' in node &&
        node.type === 'text' &&
        'text' in node
      )
    ) {
      return null;
    }

    const text = this.escapeHtml(String(node.text));
    const marks = this.getMarks(node);
    if (marks.length === 0) return text;

    return applyMarks(text, marks, MARK_TAGS);
  }

  private getTagAndClass(node: ProseMirrorNode): {
    tagName: string;
    classNames: string[];
  } {
    const typeMap: Record<string, { tag: string; cls: string }> = {
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
      image: { tag: 'img', cls: 'ink-doc-image' },
      figure: { tag: 'figure', cls: 'ink-doc-figure' },
      caption: { tag: 'figcaption', cls: 'ink-doc-caption' },
    };

    if (typeof node === 'object' && node) {
      let name = '';
      if ('nodeName' in node) name = String(node.nodeName);
      else if ('type' in node) name = String(node.type);
      const lower = name.toLowerCase();
      if (lower === 'heading') {
        const attrs =
          'attrs' in node ? (node['attrs'] as Record<string, unknown>) : null;
        const level = clampLevel(Number(attrs?.['level'] ?? 1));
        return {
          tagName: `h${level}`,
          classNames: [`ink-doc-heading-${level}`],
        };
      }
      const mapped = typeMap[lower];
      if (mapped) {
        return {
          tagName: mapped.tag,
          classNames: mapped.cls ? [mapped.cls] : [],
        };
      }
      return { tagName: lower || 'div', classNames: [] };
    }
    return { tagName: 'span', classNames: [] };
  }

  private getAttributes(node: ProseMirrorNode): string {
    if (typeof node !== 'object' || !('attrs' in node)) {
      return '';
    }

    const attrs: Record<string, unknown> = node.attrs ?? {};
    const parts: string[] = [];

    for (const [key, value] of Object.entries(attrs)) {
      if (value !== null && value !== undefined) {
        let stringValue: string;
        if (typeof value === 'object') {
          stringValue = JSON.stringify(value);
        } else if (typeof value === 'string') {
          stringValue = value;
        } else {
          // eslint-disable-next-line @typescript-eslint/no-base-to-string
          stringValue = String(value);
        }
        parts.push(`${key}="${this.escapeHtml(stringValue)}"`);
      }
    }

    return parts.length > 0 ? ' ' + parts.join(' ') : '';
  }

  private getChildren(node: ProseMirrorNode): ProseMirrorNode[] {
    if (typeof node !== 'object') return [];

    if ('content' in node && Array.isArray(node.content)) {
      return node.content;
    }

    if ('children' in node && Array.isArray(node.children)) {
      return node.children;
    }

    return [];
  }

  private getMarks(node: ProseMirrorNode): string[] {
    if (typeof node !== 'object' || !node) return [];
    const marks = (node as Record<string, unknown>)['marks'];
    if (!Array.isArray(marks)) return [];
    return marks
      .map(m => {
        if (typeof m === 'string') return m;
        if (typeof m === 'object' && m && 'type' in m)
          return String((m as Record<string, unknown>)['type']);
        return '';
      })
      .filter(Boolean);
  }

  /**
   * Process frontmatter item
   */
  private processFrontmatter(
    item: FrontmatterItem,
    metadata: PublishMetadata,
    order: number
  ): Chapter {
    let content: string;
    let title: string;

    switch (item.contentType) {
      case FrontmatterType.TitlePage:
        title = 'Title Page';
        content = this.generateTitlePage(metadata);
        break;

      case FrontmatterType.Copyright:
        title = 'Copyright';
        content = this.generateCopyrightPage(metadata);
        break;

      case FrontmatterType.Dedication:
        title = 'Dedication';
        content = item.customContent || '<p>Dedication</p>';
        break;

      case FrontmatterType.Custom:
        title = item.customTitle || 'Frontmatter';
        content = item.customContent || '';
        break;

      default:
        title = 'Frontmatter';
        content = '';
    }

    return {
      id: `frontmatter-${item.id}`,
      title,
      filename: `frontmatter_${String(order).padStart(3, '0')}.xhtml`,
      content: this.wrapInXhtml(title, content),
      order,
      level: 0,
    };
  }

  /**
   * Process separator item
   */
  private processSeparator(item: SeparatorItem, order: number): Chapter {
    let content = '';

    switch (item.style) {
      case SeparatorStyle.PageBreak:
        content = '<div class="ink-page-break"></div>';
        break;

      case SeparatorStyle.SceneBreak:
        content = `<p class="ink-scene-break">${this.escapeHtml(item.customText || '* * *')}</p>`;
        break;

      case SeparatorStyle.ChapterBreak:
        content = '<hr class="ink-chapter-break" />';
        break;
    }

    return {
      id: `separator-${item.id}`,
      title: '',
      filename: `separator_${String(order).padStart(3, '0')}.xhtml`,
      content: this.wrapInXhtml('', content),
      order,
      level: -1, // Not shown in TOC
    };
  }

  /**
   * Process backmatter item
   */
  private processBackmatter(
    item: PublishPlanItem,
    metadata: PublishMetadata,
    order: number
  ): Chapter {
    const backmatterItem = item as {
      id: string;
      type: PublishPlanItemType.Backmatter;
      contentType: BackmatterType;
      customContent?: string;
      customTitle?: string;
    };

    let content: string;
    let title: string;

    switch (backmatterItem.contentType) {
      case BackmatterType.AboutAuthor:
        title = 'About the Author';
        content = `<p>${metadata.author}</p>`;
        break;

      case BackmatterType.Acknowledgments:
        title = 'Acknowledgments';
        content = backmatterItem.customContent || '';
        break;

      case BackmatterType.Custom:
        title = backmatterItem.customTitle || 'Backmatter';
        content = backmatterItem.customContent || '';
        break;

      default:
        title = 'Backmatter';
        content = '';
    }

    return {
      id: `backmatter-${backmatterItem.id}`,
      title,
      filename: `backmatter_${String(order).padStart(3, '0')}.xhtml`,
      content: this.wrapInXhtml(title, content),
      order,
      level: 0,
    };
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
    const parts: string[] = [`<section class="ink-wb-section">`];
    for (const entry of entries) {
      parts.push(this.renderWorldbuildingEntry(entry));
    }
    parts.push('</section>');
    return parts.join('\n');
  }

  /**
   * Process a Worldbuilding plan item into a single EPUB chapter (one file
   * containing all included entries).
   */
  private async processWorldbuilding(
    item: WorldbuildingItem,
    elements: Element[],
    order: number
  ): Promise<Chapter[]> {
    const entries = await this.worldbuildingRenderer.renderItem(item, elements);
    if (entries.length === 0) return [];
    const title = item.title || 'Worldbuilding';
    const parts: string[] = [];
    parts.push(`<section class="ink-wb-section">`);
    if (item.title) {
      parts.push(
        `<h2 class="ink-wb-section-title">${this.escapeHtml(item.title)}</h2>`
      );
    }
    for (const entry of entries) {
      parts.push(this.renderWorldbuildingEntry(entry));
    }
    parts.push('</section>');
    return [
      {
        id: `worldbuilding-${item.id}`,
        title,
        filename: `worldbuilding_${String(order + 1).padStart(3, '0')}.xhtml`,
        content: this.wrapInXhtml(title, parts.join('\n')),
        order,
        level: 0,
      },
    ];
  }

  private renderWorldbuildingEntry(entry: RenderedWorldbuildingEntry): string {
    const layoutClass = `ink-wb-layout-${entry.layout}`;
    const schemaClass = entry.schemaId
      ? ` ink-wb-schema-${this.cssSafe(entry.schemaId)}`
      : '';
    const parts: string[] = [];
    parts.push(`<article class="ink-wb-entry ${layoutClass}${schemaClass}">`);
    parts.push(
      `<h3 class="ink-wb-entry-title">${this.escapeHtml(entry.title)}</h3>`
    );
    if (entry.imageRef) {
      parts.push(
        `<img class="ink-wb-entry-image" src="${this.escapeHtml(entry.imageRef)}" alt="${this.escapeHtml(entry.title)}" />`
      );
    }
    if (entry.description) {
      parts.push(
        `<p class="ink-wb-entry-description">${this.escapeHtml(entry.description)}</p>`
      );
    }
    for (const tab of entry.tabs) {
      parts.push(
        `<section class="ink-wb-tab" data-tab="${this.cssSafe(tab.key)}">`,
        `<h4 class="ink-wb-tab-heading">${this.escapeHtml(tab.label)}</h4>`,
        '<dl class="ink-wb-fields">'
      );
      for (const f of tab.fields) {
        parts.push(
          `<dt class="ink-wb-field-label">${this.escapeHtml(f.label)}</dt>`,
          `<dd class="ink-wb-field-value">${this.escapeHtml(f.displayValue)}</dd>`
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
  private addContentFiles(
    zip: JSZip,
    chapters: Chapter[],
    toc: TocEntry[],
    plan: PublishPlan
  ): void {
    // Add cover image if available
    if (this.coverImageData) {
      const ext = this.getCoverImageExtension();
      zip.file(`OEBPS/images/cover.${ext}`, this.coverImageData.blob);

      // Add cover page XHTML
      zip.file('OEBPS/cover.xhtml', this.generateCoverPage(ext));
    }

    // Add chapters
    for (const chapter of chapters) {
      zip.file(`OEBPS/${chapter.filename}`, chapter.content);
    }

    // Add stylesheet
    zip.file(
      'OEBPS/styles.css',
      this.generateStylesheet(plan.styles ?? createDefaultPublishStyles())
    );

    // Add OPF (package) file
    zip.file(
      'OEBPS/content.opf',
      this.generateOpf(chapters, plan.metadata, this.coverImageData !== null)
    );

    // Add NCX (navigation) file
    zip.file('OEBPS/toc.ncx', this.generateNcx(toc, plan.metadata));

    // Add NAV (EPUB3 navigation) file
    zip.file('OEBPS/nav.xhtml', this.generateNav(toc));
  }

  /**
   * Get file extension for cover image based on MIME type
   */
  private getCoverImageExtension(): string {
    if (!this.coverImageData) return 'jpg';
    const mimeType = this.coverImageData.mimeType;
    if (mimeType.includes('png')) return 'png';
    if (mimeType.includes('gif')) return 'gif';
    if (mimeType.includes('webp')) return 'webp';
    return 'jpg';
  }

  /**
   * Generate cover page XHTML
   */
  private generateCoverPage(imageExt: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>Cover</title>
  <style>
    body { margin: 0; padding: 0; text-align: center; }
    img { max-width: 100%; max-height: 100%; }
  </style>
</head>
<body>
  <img src="images/cover.${imageExt}" alt="Cover"/>
</body>
</html>`;
  }

  /**
   * Build table of contents from chapters
   */
  private buildTableOfContents(
    chapters: Chapter[],
    _plan: PublishPlan
  ): TocEntry[] {
    const toc: TocEntry[] = [];

    for (const chapter of chapters) {
      if (chapter.level < 0 || !chapter.title) continue;

      toc.push({
        title: chapter.title,
        href: chapter.filename,
        level: chapter.level,
      });
    }

    return toc;
  }

  /**
   * Generate OPF (package) file
   */
  private generateOpf(
    chapters: Chapter[],
    metadata: PublishMetadata,
    hasCover: boolean = false
  ): string {
    const uuid = crypto.randomUUID();
    const now = new Date().toISOString();
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

    // Add chapter items
    chapters.forEach((ch, i) => {
      manifestParts.push(
        `    <item id="chapter${i}" href="${ch.filename}" media-type="application/xhtml+xml"/>`
      );
    });

    const manifestItems = manifestParts.join('\n');

    // Build spine items (cover first if present)
    const spineParts: string[] = [];
    if (hasCover) {
      spineParts.push(`    <itemref idref="cover"/>`);
    }
    chapters.forEach((_, i) => {
      spineParts.push(`    <itemref idref="chapter${i}"/>`);
    });
    const spineItems = spineParts.join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">urn:uuid:${uuid}</dc:identifier>
    <dc:title>${this.escapeXml(metadata.title)}</dc:title>
    <dc:creator>${this.escapeXml(metadata.author)}</dc:creator>
    <dc:language>${metadata.language}</dc:language>
    <dc:date>${now}</dc:date>
    ${metadata.publisher ? `<dc:publisher>${this.escapeXml(metadata.publisher)}</dc:publisher>` : ''}
    ${metadata.description ? `<dc:description>${this.escapeXml(metadata.description)}</dc:description>` : ''}
    <meta property="dcterms:modified">${now}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="css" href="styles.css" media-type="text/css"/>
${manifestItems}
  </manifest>
  <spine toc="ncx">
${spineItems}
  </spine>
</package>`;
  }

  /**
   * Generate NCX (navigation) file
   */
  private generateNcx(toc: TocEntry[], metadata: PublishMetadata): string {
    const navPoints = toc
      .map(
        (entry, i) => `
    <navPoint id="navPoint-${i + 1}" playOrder="${i + 1}">
      <navLabel>
        <text>${this.escapeXml(entry.title)}</text>
      </navLabel>
      <content src="${entry.href}"/>
    </navPoint>`
      )
      .join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${crypto.randomUUID()}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>${this.escapeXml(metadata.title)}</text>
  </docTitle>
  <navMap>${navPoints}
  </navMap>
</ncx>`;
  }

  /**
   * Generate NAV (EPUB3 navigation) file
   */
  private generateNav(toc: TocEntry[]): string {
    const navItems = toc
      .map(
        entry =>
          `      <li><a href="${entry.href}">${this.escapeXml(entry.title)}</a></li>`
      )
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>Table of Contents</title>
</head>
<body>
  <nav epub:type="toc">
    <h1>Table of Contents</h1>
    <ol>
${navItems}
    </ol>
  </nav>
</body>
</html>`;
  }

  /**
   * Generate stylesheet
   */
  private generateStylesheet(styles: PublishStyles): string {
    return this.cssEmitter.emitEpubStylesheet(styles);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private Methods - Utilities
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Wrap content in XHTML document
   */
  private wrapInXhtml(title: string, content: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${this.escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
${content}
</body>
</html>`;
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
    return `<div class="ink-frontmatter ink-frontmatter-title">
  <h1 class="ink-frontmatter-title-text">${this.escapeHtml(metadata.title)}</h1>
  ${metadata.subtitle ? `<p class="ink-frontmatter-subtitle">${this.escapeHtml(metadata.subtitle)}</p>` : ''}
  <p class="ink-frontmatter-author">${this.escapeHtml(metadata.author)}</p>
</div>`;
  }

  /**
   * Generate copyright page HTML
   */
  private generateCopyrightPage(metadata: PublishMetadata): string {
    const year = new Date().getFullYear();
    return `<div class="ink-frontmatter ink-frontmatter-copyright">
  <p>${this.escapeHtml(metadata.copyright || `Copyright © ${year} ${metadata.author}`)}</p>
  <p>All rights reserved.</p>
  ${metadata.publisher ? `<p>Published by ${this.escapeHtml(metadata.publisher)}</p>` : ''}
  ${metadata.isbn ? `<p>ISBN: ${this.escapeHtml(metadata.isbn)}</p>` : ''}
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
   * Count words in HTML content
   */
  private countWords(html: string): number {
    const text = html.replaceAll(/<[^>]*>/g, ' ');
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

  /**
   * Escape HTML special characters
   */
  private escapeHtml(str: string): string {
    return str
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  /**
   * Escape XML special characters (same as HTML)
   */
  private escapeXml(str: string): string {
    return this.escapeHtml(str);
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
      attrs?: Record<string, unknown>;
      content?: ProseMirrorNode[];
      children?: ProseMirrorNode[];
    };
