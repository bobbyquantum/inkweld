import { inject, Injectable } from '@angular/core';
import { type Element, ElementType } from '@inkweld/index';
import {
  createDefaultPublishStyles,
  type PublishStyles,
} from '@models/publish-style';
import { trimHyphens } from '@utils/string-utils';
import { isWorldbuildingType } from '@utils/worldbuilding.utils';
import { BehaviorSubject, type Observable, Subject } from 'rxjs';

import {
  extractMediaId,
  isMediaUrl,
} from '../../components/image-paste/image-paste-plugin';
import {
  type BackgroundSetting,
  isBackgroundEmpty,
} from '../../models/element-appearance';
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
  type WorldbuildingItem,
} from '../../models/publish-plan';
import { mediaIdFromReference } from '../../utils/media-reference';
import { LoggerService } from '../core/logger.service';
import { LocalStorageService } from '../local/local-storage.service';
import { DocumentService } from '../project/document.service';
import { ProjectStateService } from '../project/project-state.service';
import { IconSvgService } from './icon-svg.service';
import { PublishCssEmitterService } from './publish-css-emitter.service';
import {
  type RenderedWorldbuildingEntry,
  type RenderedWorldbuildingField,
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
  string | { [key: string]: unknown } | ProseMirrorNode[] | null | undefined;

/**
 * Map a table cell's `align` attribute to a CSS class.
 *
 * Alignment becomes a class rather than an inline `style` attribute so that
 * attacker-controlled document JSON can never inject arbitrary CSS; only the
 * three known values produce a class at all.
 */
function alignClass(node: ProseMirrorNode): string | null {
  if (typeof node !== 'object' || !node || !('attrs' in node)) return null;
  const attrs = node['attrs'] as Record<string, unknown> | null;
  const align = attrs?.['align'];
  if (align === 'left' || align === 'center' || align === 'right') {
    return `ink-doc-align-${align}`;
  }
  return null;
}

/** Maximum indent level honoured from paragraph/heading `indent` attrs. */
const MAX_INDENT = 8;

/**
 * Validate a CSS colour value coming from a text_color /
 * text_background_color mark. Only hex, rgb()/rgba(), hsl()/hsla() and
 * plain named colours are accepted; anything else (url(), expressions,
 * semicolons) is rejected so document JSON can never inject arbitrary CSS.
 */
export function sanitizeCssColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(v)) return v;
  if (/^(?:rgb|hsl)a?\(\s*[\d.%\s,/-]+\)$/i.test(v)) return v;
  if (/^[a-z]{3,20}$/i.test(v)) return v.toLowerCase();
  return null;
}

/**
 * Extract the media id from either media URL scheme used in project data:
 * `media:<id>` (inline document images) or `media://<id>.<ext>` (worldbuilding
 * identity images and covers). Returns null for any other source.
 */
export function mediaIdFromSrc(src: unknown): string | null {
  if (typeof src !== 'string') return null;
  if (src.startsWith('media://')) return mediaIdFromReference(src) || null;
  if (isMediaUrl(src)) return extractMediaId(src) || null;
  return null;
}

/**
 * True for sources that may be emitted verbatim as an `img src`: http(s)
 * URLs, base64 `data:image/*` URLs, and scheme-less relative paths. Any
 * other scheme (`javascript:`, `vbscript:`, non-image `data:`) is refused.
 */
function isPassthroughImageSrc(src: string): boolean {
  const trimmed = src.trim();
  if (!trimmed) return false;
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(trimmed)) return true;
  // Scheme-less (relative or root-relative) path.
  return !/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !trimmed.startsWith('//');
}

/**
 * Validate a CSS gradient value from element appearance. Accepts the three
 * gradient functions with a restricted character set (no quotes, semicolons,
 * or nested `url(`), so it can be emitted inside a `style` attribute safely.
 */
export function sanitizeCssGradient(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!/^(?:repeating-)?(?:linear|radial|conic)-gradient\(/i.test(v)) {
    return null;
  }
  if (!/^[\w\s,.%#()/-]+$/.test(v) || /url\s*\(/i.test(v)) return null;
  return v;
}

/** A heading emitted during document rendering, for page outlines. */
export interface RenderedHeading {
  level: number;
  id: string;
  text: string;
}

/** Resolves a `media:` id to an href usable in the output, or null. */
export type ImageHrefResolver = (
  mediaId: string
) => Promise<string | null | undefined>;

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
  private readonly iconSvg = inject(IconSvgService);
  private readonly worldbuildingRenderer = inject(
    WorldbuildingPublishRendererService
  );

  private coverImageData: string | null = null;

  /**
   * Optional resolver mapping a referenced element id to an href. When set,
   * `elementRef` nodes render as links instead of plain text. Used by the
   * multi-page site generator so cross-references resolve to page URLs.
   */
  private elementRefHref: ((elementId: string) => string | undefined) | null =
    null;

  /**
   * Resolver for inline images stored as project media (`media:<id>`).
   * When `null`, images are embedded as base64 data URLs loaded from local
   * storage. The site generator installs its own resolver that writes the
   * blob into the archive and returns a relative path.
   */
  private imageHrefResolver: ImageHrefResolver | null = null;

  /** media id → resolved href (or null when unavailable) for the current run. */
  private readonly resolvedImages = new Map<string, string | null>();

  /** icon name → inline SVG (or null when unavailable) for the current run. */
  private readonly resolvedIcons = new Map<string, string | null>();

  /** Heading ids already used on the current page (for unique anchors). */
  private readonly usedHeadingIds = new Set<string>();

  /** Headings rendered since the last {@link takeRenderedHeadings}. */
  private renderedHeadings: RenderedHeading[] = [];

  /** Non-fatal issues noticed while rendering (missing images, etc.). */
  private pendingWarnings: string[] = [];

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

      this.resetRenderState();

      // Load cover if enabled
      if (plan.options.includeCover) {
        await this.loadCoverImage();
      }

      // Generate HTML content
      const htmlContent = await this.buildHtml(plan, result);
      result.warnings.push(...this.takeWarnings());

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

  /**
   * Install (or clear, with `null`) the element-reference link resolver.
   * Callers should reset it to `null` in a `finally` block once rendering
   * completes so later single-page exports are unaffected.
   */
  setElementRefResolver(
    resolver: ((elementId: string) => string | undefined) | null
  ): void {
    this.elementRefHref = resolver;
  }

  /**
   * Install (or clear) the inline-image resolver. See
   * {@link imageHrefResolver}.
   */
  setImageHrefResolver(resolver: ImageHrefResolver | null): void {
    this.imageHrefResolver = resolver;
  }

  /**
   * Clear per-run render state: resolved image cache, heading ids, collected
   * headings, and warnings. Called at the start of every export.
   */
  resetRenderState(): void {
    this.resolvedImages.clear();
    this.resolvedIcons.clear();
    this.resetHeadingIds();
    this.pendingWarnings = [];
  }

  /**
   * Start a fresh anchor namespace. Heading ids are unique per call scope;
   * the site generator invokes this once per page.
   */
  resetHeadingIds(): void {
    this.usedHeadingIds.clear();
    this.renderedHeadings = [];
  }

  /** Return and clear the headings rendered since the last call. */
  takeRenderedHeadings(): RenderedHeading[] {
    const out = this.renderedHeadings;
    this.renderedHeadings = [];
    return out;
  }

  /** Return and clear accumulated render warnings. */
  takeWarnings(): string[] {
    const out = this.pendingWarnings;
    this.pendingWarnings = [];
    return out;
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
  /** Shared with {@link HtmlSiteGeneratorService}. */
  async loadCoverBlob(project: {
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

      case PublishPlanItemType.Backmatter:
        return this.processBackmatter(item, plan.metadata);

      default:
        return '';
    }
  }

  /**
   * Render a back matter item. Glossary and index entries have no
   * automatic content source yet; they render their custom content when
   * present and are otherwise skipped with a warning.
   * Shared with {@link HtmlSiteGeneratorService}.
   */
  processBackmatter(item: BackmatterItem, metadata: PublishMetadata): string {
    const { title, body } = this.backmatterContent(item, metadata);
    if (!body) return '';
    return [
      `<section class="ink-backmatter ink-backmatter-${this.cssSafe(item.contentType)}">`,
      `<h2 class="ink-backmatter-title">${this.escapeHtml(title)}</h2>`,
      body,
      '</section>',
    ].join('\n');
  }

  /**
   * Title and inner HTML for a back matter item, or an empty body when
   * there is nothing to render. Shared with {@link HtmlSiteGeneratorService}.
   */
  backmatterContent(
    item: BackmatterItem,
    metadata: PublishMetadata
  ): { title: string; body: string } {
    const custom = item.customContent
      ? `<p>${this.escapeHtml(item.customContent)}</p>`
      : '';
    switch (item.contentType) {
      case BackmatterType.AboutAuthor:
        return {
          title: item.customTitle || 'About the Author',
          body: custom || `<p>${this.escapeHtml(metadata.author)}</p>`,
        };
      case BackmatterType.Acknowledgments:
        return { title: item.customTitle || 'Acknowledgments', body: custom };
      case BackmatterType.Custom:
        return { title: item.customTitle || 'Back Matter', body: custom };
      case BackmatterType.Glossary:
      case BackmatterType.Index: {
        const title =
          item.customTitle ||
          (item.contentType === BackmatterType.Glossary ? 'Glossary' : 'Index');
        if (!custom) {
          this.pendingWarnings.push(
            `${title} back matter has no content and was skipped`
          );
        }
        return { title, body: custom };
      }
      default:
        return { title: item.customTitle || 'Back Matter', body: custom };
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

  /**
   * Render a worldbuilding plan item as an HTML section.
   * Shared with {@link HtmlSiteGeneratorService}.
   */
  async processWorldbuilding(
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
    await this.resolveIcons(entries);
    for (const entry of entries) {
      const imageHref = await this.resolveImageHref(entry.imageRef);
      const background = await this.resolveEntryBackground(
        entry.appearance?.content
      );
      parts.push(this.renderWorldbuildingEntry(entry, imageHref, background));
    }
    parts.push('</section>');
    return parts.join('\n');
  }

  /**
   * Resolve an arbitrary image source (document image, worldbuilding
   * identity image) to an href for the output, or null when it cannot be
   * shown. Media references go through the per-run cache and the installed
   * resolver; http(s) and data URLs pass through; anything else is dropped.
   */
  async resolveImageHref(src: string | undefined): Promise<string | null> {
    if (!src) return null;
    const mediaId = mediaIdFromSrc(src);
    if (mediaId) {
      if (!this.resolvedImages.has(mediaId)) {
        await this.resolveMediaId(mediaId);
      }
      return this.resolvedImages.get(mediaId) ?? null;
    }
    return isPassthroughImageSrc(src) ? src : null;
  }

  /**
   * Turn the element's authored content background into a CSS value for the
   * light theme, or null when there is none. Colours and gradients are
   * validated; image references resolve through the image pipeline so the
   * file travels with the export.
   */
  private async resolveEntryBackground(
    setting: BackgroundSetting | undefined
  ): Promise<{ css: string; isImage: boolean } | null> {
    if (!setting || isBackgroundEmpty(setting)) return null;
    const value =
      setting.mode === 'manual' ? setting.light || setting.dark : setting.value;
    if (!value) return null;
    switch (setting.type) {
      case 'color': {
        const color = sanitizeCssColor(value);
        return color ? { css: color, isImage: false } : null;
      }
      case 'gradient': {
        const gradient = sanitizeCssGradient(value);
        return gradient ? { css: gradient, isImage: false } : null;
      }
      case 'image': {
        const href = await this.resolveImageHref(value);
        return href
          ? { css: `url("${href.replaceAll('"', '%22')}")`, isImage: true }
          : null;
      }
      default:
        return null;
    }
  }

  private renderWorldbuildingEntry(
    entry: RenderedWorldbuildingEntry,
    imageHref: string | null,
    background: { css: string; isImage: boolean } | null
  ): string {
    const esc = (v: string): string => this.escapeHtml(v);
    const classes = ['ink-wb-entry', `ink-wb-layout-${entry.layout}`];
    if (entry.schemaId) {
      classes.push(`ink-wb-schema-${this.cssSafe(entry.schemaId)}`);
    }
    if (background) {
      classes.push('ink-wb-has-bg');
      if (background.isImage) classes.push('ink-wb-has-bg-image');
    }
    const styleAttr = background
      ? ` style="--ink-wb-bg: ${esc(background.css)};"`
      : '';

    // Entry and tab anchors feed page outlines and in-page links.
    const anchor = this.uniqueHeadingId(entry.title);
    this.renderedHeadings.push({ level: 2, id: anchor, text: entry.title });

    const parts: string[] = [];
    parts.push(
      `<article class="${classes.join(' ')}" id="${anchor}"${styleAttr}>`,
      '<header class="ink-wb-entry-header">',
      this.renderIcon(entry.icon),
      `<h3 class="ink-wb-entry-title">${esc(entry.title)}</h3>`
    );
    if (entry.schemaLabel) {
      parts.push(
        `<span class="ink-wb-entry-schema">${esc(entry.schemaLabel)}</span>`
      );
    }
    parts.push('</header>');
    if (imageHref) {
      parts.push(
        `<img class="ink-wb-entry-image" src="${esc(imageHref)}" alt="${esc(entry.title)}" loading="lazy" />`
      );
    }
    if (entry.description) {
      parts.push(
        `<p class="ink-wb-entry-description">${esc(entry.description)}</p>`
      );
    }
    for (const tab of entry.tabs) {
      const tabId = this.uniqueHeadingId(`${entry.title} ${tab.label}`);
      this.renderedHeadings.push({ level: 3, id: tabId, text: tab.label });
      parts.push(
        `<section class="ink-wb-tab" id="${tabId}" data-tab="${this.cssSafe(tab.key)}">`,
        `<h4 class="ink-wb-tab-heading">${this.renderIcon(tab.icon)}${esc(tab.label)}</h4>`,
        '<dl class="ink-wb-fields">'
      );
      for (const f of tab.fields) {
        parts.push(this.renderWorldbuildingField(f));
      }
      parts.push('</dl>', '</section>');
    }
    parts.push('</article>');
    return parts.join('\n');
  }

  /**
   * One field as a `<div>`-wrapped dt/dd pair so it can occupy a grid cell
   * sized by the schema's layout span. Relationship values link to the
   * target's page when the current export has one.
   */
  private renderWorldbuildingField(f: RenderedWorldbuildingField): string {
    const esc = (v: string): string => this.escapeHtml(v);
    const span = Number(f.span);
    const spanClass =
      Number.isInteger(span) && span >= 1 && span <= 12
        ? ` ink-wb-span-${span}`
        : '';
    const typeClass = ` ink-wb-field-type-${this.cssSafe(String(f.type))}`;

    let value: string;
    if (f.links && f.links.length > 0) {
      value = f.links
        .map(link => {
          const href = this.elementRefHref?.(link.id);
          const name = esc(link.name);
          return href
            ? `<a class="ink-mark-link ink-element-ref" href="${esc(href)}">${name}</a>`
            : name;
        })
        .join(', ');
    } else {
      value = esc(f.displayValue);
    }

    return [
      `<div class="ink-wb-field${typeClass}${spanClass}">`,
      `<dt class="ink-wb-field-label">${esc(f.label)}</dt>`,
      `<dd class="ink-wb-field-value">${value}</dd>`,
      '</div>',
    ].join('');
  }

  /**
   * Resolve every schema and tab icon used by the entries to inline SVG
   * ahead of the synchronous render pass. Icons are cached per run.
   */
  private async resolveIcons(
    entries: RenderedWorldbuildingEntry[]
  ): Promise<void> {
    const names = new Set<string>();
    for (const entry of entries) {
      if (entry.icon) names.add(entry.icon);
      for (const tab of entry.tabs) if (tab.icon) names.add(tab.icon);
    }
    for (const name of names) {
      if (this.resolvedIcons.has(name)) continue;
      this.resolvedIcons.set(name, await this.iconSvg.getSvg(name));
    }
  }

  /**
   * A Material Symbols icon inlined as SVG, so exports need neither the
   * icon font nor a network connection. Unresolvable icons render nothing.
   */
  private renderIcon(name: string | undefined): string {
    const svg = name ? this.resolvedIcons.get(name) : null;
    if (!svg) return '';
    return `<span class="ink-wb-icon" aria-hidden="true">${svg}</span>`;
  }

  /** Shared with {@link HtmlSiteGeneratorService}. */
  cssSafe(s: string): string {
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

    if (isWorldbuildingType(element.type)) {
      // Worldbuilding element added inline (e.g. via "Add everything").
      // Render as a single-entry block wrapped in the standard WB section
      // so global WB styling still applies.
      return await this.renderInlineWbHtml(element);
    }
    if (element.type === ElementType.Item) {
      return await this.renderItemSection(item, element, plan, chapterNumber);
    }
    if (element.type === ElementType.Folder && item.includeChildren) {
      return await this.renderFolderChildrenHtml(element, elements);
    }
    return '';
  }

  /**
   * Render a single worldbuilding element as its own section.
   * Shared with {@link HtmlSiteGeneratorService}.
   */
  async renderInlineWbHtml(element: Element): Promise<string> {
    const synthetic = this.singleEntryWbItem(element.id);
    return await this.processWorldbuilding(synthetic, [element]);
  }

  private async renderItemSection(
    item: ElementItem,
    element: Element,
    plan: PublishPlan,
    chapterNumber: number
  ): Promise<string> {
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
    return [
      `<section class="ink-chapter" id="${anchor}">`,
      content,
      `</section>`,
    ].join('\n');
  }

  private async renderFolderChildrenHtml(
    element: Element,
    elements: Element[]
  ): Promise<string> {
    const parts: string[] = [];
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
        const html = await this.renderInlineWbHtml(child);
        if (html) parts.push(html);
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

  /** Shared with {@link HtmlSiteGeneratorService}. */
  generateCopyrightPage(metadata: PublishMetadata): string {
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

  /** Shared with {@link HtmlSiteGeneratorService}. */
  getChildElements(parent: Element, allElements: Element[]): Element[] {
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

  /**
   * Load a document and convert it to HTML.
   * Shared with {@link HtmlSiteGeneratorService}.
   */
  async getDocumentContent(elementId: string): Promise<string> {
    const fullDocId = this.getFullDocumentId(elementId);

    try {
      const content = await this.documentService.getDocumentContent(fullDocId);
      if (!content) return '<p>Document is empty</p>';
      await this.resolveDocumentImages(content);
      return this.prosemirrorToHtml(content);
    } catch {
      return '<p>Content unavailable</p>';
    }
  }

  /**
   * Find every `media:` image in a document and resolve it to an href
   * ahead of the synchronous render pass. Results are cached per run so a
   * media file referenced from several documents is only loaded once.
   */
  private async resolveDocumentImages(content: unknown): Promise<void> {
    const ids = new Set<string>();
    this.collectMediaIds(content as ProseMirrorNode, ids);
    for (const id of ids) {
      if (!this.resolvedImages.has(id)) await this.resolveMediaId(id);
    }
  }

  /** Resolve one media id into the per-run cache, warning when it fails. */
  private async resolveMediaId(id: string): Promise<void> {
    let href: string | null = null;
    try {
      href = this.imageHrefResolver
        ? ((await this.imageHrefResolver(id)) ?? null)
        : await this.mediaToDataUrl(id);
    } catch (error) {
      this.logger.warn('HtmlGenerator', `Failed to load image ${id}`, error);
    }
    if (!href) {
      this.pendingWarnings.push(`Image ${id} could not be loaded`);
    }
    this.resolvedImages.set(id, href);
  }

  private collectMediaIds(node: ProseMirrorNode, out: Set<string>): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const n of node) this.collectMediaIds(n, out);
      return;
    }
    if (this.getNodeTypeName(node).toLowerCase() === 'image') {
      const id = mediaIdFromSrc(this.nodeAttrs(node)?.['src']);
      if (id) out.add(id);
    }
    for (const child of this.getChildren(node)) {
      this.collectMediaIds(child, out);
    }
  }

  /** Default image resolution: local media blob → base64 data URL. */
  private async mediaToDataUrl(mediaId: string): Promise<string | null> {
    const project = this.projectStateService.project();
    if (!project) return null;
    const blob = await this.localStorage.getMedia(
      `${project.username}/${project.slug}`,
      mediaId
    );
    if (!blob) return null;
    return await this.blobToBase64(blob);
  }

  private nodeAttrs(node: ProseMirrorNode): Record<string, unknown> | null {
    if (typeof node !== 'object' || !node || Array.isArray(node)) return null;
    const attrs = node['attrs'];
    return attrs && typeof attrs === 'object'
      ? (attrs as Record<string, unknown>)
      : null;
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

    const typeName = this.getNodeTypeName(node).toLowerCase();
    if (typeName === 'image') return this.renderImage(node);

    const { tagName, classNames } = this.getTagAndClass(node);
    const children = this.getChildren(node);
    let childHtml = children.map(c => this.nodeToHtml(c)).join('');

    if (['br', 'hr'].includes(tagName)) return `<${tagName} />`;

    const extraAttrs: string[] = [];
    if (tagName.length === 2 && tagName.startsWith('h')) {
      const level = Number(tagName[1]);
      const text = this.plainText(node);
      const id = this.uniqueHeadingId(text);
      this.renderedHeadings.push({ level, id, text });
      extraAttrs.push(` id="${id}"`);
    }
    if (tagName === 'ol') {
      const order = Number(this.nodeAttrs(node)?.['order']);
      if (Number.isInteger(order) && order > 1) {
        extraAttrs.push(` start="${order}"`);
      }
    }
    if (tagName === 'pre') {
      childHtml = `<code>${childHtml}</code>`;
    }

    const classAttr = classNames.length
      ? ` class="${classNames.join(' ')}"`
      : '';
    return `<${tagName}${classAttr}${extraAttrs.join('')}>${childHtml}</${tagName}>`;
  }

  /**
   * Render an inline image. `media:` sources resolve through the cache
   * filled by {@link resolveDocumentImages}; http(s) and `data:image/`
   * sources pass through; anything else is dropped. A missing image
   * renders as a visible placeholder so the gap is obvious in the output.
   */
  private renderImage(node: ProseMirrorNode): string {
    const attrs = this.nodeAttrs(node);
    const rawSrc = attrs?.['src'];
    const alt = typeof attrs?.['alt'] === 'string' ? attrs['alt'] : '';
    const title = typeof attrs?.['title'] === 'string' ? attrs['title'] : '';

    let src: string | null = null;
    if (typeof rawSrc === 'string') {
      const id = mediaIdFromSrc(rawSrc);
      if (id) {
        src = this.resolvedImages.get(id) ?? null;
      } else if (isPassthroughImageSrc(rawSrc)) {
        src = rawSrc;
      }
    }

    if (!src) {
      const label = alt ? `Image unavailable: ${alt}` : 'Image unavailable';
      return `<span class="ink-doc-image-missing" role="img" aria-label="${this.escapeHtml(label)}">[${this.escapeHtml(label)}]</span>`;
    }

    const width = Number(attrs?.['width']);
    const widthAttr =
      Number.isFinite(width) && width > 0
        ? ` width="${Math.round(width)}"`
        : '';
    const titleAttr = title ? ` title="${this.escapeHtml(title)}"` : '';
    return `<img class="ink-doc-image" src="${this.escapeHtml(src)}" alt="${this.escapeHtml(alt)}"${titleAttr}${widthAttr} loading="lazy" />`;
  }

  /** Concatenated text content of a node subtree (no markup). */
  private plainText(node: ProseMirrorNode): string {
    if (!node) return '';
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(n => this.plainText(n)).join('');
    if ('text' in node && typeof node['text'] === 'string') return node['text'];
    return this.getChildren(node)
      .map(c => this.plainText(c))
      .join('');
  }

  /**
   * Build a unique, URL-safe id for a heading from its text. Falls back to
   * `section` for empty headings; duplicates get a numeric suffix.
   */
  private uniqueHeadingId(text: string): string {
    const base =
      trimHyphens(
        text
          .toLowerCase()
          .normalize('NFKD')
          .replaceAll(/[\u0300-\u036f]/g, '')
          .replaceAll(/[^a-z0-9]+/g, '-')
      ).slice(0, 64) || 'section';
    let id = base;
    let n = 2;
    while (this.usedHeadingIds.has(id)) {
      id = `${base}-${n}`;
      n++;
    }
    this.usedHeadingIds.add(id);
    return id;
  }

  private renderElementRef(node: ProseMirrorNode): string | null {
    if (typeof node !== 'object' || !node || Array.isArray(node)) return null;
    const nodeType =
      'type' in node ? (node['type'] as string) : (node['nodeName'] as string);
    if (nodeType !== 'elementRef') return null;

    const attrs =
      'attrs' in node ? (node['attrs'] as Record<string, unknown>) : null;
    const displayText = attrs?.['displayText'] as string | undefined;
    if (!displayText) return '';
    const safeText = this.escapeHtml(displayText);

    const elementId = attrs?.['elementId'];
    const href =
      this.elementRefHref && typeof elementId === 'string'
        ? this.elementRefHref(elementId)
        : undefined;
    if (!href) return safeText;
    return `<a class="ink-mark-link ink-element-ref" href="${this.escapeHtml(href)}">${safeText}</a>`;
  }

  private static readonly NODE_TAG_MAP: Record<
    string,
    { tag: string; cls: string }
  > = {
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
    table: { tag: 'table', cls: 'ink-doc-table' },
    table_row: { tag: 'tr', cls: 'ink-doc-table-row' },
    tablerow: { tag: 'tr', cls: 'ink-doc-table-row' },
    table_cell: { tag: 'td', cls: 'ink-doc-table-cell' },
    tablecell: { tag: 'td', cls: 'ink-doc-table-cell' },
    table_header: { tag: 'th', cls: 'ink-doc-table-header' },
    tableheader: { tag: 'th', cls: 'ink-doc-table-header' },
  };

  /** Cell node names that carry GFM column alignment. */
  private static readonly TABLE_CELL_NAMES = new Set([
    'table_cell',
    'tablecell',
    'table_header',
    'tableheader',
  ]);

  private getTagAndClass(node: ProseMirrorNode): {
    tagName: string;
    classNames: string[];
  } {
    if (typeof node !== 'object' || !node) {
      return { tagName: 'span', classNames: [] };
    }
    const lower = this.getNodeTypeName(node).toLowerCase();
    if (lower === 'heading') {
      const attrs =
        'attrs' in node ? (node['attrs'] as Record<string, unknown>) : null;
      const level = clampLevel(Number(attrs?.['level'] ?? 1));
      return {
        tagName: `h${level}`,
        classNames: [
          `ink-doc-heading-${level}`,
          ...this.blockLayoutClasses(node),
        ],
      };
    }
    const mapped = HtmlGeneratorService.NODE_TAG_MAP[lower];
    if (mapped) {
      const classNames = mapped.cls ? [mapped.cls] : [];
      // Column alignment travels as a class rather than a style attribute:
      // node attributes come from document JSON and are never emitted
      // verbatim (see the note on unknown node types below).
      if (HtmlGeneratorService.TABLE_CELL_NAMES.has(lower)) {
        const align = alignClass(node);
        if (align) classNames.push(align);
      }
      if (lower === 'paragraph' || lower === 'blockquote') {
        classNames.push(...this.blockLayoutClasses(node));
      }
      return { tagName: mapped.tag, classNames };
    }
    // Unknown node types render as a neutral container so a malicious
    // document JSON cannot smuggle in attacker-controlled tags like
    // <script>, <iframe>, or <object>.
    return { tagName: 'div', classNames: [] };
  }

  /**
   * Alignment and indent classes for block nodes that carry ngx-editor's
   * `align` / `indent` attributes. Values are whitelisted; indent is capped.
   */
  private blockLayoutClasses(node: ProseMirrorNode): string[] {
    const out: string[] = [];
    const align = alignClass(node);
    if (align) out.push(align);
    const indent = Number(this.nodeAttrs(node)?.['indent']);
    if (Number.isInteger(indent) && indent > 0) {
      out.push(`ink-doc-indent-${Math.min(indent, MAX_INDENT)}`);
    }
    return out;
  }

  private getNodeTypeName(node: ProseMirrorNode): string {
    if (typeof node !== 'object' || !node) return '';
    if ('nodeName' in node) {
      const v = node['nodeName'];
      return typeof v === 'string' ? v : '';
    }
    if ('type' in node) {
      const v = node['type'];
      return typeof v === 'string' ? v : '';
    }
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

  private applyMarks(text: string, node: ProseMirrorNode): string {
    const markObjs = this.getMarksWithAttrs(node);
    let result = text;
    for (const m of markObjs) {
      result = this.applySingleMark(result, m);
    }
    return result;
  }

  private static readonly SIMPLE_MARK_WRAPPERS: Record<
    string,
    { tag: string; cls: string }
  > = {
    bold: { tag: 'strong', cls: 'ink-mark-bold' },
    strong: { tag: 'strong', cls: 'ink-mark-bold' },
    italic: { tag: 'em', cls: 'ink-mark-italic' },
    em: { tag: 'em', cls: 'ink-mark-italic' },
    underline: { tag: 'u', cls: 'ink-mark-underline' },
    strike: { tag: 's', cls: 'ink-mark-strike' },
    code: { tag: 'code', cls: 'ink-mark-code' },
    subscript: { tag: 'sub', cls: 'ink-mark-subscript' },
    sub: { tag: 'sub', cls: 'ink-mark-subscript' },
    superscript: { tag: 'sup', cls: 'ink-mark-superscript' },
    sup: { tag: 'sup', cls: 'ink-mark-superscript' },
  };

  private applySingleMark(
    text: string,
    m: { type: string; attrs?: Record<string, unknown> }
  ): string {
    const name = m.type;
    if (name === 'comment') return text; // comments stripped from publish output
    if (name === 'link') return this.applyLinkMark(text, m.attrs);
    if (name === 'text_color') {
      const color = sanitizeCssColor(m.attrs?.['color']);
      return color
        ? `<span class="ink-mark-color" style="color: ${color};">${text}</span>`
        : text;
    }
    if (name === 'text_background_color') {
      const color = sanitizeCssColor(m.attrs?.['backgroundColor']);
      return color
        ? `<span class="ink-mark-highlight" style="background-color: ${color};">${text}</span>`
        : text;
    }
    const wrapper = HtmlGeneratorService.SIMPLE_MARK_WRAPPERS[name];
    if (wrapper) {
      return `<${wrapper.tag} class="${wrapper.cls}">${text}</${wrapper.tag}>`;
    }
    return text;
  }

  private applyLinkMark(
    text: string,
    attrs: Record<string, unknown> | undefined
  ): string {
    const hrefRaw = attrs?.['href'];
    const safeHref = this.sanitizeUrl(
      typeof hrefRaw === 'string' ? hrefRaw : ''
    );
    if (!safeHref) {
      // Empty/disallowed href: drop the link wrapper but keep the text.
      return text;
    }
    // External http(s) links open in a new tab; we always strip
    // window.opener access for safety.
    const isExternal = /^https?:/i.test(safeHref);
    const relAttr = isExternal
      ? ' rel="noopener noreferrer" target="_blank"'
      : '';
    return `<a class="ink-mark-link" href="${this.escapeHtml(safeHref)}"${relAttr}>${text}</a>`;
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

      this.appendTocEntry(lines, item, element, elements, chapterNumber, plan);
      if (item.isChapter) chapterNumber++;
    }

    lines.push(`</ul>`, `</nav>`);
    return lines.join('\n');
  }

  private appendTocEntry(
    lines: string[],
    item: ElementItem,
    element: Element,
    elements: Element[],
    chapterNumber: number,
    plan: PublishPlan
  ): void {
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
      this.appendTocFolderChildren(lines, element, elements);
      lines.push(`</li>`);
    } else {
      lines.push(
        `<li class="ink-toc-entry"><a href="#${anchor}">${safe}</a></li>`
      );
    }
  }

  private appendTocFolderChildren(
    lines: string[],
    element: Element,
    elements: Element[]
  ): void {
    const children = this.getChildElements(element, elements);
    if (!children.length) return;
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

  /** Shared with {@link HtmlSiteGeneratorService}. */
  formatChapterTitle(
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

  /** Shared with {@link HtmlSiteGeneratorService}. */
  escapeHtml(str: string): string {
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
    const text = html.replaceAll(/<[^<>]+>/g, ' ');
    return text.split(/\s+/).filter(Boolean).length;
  }

  private generateFilename(title: string): string {
    const safeName = trimHyphens(
      title.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')
    );
    return `${safeName || 'document'}.html`;
  }
}
