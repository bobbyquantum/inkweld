import { inject, Injectable } from '@angular/core';
import { Element, ElementType } from '@inkweld/index';
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
import { LocalStorageService } from '../local/local-storage.service';
import { DocumentService } from '../project/document.service';
import { ProjectStateService } from '../project/project-state.service';

export interface HtmlProgress {
  phase: HtmlPhase;
  overallProgress: number;
  message: string;
  totalItems: number;
  completedItems: number;
}

export enum HtmlPhase {
  Idle = 'idle',
  Processing = 'processing',
  Complete = 'complete',
  Error = 'error',
}

export interface HtmlResult {
  success: boolean;
  file?: Blob;
  filename?: string;
  stats?: PublishStats;
  warnings: string[];
  error?: string;
}

type ProseMirrorNode =
  | string
  | { [key: string]: unknown }
  | ProseMirrorNode[]
  | null
  | undefined;

/**
 * HTML Generator Service
 *
 * Generates a single HTML file with all content, suitable for
 * web viewing or further conversion.
 */
@Injectable({
  providedIn: 'root',
})
export class HtmlGeneratorService {
  private readonly logger = inject(LoggerService);
  private readonly documentService = inject(DocumentService);
  private readonly projectStateService = inject(ProjectStateService);
  private readonly localStorage = inject(LocalStorageService);

  private coverImageData: string | null = null;

  private readonly progressSubject = new BehaviorSubject<HtmlProgress>({
    phase: HtmlPhase.Idle,
    overallProgress: 0,
    message: 'Ready',
    totalItems: 0,
    completedItems: 0,
  });

  private readonly completeSubject = new Subject<HtmlResult>();

  readonly progress$: Observable<HtmlProgress> =
    this.progressSubject.asObservable();
  readonly complete$: Observable<HtmlResult> =
    this.completeSubject.asObservable();

  async generateHtml(plan: PublishPlan): Promise<HtmlResult> {
    const startTime = Date.now();
    const result: HtmlResult = { success: false, warnings: [] };

    try {
      this.updateProgress({
        phase: HtmlPhase.Processing,
        overallProgress: 10,
        message: 'Generating HTML...',
        totalItems: plan.items.length,
        completedItems: 0,
      });

      // Load cover if enabled
      if (plan.options.includeCover) {
        await this.loadCoverImage();
      }

      // Generate HTML content
      const htmlContent = await this.buildHtml(plan, result);

      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });

      result.success = true;
      result.file = blob;
      result.filename = this.generateFilename(plan.metadata.title);
      result.stats = {
        wordCount: this.countWords(htmlContent),
        chapterCount: plan.items.filter(
          i => i.type === PublishPlanItemType.Element && i.isChapter
        ).length,
        documentCount: plan.items.filter(
          i => i.type === PublishPlanItemType.Element
        ).length,
        fileSize: blob.size,
        generationTimeMs: Date.now() - startTime,
      };

      this.updateProgress({
        phase: HtmlPhase.Complete,
        overallProgress: 100,
        message: 'HTML generated successfully',
      });

      this.completeSubject.next(result);
      return result;
    } catch (error) {
      this.logger.error('HtmlGenerator', 'Generation failed', error);
      result.error = error instanceof Error ? error.message : 'Unknown error';
      this.updateProgress({ phase: HtmlPhase.Error, message: result.error });
      this.completeSubject.next(result);
      return result;
    }
  }

  private updateProgress(updates: Partial<HtmlProgress>): void {
    const current = this.progressSubject.getValue();
    this.progressSubject.next({ ...current, ...updates });
  }

  private async loadCoverImage(): Promise<void> {
    const project = this.projectStateService.project();
    if (!project) return;

    try {
      const coverBlob = await this.localStorage.getProjectCover(
        project.username,
        project.slug
      );
      if (coverBlob) {
        this.coverImageData = await this.blobToBase64(coverBlob);
      }
    } catch (error) {
      this.logger.warn('HtmlGenerator', 'Failed to load cover', error);
    }
  }

  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private async buildHtml(
    plan: PublishPlan,
    result: HtmlResult
  ): Promise<string> {
    const elements = this.projectStateService.elements();
    const sections: string[] = [];
    let chapterNumber = 0;

    for (const item of plan.items) {
      const content = await this.processItem(
        item,
        elements,
        plan,
        chapterNumber,
        result
      );
      sections.push(content);

      if (item.type === PublishPlanItemType.Element && item.isChapter) {
        chapterNumber++;
      }
    }

    return this.wrapInHtmlDocument(
      sections.join('\n'),
      plan.metadata,
      plan.options
    );
  }

  private async processItem(
    item: PublishPlanItem,
    elements: Element[],
    plan: PublishPlan,
    chapterNumber: number,
    _result: HtmlResult
  ): Promise<string> {
    switch (item.type) {
      case PublishPlanItemType.Element:
        return this.processElement(item, elements, plan.options, chapterNumber);

      case PublishPlanItemType.Separator:
        return this.processSeparator(item, plan.options);

      case PublishPlanItemType.Frontmatter:
        return this.processFrontmatter(item, plan.metadata);

      case PublishPlanItemType.TableOfContents:
        return '<nav class="toc"><h2>Table of Contents</h2></nav>';

      default:
        return '';
    }
  }

  private async processElement(
    item: ElementItem,
    elements: Element[],
    options: PublishOptions,
    chapterNumber: number
  ): Promise<string> {
    const element = elements.find(e => e.id === item.elementId);
    if (!element) return '';

    const parts: string[] = [];

    if (element.type === ElementType.Item) {
      const content = await this.getDocumentContent(element.id);
      const title = item.titleOverride || element.name;
      const formattedTitle = this.formatChapterTitle(
        title,
        chapterNumber,
        item.isChapter ?? false,
        options
      );

      parts.push(`<section class="chapter">`);
      parts.push(`<h1>${this.escapeHtml(formattedTitle)}</h1>`);
      parts.push(content);
      parts.push(`</section>`);
    } else if (element.type === ElementType.Folder && item.includeChildren) {
      const children = this.getChildElements(element, elements);
      for (const child of children) {
        if (child.type === ElementType.Item) {
          const content = await this.getDocumentContent(child.id);
          parts.push(`<section class="section">`);
          parts.push(`<h2>${this.escapeHtml(child.name)}</h2>`);
          parts.push(content);
          parts.push(`</section>`);
        }
      }
    }

    return parts.join('\n');
  }

  private processSeparator(
    item: SeparatorItem,
    options: PublishOptions
  ): string {
    switch (item.style) {
      case SeparatorStyle.PageBreak:
        return '<div class="page-break"></div>';
      case SeparatorStyle.SceneBreak:
        return `<div class="scene-break">${this.escapeHtml(item.customText || options.sceneBreakText || '* * *')}</div>`;
      case SeparatorStyle.ChapterBreak:
        return '<hr class="chapter-break" />';
      default:
        return '';
    }
  }

  private processFrontmatter(
    item: FrontmatterItem,
    metadata: PublishMetadata
  ): string {
    switch (item.contentType) {
      case FrontmatterType.TitlePage:
        return this.generateTitlePage(metadata);
      case FrontmatterType.Copyright:
        return this.generateCopyrightPage(metadata);
      case FrontmatterType.Dedication:
        return `<section class="dedication"><p>${this.escapeHtml(item.customContent || '')}</p></section>`;
      case FrontmatterType.Custom:
        return `<section class="custom"><h2>${this.escapeHtml(item.customTitle || '')}</h2><p>${this.escapeHtml(item.customContent || '')}</p></section>`;
      default:
        return '';
    }
  }

  private generateTitlePage(metadata: PublishMetadata): string {
    const parts: string[] = ['<section class="title-page">'];

    if (this.coverImageData) {
      parts.push(
        `<img src="${this.coverImageData}" alt="Cover" class="cover-image" />`
      );
    }

    parts.push(`<h1 class="title">${this.escapeHtml(metadata.title)}</h1>`);

    if (metadata.subtitle) {
      parts.push(
        `<p class="subtitle">${this.escapeHtml(metadata.subtitle)}</p>`
      );
    }

    parts.push(`<p class="author">${this.escapeHtml(metadata.author)}</p>`);
    parts.push('</section>');

    return parts.join('\n');
  }

  private generateCopyrightPage(metadata: PublishMetadata): string {
    const year = new Date().getFullYear();
    const parts: string[] = ['<section class="copyright">'];

    parts.push(
      `<p>${this.escapeHtml(metadata.copyright || `Copyright © ${year} ${metadata.author}`)}</p>`
    );
    parts.push('<p>All rights reserved.</p>');

    if (metadata.publisher) {
      parts.push(`<p>Published by ${this.escapeHtml(metadata.publisher)}</p>`);
    }

    if (metadata.isbn) {
      parts.push(`<p>ISBN: ${this.escapeHtml(metadata.isbn)}</p>`);
    }

    parts.push('</section>');
    return parts.join('\n');
  }

  private getChildElements(parent: Element, allElements: Element[]): Element[] {
    const parentIndex = allElements.indexOf(parent);
    const children: Element[] = [];
    for (let i = parentIndex + 1; i < allElements.length; i++) {
      if (allElements[i].level <= parent.level) break;
      children.push(allElements[i]);
    }
    return children;
  }

  private getFullDocumentId(elementId: string): string {
    if (elementId.includes(':')) return elementId;
    const project = this.projectStateService.project();
    if (!project) return elementId;
    return `${project.username}:${project.slug}:${elementId}`;
  }

  private async getDocumentContent(elementId: string): Promise<string> {
    const fullDocId = this.getFullDocumentId(elementId);

    try {
      const content = await this.documentService.getDocumentContent(fullDocId);
      if (!content) return '<p>Document is empty</p>';
      return this.prosemirrorToHtml(content);
    } catch {
      return '<p>Content unavailable</p>';
    }
  }

  /**
   * Convert ProseMirror document structure to HTML
   */
  private prosemirrorToHtml(data: unknown): string {
    if (!data) return '';
    if (Array.isArray(data)) {
      return data
        .map(node => this.nodeToHtml(node as ProseMirrorNode))
        .join('');
    }
    if (typeof data === 'object') {
      return this.nodeToHtml(data as ProseMirrorNode);
    }
    return '';
  }

  private nodeToHtml(node: ProseMirrorNode): string {
    if (!node) return '';
    if (typeof node === 'string') return this.escapeHtml(node);
    if (Array.isArray(node)) return node.map(n => this.nodeToHtml(n)).join('');

    // Handle ProseMirror text nodes (objects with 'text' property)
    if (
      typeof node === 'object' &&
      'text' in node &&
      typeof node['text'] === 'string'
    ) {
      const text = this.escapeHtml(node['text']);
      return this.applyMarks(text, node);
    }

    // Handle elementRef nodes - render display text as plain text
    // These are design-time references, no special rendering or linking in published output
    if (typeof node === 'object' && node) {
      const nodeType =
        'type' in node
          ? (node['type'] as string)
          : (node['nodeName'] as string);
      if (nodeType === 'elementRef') {
        const attrs =
          'attrs' in node ? (node['attrs'] as Record<string, unknown>) : null;
        const displayText = attrs?.['displayText'] as string | undefined;
        return displayText ? this.escapeHtml(displayText) : '';
      }
    }

    const tagName = this.getTagName(node);
    const children = this.getChildren(node);
    const childHtml = children.map(c => this.nodeToHtml(c)).join('');

    if (['br', 'hr'].includes(tagName)) return `<${tagName} />`;
    return `<${tagName}>${childHtml}</${tagName}>`;
  }

  private getTagName(node: ProseMirrorNode): string {
    const typeMap: Record<string, string> = {
      paragraph: 'p',
      heading: 'h2',
      blockquote: 'blockquote',
      bullet_list: 'ul',
      ordered_list: 'ol',
      list_item: 'li',
      hard_break: 'br',
      horizontal_rule: 'hr',
    };

    if (typeof node === 'object' && node) {
      const name = (
        'nodeName' in node
          ? node['nodeName']
          : 'type' in node
            ? node['type']
            : ''
      ) as string;
      return typeMap[name.toLowerCase()] || name.toLowerCase() || 'div';
    }
    return 'span';
  }

  private getChildren(node: ProseMirrorNode): ProseMirrorNode[] {
    if (typeof node !== 'object' || !node) return [];
    if ('content' in node && Array.isArray(node['content']))
      return node['content'] as ProseMirrorNode[];
    if ('children' in node && Array.isArray(node['children']))
      return node['children'] as ProseMirrorNode[];
    return [];
  }

  private applyMarks(text: string, node: ProseMirrorNode): string {
    const marks = this.getMarks(node);
    let result = text;
    if (marks.includes('bold') || marks.includes('strong')) {
      result = `<strong>${result}</strong>`;
    }
    if (marks.includes('italic') || marks.includes('em')) {
      result = `<em>${result}</em>`;
    }
    if (marks.includes('code')) {
      result = `<code>${result}</code>`;
    }
    if (marks.includes('strike')) {
      result = `<del>${result}</del>`;
    }
    return result;
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

  private wrapInHtmlDocument(
    content: string,
    metadata: PublishMetadata,
    options: PublishOptions
  ): string {
    return `<!DOCTYPE html>
<html lang="${metadata.language || 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(metadata.title)}</title>
  <meta name="author" content="${this.escapeHtml(metadata.author)}">
  ${metadata.description ? `<meta name="description" content="${this.escapeHtml(metadata.description)}">` : ''}
  <style>
    body {
      font-family: ${options.fontFamily || 'Georgia, serif'};
      font-size: ${options.fontSize || 12}pt;
      line-height: ${options.lineHeight || 1.5};
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
      color: #333;
    }
    .title-page { text-align: center; margin-bottom: 3rem; }
    .title { font-size: 2.5rem; margin-bottom: 0.5rem; }
    .subtitle { font-size: 1.5rem; font-style: italic; color: #666; }
    .author { font-size: 1.25rem; margin-top: 2rem; }
    .cover-image { max-width: 100%; height: auto; margin-bottom: 2rem; }
    .chapter { margin-bottom: 3rem; }
    .chapter h1 { font-size: 1.75rem; border-bottom: 1px solid #ddd; padding-bottom: 0.5rem; }
    .scene-break { text-align: center; margin: 2rem 0; color: #666; }
    .page-break { page-break-after: always; }
    .copyright { font-size: 0.875rem; color: #666; margin-top: 2rem; }
    blockquote { border-left: 3px solid #ddd; padding-left: 1rem; margin-left: 0; font-style: italic; }
    ${options.customCss || ''}
  </style>
</head>
<body>
${content}
</body>
</html>`;
  }

  private formatChapterTitle(
    title: string,
    num: number,
    isChapter: boolean,
    options: PublishOptions
  ): string {
    if (!isChapter || options.chapterNumbering === ChapterNumbering.None)
      return title;

    const prefixes: Record<string, string> = {
      [ChapterNumbering.Numeric]: `Chapter ${num + 1}: `,
      [ChapterNumbering.Roman]: `Chapter ${this.toRoman(num + 1)}: `,
      [ChapterNumbering.Written]: `Chapter ${this.toWritten(num + 1)}: `,
    };

    return (prefixes[options.chapterNumbering] || '') + title;
  }

  private toRoman(num: number): string {
    const numerals: [number, string][] = [
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
    for (const [value, numeral] of numerals) {
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
    if (num < 60)
      return (
        tens[Math.floor(num / 10)] + (num % 10 > 0 ? '-' + words[num % 10] : '')
      );
    return String(num);
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private countWords(html: string): number {
    const text = html.replace(/<[^>]+>/g, ' ');
    return text.split(/\s+/).filter(Boolean).length;
  }

  private generateFilename(title: string): string {
    const safeName = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `${safeName || 'document'}.html`;
  }
}
