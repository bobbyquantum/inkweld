import { inject, Injectable } from '@angular/core';
import { type Element, ElementType } from '@inkweld/index';
import {
  createDefaultPublishStyles,
  type PublishStyles,
} from '@models/publish-style';
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
import { PublishCssEmitterService } from './publish-css-emitter.service';
import {
  type RenderedWorldbuildingEntry,
  WorldbuildingPublishRendererService,
} from './worldbuilding-publish-renderer.service';

function clampLevel(n: number): 1 | 2 | 3 | 4 | 5 | 6 {
  if (!Number.isFinite(n)) return 1;
  const v = Math.max(1, Math.min(6, Math.round(n)));
  return v as 1 | 2 | 3 | 4 | 5 | 6;
}

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
  private readonly cssEmitter = inject(PublishCssEmitterService);
  private readonly worldbuildingRenderer = inject(
    WorldbuildingPublishRendererService
  );

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
      const coverBlob = await this.loadCoverBlob(project);
      if (coverBlob) {
        this.coverImageData = await this.blobToBase64(coverBlob);
      }
    } catch (error) {
      this.logger.warn('HtmlGenerator', 'Failed to load cover', error);
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
      plan.options,
      plan.styles ?? createDefaultPublishStyles()
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
        return this.processElement(item, elements, plan, chapterNumber);

      case PublishPlanItemType.Separator:
        return this.processSeparator(item, plan.options);

      case PublishPlanItemType.Frontmatter:
        return this.processFrontmatter(item, plan.metadata);

      case PublishPlanItemType.TableOfContents:
        return this.buildTOC(plan, elements, item.title || 'Table of Contents');

      case PublishPlanItemType.Worldbuilding:
        return this.processWorldbuilding(item, elements);

      default:
        return '';
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
    elements: Element[]
  ): Promise<string> {
    const entries = await this.worldbuildingRenderer.renderItem(item, elements);
    if (entries.length === 0) return '';
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
    return parts.join('\n');
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

  private async processElement(
    item: ElementItem,
    elements: Element[],
    plan: PublishPlan,
    chapterNumber: number
  ): Promise<string> {
    const element = elements.find(e => e.id === item.elementId);
    if (!element) return '';

    const parts: string[] = [];

    if (isWorldbuildingType(element.type)) {
      // Worldbuilding element added inline (e.g. via "Add everything").
      // Render as a single-entry block wrapped in the standard WB section
      // so global WB styling still applies.
      const synthetic = this.singleEntryWbItem(element.id);
      const html = await this.processWorldbuilding(synthetic, [element]);
      if (html) parts.push(html);
    } else if (element.type === ElementType.Item) {
      const content = await this.getDocumentContent(element.id);
      // The user's document supplies its own heading (if any). We only wrap
      // it in a <section> so chapter-level styling (page breaks, margins)
      // can still target it. The id matches the anchor produced by buildTOC
      // so TOC links resolve to a real target in the rendered document.
      const elemTitle = item.titleOverride || element.name;
      const formattedTitle = this.formatChapterTitle(
        elemTitle,
        chapterNumber,
        item.isChapter ?? false,
        plan.options
      );
      const anchor = this.cssSafe(formattedTitle);
      parts.push(
        `<section class="ink-chapter" id="${anchor}">`,
        content,
        `</section>`
      );
    } else if (element.type === ElementType.Folder && item.includeChildren) {
      const children = this.getChildElements(element, elements);
      for (const child of children) {
        if (child.type === ElementType.Item) {
          const content = await this.getDocumentContent(child.id);
          const childAnchor = this.cssSafe(child.name);
          parts.push(
            `<section class="ink-section" id="${childAnchor}">`,
            content,
            `</section>`
          );
        } else if (isWorldbuildingType(child.type)) {
          const synthetic = this.singleEntryWbItem(child.id);
          const html = await this.processWorldbuilding(synthetic, [child]);
          if (html) parts.push(html);
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
        return '<div class="ink-page-break"></div>';
      case SeparatorStyle.SceneBreak:
        return `<div class="ink-scene-break">${this.escapeHtml(item.customText || options.sceneBreakText || '* * *')}</div>`;
      case SeparatorStyle.ChapterBreak:
        return '<hr class="ink-chapter-break" />';
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

    parts.push(
      `<p class="author">${this.escapeHtml(metadata.author)}</p>`,
      '</section>'
    );

    return parts.join('\n');
  }

  private generateCopyrightPage(metadata: PublishMetadata): string {
    const year = new Date().getFullYear();
    const parts: string[] = ['<section class="copyright">'];

    const copyrightText =
      metadata.copyright || `Copyright © ${year} ${metadata.author}`;
    parts.push(
      `<p>${this.escapeHtml(copyrightText)}</p>`,
      '<p>All rights reserved.</p>'
    );

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

    // Handle elementRef nodes
    const elementRefHtml = this.renderElementRef(node);
    if (elementRefHtml !== null) return elementRefHtml;

    const { tagName, classNames } = this.getTagAndClass(node);
    const children = this.getChildren(node);
    const childHtml = children.map(c => this.nodeToHtml(c)).join('');

    if (['br', 'hr'].includes(tagName)) return `<${tagName} />`;
    const classAttr = classNames.length
      ? ` class="${classNames.join(' ')}"`
      : '';
    return `<${tagName}${classAttr}>${childHtml}</${tagName}>`;
  }

  private renderElementRef(node: ProseMirrorNode): string | null {
    if (typeof node !== 'object' || !node || Array.isArray(node)) return null;
    const nodeType =
      'type' in node ? (node['type'] as string) : (node['nodeName'] as string);
    if (nodeType !== 'elementRef') return null;

    const attrs =
      'attrs' in node ? (node['attrs'] as Record<string, unknown>) : null;
    const displayText = attrs?.['displayText'] as string | undefined;
    return displayText ? this.escapeHtml(displayText) : '';
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
      let name: string;
      if ('nodeName' in node) {
        name = node['nodeName'] as string;
      } else if ('type' in node) {
        name = node['type'] as string;
      } else {
        name = '';
      }
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
      // Unknown node types render as a neutral container so a malicious
      // document JSON cannot smuggle in attacker-controlled tags like
      // <script>, <iframe>, or <object>.
      return { tagName: 'div', classNames: [] };
    }
    return { tagName: 'span', classNames: [] };
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
    const markObjs = this.getMarksWithAttrs(node);
    let result = text;
    for (const m of markObjs) {
      const name = m.type;
      if (name === 'comment') continue; // comments stripped from publish output
      if (name === 'bold' || name === 'strong') {
        result = `<strong class="ink-mark-bold">${result}</strong>`;
      } else if (name === 'italic' || name === 'em') {
        result = `<em class="ink-mark-italic">${result}</em>`;
      } else if (name === 'underline') {
        result = `<u class="ink-mark-underline">${result}</u>`;
      } else if (name === 'strike') {
        result = `<s class="ink-mark-strike">${result}</s>`;
      } else if (name === 'code') {
        result = `<code class="ink-mark-code">${result}</code>`;
      } else if (name === 'subscript' || name === 'sub') {
        result = `<sub class="ink-mark-subscript">${result}</sub>`;
      } else if (name === 'superscript' || name === 'sup') {
        result = `<sup class="ink-mark-superscript">${result}</sup>`;
      } else if (name === 'link') {
        const hrefRaw = m.attrs?.['href'];
        const safeHref = this.sanitizeUrl(
          typeof hrefRaw === 'string' ? hrefRaw : ''
        );
        if (safeHref) {
          // External http(s) links open in a new tab; we always strip
          // window.opener access for safety.
          const isExternal = /^https?:/i.test(safeHref);
          const relAttr = isExternal
            ? ' rel="noopener noreferrer" target="_blank"'
            : '';
          result = `<a class="ink-mark-link" href="${this.escapeHtml(safeHref)}"${relAttr}>${result}</a>`;
        }
        // Empty/disallowed href: drop the link wrapper but keep the text.
      }
    }
    return result;
  }

  private getMarksWithAttrs(
    node: ProseMirrorNode
  ): { type: string; attrs?: Record<string, unknown> }[] {
    if (typeof node !== 'object' || !node) return [];
    const marks = (node as Record<string, unknown>)['marks'];
    if (!Array.isArray(marks)) return [];
    return marks
      .map(m => {
        if (typeof m === 'string') return { type: m };
        if (typeof m === 'object' && m && 'type' in m) {
          const obj = m as Record<string, unknown>;
          return {
            type: String(obj['type']),
            attrs: (obj['attrs'] as Record<string, unknown>) ?? undefined,
          };
        }
        return { type: '' };
      })
      .filter(m => Boolean(m.type));
  }

  private getMarks(node: ProseMirrorNode): string[] {
    return this.getMarksWithAttrs(node).map(m => m.type);
  }

  private wrapInHtmlDocument(
    content: string,
    metadata: PublishMetadata,
    _options: PublishOptions,
    styles: PublishStyles
  ): string {
    const stylesheet = this.cssEmitter.emitHtmlStylesheet(styles);
    return `<!DOCTYPE html>
<html lang="${metadata.language || 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(metadata.title)}</title>
  <meta name="author" content="${this.escapeHtml(metadata.author)}">
  ${metadata.description ? `<meta name="description" content="${this.escapeHtml(metadata.description)}">` : ''}
  <style>
${stylesheet}
  </style>
</head>
<body>
${content}
</body>
</html>`;
  }

  /**
   * Build an HTML table of contents listing each top-level Element item.
   * Folder entries appear as section headers; document entries link to a
   * generated id. Chapter numbering (when enabled) is reflected here only
   * — the document body never contains an auto-emitted heading.
   */
  private buildTOC(
    plan: PublishPlan,
    elements: Element[],
    title: string
  ): string {
    const lines: string[] = [
      `<nav class="ink-toc">`,
      `<h2 class="ink-toc-title">${this.escapeHtml(title)}</h2>`,
      `<ul class="ink-toc-list">`,
    ];
    let chapterNumber = 0;

    for (const item of plan.items) {
      if (item.type !== PublishPlanItemType.Element) continue;
      const element = elements.find(e => e.id === item.elementId);
      if (!element) continue;

      const elemTitle = item.titleOverride || element.name;
      const formattedTitle = this.formatChapterTitle(
        elemTitle,
        chapterNumber,
        item.isChapter ?? false,
        plan.options
      );
      const safe = this.escapeHtml(formattedTitle);
      const anchor = this.cssSafe(formattedTitle);

      if (element.type === ElementType.Folder && item.includeChildren) {
        lines.push(`<li class="ink-toc-folder"><strong>${safe}</strong>`);
        const children = this.getChildElements(element, elements);
        if (children.length) {
          lines.push(`<ul class="ink-toc-list">`);
          for (const child of children) {
            if (child.type === ElementType.Item) {
              const childSafe = this.escapeHtml(child.name);
              const childAnchor = this.cssSafe(child.name);
              lines.push(
                `<li class="ink-toc-entry"><a href="#${childAnchor}">${childSafe}</a></li>`
              );
            }
          }
          lines.push(`</ul>`);
        }
        lines.push(`</li>`);
      } else {
        lines.push(
          `<li class="ink-toc-entry"><a href="#${anchor}">${safe}</a></li>`
        );
      }

      if (item.isChapter) chapterNumber++;
    }

    lines.push(`</ul>`, `</nav>`);
    return lines.join('\n');
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
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  /**
   * Returns the URL unchanged if it uses a safe scheme (http, https,
   * mailto, tel) or is a relative/anchor reference; otherwise returns
   * the empty string. This prevents `javascript:`, `data:`, `vbscript:`
   * and other potentially dangerous schemes from being emitted as the
   * `href` of a generated `<a>` tag.
   */
  private sanitizeUrl(url: string): string {
    const trimmed = url.trim();
    if (!trimmed) return '';
    if (/^(?:#|\/|\.{1,2}\/)/.test(trimmed)) return trimmed;
    if (/^(?:https?|mailto|tel):/i.test(trimmed)) return trimmed;
    return '';
  }

  private countWords(html: string): number {
    const text = html.replaceAll(/<[^>]+>/g, ' ');
    return text.split(/\s+/).filter(Boolean).length;
  }

  private generateFilename(title: string): string {
    const safeName = trimHyphens(
      title.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')
    );
    return `${safeName || 'document'}.html`;
  }
}
