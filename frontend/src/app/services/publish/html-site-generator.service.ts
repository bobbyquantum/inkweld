import { inject, Injectable } from '@angular/core';
import { type Element, ElementType } from '@inkweld/index';
import { createDefaultPublishStyles } from '@models/publish-style';
import JSZip from '@progress/jszip-esm';
import { trimHyphens } from '@utils/string-utils';
import { isWorldbuildingType } from '@utils/worldbuilding.utils';
import { BehaviorSubject, type Observable } from 'rxjs';

import {
  type BackmatterItem,
  type ElementItem,
  type FrontmatterItem,
  FrontmatterType,
  type PublishMetadata,
  type PublishPlan,
  PublishPlanItemType,
  type PublishStats,
  type WorldbuildingItem,
} from '../../models/publish-plan';
import { LoggerService } from '../core/logger.service';
import { LocalStorageService } from '../local/local-storage.service';
import { ProjectStateService } from '../project/project-state.service';
import {
  HtmlGeneratorService,
  type RenderedHeading,
} from './html-generator.service';
import { PublishCssEmitterService } from './publish-css-emitter.service';

export enum HtmlSitePhase {
  Idle = 'idle',
  Planning = 'planning',
  Rendering = 'rendering',
  Packaging = 'packaging',
  Complete = 'complete',
  Error = 'error',
}

export interface HtmlSiteProgress {
  phase: HtmlSitePhase;
  overallProgress: number;
  message: string;
  totalItems: number;
  completedItems: number;
}

export interface HtmlSiteResult {
  success: boolean;
  file?: Blob;
  filename?: string;
  stats?: PublishStats;
  warnings: string[];
  error?: string;
  /** Number of HTML pages written (including index.html). */
  pageCount?: number;
}

type SitePageKind =
  'index' | 'document' | 'worldbuilding' | 'frontmatter' | 'backmatter';

/**
 * A single page of the generated site. Pages are collected in a first pass
 * (so cross-references can resolve to page URLs), then rendered in a
 * second pass.
 */
interface SitePage {
  /** File name without extension; unique within the site. */
  slug: string;
  /** Display title used in navigation, `<title>`, and prev/next links. */
  title: string;
  kind: SitePageKind;
  /** Project element backing this page, if any. */
  elementId?: string;
  /** Parent folder name for navigation grouping. */
  group?: string;
  /** Deferred body renderer, invoked in the render pass. */
  render: () => Promise<string>;
  /** Rendered body HTML; populated in the render pass. */
  body?: string;
  /** Headings found in the body; populated in the render pass. */
  headings?: RenderedHeading[];
}

/** One entry of the client-side search index shipped with the site. */
interface SearchEntry {
  /** Page href relative to the site root. */
  href: string;
  title: string;
  /** Group (folder) name, if any. */
  group?: string;
  /** Plain-text body, whitespace-collapsed and capped. */
  text: string;
}

/** Cap on indexed characters per page; keeps the index small. */
const SEARCH_TEXT_LIMIT = 20_000;

const ASSETS_DIR = 'assets';
const MEDIA_DIR = `${ASSETS_DIR}/media`;
const STYLESHEET_PATH = `${ASSETS_DIR}/styles.css`;
const SEARCH_INDEX_PATH = `${ASSETS_DIR}/search-index.js`;
const SITE_SCRIPT_PATH = `${ASSETS_DIR}/site.js`;
const INDEX_SLUG = 'index';

/**
 * HTML Site Generator Service
 *
 * Produces a multi-page static website from a publish plan, packaged as a
 * ZIP archive:
 *
 * ```
 * index.html            landing page: cover, title, author, contents
 * <page-slug>.html      one page per document / worldbuilding section
 * assets/styles.css     shared stylesheet (publish styles + site chrome)
 * assets/site.js        search box behaviour (vanilla JS, no dependencies)
 * assets/search-index.js  search index as a script (works from file://)
 * assets/cover.<ext>    cover image, when enabled and available
 * assets/media/<id>.<ext>  inline images referenced from documents
 * ```
 *
 * Every page carries a sidebar listing all pages (grouped by folder), a
 * header with the site title and a search box, an "On this page" outline
 * of its headings, and prev/next links in the footer. The layout works
 * without JavaScript (search is the only scripted feature) so the output
 * can be hosted anywhere static files are served, or opened from disk.
 *
 * Document conversion is delegated to {@link HtmlGeneratorService} so the
 * single-page and multi-page outputs render content identically. Element
 * references (`elementRef` nodes) become links when the referenced element
 * has its own page.
 */
@Injectable({
  providedIn: 'root',
})
export class HtmlSiteGeneratorService {
  private readonly logger = inject(LoggerService);
  private readonly projectStateService = inject(ProjectStateService);
  private readonly cssEmitter = inject(PublishCssEmitterService);
  private readonly html = inject(HtmlGeneratorService);
  private readonly localStorage = inject(LocalStorageService);

  private readonly progressSubject = new BehaviorSubject<HtmlSiteProgress>({
    phase: HtmlSitePhase.Idle,
    overallProgress: 0,
    message: 'Ready',
    totalItems: 0,
    completedItems: 0,
  });

  readonly progress$: Observable<HtmlSiteProgress> =
    this.progressSubject.asObservable();

  async generateSite(plan: PublishPlan): Promise<HtmlSiteResult> {
    const startTime = Date.now();
    const result: HtmlSiteResult = { success: false, warnings: [] };

    try {
      this.updateProgress({
        phase: HtmlSitePhase.Planning,
        overallProgress: 5,
        message: 'Planning pages...',
        totalItems: 0,
        completedItems: 0,
      });

      // Reset shared renderer state first: page collection may already
      // raise warnings (e.g. empty back matter) that must not be discarded.
      this.html.resetRenderState();
      const elements = this.projectStateService.elements();
      const pages = this.collectPages(plan, elements, result);
      const pageByElement = new Map<string, SitePage>();
      for (const page of pages) {
        if (page.elementId) pageByElement.set(page.elementId, page);
      }

      const cover = plan.options.includeCover
        ? await this.loadCover(result)
        : null;

      // Render pass. Install the cross-reference resolver so element refs
      // link to the page that holds them, and the image resolver so inline
      // media is written into the archive instead of inlined as base64.
      const mediaAssets = new Map<string, { path: string; blob: Blob }>();
      this.html.setElementRefResolver(id => {
        const target = pageByElement.get(id);
        return target ? `${target.slug}.html` : undefined;
      });
      this.html.setImageHrefResolver(id => this.resolveMedia(id, mediaAssets));
      try {
        for (const [index, page] of pages.entries()) {
          this.updateProgress({
            phase: HtmlSitePhase.Rendering,
            overallProgress: 10 + Math.round((index / pages.length) * 70),
            message: `Rendering ${page.title}...`,
            totalItems: pages.length,
            completedItems: index,
          });
          this.html.resetHeadingIds();
          page.body = await page.render();
          page.headings = this.html.takeRenderedHeadings();
        }
      } finally {
        this.html.setElementRefResolver(null);
        this.html.setImageHrefResolver(null);
      }
      result.warnings.push(...this.html.takeWarnings());

      this.updateProgress({
        phase: HtmlSitePhase.Packaging,
        overallProgress: 85,
        message: 'Packaging site...',
        totalItems: pages.length,
        completedItems: pages.length,
      });

      const zip = new JSZip();
      zip.file(STYLESHEET_PATH, this.buildStylesheet(plan));
      zip.file(SITE_SCRIPT_PATH, SITE_SCRIPT_JS);
      zip.file(SEARCH_INDEX_PATH, this.buildSearchIndex(pages));
      if (cover) zip.file(cover.path, cover.blob);
      for (const asset of mediaAssets.values()) {
        zip.file(asset.path, asset.blob);
      }

      const indexBody = this.renderIndexBody(plan, pages, cover?.path);
      zip.file(
        `${INDEX_SLUG}.html`,
        this.wrapPage(plan, pages, null, indexBody)
      );
      let wordCount = 0;
      for (const page of pages) {
        const body = page.body ?? '';
        wordCount += this.countWords(body);
        zip.file(`${page.slug}.html`, this.wrapPage(plan, pages, page, body));
      }

      const blob = await zip.generateAsync({
        type: 'blob',
        mimeType: 'application/zip',
        compression: 'DEFLATE',
      });

      result.success = true;
      result.file = blob;
      result.filename = this.generateFilename(plan.metadata.title);
      result.pageCount = pages.length + 1;
      result.stats = {
        wordCount,
        chapterCount: plan.items.filter(
          i => i.type === PublishPlanItemType.Element && i.isChapter
        ).length,
        documentCount: pages.filter(p => p.kind === 'document').length,
        fileSize: blob.size,
        generationTimeMs: Date.now() - startTime,
      };

      this.updateProgress({
        phase: HtmlSitePhase.Complete,
        overallProgress: 100,
        message: 'Website generated successfully',
      });
      return result;
    } catch (error) {
      this.logger.error('HtmlSiteGenerator', 'Generation failed', error);
      result.error = error instanceof Error ? error.message : 'Unknown error';
      this.updateProgress({
        phase: HtmlSitePhase.Error,
        message: result.error,
      });
      return result;
    }
  }

  private updateProgress(updates: Partial<HtmlSiteProgress>): void {
    const current = this.progressSubject.getValue();
    this.progressSubject.next({ ...current, ...updates });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Page collection (first pass)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Walk the plan and produce the ordered list of pages. Separators and the
   * table-of-contents item have no multi-page equivalent (navigation is
   * always present) and are skipped. The title page is folded into
   * index.html rather than becoming a page of its own.
   */
  private collectPages(
    plan: PublishPlan,
    elements: Element[],
    result: HtmlSiteResult
  ): SitePage[] {
    const pages: SitePage[] = [];
    const slugs = new Set<string>([INDEX_SLUG]);
    let chapterNumber = 0;

    const add = (page: Omit<SitePage, 'slug'>): void => {
      pages.push({ ...page, slug: this.uniqueSlug(page.title, slugs) });
    };

    for (const item of plan.items) {
      switch (item.type) {
        case PublishPlanItemType.Element: {
          const element = elements.find(e => e.id === item.elementId);
          if (!element) {
            result.warnings.push(
              `Skipped missing element ${item.elementId} from plan`
            );
            break;
          }
          this.collectElementPages(
            item,
            element,
            elements,
            plan,
            chapterNumber,
            add
          );
          if (item.isChapter) chapterNumber++;
          break;
        }
        case PublishPlanItemType.Frontmatter:
          this.collectFrontmatterPage(item, plan.metadata, add);
          break;
        case PublishPlanItemType.Worldbuilding:
          this.collectWorldbuildingPage(item, elements, add);
          break;
        case PublishPlanItemType.Backmatter:
          this.collectBackmatterPage(item, plan.metadata, add);
          break;
        default:
          break;
      }
    }

    return pages;
  }

  private collectBackmatterPage(
    item: BackmatterItem,
    metadata: PublishMetadata,
    add: (page: Omit<SitePage, 'slug'>) => void
  ): void {
    // Peek at the content now so empty items (e.g. a glossary with nothing
    // to show) don't become blank pages. Warnings raised here are drained
    // with the rest after the render pass.
    const { title, body } = this.html.backmatterContent(item, metadata);
    if (!body) return;
    add({
      title,
      kind: 'backmatter',
      render: () =>
        Promise.resolve(this.html.processBackmatter(item, metadata)),
    });
  }

  private collectElementPages(
    item: ElementItem,
    element: Element,
    elements: Element[],
    plan: PublishPlan,
    chapterNumber: number,
    add: (page: Omit<SitePage, 'slug'>) => void
  ): void {
    const title = this.html.formatChapterTitle(
      item.titleOverride || element.name,
      chapterNumber,
      item.isChapter ?? false,
      plan.options
    );

    // Plans built with "Add everything" list elements flat; recover the
    // parent folder so the navigation still groups pages sensibly.
    const group = this.parentFolderName(element, elements);

    if (isWorldbuildingType(element.type)) {
      add({
        title,
        kind: 'worldbuilding',
        elementId: element.id,
        group,
        render: () => this.html.renderInlineWbHtml(element),
      });
      return;
    }

    if (element.type === ElementType.Item) {
      add({
        title,
        kind: 'document',
        elementId: element.id,
        group,
        render: () => this.renderDocumentPage(element.id),
      });
      return;
    }

    if (element.type === ElementType.Folder && item.includeChildren) {
      const children = this.html.getChildElements(element, elements);
      for (const child of children) {
        if (child.type === ElementType.Item) {
          add({
            title: child.name,
            kind: 'document',
            elementId: child.id,
            group: title,
            render: () => this.renderDocumentPage(child.id),
          });
        } else if (isWorldbuildingType(child.type)) {
          add({
            title: child.name,
            kind: 'worldbuilding',
            elementId: child.id,
            group: title,
            render: () => this.html.renderInlineWbHtml(child),
          });
        }
      }
    }
  }

  /**
   * Name of the nearest enclosing folder of an element in the flat,
   * depth-first element list, or undefined for top-level elements.
   */
  private parentFolderName(
    element: Element,
    elements: Element[]
  ): string | undefined {
    if (element.level <= 0) return undefined;
    const index = elements.indexOf(element);
    for (let i = index - 1; i >= 0; i--) {
      const candidate = elements[i];
      if (candidate.level < element.level) {
        return candidate.type === ElementType.Folder
          ? candidate.name
          : undefined;
      }
    }
    return undefined;
  }

  private collectFrontmatterPage(
    item: FrontmatterItem,
    metadata: PublishMetadata,
    add: (page: Omit<SitePage, 'slug'>) => void
  ): void {
    const esc = (s: string): string => this.html.escapeHtml(s);
    switch (item.contentType) {
      case FrontmatterType.TitlePage:
        // Rendered as the index.html hero instead.
        return;
      case FrontmatterType.Copyright:
        add({
          title: 'Copyright',
          kind: 'frontmatter',
          render: () =>
            Promise.resolve(this.html.generateCopyrightPage(metadata)),
        });
        return;
      case FrontmatterType.Dedication:
        add({
          title: 'Dedication',
          kind: 'frontmatter',
          render: () =>
            Promise.resolve(
              `<section class="dedication"><p>${esc(item.customContent || '')}</p></section>`
            ),
        });
        return;
      case FrontmatterType.Custom:
        add({
          title: item.customTitle || 'Front Matter',
          kind: 'frontmatter',
          render: () =>
            Promise.resolve(
              `<section class="custom"><h2>${esc(item.customTitle || '')}</h2><p>${esc(item.customContent || '')}</p></section>`
            ),
        });
        return;
      default:
        return;
    }
  }

  private collectWorldbuildingPage(
    item: WorldbuildingItem,
    elements: Element[],
    add: (page: Omit<SitePage, 'slug'>) => void
  ): void {
    add({
      title: item.title || 'Worldbuilding',
      kind: 'worldbuilding',
      render: () => this.html.processWorldbuilding(item, elements),
    });
  }

  private async renderDocumentPage(elementId: string): Promise<string> {
    const content = await this.html.getDocumentContent(elementId);
    return `<section class="ink-chapter">\n${content}\n</section>`;
  }

  /**
   * Turn a title into a filesystem- and URL-safe slug, appending a numeric
   * suffix when the slug is already taken.
   */
  private uniqueSlug(title: string, taken: Set<string>): string {
    const base =
      trimHyphens(
        title
          .toLowerCase()
          .normalize('NFKD')
          .replaceAll(/[\u0300-\u036f]/g, '')
          .replaceAll(/[^a-z0-9]+/g, '-')
      ) || 'page';
    let slug = base;
    let n = 2;
    while (taken.has(slug)) {
      slug = `${base}-${n}`;
      n++;
    }
    taken.add(slug);
    return slug;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Cover
  // ───────────────────────────────────────────────────────────────────────────

  private async loadCover(
    result: HtmlSiteResult
  ): Promise<{ path: string; blob: Blob } | null> {
    const project = this.projectStateService.project();
    if (!project) return null;
    try {
      const blob = await this.html.loadCoverBlob(project);
      if (!blob) return null;
      const ext = this.extensionForMime(blob.type);
      return { path: `${ASSETS_DIR}/cover.${ext}`, blob };
    } catch (error) {
      this.logger.warn('HtmlSiteGenerator', 'Failed to load cover', error);
      result.warnings.push('Cover image could not be loaded');
      return null;
    }
  }

  /**
   * Image resolver installed on the shared renderer for the render pass:
   * loads the media blob from local storage, records it for the archive,
   * and returns its relative path. Returns null when unavailable so the
   * renderer emits a placeholder and a warning.
   */
  private async resolveMedia(
    mediaId: string,
    assets: Map<string, { path: string; blob: Blob }>
  ): Promise<string | null> {
    const existing = assets.get(mediaId);
    if (existing) return existing.path;
    const project = this.projectStateService.project();
    if (!project) return null;
    const blob = await this.localStorage.getMedia(
      `${project.username}/${project.slug}`,
      mediaId
    );
    if (!blob) return null;
    const safeId = mediaId.replaceAll(/[^a-zA-Z0-9_-]/g, '_');
    const path = `${MEDIA_DIR}/${safeId}.${this.extensionForMime(blob.type)}`;
    assets.set(mediaId, { path, blob });
    return path;
  }

  private extensionForMime(mime: string): string {
    switch (mime) {
      case 'image/png':
        return 'png';
      case 'image/gif':
        return 'gif';
      case 'image/webp':
        return 'webp';
      case 'image/svg+xml':
        return 'svg';
      default:
        return 'jpg';
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Page rendering (second pass)
  // ───────────────────────────────────────────────────────────────────────────

  private renderIndexBody(
    plan: PublishPlan,
    pages: SitePage[],
    coverPath: string | undefined
  ): string {
    const esc = (s: string): string => this.html.escapeHtml(s);
    const m = plan.metadata;
    const parts: string[] = ['<section class="title-page ink-site-hero">'];
    if (coverPath) {
      parts.push(
        `<img src="${esc(coverPath)}" alt="Cover" class="cover-image" />`
      );
    }
    parts.push(`<h1 class="title">${esc(m.title)}</h1>`);
    if (m.subtitle) parts.push(`<p class="subtitle">${esc(m.subtitle)}</p>`);
    if (m.author) parts.push(`<p class="author">${esc(m.author)}</p>`);
    if (m.description) {
      parts.push(`<p class="ink-site-description">${esc(m.description)}</p>`);
    }
    parts.push('</section>');

    if (pages.length > 0) {
      parts.push(
        '<nav class="ink-toc">',
        '<h2 class="ink-toc-title">Contents</h2>',
        this.renderPageList(pages, null, 'ink-toc-list', 'ink-toc-entry'),
        '</nav>'
      );
    }
    return parts.join('\n');
  }

  /**
   * Render the ordered page list as nested `<ul>`s, grouping consecutive
   * pages that share a folder under a group heading. Used for both the
   * sidebar and the index page contents.
   */
  private renderPageList(
    pages: SitePage[],
    current: SitePage | null,
    listClass: string,
    entryClass: string
  ): string {
    const esc = (s: string): string => this.html.escapeHtml(s);
    const lines: string[] = [`<ul class="${listClass}">`];
    let openGroup: string | undefined;

    const closeGroup = (): void => {
      if (openGroup !== undefined) {
        lines.push('</ul>', '</li>');
        openGroup = undefined;
      }
    };

    for (const page of pages) {
      if (page.group !== openGroup) {
        closeGroup();
        if (page.group !== undefined) {
          lines.push(
            `<li class="ink-toc-folder ink-nav-group"><strong class="ink-nav-group-title">${esc(page.group)}</strong>`,
            `<ul class="${listClass}">`
          );
          openGroup = page.group;
        }
      }
      const isCurrent = current !== null && current.slug === page.slug;
      const currentAttr = isCurrent ? ' aria-current="page"' : '';
      const levelAttr = page.group !== undefined ? ' data-level="2"' : '';
      lines.push(
        `<li class="${entryClass}"${levelAttr}><a href="${esc(page.slug)}.html"${currentAttr}>${esc(page.title)}</a></li>`
      );
    }
    closeGroup();
    lines.push('</ul>');
    return lines.join('\n');
  }

  /**
   * Wrap a page body in the site chrome: header, sidebar navigation, main
   * column, and prev/next footer. `page` is `null` for index.html.
   */
  private wrapPage(
    plan: PublishPlan,
    pages: SitePage[],
    page: SitePage | null,
    body: string
  ): string {
    const esc = (s: string): string => this.html.escapeHtml(s);
    const m = plan.metadata;
    const siteTitle = m.title || 'Untitled';
    const pageTitle = page ? `${page.title} · ${siteTitle}` : siteTitle;

    const index = page ? pages.indexOf(page) : -1;
    const prev: { href: string; title: string } | null = page
      ? index > 0
        ? {
            href: `${pages[index - 1].slug}.html`,
            title: pages[index - 1].title,
          }
        : { href: `${INDEX_SLUG}.html`, title: siteTitle }
      : null;
    const next: { href: string; title: string } | null = page
      ? index < pages.length - 1
        ? {
            href: `${pages[index + 1].slug}.html`,
            title: pages[index + 1].title,
          }
        : null
      : pages.length > 0
        ? { href: `${pages[0].slug}.html`, title: pages[0].title }
        : null;

    const pager: string[] = ['<footer class="ink-pager">'];
    pager.push(
      prev
        ? `<a class="ink-pager-prev" rel="prev" href="${esc(prev.href)}"><span class="ink-pager-label">Previous</span><span class="ink-pager-title">${esc(prev.title)}</span></a>`
        : '<span class="ink-pager-prev ink-pager-empty"></span>',
      next
        ? `<a class="ink-pager-next" rel="next" href="${esc(next.href)}"><span class="ink-pager-label">Next</span><span class="ink-pager-title">${esc(next.title)}</span></a>`
        : '<span class="ink-pager-next ink-pager-empty"></span>',
      '</footer>'
    );

    const groupLabel = page?.group
      ? `<p class="ink-page-group">${esc(page.group)}</p>\n`
      : '';
    const outline = page
      ? this.renderPageOutline(page.headings ?? [], page.title)
      : '';

    const indexCurrent = page === null ? ' aria-current="page"' : '';
    const nav = [
      '<nav class="ink-site-nav" aria-label="Contents">',
      `<a class="ink-site-nav-home" href="${INDEX_SLUG}.html"${indexCurrent}>${esc(siteTitle)}</a>`,
      this.renderPageList(pages, page, 'ink-nav-list', 'ink-nav-entry'),
      '</nav>',
    ].join('\n');

    return `<!DOCTYPE html>
<html lang="${esc(m.language || 'en')}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(pageTitle)}</title>
  <meta name="author" content="${esc(m.author)}">
  ${m.description ? `<meta name="description" content="${esc(m.description)}">` : ''}
  <meta name="generator" content="Inkweld">
  <link rel="stylesheet" href="${STYLESHEET_PATH}">
  <script src="${SEARCH_INDEX_PATH}" defer></script>
  <script src="${SITE_SCRIPT_PATH}" defer></script>
</head>
<body class="ink-site">
<input type="checkbox" id="ink-nav-toggle" class="ink-nav-toggle" aria-hidden="true">
<header class="ink-site-header">
  <label for="ink-nav-toggle" class="ink-nav-button" aria-label="Toggle navigation">&#9776;</label>
  <a class="ink-site-title" href="${INDEX_SLUG}.html">${esc(siteTitle)}</a>
  <div class="ink-search" hidden>
    <input class="ink-search-input" type="search" placeholder="Search" aria-label="Search this site" autocomplete="off">
    <ul class="ink-search-results" role="listbox" hidden></ul>
  </div>
</header>
<div class="ink-site-layout">
${nav}
<main class="ink-site-main">
<div class="ink-site-content">
<article class="ink-site-article">
${groupLabel}${body}
</article>
${outline}
</div>
${pager.join('\n')}
</main>
</div>
</body>
</html>`;
  }

  /**
   * "On this page" outline built from the h2/h3 headings of the rendered
   * body. Pages with fewer than two such headings get no outline.
   */
  private renderPageOutline(
    headings: RenderedHeading[],
    pageTitle: string
  ): string {
    const esc = (s: string): string => this.html.escapeHtml(s);
    // A page holding a single worldbuilding entry repeats the page title as
    // its entry heading; that adds nothing to the outline, so drop it.
    const entries = headings.filter(
      h =>
        h.level >= 2 &&
        h.level <= 3 &&
        h.text.trim().length > 0 &&
        !(h.level === 2 && h.text.trim() === pageTitle.trim())
    );
    if (entries.length < 2) return '';
    const lines = [
      '<aside class="ink-page-toc" aria-label="On this page">',
      '<p class="ink-page-toc-title">On this page</p>',
      '<ul class="ink-page-toc-list">',
    ];
    for (const h of entries) {
      lines.push(
        `<li class="ink-page-toc-entry" data-level="${h.level}"><a href="#${esc(h.id)}">${esc(h.text)}</a></li>`
      );
    }
    lines.push('</ul>', '</aside>');
    return lines.join('\n');
  }

  /**
   * Search index as a script that assigns a global, so it loads from
   * `file://` where `fetch()` of a JSON file would be blocked.
   */
  private buildSearchIndex(pages: SitePage[]): string {
    const entries: SearchEntry[] = pages.map(page => {
      const entry: SearchEntry = {
        href: `${page.slug}.html`,
        title: page.title,
        text: this.plainText(page.body ?? '').slice(0, SEARCH_TEXT_LIMIT),
      };
      if (page.group !== undefined) entry.group = page.group;
      return entry;
    });
    // `<` is escaped so the payload can never close a script tag if it is
    // ever inlined; harmless in an external script.
    const json = JSON.stringify(entries).replaceAll('<', '\\u003c');
    return `window.__INKWELD_SEARCH_INDEX__ = ${json};\n`;
  }

  /** Strip tags and entities, collapse whitespace. */
  private plainText(html: string): string {
    return html
      .replaceAll(/<[^<>]+>/g, ' ')
      .replaceAll('&amp;', '&')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&quot;', '"')
      .replaceAll(/\s+/g, ' ')
      .trim();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Stylesheet
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * The publish-style stylesheet followed by the site chrome. The single-page
   * emitter constrains `body` to a reading column; here that constraint is
   * moved onto the article so the sidebar can sit beside it.
   */
  private buildStylesheet(plan: PublishPlan): string {
    const base = this.cssEmitter.emitHtmlStylesheet(
      plan.styles ?? createDefaultPublishStyles()
    );
    return `${base}\n\n${SITE_CHROME_CSS}`;
  }

  private countWords(html: string): number {
    const text = html.replaceAll(/<[^<>]+>/g, ' ');
    return text.split(/\s+/).filter(Boolean).length;
  }

  private generateFilename(title: string): string {
    const safeName = trimHyphens(
      title.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')
    );
    return `${safeName || 'site'}-site.zip`;
  }
}

/**
 * Layout CSS for the generated site. Kept free of colours that would fight
 * the user's publish styles: chrome uses neutral greys and inherits the
 * body font.
 */
const SITE_CHROME_CSS = `/* ── Inkweld site chrome ─────────────────────────────────────────────── */
body.ink-site {
  max-width: none;
  margin: 0;
  padding: 0;
  background: #fff;
}
.ink-site-header, .ink-site-nav, .ink-pager, .ink-page-toc, .ink-search-results {
  text-align: left;
  text-indent: 0;
  hyphens: manual;
}
.ink-nav-toggle { position: absolute; left: -9999px; }
.ink-site-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 1rem;
  border-bottom: 1px solid #e3e3e3;
  background: #fafafa;
}
.ink-site-title {
  font-weight: 600;
  text-decoration: none;
  color: inherit;
}
.ink-nav-button {
  display: none;
  cursor: pointer;
  font-size: 1.4rem;
  line-height: 1;
  padding: 0.1rem 0.4rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #fff;
}
.ink-site-layout {
  display: flex;
  align-items: flex-start;
  min-height: calc(100vh - 3rem);
}
.ink-site-nav {
  position: sticky;
  top: 3rem;
  flex: 0 0 260px;
  max-height: calc(100vh - 3rem);
  overflow-y: auto;
  padding: 1.25rem 1rem;
  border-right: 1px solid #e3e3e3;
  background: #fafafa;
  font-size: 0.92em;
}
.ink-site-nav-home {
  display: block;
  margin-bottom: 0.75rem;
  font-weight: 600;
  text-decoration: none;
  color: inherit;
}
.ink-nav-list { list-style: none; margin: 0; padding: 0; }
.ink-nav-list .ink-nav-list { padding-left: 0.85rem; margin-top: 0.15rem; }
.ink-nav-group { margin-top: 0.6rem; }
.ink-nav-group-title {
  display: block;
  font-size: 0.8em;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #666;
}
.ink-nav-entry a {
  display: block;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  text-decoration: none;
  color: inherit;
}
.ink-nav-entry a:hover { background: #eee; }
.ink-nav-entry a[aria-current="page"],
.ink-site-nav-home[aria-current="page"] {
  background: #e6e6e6;
  font-weight: 600;
}
.ink-site-main { flex: 1 1 auto; min-width: 0; }
.ink-site-article {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}
.ink-site-hero { text-align: center; }
.ink-site-hero .cover-image { max-height: 60vh; margin-bottom: 1.5rem; }
.ink-site-description { max-width: 40em; margin: 1rem auto 0; }
.ink-toc-list { list-style: none; padding-left: 0; }
.ink-toc-list .ink-toc-list { padding-left: 1.25rem; }
.ink-toc-entry a { text-decoration: none; color: inherit; }
.ink-toc-entry a:hover { text-decoration: underline; }
.ink-element-ref { border-bottom: 1px dotted currentColor; }
.ink-pager {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  max-width: 800px;
  margin: 0 auto;
  padding: 1.5rem 2rem 3rem;
  border-top: 1px solid #e3e3e3;
}
.ink-pager a {
  display: flex;
  flex-direction: column;
  max-width: 48%;
  text-decoration: none;
  color: inherit;
}
.ink-pager-next { margin-left: auto; text-align: right; }
.ink-pager-label {
  font-size: 0.75em;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #666;
}
.ink-pager-title { font-weight: 600; }
.ink-pager-empty { flex: 1; }
.ink-page-group {
  margin: 0 0 0.25rem;
  font-size: 0.8em;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #666;
}
.ink-site-content { display: flex; align-items: flex-start; }
.ink-site-content .ink-site-article { flex: 1 1 auto; min-width: 0; }
.ink-page-toc {
  display: none;
  position: sticky;
  top: 4rem;
  flex: 0 0 220px;
  max-height: calc(100vh - 5rem);
  overflow-y: auto;
  padding: 2rem 1rem 1rem 0;
  font-size: 0.85em;
}
.ink-page-toc-title {
  margin: 0 0 0.5rem;
  font-size: 0.8em;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #666;
}
.ink-page-toc-list { list-style: none; margin: 0; padding: 0; border-left: 2px solid #e3e3e3; }
.ink-page-toc-entry a {
  display: block;
  padding: 0.2rem 0.75rem;
  text-decoration: none;
  color: inherit;
}
.ink-page-toc-entry[data-level="3"] a { padding-left: 1.5rem; }
.ink-page-toc-entry a:hover { text-decoration: underline; }
@media (min-width: 1200px) {
  .ink-page-toc { display: block; }
}
.ink-search { position: relative; margin-left: auto; }
.ink-search-input {
  width: 14rem;
  max-width: 50vw;
  padding: 0.35rem 0.6rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font: inherit;
  font-size: 0.9em;
}
.ink-search-results {
  position: absolute;
  right: 0;
  top: calc(100% + 0.25rem);
  z-index: 20;
  width: 24rem;
  max-width: 90vw;
  max-height: 60vh;
  overflow-y: auto;
  margin: 0;
  padding: 0.25rem;
  list-style: none;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #fff;
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
}
.ink-search-result a {
  display: block;
  padding: 0.4rem 0.6rem;
  border-radius: 3px;
  text-decoration: none;
  color: inherit;
}
.ink-search-result a:hover, .ink-search-result[aria-selected="true"] a { background: #eee; }
.ink-search-result-title { display: block; font-weight: 600; }
.ink-search-result-group { font-weight: 400; color: #666; font-size: 0.85em; }
.ink-search-result-snippet { display: block; font-size: 0.85em; color: #444; }
.ink-search-result mark { background: #fff2a8; color: inherit; }
.ink-search-empty { padding: 0.5rem 0.6rem; color: #666; font-size: 0.9em; }
@media (max-width: 860px) {
  .ink-nav-button { display: inline-block; }
  .ink-site-layout { display: block; }
  .ink-site-nav {
    display: none;
    position: static;
    max-height: none;
    border-right: none;
    border-bottom: 1px solid #e3e3e3;
  }
  .ink-nav-toggle:checked ~ .ink-site-layout .ink-site-nav { display: block; }
  .ink-site-article, .ink-pager { padding-left: 1.25rem; padding-right: 1.25rem; }
}
@media print {
  .ink-site-header, .ink-site-nav, .ink-pager { display: none; }
}
`;

/**
 * Search box behaviour. Reads the index published alongside the site
 * (`window.__INKWELD_SEARCH_INDEX__`), filters on title and body text,
 * and renders up to ten results with a highlighted snippet. Keyboard:
 * arrows move, Enter opens, Escape closes. The search box stays hidden
 * when the index failed to load so the header degrades cleanly.
 */
const SITE_SCRIPT_JS = `(function () {
  'use strict';
  var index = window.__INKWELD_SEARCH_INDEX__;
  var box = document.querySelector('.ink-search');
  if (!box || !Array.isArray(index)) return;
  var input = box.querySelector('.ink-search-input');
  var list = box.querySelector('.ink-search-results');
  var selected = -1;
  var results = [];
  box.hidden = false;

  function escapeHtml(s) {
    return s.replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function highlight(text, terms) {
    var out = escapeHtml(text);
    terms.forEach(function (t) {
      var re = new RegExp('(' + t.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&') + ')', 'ig');
      out = out.replace(re, '<mark>$1</mark>');
    });
    return out;
  }
  function snippet(text, terms) {
    var lower = text.toLowerCase();
    var pos = -1;
    for (var i = 0; i < terms.length && pos < 0; i++) pos = lower.indexOf(terms[i]);
    if (pos < 0) pos = 0;
    var start = Math.max(0, pos - 60);
    var end = Math.min(text.length, pos + 120);
    return (start > 0 ? '\u2026' : '') + text.slice(start, end) + (end < text.length ? '\u2026' : '');
  }
  function score(entry, terms) {
    var title = entry.title.toLowerCase();
    var text = entry.text.toLowerCase();
    var total = 0;
    for (var i = 0; i < terms.length; i++) {
      var t = terms[i];
      if (title.indexOf(t) >= 0) total += 10;
      else if (text.indexOf(t) >= 0) total += 1;
      else return 0;
    }
    return total;
  }
  function render() {
    list.innerHTML = '';
    if (!input.value.trim()) { list.hidden = true; return; }
    if (results.length === 0) {
      var empty = document.createElement('li');
      empty.className = 'ink-search-empty';
      empty.textContent = 'No results';
      list.appendChild(empty);
      list.hidden = false;
      return;
    }
    var terms = currentTerms();
    results.forEach(function (r, i) {
      var li = document.createElement('li');
      li.className = 'ink-search-result';
      li.setAttribute('role', 'option');
      if (i === selected) li.setAttribute('aria-selected', 'true');
      var group = r.entry.group ? ' <span class="ink-search-result-group">\u00b7 ' + escapeHtml(r.entry.group) + '</span>' : '';
      li.innerHTML = '<a href="' + escapeHtml(r.entry.href) + '">' +
        '<span class="ink-search-result-title">' + highlight(r.entry.title, terms) + group + '</span>' +
        '<span class="ink-search-result-snippet">' + highlight(snippet(r.entry.text, terms), terms) + '</span></a>';
      list.appendChild(li);
    });
    list.hidden = false;
  }
  function currentTerms() {
    return input.value.toLowerCase().split(/\\s+/).filter(Boolean);
  }
  function search() {
    var terms = currentTerms();
    selected = -1;
    if (terms.length === 0) { results = []; render(); return; }
    results = index
      .map(function (entry) { return { entry: entry, score: score(entry, terms) }; })
      .filter(function (r) { return r.score > 0; })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, 10);
    render();
  }
  input.addEventListener('input', search);
  input.addEventListener('focus', function () { if (results.length) list.hidden = false; });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); selected = Math.min(results.length - 1, selected + 1); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); selected = Math.max(0, selected - 1); render(); }
    else if (e.key === 'Enter' && selected >= 0 && results[selected]) { window.location.href = results[selected].entry.href; }
    else if (e.key === 'Escape') { list.hidden = true; input.blur(); }
  });
  document.addEventListener('click', function (e) {
    if (!box.contains(e.target)) list.hidden = true;
  });
})();
`;
