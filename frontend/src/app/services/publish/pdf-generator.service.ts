import { inject, Injectable } from '@angular/core';
import { type Element, ElementType } from '@inkweld/index';
import { type PublishStyles } from '@models/publish-style';
import { $typst, TypstSnippet } from '@myriaddreamin/typst.ts/contrib/snippet';
import { BehaviorSubject, type Observable, Subject } from 'rxjs';

import {
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
import { trimHyphens } from '../../utils/string-utils';
import { isWorldbuildingType } from '../../utils/worldbuilding.utils';
import { LoggerService } from '../core/logger.service';
import { LocalStorageService } from '../local/local-storage.service';
import { DocumentService } from '../project/document.service';
import { ProjectStateService } from '../project/project-state.service';
import { applyMarks, TYPST_MARK_TAGS } from './publish-marks-helper';
import { PublishTypstEmitterService } from './publish-typst-emitter.service';
import {
  type RenderedWorldbuildingEntry,
  WorldbuildingPublishRendererService,
} from './worldbuilding-publish-renderer.service';

/**
 * Progress information for PDF generation
 */
export interface PdfProgress {
  phase: PdfPhase;
  overallProgress: number;
  message: string;
  detail?: string;
  currentItem?: string;
  totalItems: number;
  completedItems: number;
}

export enum PdfPhase {
  Idle = 'idle',
  Initializing = 'initializing',
  ProcessingContent = 'processing-content',
  GeneratingPdf = 'generating-pdf',
  Complete = 'complete',
  Error = 'error',
}

export interface PdfResult {
  success: boolean;
  file?: Blob;
  filename?: string;
  stats?: PublishStats;
  warnings: string[];
  error?: string;
}

/**
 * Internal context for PDF generation state
 */
interface PdfContext {
  markup: string;
  options: PublishOptions;
  styles?: PublishStyles;
  wordCount: number;
  chapterCount: number;
}

interface CoverImageData {
  base64: string;
  mimeType: string;
}

// ProseMirror node type for conversion
type ProseMirrorNode =
  | string
  | { [key: string]: unknown }
  | ProseMirrorNode[]
  | null
  | undefined;

/**
 * URLs of bundled font files preloaded into the Typst WASM compiler.
 *
 * **Format must be TTF/OTF.** The WASM compiler parses fonts via
 * `ttf-parser`, which rejects woff/woff2 silently — Typst then falls
 * back to its default Libertinus Serif and font-preset switching has no
 * visible effect. The `@fontsource/*` packages we use for browser CSS
 * only ship woff/woff2, so TTFs are downloaded by
 * `frontend/scripts/fetch-publish-fonts.mjs` during `bun install` and
 * placed in `frontend/public/assets/fonts/` (gitignored). Angular serves
 * `public/` as static assets, so they are reachable at the URLs below.
 *
 * Typst resolves the `font:` argument by matching the family name
 * embedded in the font file, so the URL list itself just needs to cover
 * every variant (regular / italic / bold / bold-italic) we want
 * available in PDF output without weight-synthesis or italic-faux
 * artefacts.
 *
 * Exported for testing — `publish-style.spec.ts` and the spec for this
 * service assert every URL points at a bundled family present in
 * `PUBLISH_FONT_TOKENS` and that the list contains exactly 4 variants
 * per family.
 */
export const BUNDLED_TYPST_FONT_URLS: readonly string[] = [
  // EB Garamond (serifBook)
  '/assets/fonts/eb-garamond-latin-400-normal.ttf',
  '/assets/fonts/eb-garamond-latin-400-italic.ttf',
  '/assets/fonts/eb-garamond-latin-700-normal.ttf',
  '/assets/fonts/eb-garamond-latin-700-italic.ttf',
  // Source Serif 4 (serifClassic)
  '/assets/fonts/source-serif-4-latin-400-normal.ttf',
  '/assets/fonts/source-serif-4-latin-400-italic.ttf',
  '/assets/fonts/source-serif-4-latin-700-normal.ttf',
  '/assets/fonts/source-serif-4-latin-700-italic.ttf',
  // Source Sans 3 (sansClean)
  '/assets/fonts/source-sans-3-latin-400-normal.ttf',
  '/assets/fonts/source-sans-3-latin-400-italic.ttf',
  '/assets/fonts/source-sans-3-latin-700-normal.ttf',
  '/assets/fonts/source-sans-3-latin-700-italic.ttf',
  // Lato (sansHumanist)
  '/assets/fonts/lato-latin-400-normal.ttf',
  '/assets/fonts/lato-latin-400-italic.ttf',
  '/assets/fonts/lato-latin-700-normal.ttf',
  '/assets/fonts/lato-latin-700-italic.ttf',
  // Source Code Pro (mono)
  '/assets/fonts/source-code-pro-latin-400-normal.ttf',
  '/assets/fonts/source-code-pro-latin-400-italic.ttf',
  '/assets/fonts/source-code-pro-latin-700-normal.ttf',
  '/assets/fonts/source-code-pro-latin-700-italic.ttf',
  // Courier Prime (serifManuscript)
  '/assets/fonts/courier-prime-latin-400-normal.ttf',
  '/assets/fonts/courier-prime-latin-400-italic.ttf',
  '/assets/fonts/courier-prime-latin-700-normal.ttf',
  '/assets/fonts/courier-prime-latin-700-italic.ttf',
];

/**
 * PDF Generator Service using Typst
 *
 * Generates high-quality PDF documents using the Typst typesetting system.
 */
@Injectable({
  providedIn: 'root',
})
export class PdfGeneratorService {
  private readonly logger = inject(LoggerService);
  private readonly documentService = inject(DocumentService);
  private readonly projectStateService = inject(ProjectStateService);
  private readonly localStorage = inject(LocalStorageService);
  private readonly typstEmitter = inject(PublishTypstEmitterService);
  private readonly worldbuildingRenderer = inject(
    WorldbuildingPublishRendererService
  );

  private coverImageData: CoverImageData | null = null;

  private readonly progressSubject = new BehaviorSubject<PdfProgress>({
    phase: PdfPhase.Idle,
    overallProgress: 0,
    message: 'Ready',
    totalItems: 0,
    completedItems: 0,
  });

  private readonly completeSubject = new Subject<PdfResult>();
  private isCancelled = false;
  private isInitialized = false;

  readonly progress$: Observable<PdfProgress> =
    this.progressSubject.asObservable();
  readonly complete$: Observable<PdfResult> =
    this.completeSubject.asObservable();

  private initTypst(): void {
    if (this.isInitialized) return;

    try {
      // Use local WASM modules for offline capability
      $typst.setCompilerInitOptions({
        getModule: () => '/assets/wasm/typst_ts_web_compiler_bg.wasm',
      });
      $typst.setRendererInitOptions({
        getModule: () => '/assets/wasm/typst_ts_renderer_bg.wasm',
      });
      // Preload bundled fonts so the PDF compiler can resolve every family
      // listed in PUBLISH_FONT_TOKENS without requiring network access.
      // Files are copied to /assets/fonts/ at build time (see angular.json).
      // The PWA service worker prefetches them like any other asset, so
      // subsequent visits and offline use both work.
      $typst.use(TypstSnippet.preloadFonts([...BUNDLED_TYPST_FONT_URLS]));
      this.isInitialized = true;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('initialized')) {
        this.isInitialized = true;
        return;
      }
      this.logger.error('PdfGenerator', 'Failed to initialize Typst', error);
      throw error;
    }
  }

  cancel(): void {
    this.isCancelled = true;
    this.updateProgress({
      phase: PdfPhase.Idle,
      message: 'Generation cancelled',
    });
  }

  async generatePdf(plan: PublishPlan): Promise<PdfResult> {
    this.isCancelled = false;
    this.coverImageData = null;
    const startTime = Date.now();
    const result: PdfResult = {
      success: false,
      warnings: [],
    };

    try {
      this.updateProgress({
        phase: PdfPhase.Initializing,
        overallProgress: 5,
        message: 'Initializing Typst...',
        totalItems: plan.items.length,
        completedItems: 0,
      });

      this.initTypst();

      // Load cover image if enabled
      if (plan.options.includeCover) {
        await this.loadCoverImage();
      }

      this.updateProgress({
        phase: PdfPhase.GeneratingPdf,
        overallProgress: 10,
        message: 'Processing content...',
      });

      const ctx: PdfContext = {
        markup: this.getTypstTemplate(plan),
        options: plan.options,
        styles: plan.styles,
        wordCount: 0,
        chapterCount: 0,
      };

      // Process content into Typst markup
      await this.processContent(plan, ctx, result);

      if (this.isCancelled) {
        result.error = 'Generation cancelled';
        this.completeSubject.next(result);
        return result;
      }

      this.updateProgress({
        phase: PdfPhase.GeneratingPdf,
        overallProgress: 80,
        message: 'Compiling PDF...',
      });

      // Map cover image if available
      const coverData = this.coverImageData as CoverImageData | null;
      if (coverData) {
        const response = await fetch(`${coverData.base64}`);
        const buffer = await response.arrayBuffer();
        await $typst.mapShadow('cover.jpg', new Uint8Array(buffer));
      }

      // Compile to PDF
      this.logger.debug(
        'PdfGenerator',
        'Compiling Typst markup:\n' + ctx.markup
      );
      const pdfData = await $typst.pdf({ mainContent: ctx.markup });
      if (!pdfData) {
        throw new Error('Typst compilation failed to produce PDF data');
      }
      this.logger.debug(
        'PdfGenerator',
        `PDF compiled successfully, size: ${pdfData.length}`
      );

      const blob = new Blob([new Uint8Array(pdfData)], {
        type: 'application/pdf',
      });

      result.success = true;
      result.file = blob;
      result.filename = this.generateFilename(plan.metadata.title);
      result.stats = {
        wordCount: ctx.wordCount,
        chapterCount: ctx.chapterCount,
        documentCount: plan.items.filter(
          i => i.type === PublishPlanItemType.Element
        ).length,
        fileSize: blob.size,
        generationTimeMs: Date.now() - startTime,
      };

      this.updateProgress({
        phase: PdfPhase.Complete,
        overallProgress: 100,
        message: `PDF generated: ${this.formatFileSize(blob.size)}`,
      });

      this.completeSubject.next(result);
      return result;
    } catch (error: unknown) {
      console.error('PDF Generation Error:', error);
      if (error instanceof Error && error.stack) {
        console.error('Error Stack:', error.stack);
      }
      this.logger.error('PdfGenerator', 'Generation failed', error);
      result.error = error instanceof Error ? error.message : String(error);

      this.updateProgress({
        phase: PdfPhase.Error,
        message: result.error,
      });

      this.completeSubject.next(result);
      return result;
    }
  }

  private getTypstTemplate(plan: PublishPlan): string {
    return this.typstEmitter.emitPreamble(plan.styles);
  }

  /**
   * True if the resolved chapter-title style asks for a page break before
   * each chapter. Defaults to false when no styles are configured.
   */
  private shouldPageBreakBeforeChapter(ctx: PdfContext): boolean {
    return ctx.styles?.structure?.chapterTitle?.pageBreakBefore ?? false;
  }

  private updateProgress(updates: Partial<PdfProgress>): void {
    const current = this.progressSubject.getValue();
    this.progressSubject.next({ ...current, ...updates });
  }

  private async loadCoverImage(): Promise<void> {
    const project = this.projectStateService.project();
    if (!project) return;

    try {
      const coverBlob = await this.loadCoverBlob(project);

      if (coverBlob) {
        // Convert blob to base64 for jsPDF
        const base64 = await this.blobToBase64(coverBlob);
        this.coverImageData = {
          base64,
          mimeType: coverBlob.type || 'image/jpeg',
        };
        this.logger.debug('PdfGenerator', 'Loaded cover image');
      }
    } catch (error) {
      this.logger.warn('PdfGenerator', 'Failed to load cover image', error);
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

  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private async processContent(
    plan: PublishPlan,
    ctx: PdfContext,
    result: PdfResult
  ): Promise<void> {
    const elements = this.projectStateService.elements();
    let chapterNumber = 0;
    let processedCount = 0;

    this.updateProgress({
      phase: PdfPhase.ProcessingContent,
      message: `Processing content (0/${plan.items.length})...`,
    });

    for (const item of plan.items) {
      if (this.isCancelled) break;

      this.updateProgress({
        detail: `Processing item ${processedCount + 1}...`,
        completedItems: processedCount,
      });

      try {
        await this.processItem(item, elements, plan, ctx, chapterNumber);

        if (item.type === PublishPlanItemType.Element && item.isChapter) {
          chapterNumber++;
          ctx.chapterCount++;
        }
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : 'Unknown error';
        result.warnings.push(`Error processing item: ${errorMsg}`);
        this.logger.warn('PdfGenerator', `Error processing item`, error);
      }

      processedCount++;
      const progress = 10 + (processedCount / plan.items.length) * 60;
      this.updateProgress({
        overallProgress: Math.round(progress),
        message: `Processing content (${processedCount}/${plan.items.length})...`,
      });
    }
  }

  private async processItem(
    item: PublishPlanItem,
    elements: Element[],
    plan: PublishPlan,
    ctx: PdfContext,
    chapterNumber: number
  ): Promise<void> {
    switch (item.type) {
      case PublishPlanItemType.Element:
        await this.processElementItem(item, elements, ctx, chapterNumber);
        break;

      case PublishPlanItemType.Separator:
        this.processSeparator(item, ctx);
        break;

      case PublishPlanItemType.Frontmatter:
        this.processFrontmatter(item, plan.metadata, ctx);
        break;

      case PublishPlanItemType.TableOfContents:
        ctx.markup += '#pagebreak(weak: true)\n';
        ctx.markup += '= Table of Contents\n\n';
        ctx.markup += '#outline(title: none, indent: auto)\n\n';
        break;

      case PublishPlanItemType.Worldbuilding:
        await this.processWorldbuilding(item, elements, ctx);
        break;
    }
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

  private async processWorldbuilding(
    item: WorldbuildingItem,
    elements: Element[],
    ctx: PdfContext
  ): Promise<void> {
    const entries = await this.worldbuildingRenderer.renderItem(item, elements);
    if (entries.length === 0) return;
    if (item.title) {
      ctx.markup += `#pagebreak(weak: true)\n`;
      ctx.markup += `#wb-section-title[${this.escapeTypst(item.title)}]\n\n`;
    }
    for (const entry of entries) {
      ctx.markup += this.renderWorldbuildingEntryTypst(entry);
    }
  }

  private renderWorldbuildingEntryTypst(
    entry: RenderedWorldbuildingEntry
  ): string {
    const parts: string[] = [];
    const titleArg = `[${this.escapeTypst(entry.title)}]`;
    const body: string[] = [];
    if (entry.description) {
      body.push(`#emph[${this.escapeTypst(entry.description)}]`, '#v(4pt)');
    }
    // Worldbuilding identity images (`entry.imageRef`) are intentionally
    // NOT rendered in PDF output. The HTML/EPUB/Markdown generators embed
    // the URL directly because they run inside a browser context that
    // resolves it natively, but Typst's `#image()` requires the raw image
    // bytes to be registered with the compiler via `addSource`/asset map.
    // Wiring per-entry image fetch + asset registration into the typst.ts
    // pipeline is tracked separately; until then we omit the image rather
    // than emit a broken `#image()` call that would fail compilation.
    for (const tab of entry.tabs) {
      const tabBody: string[] = [];
      for (const f of tab.fields) {
        tabBody.push(
          `#wb-field([${this.escapeTypst(f.label)}], [${this.escapeTypst(f.displayValue)}])`
        );
      }
      body.push(
        `#wb-tab([${this.escapeTypst(tab.label)}], [\n${tabBody.join('\n')}\n])`
      );
    }
    parts.push(`#wb-entry(${titleArg}, [\n${body.join('\n')}\n])\n\n`);
    return parts.join('');
  }

  private async processElementItem(
    item: ElementItem,
    elements: Element[],
    ctx: PdfContext,
    _chapterNumber: number
  ): Promise<void> {
    const element = elements.find(e => e.id === item.elementId);
    if (!element) {
      throw new Error(`Element not found: ${item.elementId}`);
    }

    if (isWorldbuildingType(element.type)) {
      // Inline worldbuilding element (e.g. via "Add everything"): render
      // as a single-entry block with no section title (user document
      // controls headings).
      const synthetic = this.singleEntryWbItem(element.id);
      await this.processWorldbuilding(synthetic, [element], ctx);
    } else if (element.type === ElementType.Item) {
      // The publish style chapter-title page break (if enabled) is still
      // emitted so chapters start on a new page. The element name itself
      // is NOT auto-rendered as a heading — the user's document supplies
      // its own title (or none).
      if (item.isChapter && this.shouldPageBreakBeforeChapter(ctx)) {
        ctx.markup += '#pagebreak(weak: true)\n\n';
      }
      // Add document content
      await this.addDocumentContent(element.id, ctx);
    } else if (element.type === ElementType.Folder && item.includeChildren) {
      const children = this.getChildElements(element, elements);

      for (const child of children) {
        if (child.type === ElementType.Item) {
          await this.addDocumentContent(child.id, ctx);
        } else if (isWorldbuildingType(child.type)) {
          const synthetic = this.singleEntryWbItem(child.id);
          await this.processWorldbuilding(synthetic, [child], ctx);
        }
      }
    }
  }

  private processSeparator(item: SeparatorItem, ctx: PdfContext): void {
    switch (item.style) {
      case SeparatorStyle.PageBreak:
      case SeparatorStyle.ChapterBreak:
        ctx.markup += '#pagebreak(weak: true)\n';
        break;

      case SeparatorStyle.SceneBreak: {
        const text = this.escapeTypst(
          item.customText || ctx.options.sceneBreakText || '* * *'
        );
        ctx.markup += `#scene-break([${text}])\n\n`;
        break;
      }
    }
  }

  private processFrontmatter(
    item: FrontmatterItem,
    metadata: PublishMetadata,
    ctx: PdfContext
  ): void {
    switch (item.contentType) {
      case FrontmatterType.TitlePage:
        this.generateTitlePage(metadata, ctx);
        break;

      case FrontmatterType.Copyright:
        this.generateCopyrightPage(metadata, ctx);
        break;

      case FrontmatterType.Dedication:
        ctx.markup += '#pagebreak(weak: true)\n';
        ctx.markup += '#v(8em)\n';
        ctx.markup += `#align(center)[#emph[${this.escapeTypst(
          item.customContent || ''
        )}]]\n\n`;
        break;

      case FrontmatterType.Custom:
        ctx.markup += '#pagebreak(weak: true)\n';
        if (item.customTitle) {
          ctx.markup += `= ${item.customTitle}\n\n`;
        }
        ctx.markup += `${this.escapeTypst(item.customContent || '')}\n\n`;
        break;
    }
  }

  private generateTitlePage(metadata: PublishMetadata, ctx: PdfContext): void {
    ctx.markup += '#pagebreak(weak: true)\n';
    ctx.markup += '#align(center + horizon)[\n';

    if (this.coverImageData) {
      ctx.markup += '  #image("cover.jpg", width: 60%)\n';
      ctx.markup += '  #v(2em)\n';
    } else {
      ctx.markup += '  #v(4em)\n';
    }

    ctx.markup += `  #text(size: 28pt, weight: "bold")[${this.escapeTypst(
      metadata.title
    )}]\n`;

    if (metadata.subtitle) {
      ctx.markup += `  #v(1em)\n`;
      ctx.markup += `  #text(size: 18pt, style: "italic")[${this.escapeTypst(
        metadata.subtitle
      )}]\n`;
    }

    ctx.markup += `  #v(3em)\n`;
    ctx.markup += `  #text(size: 16pt)[${this.escapeTypst(metadata.author)}]\n`;
    ctx.markup += ']\n\n';
  }

  private generateCopyrightPage(
    metadata: PublishMetadata,
    ctx: PdfContext
  ): void {
    ctx.markup += '#pagebreak(weak: true)\n';
    ctx.markup += '#v(1fr)\n';
    ctx.markup += '#set text(size: 10pt, fill: gray.darken(20%))\n';

    ctx.markup += `*${this.escapeTypst(metadata.title)}*\n`;
    if (metadata.subtitle)
      ctx.markup += `_${this.escapeTypst(metadata.subtitle)}_\n`;

    ctx.markup += '\n';
    ctx.markup += `${this.escapeTypst(
      metadata.copyright ||
        `Copyright © ${new Date().getFullYear()} ${metadata.author}`
    )}\n`;
    ctx.markup += 'All rights reserved.\n\n';

    if (metadata.publisher) {
      ctx.markup += `Published by ${this.escapeTypst(metadata.publisher)}\n`;
    }

    if (metadata.isbn) {
      ctx.markup += `ISBN: ${this.escapeTypst(metadata.isbn)}\n`;
    }

    ctx.markup += `#set text(fill: black)\n`;
    ctx.markup += '\n';
  }

  private getChildElements(parent: Element, allElements: Element[]): Element[] {
    const parentIndex = allElements.indexOf(parent);
    const children: Element[] = [];

    for (let i = parentIndex + 1; i < allElements.length; i++) {
      const elem = allElements[i];
      if (elem.level <= parent.level) break;
      children.push(elem);
    }

    return children;
  }

  private getFullDocumentId(elementId: string): string {
    if (elementId.includes(':')) return elementId;

    const project = this.projectStateService.project();
    if (!project) return elementId;

    return `${project.username}:${project.slug}:${elementId}`;
  }

  private async addDocumentContent(
    elementId: string,
    ctx: PdfContext
  ): Promise<void> {
    const fullDocId = this.getFullDocumentId(elementId);

    try {
      const content = await this.documentService.getDocumentContent(fullDocId);
      if (!content) {
        ctx.markup += '#emph[Document is empty]\n\n';
        return;
      }
      this.processProseMirrorNode(content, ctx);
    } catch (error) {
      this.logger.warn(
        'PdfGenerator',
        `Failed to get document content: ${fullDocId}`,
        error
      );
      ctx.markup += '#emph[Content unavailable]\n\n';
    }
  }

  /**
   * Convert ProseMirror document to Typst markup
   */
  private processProseMirrorNode(data: unknown, ctx: PdfContext): void {
    if (!data) return;

    if (Array.isArray(data)) {
      data.forEach(node => this.nodeToTypst(node as ProseMirrorNode, ctx));
    } else if (typeof data === 'object') {
      this.nodeToTypst(data as ProseMirrorNode, ctx);
    }
  }

  private nodeToTypst(node: ProseMirrorNode, ctx: PdfContext): void {
    if (!node) return;

    if (typeof node === 'string') {
      ctx.markup += `${this.escapeTypst(node)}\n\n`;
      return;
    }

    if (Array.isArray(node)) {
      node.forEach(n => this.nodeToTypst(n, ctx));
      return;
    }

    const nodeName = this.getNodeName(node);
    const children = this.getChildren(node);

    switch (nodeName) {
      case 'paragraph': {
        const text = this.extractTypstText(node);
        if (!text.trim()) {
          ctx.markup += '#v(0.5em)\n\n';
          return;
        }
        ctx.markup += `${text}\n\n`;
        break;
      }

      case 'heading': {
        const level = Math.min(6, Math.max(1, this.getAttr(node, 'level', 1)));
        const text = children.map(c => this.extractPlainText(c)).join('');
        ctx.markup += `#doc-heading-${level}[${this.escapeTypst(text)}]\n\n`;
        break;
      }

      case 'blockquote': {
        const inner = children.map(c => this.extractTypstText(c)).join(' ');
        ctx.markup += `#doc-blockquote[${inner}]\n\n`;
        break;
      }

      case 'bullet_list':
        children.forEach(item => {
          ctx.markup += `- ${this.extractTypstText(item)}\n`;
        });
        ctx.markup += '\n';
        break;

      case 'ordered_list':
        children.forEach(item => {
          ctx.markup += `+ ${this.extractTypstText(item)}\n`;
        });
        ctx.markup += '\n';
        break;

      case 'hard_break':
        ctx.markup += ' #h(0pt) \\ \n';
        break;

      case 'horizontal_rule':
        ctx.markup += '#line(length: 100%, stroke: 0.5pt + gray)\n\n';
        break;

      case 'code_block':
      case 'codeblock': {
        const text = children.map(c => this.extractPlainText(c)).join('');
        ctx.markup += `#doc-code-block(${typstString(text)})\n\n`;
        break;
      }

      default:
        // Process children for unknown nodes
        children.forEach(c => this.nodeToTypst(c, ctx));
    }
  }

  private extractTypstText(node: ProseMirrorNode): string {
    if (!node) return '';

    if (typeof node === 'string') return this.escapeTypst(node);
    if (Array.isArray(node))
      return node.map(n => this.extractTypstText(n)).join('');

    const nodeName = this.getNodeName(node);
    if (nodeName === 'elementref') return this.extractElementRefTypstText(node);
    if (nodeName === 'text' || !nodeName)
      return this.extractMarkedTypstText(node);

    return this.getChildren(node)
      .map(c => this.extractTypstText(c))
      .join('');
  }

  private extractElementRefTypstText(node: ProseMirrorNode): string {
    const attrs = (node as Record<string, unknown>)['attrs'] as
      | Record<string, unknown>
      | undefined;
    const displayText = attrs?.['displayText'];
    return typeof displayText === 'string' && displayText
      ? this.escapeTypst(displayText)
      : '';
  }

  private extractMarkedTypstText(node: ProseMirrorNode): string {
    const rawText = (node as Record<string, unknown>)['text'];
    const baseText =
      typeof rawText === 'string' ? this.escapeTypst(rawText) : '';

    const marks = this.getMarks(node);
    if (marks.length === 0) return baseText;

    return this.applyTypstMarks(baseText, marks);
  }

  private applyTypstMarks(text: string, marks: string[]): string {
    return applyMarks(text, marks, TYPST_MARK_TAGS);
  }

  private extractPlainText(node: ProseMirrorNode): string {
    if (!node) return '';
    if (typeof node === 'string') return node;
    if (Array.isArray(node))
      return node.map(n => this.extractPlainText(n)).join('');

    const nodeName = this.getNodeName(node);
    if (nodeName === 'elementref') {
      const attrs = node['attrs'] as Record<string, unknown> | undefined;
      const displayText = attrs?.['displayText'];
      return typeof displayText === 'string' ? displayText : '';
    }

    const text = node['text'];
    if (typeof text === 'string') return text;

    const children = this.getChildren(node);
    return children.map(c => this.extractPlainText(c)).join('');
  }

  private getNodeName(node: ProseMirrorNode): string {
    if (typeof node !== 'object' || !node) return '';
    if ('nodeName' in node) return String(node['nodeName']).toLowerCase();
    if ('type' in node) return String(node['type']).toLowerCase();
    return '';
  }

  private getChildren(node: ProseMirrorNode): ProseMirrorNode[] {
    if (typeof node !== 'object' || !node) return [];
    if ('content' in node && Array.isArray(node['content']))
      return node['content'] as ProseMirrorNode[];
    if ('children' in node && Array.isArray(node['children']))
      return node['children'] as ProseMirrorNode[];
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

  private getAttr(
    node: ProseMirrorNode,
    key: string,
    defaultValue: number
  ): number {
    if (typeof node !== 'object' || !node) return defaultValue;
    const attrs = (node as Record<string, unknown>)['attrs'];
    if (typeof attrs !== 'object' || !attrs) return defaultValue;
    const value = (attrs as Record<string, unknown>)[key];
    return typeof value === 'number' ? value : defaultValue;
  }

  private formatChapterTitle(
    title: string,
    chapterNumber: number,
    isChapter: boolean,
    options: PublishOptions
  ): string {
    if (!isChapter || options.chapterNumbering === ChapterNumbering.None) {
      return title;
    }
    return title;
  }

  private formatChapterNumber(
    chapterNumber: number,
    isChapter: boolean,
    options: PublishOptions
  ): string {
    if (!isChapter || options.chapterNumbering === ChapterNumbering.None) {
      return '';
    }
    switch (options.chapterNumbering) {
      case ChapterNumbering.Numeric:
        return `Chapter ${chapterNumber + 1}`;
      case ChapterNumbering.Roman:
        return `Chapter ${this.toRoman(chapterNumber + 1)}`;
      case ChapterNumbering.Written:
        return `Chapter ${this.toWritten(chapterNumber + 1)}`;
      default:
        return '';
    }
  }

  private escapeTypst(text: string): string {
    if (!text) return '';
    return text
      .replaceAll('\\', String.raw`\\`)
      .replaceAll('#', String.raw`\#`)
      .replaceAll('$', String.raw`\$`)
      .replaceAll('_', String.raw`\_`)
      .replaceAll('*', String.raw`\*`)
      .replaceAll('@', String.raw`\@`)
      .replaceAll('[', String.raw`\[`)
      .replaceAll(']', String.raw`\]`)
      .replaceAll('`', String.raw`\``);
  }

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
    for (const [value, numeral] of romanNumerals) {
      while (num >= value) {
        result += numeral;
        num -= value;
      }
    }
    return result;
  }

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
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty'];

    if (num < 20) return words[num];
    if (num < 60) {
      const t = Math.floor(num / 10);
      const u = num % 10;
      return tens[t] + (u > 0 ? '-' + words[u] : '');
    }
    return String(num);
  }

  /**
   * Render a preview of the plan as inline SVG using Typst WASM.
   * Returns an SVG markup string suitable for direct DOM injection.
   */
  async renderSvgPreview(plan: PublishPlan): Promise<string> {
    this.isCancelled = false;
    this.initTypst();
    this.coverImageData = null;

    if (plan.options.includeCover) {
      await this.loadCoverImage();
    }

    const ctx: PdfContext = {
      markup: this.getTypstTemplate(plan),
      options: plan.options,
      styles: plan.styles,
      wordCount: 0,
      chapterCount: 0,
    };

    const result: PdfResult = { success: false, warnings: [] };
    await this.processContent(plan, ctx, result);

    // Map cover image if available
    const coverData = this.coverImageData as CoverImageData | null;
    if (coverData) {
      const response = await fetch(coverData.base64);
      const buffer = await response.arrayBuffer();
      await $typst.mapShadow('cover.jpg', new Uint8Array(buffer));
    }

    return await $typst.svg({ mainContent: ctx.markup });
  }

  private generateFilename(title: string): string {
    const safeName = trimHyphens(
      title.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')
    );
    return `${safeName || 'document'}.pdf`;
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

/**
 * Wrap a raw string as a Typst string literal (escapes `\` and `"`).
 */
function typstString(s: string): string {
  // Single backslash and double quote derived from char codes to avoid
  // double-escaped sequences in source (Sonar S7780).
  const BACKSLASH = String.fromCodePoint(92);
  const QUOTE = String.fromCodePoint(34);
  const escaped = s
    .replaceAll(BACKSLASH, BACKSLASH + BACKSLASH)
    .replaceAll(QUOTE, BACKSLASH + QUOTE);
  return QUOTE + escaped + QUOTE;
}
