import { inject, Injectable } from '@angular/core';
import { type Element, ElementType } from '@inkweld/index';
import { xmlToMarkdown } from '@inkweld/prosemirror/markdown';
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
} from '../../models/publish-plan';
import { trimHyphens } from '../../utils/string-utils';
import { LoggerService } from '../core/logger.service';
import { DocumentService } from '../project/document.service';
import { ProjectStateService } from '../project/project-state.service';

export interface MarkdownProgress {
  phase: MarkdownPhase;
  overallProgress: number;
  message: string;
  totalItems: number;
  completedItems: number;
}

export enum MarkdownPhase {
  Idle = 'idle',
  Processing = 'processing',
  Complete = 'complete',
  Error = 'error',
}

export interface MarkdownResult {
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
 * Markdown Generator Service
 *
 * Generates a single Markdown file with all content.
 * Useful for importing into other tools or version control.
 */
@Injectable({
  providedIn: 'root',
})
export class MarkdownGeneratorService {
  private readonly logger = inject(LoggerService);
  private readonly documentService = inject(DocumentService);
  private readonly projectStateService = inject(ProjectStateService);

  private readonly progressSubject = new BehaviorSubject<MarkdownProgress>({
    phase: MarkdownPhase.Idle,
    overallProgress: 0,
    message: 'Ready',
    totalItems: 0,
    completedItems: 0,
  });

  private readonly completeSubject = new Subject<MarkdownResult>();

  readonly progress$: Observable<MarkdownProgress> =
    this.progressSubject.asObservable();
  readonly complete$: Observable<MarkdownResult> =
    this.completeSubject.asObservable();

  async generateMarkdown(plan: PublishPlan): Promise<MarkdownResult> {
    const startTime = Date.now();
    const result: MarkdownResult = { success: false, warnings: [] };

    try {
      this.updateProgress({
        phase: MarkdownPhase.Processing,
        overallProgress: 10,
        message: 'Generating Markdown...',
        totalItems: plan.items.length,
        completedItems: 0,
      });

      const mdContent = await this.buildMarkdown(plan, result);
      const blob = new Blob([mdContent], {
        type: 'text/markdown;charset=utf-8',
      });

      result.success = true;
      result.file = blob;
      result.filename = this.generateFilename(plan.metadata.title);
      result.stats = {
        wordCount: mdContent.split(/\s+/).filter(Boolean).length,
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
        phase: MarkdownPhase.Complete,
        overallProgress: 100,
        message: 'Markdown generated successfully',
      });

      this.completeSubject.next(result);
      return result;
    } catch (error) {
      this.logger.error('MarkdownGenerator', 'Generation failed', error);
      result.error = error instanceof Error ? error.message : 'Unknown error';
      this.updateProgress({
        phase: MarkdownPhase.Error,
        message: result.error,
      });
      this.completeSubject.next(result);
      return result;
    }
  }

  private updateProgress(updates: Partial<MarkdownProgress>): void {
    const current = this.progressSubject.getValue();
    this.progressSubject.next({ ...current, ...updates });
  }

  private async buildMarkdown(
    plan: PublishPlan,
    _result: MarkdownResult
  ): Promise<string> {
    const elements = this.projectStateService.elements();
    const sections: string[] = [];
    let chapterNumber = 0;

    // Add YAML frontmatter
    sections.push(this.generateFrontmatter(plan.metadata));

    for (const item of plan.items) {
      const content = await this.processItem(
        item,
        elements,
        plan.options,
        chapterNumber,
        plan
      );
      if (content.trim()) sections.push(content);

      if (item.type === PublishPlanItemType.Element && item.isChapter) {
        chapterNumber++;
      }
    }

    return sections.join('\n\n');
  }

  private generateFrontmatter(metadata: PublishMetadata): string {
    const keywordList = metadata.keywords?.length
      ? metadata.keywords.map(k => this.serializeYamlScalar(k)).join(', ')
      : null;
    const lines = [
      '---',
      `title: ${this.serializeYamlScalar(metadata.title)}`,
      `author: ${this.serializeYamlScalar(metadata.author)}`,
      ...(metadata.subtitle
        ? [`subtitle: ${this.serializeYamlScalar(metadata.subtitle)}`]
        : []),
      ...(metadata.description
        ? [`description: ${this.serializeYamlScalar(metadata.description)}`]
        : []),
      ...(metadata.language
        ? [`language: ${this.serializeYamlScalar(metadata.language)}`]
        : []),
      ...(keywordList ? [`keywords: [${keywordList}]`] : []),
      '---',
    ];
    return lines.join('\n');
  }

  private serializeYamlScalar(value: string): string {
    // JSON string encoding is valid YAML flow scalar syntax and safely escapes quotes/newlines.
    return JSON.stringify(value);
  }

  private async processItem(
    item: PublishPlanItem,
    elements: Element[],
    options: PublishOptions,
    chapterNumber: number,
    plan: PublishPlan
  ): Promise<string> {
    switch (item.type) {
      case PublishPlanItemType.Element:
        return this.processElement(item, elements, options, chapterNumber);

      case PublishPlanItemType.Separator:
        return this.processSeparator(item, options);

      case PublishPlanItemType.Frontmatter:
        return this.processFrontmatter(item);

      case PublishPlanItemType.TableOfContents:
        return this.buildTOC(plan, elements);

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

      parts.push(`# ${formattedTitle}`, content);
    } else if (element.type === ElementType.Folder && item.includeChildren) {
      const children = this.getChildElements(element, elements);
      for (const child of children) {
        if (child.type === ElementType.Item) {
          const content = await this.getDocumentContent(child.id);
          parts.push(`## ${child.name}`, content);
        }
      }
    }

    return parts.join('\n\n');
  }

  private processSeparator(
    item: SeparatorItem,
    options: PublishOptions
  ): string {
    switch (item.style) {
      case SeparatorStyle.PageBreak:
        return '---\n\n<div style="page-break-after: always;"></div>';
      case SeparatorStyle.SceneBreak:
        return `\n${item.customText || options.sceneBreakText || '* * *'}\n`;
      case SeparatorStyle.ChapterBreak:
        return '---';
      default:
        return '';
    }
  }

  private processFrontmatter(item: FrontmatterItem): string {
    switch (item.contentType) {
      case FrontmatterType.TitlePage:
        return ''; // Already in YAML frontmatter
      case FrontmatterType.Copyright:
        return '## Copyright\n\nAll rights reserved.';
      case FrontmatterType.Dedication:
        return `## Dedication\n\n*${item.customContent || ''}*`;
      case FrontmatterType.Custom:
        return `## ${item.customTitle || ''}\n\n${item.customContent || ''}`;
      default:
        return '';
    }
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
      if (!content) return '*Document is empty*';
      return this.prosemirrorToMarkdown(content);
    } catch {
      return '*Content unavailable*';
    }
  }

  /**
   * Convert a ProseMirror document (JSON form) to Markdown by first
   * serializing it to canonical Inkweld XML, then handing it off to the
   * shared `xmlToMarkdown` converter. Centralising the markdown logic
   * in `@inkweld/prosemirror` keeps the publish pipeline, MCP layer,
   * and editor preview in lock-step.
   *
   * Lossy marks (`text_color`, `text_background_color`) are dropped
   * here at the JSON→XML stage because the publish output prefers a
   * clean, paste-ready document over a fully-reversible one. Comment
   * marks are likewise omitted from published output.
   */
  private prosemirrorToMarkdown(data: unknown): string {
    if (!data) return '';
    const xml = this.serializeProseMirrorToXml(data);
    if (!xml) return '';
    return xmlToMarkdown(xml);
  }

  /**
   * Walk a loosely-typed ProseMirror JSON tree and produce the canonical
   * Inkweld XML string consumed by `xmlToMarkdown`.
   */
  private serializeProseMirrorToXml(data: unknown): string {
    if (Array.isArray(data)) {
      return data.map(n => this.nodeToXml(n as ProseMirrorNode)).join('');
    }
    if (typeof data === 'object' && data !== null) {
      return this.nodeToXml(data as ProseMirrorNode);
    }
    return '';
  }

  private nodeToXml(node: ProseMirrorNode): string {
    if (!node) return '';
    if (typeof node === 'string') return this.escapeXmlText(node);
    if (Array.isArray(node)) return node.map(n => this.nodeToXml(n)).join('');

    const name = this.getNodeName(node);
    const children = this.getChildren(node);

    // Text node — wrap in marks (innermost first).
    const textVal = (node as Record<string, unknown>)['text'];
    if (typeof textVal === 'string') {
      let inner = this.escapeXmlText(textVal);
      const marks = this.getRawMarks(node);
      // Inside-out: code → strong/em/s/u/sup/sub → link. Lossy marks
      // (text_color, comment, …) are intentionally dropped to match
      // the previous publish output.
      let linkAttrs: Record<string, unknown> | undefined;
      for (const m of marks) {
        switch (m.type) {
          case 'code':
            inner = `<code>${inner}</code>`;
            break;
          default:
            break;
        }
      }
      for (const m of marks) {
        switch (m.type) {
          case 'bold':
          case 'strong':
            inner = `<strong>${inner}</strong>`;
            break;
          case 'italic':
          case 'em':
            inner = `<em>${inner}</em>`;
            break;
          case 'strike':
          case 's':
            inner = `<s>${inner}</s>`;
            break;
          case 'u':
            inner = `<u>${inner}</u>`;
            break;
          case 'sup':
            inner = `<sup>${inner}</sup>`;
            break;
          case 'sub':
            inner = `<sub>${inner}</sub>`;
            break;
          case 'link':
            linkAttrs = m.attrs;
            break;
          default:
            break;
        }
      }
      if (linkAttrs) {
        const href = this.safeStringAttr(linkAttrs, 'href');
        const title = this.safeStringAttr(linkAttrs, 'title');
        const titleAttr = title ? ` title="${this.escapeXmlAttr(title)}"` : '';
        inner = `<a href="${this.escapeXmlAttr(href)}"${titleAttr}>${inner}</a>`;
      }
      return inner;
    }

    const inner = children.map(c => this.nodeToXml(c)).join('');

    switch (name) {
      case 'doc':
        return inner;
      case 'paragraph':
        return `<paragraph>${inner}</paragraph>`;
      case 'heading': {
        const level = this.getAttr(node, 'level', 2);
        return `<heading level="${level}">${inner}</heading>`;
      }
      case 'blockquote':
        return `<blockquote>${inner}</blockquote>`;
      case 'bullet_list':
      case 'bulletlist':
        return `<bullet_list>${inner}</bullet_list>`;
      case 'ordered_list':
      case 'orderedlist':
        return `<ordered_list>${inner}</ordered_list>`;
      case 'list_item':
      case 'listitem':
        return `<list_item>${inner}</list_item>`;
      case 'code_block':
      case 'codeblock': {
        const attrs = (node as Record<string, unknown>)['attrs'] as
          | Record<string, unknown>
          | undefined;
        const lang = this.safeStringAttr(attrs, 'lang');
        const langAttr = lang ? ` lang="${this.escapeXmlAttr(lang)}"` : '';
        return `<code_block${langAttr}>${inner}</code_block>`;
      }
      case 'image': {
        const attrs = (node as Record<string, unknown>)['attrs'] as
          | Record<string, unknown>
          | undefined;
        const src = this.safeStringAttr(attrs, 'src');
        const alt = this.safeStringAttr(attrs, 'alt');
        const title = this.safeStringAttr(attrs, 'title');
        if (!src) return '';
        const titleAttr = title ? ` title="${this.escapeXmlAttr(title)}"` : '';
        return `<image src="${this.escapeXmlAttr(src)}" alt="${this.escapeXmlAttr(alt)}"${titleAttr}/>`;
      }
      case 'horizontal_rule':
      case 'horizontalrule':
      case 'hr':
        return '<horizontal_rule/>';
      case 'hard_break':
      case 'hardbreak':
      case 'br':
        return '<hard_break/>';
      case 'elementref':
      case 'elementRef': {
        const attrs = (node as Record<string, unknown>)['attrs'] as
          | Record<string, unknown>
          | undefined;
        const display = this.safeStringAttr(attrs, 'displayText');
        // Render as plain text — publish output should not include
        // `inkweld://` URIs because they only resolve inside the app.
        return display ? this.escapeXmlText(display) : '';
      }
      default:
        return inner;
    }
  }

  private escapeXmlText(text: string): string {
    return text
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  private escapeXmlAttr(text: string): string {
    return text
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;');
  }

  /**
   * Return raw mark objects (type + attrs) from a ProseMirror node.
   * Unlike the old getMarks(), this preserves attrs so link hrefs etc. are available.
   */
  private getRawMarks(
    node: ProseMirrorNode
  ): Array<{ type: string; attrs?: Record<string, unknown> }> {
    if (typeof node !== 'object' || !node) return [];
    const marks = (node as Record<string, unknown>)['marks'];
    if (!Array.isArray(marks)) return [];
    return marks
      .map(m => {
        if (typeof m === 'string') return { type: m };
        if (typeof m === 'object' && m !== null) {
          const markObj = m as Record<string, unknown>;
          const typeVal = markObj['type'];
          // ProseMirror serialises mark type as a string; ngx-editor may also
          // produce objects with a `name` field depending on the version.
          let type: string;
          if (
            typeof typeVal === 'object' &&
            typeVal !== null &&
            'name' in typeVal
          ) {
            type = String((typeVal as Record<string, unknown>)['name']);
          } else if (typeof typeVal === 'string') {
            type = typeVal;
          } else {
            type = '';
          }
          const attrs = markObj['attrs'] as Record<string, unknown> | undefined;
          return { type, attrs };
        }
        return { type: '' };
      })
      .filter(m => Boolean(m.type));
  }

  /**
   * Safely extract a string attribute from a ProseMirror attrs object.
   * Returns an empty string if the value is absent or not a string,
   * avoiding the no-base-to-string lint error.
   */
  private safeStringAttr(
    attrs: Record<string, unknown> | undefined,
    key: string
  ): string {
    const value = attrs?.[key];
    return typeof value === 'string' ? value : '';
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
    num: number,
    isChapter: boolean,
    options: PublishOptions
  ): string {
    if (!isChapter || options.chapterNumbering === ChapterNumbering.None) {
      return title;
    }

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
    if (num < 60) {
      return (
        tens[Math.floor(num / 10)] + (num % 10 > 0 ? '-' + words[num % 10] : '')
      );
    }
    return String(num);
  }

  private generateFilename(title: string): string {
    const safeName = trimHyphens(
      title.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')
    );
    return `${safeName || 'document'}.md`;
  }

  /**
   * Build a real Markdown Table of Contents from the plan's element items.
   *
   * Each top-level element gets a TOC entry linked to a heading anchor that
   * matches the # heading emitted by processElement(). GitHub-Flavored Markdown
   * anchor rules are used (lowercase, hyphens for spaces/non-alphanum).
   */
  private buildTOC(plan: PublishPlan, elements: Element[]): string {
    const lines: string[] = ['## Table of Contents', ''];
    let chapterNumber = 0;

    for (const item of plan.items) {
      if (item.type !== PublishPlanItemType.Element) continue;

      const element = elements.find(e => e.id === item.elementId);
      if (!element) continue;

      const title = item.titleOverride || element.name;
      const formattedTitle = this.formatChapterTitle(
        title,
        chapterNumber,
        item.isChapter ?? false,
        plan.options
      );

      const anchor = this.headingToAnchor(formattedTitle);

      if (element.type === ElementType.Folder && item.includeChildren) {
        // Folder: list as a section header (no link, no anchor)
        lines.push(`- **${formattedTitle}**`);
      } else {
        lines.push(`- [${formattedTitle}](#${anchor})`);
      }

      if (item.isChapter) chapterNumber++;
    }

    return lines.join('\n');
  }

  /**
   * Convert a heading string to a GitHub-Flavored Markdown anchor slug.
   * Rules: lowercase, spaces -> hyphens, strip non-alphanumeric/hyphen chars.
   */
  private headingToAnchor(heading: string): string {
    return trimHyphens(
      heading
        .toLowerCase()
        .replaceAll(/[^\w\s-]/g, '')
        .replaceAll(/\s+/g, '-')
        .split('-')
        .filter(Boolean)
        .join('-')
    );
  }
}
