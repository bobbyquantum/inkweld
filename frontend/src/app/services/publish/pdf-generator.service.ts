import { inject, Injectable } from '@angular/core';
import { Element, ElementType } from '@inkweld/index';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import type {
  Content,
  ContentText,
  TDocumentDefinitions,
} from 'pdfmake/interfaces';
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

// Initialize pdfmake with fonts
pdfMake.vfs = pdfFonts.vfs;

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

// ProseMirror node type for conversion
type ProseMirrorNode =
  | string
  | { [key: string]: unknown }
  | ProseMirrorNode[]
  | null
  | undefined;

/**
 * PDF Generator Service using pdfmake
 *
 * Generates simple PDF documents suitable for text-heavy content like novels.
 * For advanced layouts (game content, character sheets, etc.), a future
 * PDF_LAYOUT format using pdfkit will be added.
 */
@Injectable({
  providedIn: 'root',
})
export class PdfGeneratorService {
  private readonly logger = inject(LoggerService);
  private readonly documentService = inject(DocumentService);
  private readonly projectStateService = inject(ProjectStateService);
  private readonly offlineStorage = inject(OfflineStorageService);

  private coverImageData: { base64: string; mimeType: string } | null = null;

  private readonly progressSubject = new BehaviorSubject<PdfProgress>({
    phase: PdfPhase.Idle,
    overallProgress: 0,
    message: 'Ready',
    totalItems: 0,
    completedItems: 0,
  });

  private readonly completeSubject = new Subject<PdfResult>();
  private isCancelled = false;

  readonly progress$: Observable<PdfProgress> =
    this.progressSubject.asObservable();
  readonly complete$: Observable<PdfResult> =
    this.completeSubject.asObservable();

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
        message: 'Initializing PDF generation...',
        totalItems: plan.items.length,
        completedItems: 0,
      });

      // Load cover image if enabled
      if (plan.options.includeCover) {
        await this.loadCoverImage();
      }

      // Process content into pdfmake format
      const content = await this.processContent(plan, result);

      if (this.isCancelled) {
        result.error = 'Generation cancelled';
        this.completeSubject.next(result);
        return result;
      }

      this.updateProgress({
        phase: PdfPhase.GeneratingPdf,
        overallProgress: 80,
        message: 'Generating PDF...',
      });

      // Build document definition
      const docDefinition = this.buildDocumentDefinition(
        content,
        plan.metadata,
        plan.options
      );

      // Generate PDF
      const blob = await this.createPdfBlob(docDefinition);

      // Calculate stats
      const wordCount = this.countWordsInContent(content);

      result.success = true;
      result.file = blob;
      result.filename = this.generateFilename(plan.metadata.title);
      result.stats = {
        wordCount,
        chapterCount: content.filter(
          c =>
            typeof c === 'object' && 'style' in c && c.style === 'chapterTitle'
        ).length,
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
    } catch (error) {
      this.logger.error('PdfGenerator', 'Generation failed', error);
      result.error = error instanceof Error ? error.message : 'Unknown error';

      this.updateProgress({
        phase: PdfPhase.Error,
        message: result.error,
      });

      this.completeSubject.next(result);
      return result;
    }
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
        // Convert blob to base64 for pdfmake
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
    result: PdfResult
  ): Promise<Content[]> {
    const content: Content[] = [];
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
        const itemContent = await this.processItem(
          item,
          elements,
          plan,
          chapterNumber
        );
        content.push(...itemContent);

        if (item.type === PublishPlanItemType.Element && item.isChapter) {
          chapterNumber++;
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

    return content;
  }

  private async processItem(
    item: PublishPlanItem,
    elements: Element[],
    plan: PublishPlan,
    chapterNumber: number
  ): Promise<Content[]> {
    switch (item.type) {
      case PublishPlanItemType.Element:
        return this.processElementItem(
          item,
          elements,
          plan.options,
          chapterNumber
        );

      case PublishPlanItemType.Separator:
        return this.processSeparator(item, plan.options);

      case PublishPlanItemType.Frontmatter:
        return this.processFrontmatter(item, plan.metadata);

      case PublishPlanItemType.TableOfContents:
        // TOC is handled differently in PDF - we'll add it as a placeholder
        return [
          { text: 'Table of Contents', style: 'tocTitle', pageBreak: 'before' },
        ];

      default:
        return [];
    }
  }

  private async processElementItem(
    item: ElementItem,
    elements: Element[],
    options: PublishOptions,
    chapterNumber: number
  ): Promise<Content[]> {
    const element = elements.find(e => e.id === item.elementId);
    if (!element) {
      throw new Error(`Element not found: ${item.elementId}`);
    }

    const content: Content[] = [];

    if (element.type === ElementType.Item) {
      const docContent = await this.getDocumentContent(element.id);
      const title = item.titleOverride || element.name;
      const formattedTitle = this.formatChapterTitle(
        title,
        chapterNumber,
        item.isChapter ?? false,
        options
      );

      // Add chapter title
      content.push({
        text: formattedTitle,
        style: 'chapterTitle',
        pageBreak: chapterNumber > 0 ? 'before' : undefined,
      });

      // Add document content
      content.push(...docContent);
    } else if (element.type === ElementType.Folder && item.includeChildren) {
      const children = this.getChildElements(element, elements);

      for (const child of children) {
        if (child.type === ElementType.Item) {
          const docContent = await this.getDocumentContent(child.id);
          content.push({
            text: child.name,
            style: 'sectionTitle',
          });
          content.push(...docContent);
        }
      }
    }

    return content;
  }

  private processSeparator(
    item: SeparatorItem,
    options: PublishOptions
  ): Content[] {
    switch (item.style) {
      case SeparatorStyle.PageBreak:
        return [{ text: '', pageBreak: 'after' }];

      case SeparatorStyle.SceneBreak:
        return [
          {
            text: item.customText || options.sceneBreakText || '* * *',
            style: 'sceneBreak',
            alignment: 'center',
            margin: [0, 20, 0, 20],
          },
        ];

      case SeparatorStyle.ChapterBreak:
        return [{ text: '', pageBreak: 'after' }];

      default:
        return [];
    }
  }

  private processFrontmatter(
    item: FrontmatterItem,
    metadata: PublishMetadata
  ): Content[] {
    switch (item.contentType) {
      case FrontmatterType.TitlePage:
        return this.generateTitlePage(metadata);

      case FrontmatterType.Copyright:
        return this.generateCopyrightPage(metadata);

      case FrontmatterType.Dedication:
        return [
          { text: '', pageBreak: 'before' },
          {
            text: item.customContent || '',
            style: 'dedication',
            alignment: 'center',
            margin: [50, 100, 50, 0],
          },
        ];

      case FrontmatterType.Custom:
        return [
          {
            text: item.customTitle || '',
            style: 'sectionTitle',
            pageBreak: 'before',
          },
          { text: item.customContent || '', style: 'body' },
        ];

      default:
        return [];
    }
  }

  private generateTitlePage(metadata: PublishMetadata): Content[] {
    const content: Content[] = [];

    // Add cover image if available
    if (this.coverImageData) {
      content.push({
        image: this.coverImageData.base64,
        width: 400,
        alignment: 'center',
        margin: [0, 0, 0, 30],
      });
    }

    content.push({
      text: metadata.title,
      style: 'title',
      alignment: 'center',
      margin: [0, this.coverImageData ? 20 : 150, 0, 10],
    });

    if (metadata.subtitle) {
      content.push({
        text: metadata.subtitle,
        style: 'subtitle',
        alignment: 'center',
        margin: [0, 0, 0, 30],
      });
    }

    content.push({
      text: metadata.author,
      style: 'author',
      alignment: 'center',
      margin: [0, 30, 0, 0],
    });

    return content;
  }

  private generateCopyrightPage(metadata: PublishMetadata): Content[] {
    const year = new Date().getFullYear();
    const lines: string[] = [];

    lines.push(metadata.title);
    if (metadata.subtitle) lines.push(metadata.subtitle);
    lines.push('');
    lines.push(metadata.copyright || `Copyright © ${year} ${metadata.author}`);
    lines.push('All rights reserved.');
    lines.push('');

    if (metadata.publisher) {
      lines.push(`Published by ${metadata.publisher}`);
    }

    if (metadata.isbn) {
      lines.push(`ISBN: ${metadata.isbn}`);
    }

    return [
      { text: '', pageBreak: 'before' },
      {
        text: lines.join('\n'),
        style: 'copyright',
        margin: [0, 200, 0, 0],
      },
    ];
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

  private async getDocumentContent(elementId: string): Promise<Content[]> {
    const fullDocId = this.getFullDocumentId(elementId);

    try {
      const content = await this.documentService.getDocumentContent(fullDocId);
      if (!content) {
        return [{ text: 'Document is empty', style: 'body', italics: true }];
      }
      return this.prosemirrorToPdfContent(content);
    } catch (error) {
      this.logger.warn(
        'PdfGenerator',
        `Failed to get document content: ${fullDocId}`,
        error
      );
      return [{ text: 'Content unavailable', style: 'body', italics: true }];
    }
  }

  /**
   * Convert ProseMirror document to PDF content array
   */
  private prosemirrorToPdfContent(data: unknown): Content[] {
    if (!data) return [];

    if (Array.isArray(data)) {
      return data.flatMap(node => this.nodeToContent(node as ProseMirrorNode));
    }

    if (typeof data === 'object') {
      return this.nodeToContent(data as ProseMirrorNode);
    }

    return [];
  }

  private nodeToContent(node: ProseMirrorNode): Content[] {
    if (!node) return [];

    if (typeof node === 'string') {
      return [{ text: node, style: 'body' }];
    }

    if (Array.isArray(node)) {
      return node.flatMap(n => this.nodeToContent(n));
    }

    const nodeName = this.getNodeName(node);
    const children = this.getChildren(node);

    switch (nodeName) {
      case 'paragraph': {
        const textParts = children.flatMap(c => this.extractText(c));
        if (textParts.length === 0) return [];
        return [{ text: textParts, style: 'body', margin: [0, 0, 0, 10] }];
      }

      case 'heading': {
        const level = this.getAttr(node, 'level', 1);
        const headingText = children
          .map(c => this.extractPlainText(c))
          .join('');
        return [
          {
            text: headingText,
            style: `heading${level}`,
            margin: [0, 15, 0, 10],
          },
        ];
      }

      case 'blockquote':
        return [
          {
            text: children.map(c => this.extractPlainText(c)).join('\n'),
            style: 'blockquote',
            margin: [30, 10, 30, 10],
          },
        ];

      case 'bullet_list':
        return [
          {
            ul: children.map(c => this.extractPlainText(c)),
            margin: [0, 5, 0, 5],
          },
        ];

      case 'ordered_list':
        return [
          {
            ol: children.map(c => this.extractPlainText(c)),
            margin: [0, 5, 0, 5],
          },
        ];

      case 'hard_break':
        return [{ text: '\n' }];

      case 'horizontal_rule':
        return [
          {
            canvas: [
              {
                type: 'line',
                x1: 0,
                y1: 0,
                x2: 515,
                y2: 0,
                lineWidth: 0.5,
              },
            ],
            margin: [0, 10, 0, 10],
          },
        ];

      default:
        // Process children for unknown nodes
        return children.flatMap(c => this.nodeToContent(c));
    }
  }

  private extractText(node: ProseMirrorNode): (string | ContentText)[] {
    if (!node) return [];

    if (typeof node === 'string') {
      return [node];
    }

    if (Array.isArray(node)) {
      return node.flatMap(n => this.extractText(n));
    }

    const nodeName = this.getNodeName(node);
    const children = this.getChildren(node);
    const marks = this.getMarks(node);

    // Text node with marks
    if (nodeName === 'text' || !nodeName) {
      const rawText = (node as Record<string, unknown>)['text'];
      const text = typeof rawText === 'string' ? rawText : '';
      if (marks.length === 0) return [text];

      const styled: ContentText = { text };
      for (const mark of marks) {
        if (mark === 'bold' || mark === 'strong') styled.bold = true;
        if (mark === 'italic' || mark === 'em') styled.italics = true;
        if (mark === 'underline') styled.decoration = 'underline';
        if (mark === 'strike') styled.decoration = 'lineThrough';
      }
      return [styled];
    }

    return children.flatMap(c => this.extractText(c));
  }

  private extractPlainText(node: ProseMirrorNode): string {
    if (!node) return '';
    if (typeof node === 'string') return node;
    if (Array.isArray(node))
      return node.map(n => this.extractPlainText(n)).join('');

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

  private buildDocumentDefinition(
    content: Content[],
    metadata: PublishMetadata,
    options: PublishOptions
  ): TDocumentDefinitions {
    return {
      info: {
        title: metadata.title,
        author: metadata.author,
        subject: metadata.description || '',
        keywords: metadata.keywords?.join(', ') || '',
      },
      pageSize: 'LETTER',
      pageMargins: [72, 72, 72, 72], // 1 inch margins
      content,
      styles: {
        title: {
          fontSize: 28,
          bold: true,
          font: 'Helvetica',
        },
        subtitle: {
          fontSize: 18,
          italics: true,
        },
        author: {
          fontSize: 16,
        },
        chapterTitle: {
          fontSize: 24,
          bold: true,
          margin: [0, 0, 0, 20],
        },
        sectionTitle: {
          fontSize: 18,
          bold: true,
          margin: [0, 15, 0, 10],
        },
        body: {
          fontSize: options.fontSize || 12,
          lineHeight: options.lineHeight || 1.5,
          font: 'Times',
        },
        heading1: {
          fontSize: 20,
          bold: true,
        },
        heading2: {
          fontSize: 16,
          bold: true,
        },
        heading3: {
          fontSize: 14,
          bold: true,
        },
        blockquote: {
          fontSize: 11,
          italics: true,
          color: '#555555',
        },
        sceneBreak: {
          fontSize: 14,
        },
        copyright: {
          fontSize: 10,
          color: '#666666',
        },
        dedication: {
          fontSize: 14,
          italics: true,
        },
        tocTitle: {
          fontSize: 20,
          bold: true,
          margin: [0, 0, 0, 20],
        },
      },
      defaultStyle: {
        font: 'Times',
        fontSize: 12,
      },
    };
  }

  private createPdfBlob(docDefinition: TDocumentDefinitions): Promise<Blob> {
    return new Promise((resolve, reject) => {
      try {
        const pdfDoc = pdfMake.createPdf(docDefinition);
        pdfDoc.getBlob((blob: Blob) => {
          resolve(blob);
        });
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private countWordsInContent(content: Content[]): number {
    let count = 0;
    for (const item of content) {
      if (typeof item === 'string') {
        count += item.split(/\s+/).filter(Boolean).length;
      } else if (typeof item === 'object' && item && 'text' in item) {
        const text = item.text;
        if (typeof text === 'string') {
          count += text.split(/\s+/).filter(Boolean).length;
        } else if (Array.isArray(text)) {
          for (const t of text) {
            if (typeof t === 'string') {
              count += t.split(/\s+/).filter(Boolean).length;
            } else if (typeof t === 'object' && t && 'text' in t) {
              const tText = (t as { text: unknown }).text;
              count += (typeof tText === 'string' ? tText : '')
                .split(/\s+/)
                .filter(Boolean).length;
            }
          }
        }
      }
    }
    return count;
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
