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
          i =>
            i.type === PublishPlanItemType.Element &&
            (i as ElementItem).isChapter
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
        chapterNumber
      );
      sections.push(content);

      if (
        item.type === PublishPlanItemType.Element &&
        (item as ElementItem).isChapter
      ) {
        chapterNumber++;
      }
    }

    return sections.join('\n\n');
  }

  private generateFrontmatter(metadata: PublishMetadata): string {
    const lines = ['---'];
    lines.push(`title: "${metadata.title}"`);
    lines.push(`author: "${metadata.author}"`);
    if (metadata.subtitle) lines.push(`subtitle: "${metadata.subtitle}"`);
    if (metadata.description)
      lines.push(`description: "${metadata.description}"`);
    if (metadata.language) lines.push(`language: ${metadata.language}`);
    if (metadata.keywords?.length) {
      lines.push(
        `keywords: [${metadata.keywords.map(k => `"${k}"`).join(', ')}]`
      );
    }
    lines.push('---');
    return lines.join('\n');
  }

  private async processItem(
    item: PublishPlanItem,
    elements: Element[],
    options: PublishOptions,
    chapterNumber: number
  ): Promise<string> {
    switch (item.type) {
      case PublishPlanItemType.Element:
        return this.processElement(
          item as ElementItem,
          elements,
          options,
          chapterNumber
        );

      case PublishPlanItemType.Separator:
        return this.processSeparator(item as SeparatorItem, options);

      case PublishPlanItemType.Frontmatter:
        return this.processFrontmatter(item as FrontmatterItem);

      case PublishPlanItemType.TableOfContents:
        return '## Table of Contents\n\n[TOC]';

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

      parts.push(`# ${formattedTitle}`);
      parts.push(content);
    } else if (element.type === ElementType.Folder && item.includeChildren) {
      const children = this.getChildElements(element, elements);
      for (const child of children) {
        if (child.type === ElementType.Item) {
          const content = await this.getDocumentContent(child.id);
          parts.push(`## ${child.name}`);
          parts.push(content);
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
   * Convert ProseMirror document to Markdown
   */
  private prosemirrorToMarkdown(data: unknown): string {
    if (!data) return '';
    if (Array.isArray(data)) {
      return data
        .map(node => this.nodeToMarkdown(node as ProseMirrorNode))
        .join('\n\n');
    }
    if (typeof data === 'object') {
      return this.nodeToMarkdown(data as ProseMirrorNode);
    }
    return '';
  }

  private nodeToMarkdown(node: ProseMirrorNode): string {
    if (!node) return '';
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) {
      return node.map(n => this.nodeToMarkdown(n)).join('\n\n');
    }

    const nodeName = this.getNodeName(node);
    const children = this.getChildren(node);
    const childText = children.map(c => this.extractText(c)).join('');

    switch (nodeName) {
      case 'paragraph':
        return childText;

      case 'heading': {
        const level = this.getAttr(node, 'level', 2);
        const hashes = '#'.repeat(Math.min(level, 6));
        return `${hashes} ${childText}`;
      }

      case 'blockquote':
        return childText
          .split('\n')
          .map(line => `> ${line}`)
          .join('\n');

      case 'bullet_list':
        return children.map(c => `- ${this.extractText(c)}`).join('\n');

      case 'ordered_list':
        return children
          .map((c, i) => `${i + 1}. ${this.extractText(c)}`)
          .join('\n');

      case 'code_block':
        return '```\n' + childText + '\n```';

      case 'horizontal_rule':
        return '---';

      case 'hard_break':
        return '  \n';

      default:
        return childText;
    }
  }

  private extractText(node: ProseMirrorNode): string {
    if (!node) return '';
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) {
      return node.map(n => this.extractText(n)).join('');
    }

    const text = (node as Record<string, unknown>)['text'];
    if (typeof text === 'string') {
      const marks = this.getMarks(node);
      let result = text;
      if (marks.includes('bold') || marks.includes('strong')) {
        result = `**${result}**`;
      }
      if (marks.includes('italic') || marks.includes('em')) {
        result = `*${result}*`;
      }
      if (marks.includes('code')) {
        result = `\`${result}\``;
      }
      if (marks.includes('strike')) {
        result = `~~${result}~~`;
      }
      return result;
    }

    const children = this.getChildren(node);
    return children.map(c => this.extractText(c)).join('');
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
    const safeName = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `${safeName || 'document'}.md`;
  }
}
