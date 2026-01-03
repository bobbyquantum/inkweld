import { inject, Injectable } from '@angular/core';
import { Element, ElementType } from '@inkweld/index';
import { $typst } from '@myriaddreamin/typst.ts/contrib/snippet';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

import {
  ChapterNumbering,
  ElementItem,
  FrontmatterItem,
  FrontmatterType,
  PublishMetadata,
  PublishOptions,
  PublishPlan,
  PublishPlanItem,
  PublishPlanItemType,
  PublishStats,
  SeparatorItem,
  SeparatorStyle,
} from '../../models/publish-plan';
import { LoggerService } from '../core/logger.service';
import { OfflineStorageService } from '../offline/offline-storage.service';
import { DocumentService } from '../project/document.service';
import { ProjectStateService } from '../project/project-state.service';

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
  private readonly offlineStorage = inject(OfflineStorageService);

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
    const fontSize = plan.options.fontSize || 12;
    const lineHeight = plan.options.lineHeight || 1.5;
    const sceneBreakText = this.escapeTypst(
      plan.options.sceneBreakText || '* * *'
    );

    return `
#set page(paper: "us-letter", margin: 1in)
#set text(font: "Linux Libertine", size: ${fontSize}pt)
#set par(justify: true, leading: ${lineHeight - 1}em)

#let quote(body) = block(
  inset: (left: 1em),
  stroke: (left: 0.5pt + gray),
  emph(body)
)

#let scene-break() = align(center)[
  #v(1em)
  ${sceneBreakText}
  #v(1em)
]

`;
  }

  private updateProgress(updates: Partial<PdfProgress>): void {
    const current = this.progressSubject.getValue();
    this.progressSubject.next({ ...current, ...updates });
  }

  private async loadCoverImage(): Promise<void> {
    const project = this.projectStateService.project();
    if (!project) return;

    try {
      const coverBlob = await this.offlineStorage.getProjectCover(
        project.username,
        project.slug
      );

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
    }
  }

  private async processElementItem(
    item: ElementItem,
    elements: Element[],
    ctx: PdfContext,
    chapterNumber: number
  ): Promise<void> {
    const element = elements.find(e => e.id === item.elementId);
    if (!element) {
      throw new Error(`Element not found: ${item.elementId}`);
    }

    if (element.type === ElementType.Item) {
      const title = item.titleOverride || element.name;
      const formattedTitle = this.formatChapterTitle(
        title,
        chapterNumber,
        item.isChapter ?? false,
        ctx.options
      );

      // Add chapter title
      if (chapterNumber > 0 || item.isChapter) {
        ctx.markup += '#pagebreak(weak: true)\n';
      }
      ctx.markup += `= ${formattedTitle}\n\n`;

      // Add document content
      await this.addDocumentContent(element.id, ctx);
    } else if (element.type === ElementType.Folder && item.includeChildren) {
      const children = this.getChildElements(element, elements);

      for (const child of children) {
        if (child.type === ElementType.Item) {
          ctx.markup += `== ${child.name}\n\n`;
          await this.addDocumentContent(child.id, ctx);
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

      case SeparatorStyle.SceneBreak:
        ctx.markup += '#scene-break()\n\n';
        break;
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

    ctx.markup += `#set text(size: ${ctx.options.fontSize || 12}pt, fill: black)\n`;
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
        const level = this.getAttr(node, 'level', 1);
        const prefix = '='.repeat(level + 1); // +1 because level 1 is reserved for chapters
        const text = children.map(c => this.extractPlainText(c)).join('');
        ctx.markup += `${prefix} ${this.escapeTypst(text)}\n\n`;
        break;
      }

      case 'blockquote':
        ctx.markup += '#quote[\n';
        children.forEach(c => {
          ctx.markup += `  ${this.extractTypstText(c)}\n`;
        });
        ctx.markup += ']\n\n';
        break;

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

      default:
        // Process children for unknown nodes
        children.forEach(c => this.nodeToTypst(c, ctx));
    }
  }

  private extractTypstText(node: ProseMirrorNode): string {
    if (!node) return '';

    if (typeof node === 'string') {
      return this.escapeTypst(node);
    }

    if (Array.isArray(node)) {
      return node.map(n => this.extractTypstText(n)).join('');
    }

    const nodeName = this.getNodeName(node);
    const children = this.getChildren(node);
    const marks = this.getMarks(node);

    // Handle elementRef nodes
    if (nodeName === 'elementref') {
      const attrs = (node as Record<string, unknown>)['attrs'] as
        | Record<string, unknown>
        | undefined;
      const displayText = attrs?.['displayText'];
      return typeof displayText === 'string' && displayText
        ? this.escapeTypst(displayText)
        : '';
    }

    // Text node with marks
    if (nodeName === 'text' || !nodeName) {
      const rawText = (node as Record<string, unknown>)['text'];
      let text = typeof rawText === 'string' ? this.escapeTypst(rawText) : '';

      if (marks.length === 0) return text;

      for (const mark of marks) {
        if (mark === 'bold' || mark === 'strong') text = `*${text}*`;
        if (mark === 'italic' || mark === 'em') text = `_${text}_`;
        if (mark === 'underline') text = `#underline[${text}]`;
        if (mark === 'strike') text = `#strike[${text}]`;
        if (mark === 'code') text = `\`${text}\``;
      }
      return text;
    }

    return children.map(c => this.extractTypstText(c)).join('');
  }

  private extractPlainText(node: ProseMirrorNode): string {
    if (!node) return '';
    if (typeof node === 'string') return node;
    if (Array.isArray(node))
      return node.map(n => this.extractPlainText(n)).join('');

    const nodeName = this.getNodeName(node);
    if (nodeName === 'elementref') {
      const attrs = (node as Record<string, unknown>)['attrs'] as
        | Record<string, unknown>
        | undefined;
      const displayText = attrs?.['displayText'];
      return typeof displayText === 'string' ? displayText : '';
    }

    const text = (node as Record<string, unknown>)['text'];
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

  private escapeTypst(text: string): string {
    if (!text) return '';
    return text
      .replace(/\\/g, '\\\\')
      .replace(/#/g, '\\#')
      .replace(/\$/g, '\\$')
      .replace(/_/g, '\\_')
      .replace(/\*/g, '\\*')
      .replace(/@/g, '\\@')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/`/g, '\\`');
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

  private generateFilename(title: string): string {
    const safeName = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `${safeName || 'document'}.pdf`;
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
