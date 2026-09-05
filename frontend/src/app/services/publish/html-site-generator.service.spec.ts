import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type Element, ElementType, type Project } from '@inkweld/index';
import { createDefaultPublishStyles } from '@models/publish-style';
import JSZip from '@progress/jszip-esm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import {
  BackmatterType,
  ChapterNumbering,
  FrontmatterType,
  PublishFormat,
  type PublishPlan,
  type PublishPlanItem,
  PublishPlanItemType,
  SeparatorStyle,
} from '../../models/publish-plan';
import { LoggerService } from '../core/logger.service';
import { LocalStorageService } from '../local/local-storage.service';
import { DocumentService } from '../project/document.service';
import { ProjectStateService } from '../project/project-state.service';
import { HtmlGeneratorService } from './html-generator.service';
import {
  HtmlSiteGeneratorService,
  HtmlSitePhase,
  type HtmlSiteProgress,
} from './html-site-generator.service';
import { IconSvgService } from './icon-svg.service';
import { PublishCssEmitterService } from './publish-css-emitter.service';
import { WorldbuildingPublishRendererService } from './worldbuilding-publish-renderer.service';

describe('HtmlSiteGeneratorService', () => {
  let service: HtmlSiteGeneratorService;
  let htmlGenerator: HtmlGeneratorService;
  let documentServiceMock: { getDocumentContent: ReturnType<typeof vi.fn> };
  let localStorageMock: {
    getMedia: ReturnType<
      typeof vi.fn<(key: string, id: string) => Promise<Blob | null>>
    >;
  };
  let wbRendererMock: { renderItem: ReturnType<typeof vi.fn> };
  let iconSvgMock: {
    getSvg: ReturnType<typeof vi.fn<(name: string) => Promise<string | null>>>;
  };
  const fakeSvg = (name: string): string =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" focusable="false" aria-hidden="true"><path d="M0 0h${name.length}"/></svg>`;
  let projectStateMock: {
    project: ReturnType<typeof signal<Project | null>>;
    elements: ReturnType<typeof signal<Element[]>>;
    coverMediaId: ReturnType<typeof signal<string | undefined>>;
  };

  const mockProject: Project = {
    id: 'proj-1',
    username: 'testuser',
    slug: 'test-project',
    title: 'Test Project',
    description: '',
    createdDate: '2024-01-01',
    updatedDate: '2024-01-01',
  };

  const el = (
    id: string,
    name: string,
    type: ElementType,
    level = 0,
    parentId: string | null = null
  ): Element => ({
    id,
    name,
    type,
    parentId,
    order: 0,
    level,
    expandable: type === ElementType.Folder,
    version: 1,
    metadata: {},
  });

  const mockElements: Element[] = [
    el('doc-1', 'Introduction', ElementType.Item),
    el('folder-1', 'Guides', ElementType.Folder),
    el('doc-2', 'Getting Started', ElementType.Item, 1, 'folder-1'),
    el('doc-3', 'Getting Started', ElementType.Item, 1, 'folder-1'),
    el('doc-4', 'Appendix', ElementType.Item),
    el('doc-5', 'Reference', ElementType.Item),
  ];

  const paragraph = (text: string): unknown => ({
    nodeName: 'paragraph',
    children: [text],
  });

  const docContent: Record<string, unknown[]> = {
    'doc-1': [
      paragraph('Welcome to the guide.'),
      {
        nodeName: 'paragraph',
        children: [
          'See ',
          {
            type: 'elementRef',
            attrs: { elementId: 'doc-4', displayText: 'the appendix' },
          },
          ' and ',
          {
            type: 'elementRef',
            attrs: { elementId: 'missing', displayText: 'a ghost' },
          },
          '.',
        ],
      },
    ],
    'doc-2': [paragraph('First guide.')],
    'doc-3': [paragraph('Second guide with the same name.')],
    'doc-4': [paragraph('Appendix content.')],
    'doc-5': [
      {
        type: 'heading',
        attrs: { level: 1 },
        content: [{ text: 'Reference' }],
      },
      { type: 'heading', attrs: { level: 2 }, content: [{ text: 'Install' }] },
      {
        type: 'paragraph',
        content: [
          { type: 'image', attrs: { src: 'media:img-1', alt: 'Diagram' } },
        ],
      },
      { type: 'heading', attrs: { level: 3 }, content: [{ text: 'Linux' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ text: 'Usage' }] },
      {
        type: 'paragraph',
        content: [
          { type: 'image', attrs: { src: 'media:img-1', alt: 'Again' } },
          { text: 'Use it <carefully>.' },
        ],
      },
    ],
  };

  const buildPlan = (
    items: PublishPlanItem[],
    overrides: Partial<PublishPlan> = {}
  ): PublishPlan => ({
    id: 'plan-1',
    name: 'Site Plan',
    format: PublishFormat.HTML_SITE,
    metadata: {
      title: 'My Handbook',
      subtitle: 'A Guide',
      author: 'Jane Writer',
      language: 'en',
      description: 'All about things.',
    },
    options: {
      includeToc: true,
      includeCover: false,
      chapterNumbering: ChapterNumbering.None,
      sceneBreakText: '* * *',
      includeWordCounts: false,
    },
    styles: createDefaultPublishStyles(),
    items,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  });

  const elementItem = (
    elementId: string,
    extra: Partial<Extract<PublishPlanItem, { elementId: string }>> = {}
  ): PublishPlanItem => ({
    id: `item-${elementId}`,
    type: PublishPlanItemType.Element,
    elementId,
    includeChildren: false,
    ...extra,
  });

  const unzip = async (
    blob: Blob
  ): Promise<{ names: string[]; read: (name: string) => Promise<string> }> => {
    const zip = await new JSZip().loadAsync(blob);
    const names = Object.keys(zip.files).sort();
    return {
      names,
      read: async (name: string): Promise<string> => {
        const file = zip.file(name);
        if (!file) throw new Error(`missing ${name}`);
        return file.async('string');
      },
    };
  };

  beforeEach(() => {
    documentServiceMock = {
      getDocumentContent: vi
        .fn()
        .mockImplementation((fullId: string): Promise<unknown> => {
          const id = fullId.split(':').pop() ?? fullId;
          return Promise.resolve(docContent[id] ?? null);
        }),
    };
    localStorageMock = {
      getMedia: vi
        .fn<(key: string, id: string) => Promise<Blob | null>>()
        .mockResolvedValue(null),
    };
    wbRendererMock = { renderItem: vi.fn().mockResolvedValue([]) };
    iconSvgMock = {
      getSvg: vi
        .fn<(name: string) => Promise<string | null>>()
        .mockImplementation((name: string) =>
          Promise.resolve(name === 'unknown_icon' ? null : fakeSvg(name))
        ),
    };
    projectStateMock = {
      project: signal<Project | null>(mockProject),
      elements: signal<Element[]>(mockElements),
      coverMediaId: signal<string | undefined>(undefined),
    };

    TestBed.configureTestingModule({
      imports: [translocoTestProvider()],
      providers: [
        provideZonelessChangeDetection(),
        HtmlSiteGeneratorService,
        HtmlGeneratorService,
        PublishCssEmitterService,
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
          },
        },
        { provide: DocumentService, useValue: documentServiceMock },
        { provide: ProjectStateService, useValue: projectStateMock },
        { provide: LocalStorageService, useValue: localStorageMock },
        {
          provide: WorldbuildingPublishRendererService,
          useValue: wbRendererMock,
        },
        { provide: IconSvgService, useValue: iconSvgMock },
      ],
    });

    service = TestBed.inject(HtmlSiteGeneratorService);
    htmlGenerator = TestBed.inject(HtmlGeneratorService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should emit initial idle progress', () => {
    let progress: HtmlSiteProgress | undefined;
    service.progress$.subscribe(p => (progress = p));
    expect(progress?.phase).toBe(HtmlSitePhase.Idle);
  });

  describe('generateSite', () => {
    it('should produce a ZIP with index, one page per document, and a stylesheet', async () => {
      const plan = buildPlan([elementItem('doc-1'), elementItem('doc-4')]);

      const result = await service.generateSite(plan);

      expect(result.success).toBe(true);
      expect(result.file?.type).toBe('application/zip');
      expect(result.filename).toBe('my-handbook-site.zip');
      expect(result.pageCount).toBe(3);
      expect(result.stats?.documentCount).toBe(2);

      const { names } = await unzip(result.file!);
      expect(names).toEqual([
        'appendix.html',
        'assets/',
        'assets/search-index.js',
        'assets/site.js',
        'assets/styles.css',
        'index.html',
        'introduction.html',
      ]);
    });

    it('should render the index as a title page with a contents list', async () => {
      const plan = buildPlan([
        {
          id: 'fm-title',
          type: PublishPlanItemType.Frontmatter,
          contentType: FrontmatterType.TitlePage,
        },
        elementItem('doc-1'),
      ]);

      const result = await service.generateSite(plan);
      const { names, read } = await unzip(result.file!);
      const index = await read('index.html');

      // Title page folds into index.html rather than becoming its own page.
      expect(names.filter(n => n.endsWith('.html'))).toEqual([
        'index.html',
        'introduction.html',
      ]);
      expect(index).toContain('<title>My Handbook</title>');
      expect(index).toContain('<h1 class="title">My Handbook</h1>');
      expect(index).toContain('<p class="subtitle">A Guide</p>');
      expect(index).toContain('<p class="author">Jane Writer</p>');
      expect(index).toContain('name="description" content="All about things."');
      expect(index).toContain('<h2 class="ink-toc-title">Contents</h2>');
      expect(index).toContain('href="introduction.html"');
      expect(index).toContain(
        '<link rel="stylesheet" href="assets/styles.css">'
      );
    });

    it('should wrap every page in the site chrome with nav, current marker, and pager', async () => {
      const plan = buildPlan([elementItem('doc-1'), elementItem('doc-4')]);

      const result = await service.generateSite(plan);
      const { read } = await unzip(result.file!);
      const intro = await read('introduction.html');
      const appendix = await read('appendix.html');
      const index = await read('index.html');

      expect(intro).toContain('<title>Introduction · My Handbook</title>');
      expect(intro).toContain('<nav class="ink-site-nav"');
      expect(intro).toContain(
        '<a href="introduction.html" aria-current="page">Introduction</a>'
      );
      expect(intro).toContain('<a href="appendix.html">Appendix</a>');
      expect(intro).toContain('Welcome to the guide.');

      // First page: previous goes back to the index, next to the appendix.
      expect(intro).toContain('rel="prev" href="index.html"');
      expect(intro).toContain('rel="next" href="appendix.html"');
      // Last page: no next link.
      expect(appendix).toContain('rel="prev" href="introduction.html"');
      expect(appendix).not.toContain('rel="next"');
      // Index: no previous, next is the first page.
      expect(index).not.toContain('rel="prev"');
      expect(index).toContain('rel="next" href="introduction.html"');
      expect(index).toContain(
        'class="ink-site-nav-home" href="index.html" aria-current="page"'
      );
    });

    it('should expand folders into grouped child pages and dedupe slugs', async () => {
      const plan = buildPlan([
        elementItem('folder-1', { includeChildren: true }),
      ]);

      const result = await service.generateSite(plan);
      const { names, read } = await unzip(result.file!);

      expect(names.filter(n => n.endsWith('.html'))).toEqual([
        'getting-started-2.html',
        'getting-started.html',
        'index.html',
      ]);
      const page = await read('getting-started.html');
      expect(page).toContain(
        '<strong class="ink-nav-group-title">Guides</strong>'
      );
      expect(page).toContain('href="getting-started-2.html"');
      expect(await read('getting-started-2.html')).toContain(
        'Second guide with the same name.'
      );
    });

    it('should link element references to their pages and leave unresolved refs as text', async () => {
      const plan = buildPlan([elementItem('doc-1'), elementItem('doc-4')]);

      const result = await service.generateSite(plan);
      const { read } = await unzip(result.file!);
      const intro = await read('introduction.html');

      expect(intro).toContain(
        '<a class="ink-mark-link ink-element-ref" href="appendix.html">the appendix</a>'
      );
      expect(intro).toContain(' and a ghost.');
      expect(intro).not.toContain('href="missing');
    });

    it('should clear the element-ref resolver after generation', async () => {
      const spy = vi.spyOn(htmlGenerator, 'setElementRefResolver');
      await service.generateSite(buildPlan([elementItem('doc-1')]));

      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy.mock.calls[0][0]).toBeTypeOf('function');
      expect(spy.mock.calls[1][0]).toBeNull();

      // Single-page generation afterwards renders refs as plain text.
      const single = await htmlGenerator.generateHtml(
        buildPlan([elementItem('doc-1')], { format: PublishFormat.HTML })
      );
      const text = await single.file!.text();
      expect(text).toContain('See the appendix and a ghost.');
    });

    it('should apply chapter numbering to page titles', async () => {
      const plan = buildPlan([elementItem('doc-1', { isChapter: true })], {
        options: {
          includeToc: true,
          includeCover: false,
          chapterNumbering: ChapterNumbering.Numeric,
          sceneBreakText: '* * *',
          includeWordCounts: false,
        },
      });

      const result = await service.generateSite(plan);
      const { names, read } = await unzip(result.file!);

      expect(names).toContain('chapter-1-introduction.html');
      expect(await read('chapter-1-introduction.html')).toContain(
        '<title>Chapter 1: Introduction · My Handbook</title>'
      );
      expect(result.stats?.chapterCount).toBe(1);
    });

    it('should turn copyright and custom front matter into pages and skip separators and TOC items', async () => {
      const plan = buildPlan([
        {
          id: 'fm-copy',
          type: PublishPlanItemType.Frontmatter,
          contentType: FrontmatterType.Copyright,
        },
        {
          id: 'fm-custom',
          type: PublishPlanItemType.Frontmatter,
          contentType: FrontmatterType.Custom,
          customTitle: 'Preface',
          customContent: 'Some words.',
        },
        {
          id: 'toc',
          type: PublishPlanItemType.TableOfContents,
          title: 'Contents',
          depth: 2,
          includePageNumbers: false,
        },
        {
          id: 'sep',
          type: PublishPlanItemType.Separator,
          style: SeparatorStyle.PageBreak,
        },
        elementItem('doc-1'),
      ]);

      const result = await service.generateSite(plan);
      const { names, read } = await unzip(result.file!);

      expect(names.filter(n => n.endsWith('.html'))).toEqual([
        'copyright.html',
        'index.html',
        'introduction.html',
        'preface.html',
      ]);
      expect(await read('copyright.html')).toContain('Jane Writer');
      expect(await read('preface.html')).toContain('<h2>Preface</h2>');
    });

    it('should render worldbuilding items as their own page', async () => {
      wbRendererMock.renderItem.mockResolvedValue([
        {
          elementId: 'wb-1',
          title: 'Aria',
          layout: 'card',
          tabs: [],
        },
      ]);
      const plan = buildPlan([
        elementItem('doc-1'),
        {
          id: 'wb',
          type: PublishPlanItemType.Worldbuilding,
          categories: ['CHARACTER'],
          format: 'appendix',
          title: 'Characters',
        },
      ]);

      const result = await service.generateSite(plan);
      const { names, read } = await unzip(result.file!);

      expect(names).toContain('characters.html');
      const page = await read('characters.html');
      expect(page).toContain(
        '<h2 class="ink-wb-section-title">Characters</h2>'
      );
      expect(page).toContain('<h3 class="ink-wb-entry-title">Aria</h3>');
    });

    it('should include the cover image when enabled and available', async () => {
      localStorageMock.getMedia.mockImplementation((_key: string, id: string) =>
        Promise.resolve(
          id === 'cover' ? new Blob(['png'], { type: 'image/png' }) : null
        )
      );
      const plan = buildPlan([elementItem('doc-1')], {
        options: {
          includeToc: true,
          includeCover: true,
          chapterNumbering: ChapterNumbering.None,
          sceneBreakText: '* * *',
          includeWordCounts: false,
        },
      });

      const result = await service.generateSite(plan);
      const { names, read } = await unzip(result.file!);

      expect(names).toContain('assets/cover.png');
      expect(await read('index.html')).toContain(
        '<img src="assets/cover.png" alt="Cover" class="cover-image" />'
      );
    });

    it('should move the reading column from body to the article in the stylesheet', async () => {
      const result = await service.generateSite(
        buildPlan([elementItem('doc-1')])
      );
      const { read } = await unzip(result.file!);
      const css = await read('assets/styles.css');

      expect(css).toContain('body.ink-site');
      expect(css).toContain('.ink-site-article');
      expect(css).toContain('.ink-site-nav');
      // Publish styles are still present.
      expect(css).toContain('.ink-doc-paragraph');
    });

    it('should warn about plan items whose element no longer exists', async () => {
      const result = await service.generateSite(
        buildPlan([elementItem('doc-1'), elementItem('gone')])
      );

      expect(result.success).toBe(true);
      expect(result.warnings).toEqual([
        'Skipped missing element gone from plan',
      ]);
    });

    it('should escape metadata in the generated HTML', async () => {
      const plan = buildPlan([elementItem('doc-1')], {
        metadata: {
          title: 'Tom & <Jerry>',
          author: '"Quotes"',
          language: 'en',
        },
      });

      const result = await service.generateSite(plan);
      const { read } = await unzip(result.file!);
      const index = await read('index.html');

      expect(index).toContain('<title>Tom &amp; &lt;Jerry&gt;</title>');
      expect(index).toContain('content="&quot;Quotes&quot;"');
      expect(result.filename).toBe('tom-jerry-site.zip');
    });

    it('should report errors and set the error phase', async () => {
      const emitter = TestBed.inject(PublishCssEmitterService);
      vi.spyOn(emitter, 'emitHtmlStylesheet').mockImplementation(() => {
        throw new Error('css exploded');
      });
      let progress: HtmlSiteProgress | undefined;
      service.progress$.subscribe(p => (progress = p));

      const result = await service.generateSite(
        buildPlan([elementItem('doc-1')])
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('css exploded');
      expect(progress?.phase).toBe(HtmlSitePhase.Error);
    });
  });

  describe('rich site features', () => {
    it('should write inline media into assets/media once and reference it relatively', async () => {
      localStorageMock.getMedia.mockImplementation((_key: string, id: string) =>
        Promise.resolve(
          id === 'img-1' ? new Blob(['png'], { type: 'image/png' }) : null
        )
      );

      const result = await service.generateSite(
        buildPlan([elementItem('doc-5'), elementItem('doc-1')])
      );
      const { names, read } = await unzip(result.file!);

      expect(names).toContain('assets/media/img-1.png');
      const page = await read('reference.html');
      expect(page).toContain(
        '<img class="ink-doc-image" src="assets/media/img-1.png" alt="Diagram" loading="lazy" />'
      );
      expect(page).toContain('alt="Again"');
      expect(page).not.toContain('data:image');
      // Two references, one load.
      expect(
        localStorageMock.getMedia.mock.calls.filter(c => c[1] === 'img-1')
      ).toHaveLength(1);
      expect(result.warnings).toEqual([]);
    });

    it('should warn and render a placeholder for media that is not available locally', async () => {
      const result = await service.generateSite(
        buildPlan([elementItem('doc-5')])
      );
      const { names, read } = await unzip(result.file!);

      expect(names.some(n => n.startsWith('assets/media/'))).toBe(false);
      expect(await read('reference.html')).toContain(
        '[Image unavailable: Diagram]'
      );
      expect(result.warnings).toEqual(['Image img-1 could not be loaded']);
    });

    it('should add an "On this page" outline from h2/h3 headings', async () => {
      const result = await service.generateSite(
        buildPlan([elementItem('doc-5'), elementItem('doc-1')])
      );
      const { read } = await unzip(result.file!);
      const reference = await read('reference.html');
      const intro = await read('introduction.html');

      expect(reference).toContain('<aside class="ink-page-toc"');
      expect(reference).toContain(
        '<li class="ink-page-toc-entry" data-level="2"><a href="#install">Install</a></li>'
      );
      expect(reference).toContain(
        '<li class="ink-page-toc-entry" data-level="3"><a href="#linux">Linux</a></li>'
      );
      expect(reference).toContain('<a href="#usage">Usage</a>');
      // The h1 is the page title, not an outline entry.
      expect(reference).not.toContain('href="#reference"');
      // Pages without enough headings get no outline.
      expect(intro).not.toContain('ink-page-toc');
    });

    it('should keep heading ids independent per page', async () => {
      const result = await service.generateSite(
        buildPlan([elementItem('doc-5'), elementItem('doc-5')])
      );
      const { read } = await unzip(result.file!);

      expect(await read('reference.html')).toContain('id="install"');
      expect(await read('reference-2.html')).toContain('id="install"');
      expect(await read('reference-2.html')).not.toContain('id="install-2"');
    });

    it('should group flat plan items under their parent folder', async () => {
      const result = await service.generateSite(
        buildPlan([
          elementItem('doc-1'),
          elementItem('doc-2'),
          elementItem('doc-3'),
          elementItem('doc-4'),
        ])
      );
      const { read } = await unzip(result.file!);
      const page = await read('getting-started.html');

      expect(page).toContain('<p class="ink-page-group">Guides</p>');
      expect(page).toContain(
        '<strong class="ink-nav-group-title">Guides</strong>'
      );
      expect(page).toContain(
        '<li class="ink-nav-entry" data-level="2"><a href="getting-started-2.html">Getting Started</a></li>'
      );
      // Top-level pages are not grouped.
      expect(await read('appendix.html')).not.toContain('ink-page-group');
    });

    it('should resolve worldbuilding identity images into the media folder', async () => {
      localStorageMock.getMedia.mockImplementation((_key: string, id: string) =>
        Promise.resolve(
          id === 'img-elara' ? new Blob(['jpg'], { type: 'image/jpeg' }) : null
        )
      );
      wbRendererMock.renderItem.mockResolvedValue([
        {
          elementId: 'wb-1',
          title: 'Elara',
          layout: 'card',
          imageRef: 'media://img-elara.jpg',
          tabs: [],
        },
        {
          elementId: 'wb-2',
          title: 'Remote',
          layout: 'card',
          imageRef: 'https://example.com/r.png',
          tabs: [],
        },
        {
          elementId: 'wb-3',
          title: 'Ghost',
          layout: 'card',
          imageRef: 'media://img-missing.png',
          tabs: [],
        },
      ]);

      const result = await service.generateSite(
        buildPlan([
          {
            id: 'wb',
            type: PublishPlanItemType.Worldbuilding,
            categories: ['CHARACTER'],
            format: 'appendix',
            title: 'Characters',
          },
        ])
      );
      const { names, read } = await unzip(result.file!);
      const page = await read('characters.html');

      expect(names).toContain('assets/media/img-elara.jpg');
      expect(page).toContain(
        '<img class="ink-wb-entry-image" src="assets/media/img-elara.jpg" alt="Elara" loading="lazy" />'
      );
      expect(page).toContain('src="https://example.com/r.png"');
      expect(page).not.toContain('img-missing');
      expect(result.warnings).toEqual([
        'Image img-missing could not be loaded',
      ]);
    });

    it('should label pages that belong to a folder group', async () => {
      const result = await service.generateSite(
        buildPlan([
          elementItem('folder-1', { includeChildren: true }),
          elementItem('doc-1'),
        ])
      );
      const { read } = await unzip(result.file!);

      expect(await read('getting-started.html')).toContain(
        '<p class="ink-page-group">Guides</p>'
      );
      expect(await read('introduction.html')).not.toContain('ink-page-group');
    });

    it('should render back matter pages and skip empty ones with a warning', async () => {
      const result = await service.generateSite(
        buildPlan([
          elementItem('doc-1'),
          {
            id: 'bm-about',
            type: PublishPlanItemType.Backmatter,
            contentType: BackmatterType.AboutAuthor,
          },
          {
            id: 'bm-gloss',
            type: PublishPlanItemType.Backmatter,
            contentType: BackmatterType.Glossary,
          },
        ])
      );
      const { names, read } = await unzip(result.file!);

      expect(names).toContain('about-the-author.html');
      expect(names).not.toContain('glossary.html');
      const about = await read('about-the-author.html');
      expect(about).toContain('<p>Jane Writer</p>');
      expect(about).toContain('rel="prev" href="introduction.html"');
      expect(result.warnings).toContain(
        'Glossary back matter has no content and was skipped'
      );
    });

    it('should ship a search index and script and wire them into every page', async () => {
      const result = await service.generateSite(
        buildPlan([
          elementItem('folder-1', { includeChildren: true }),
          elementItem('doc-5'),
        ])
      );
      const { read } = await unzip(result.file!);

      const indexJs = await read('assets/search-index.js');
      expect(indexJs.startsWith('window.__INKWELD_SEARCH_INDEX__ = ')).toBe(
        true
      );
      expect(indexJs).not.toContain('<');
      const payload = JSON.parse(
        indexJs
          .slice('window.__INKWELD_SEARCH_INDEX__ = '.length)
          .replace(/;\s*$/, '')
      ) as { href: string; title: string; group?: string; text: string }[];
      expect(payload.map(e => e.href)).toEqual([
        'getting-started.html',
        'getting-started-2.html',
        'reference.html',
      ]);
      expect(payload[0]).toMatchObject({
        title: 'Getting Started',
        group: 'Guides',
        text: 'First guide.',
      });
      // Body text is de-tagged and entity-decoded, without any placeholder noise.
      expect(payload[2].text).toContain('Use it <carefully>.');
      expect(payload[2].text).not.toContain('<p');
      expect(payload[2].group).toBeUndefined();

      const siteJs = await read('assets/site.js');
      expect(siteJs).toContain('__INKWELD_SEARCH_INDEX__');

      const page = await read('reference.html');
      expect(page).toContain(
        '<script src="assets/search-index.js" defer></script>'
      );
      expect(page).toContain('<script src="assets/site.js" defer></script>');
      expect(page).toContain('<input class="ink-search-input" type="search"');
    });
  });

  describe('worldbuilding entry presentation', () => {
    const richEntry = {
      elementId: 'wb-1',
      title: 'Elara Nightwhisper',
      schemaId: 'character',
      schemaLabel: 'Character',
      icon: 'person',
      layout: 'card',
      description: 'A scholar.',
      appearance: {
        content: {
          type: 'gradient',
          mode: 'auto',
          value: 'linear-gradient(135deg, #223 0%, #445 100%)',
        },
      },
      tabs: [
        {
          key: 'basic',
          label: 'Basic Info',
          icon: 'badge',
          fields: [
            {
              key: 'age',
              label: 'Age',
              rawValue: 127,
              displayValue: '127',
              type: 'number',
              span: 4,
            },
            {
              key: 'bio',
              label: 'Biography',
              rawValue: 'Line one\nLine two',
              displayValue: 'Line one\nLine two',
              type: 'textarea',
              span: 12,
            },
          ],
        },
        {
          key: 'relations',
          label: 'Relations',
          fields: [
            {
              key: 'friends',
              label: 'Friends',
              rawValue: ['doc-4', 'nowhere'],
              displayValue: 'Appendix, Nobody',
              type: 'relationship',
              links: [
                { id: 'doc-4', name: 'Appendix' },
                { id: 'nowhere', name: 'Nobody' },
              ],
            },
          ],
        },
      ],
    };

    it('should anchor entries and tabs and list the tabs in the outline', async () => {
      wbRendererMock.renderItem.mockResolvedValue([richEntry]);
      const result = await service.generateSite(
        buildPlan([
          {
            id: 'wb',
            type: PublishPlanItemType.Worldbuilding,
            categories: [],
            format: 'appendix',
            title: 'Elara Nightwhisper',
          },
          elementItem('doc-4'),
        ])
      );
      const { read } = await unzip(result.file!);
      const page = await read('elara-nightwhisper.html');

      expect(page).toContain(
        '<article class="ink-wb-entry ink-wb-layout-card ink-wb-schema-character ink-wb-has-bg" id="elara-nightwhisper"'
      );
      expect(page).toContain(
        '<section class="ink-wb-tab" id="elara-nightwhisper-basic-info" data-tab="basic">'
      );
      expect(page).toContain(
        '<section class="ink-wb-tab" id="elara-nightwhisper-relations"'
      );
      // Outline lists the tabs, but not the entry title that equals the page title.
      expect(page).toContain('<aside class="ink-page-toc"');
      expect(page).toContain(
        '<a href="#elara-nightwhisper-basic-info">Basic Info</a>'
      );
      expect(page).toContain(
        '<a href="#elara-nightwhisper-relations">Relations</a>'
      );
      expect(page).not.toContain(
        '<a href="#elara-nightwhisper">Elara Nightwhisper</a>'
      );
    });

    it('should render schema badge, icons, authored background, spans, and relationship links', async () => {
      wbRendererMock.renderItem.mockResolvedValue([richEntry]);
      const result = await service.generateSite(
        buildPlan([
          {
            id: 'wb',
            type: PublishPlanItemType.Worldbuilding,
            categories: [],
            format: 'appendix',
            title: 'Cast',
          },
          elementItem('doc-4'),
        ])
      );
      const { read } = await unzip(result.file!);
      const page = await read('cast.html');

      expect(page).toContain(
        'style="--ink-wb-bg: linear-gradient(135deg, #223 0%, #445 100%);"'
      );
      expect(page).toContain(
        `<span class="ink-wb-icon" aria-hidden="true">${fakeSvg('person')}</span>`
      );
      expect(page).toContain(
        `<h4 class="ink-wb-tab-heading"><span class="ink-wb-icon" aria-hidden="true">${fakeSvg('badge')}</span>Basic Info</h4>`
      );
      // Tabs without an icon get none; unresolvable icons render nothing.
      expect(page).toContain('<h4 class="ink-wb-tab-heading">Relations</h4>');
      expect(page).not.toContain('material-symbols');
      expect(page).not.toContain('fonts.googleapis.com');
      expect(page).toContain(
        '<span class="ink-wb-entry-schema">Character</span>'
      );
      expect(page).toContain(
        '<div class="ink-wb-field ink-wb-field-type-number ink-wb-span-4">'
      );
      expect(page).toContain(
        '<div class="ink-wb-field ink-wb-field-type-textarea ink-wb-span-12">'
      );
      expect(page).toContain(
        '<dd class="ink-wb-field-value"><a class="ink-mark-link ink-element-ref" href="appendix.html">Appendix</a>, Nobody</dd>'
      );
      expect(iconSvgMock.getSvg).toHaveBeenCalledWith('person');
      expect(iconSvgMock.getSvg).toHaveBeenCalledWith('badge');
      expect(iconSvgMock.getSvg).toHaveBeenCalledTimes(2);
    });

    it('should reject unsafe background values and resolve image backgrounds through media', async () => {
      localStorageMock.getMedia.mockImplementation((_key: string, id: string) =>
        Promise.resolve(
          id === 'bg-1' ? new Blob(['png'], { type: 'image/png' }) : null
        )
      );
      wbRendererMock.renderItem.mockResolvedValue([
        {
          ...richEntry,
          title: 'Evil',
          appearance: {
            content: {
              type: 'gradient',
              mode: 'auto',
              value: 'linear-gradient(red, url(x))',
            },
          },
          tabs: [],
        },
        {
          ...richEntry,
          title: 'Colour',
          appearance: {
            content: {
              type: 'color',
              mode: 'manual',
              light: '#fafafa',
              dark: '#000',
            },
          },
          tabs: [],
        },
        {
          ...richEntry,
          title: 'Picture',
          appearance: {
            content: { type: 'image', mode: 'auto', value: 'media://bg-1.png' },
          },
          tabs: [],
        },
      ]);
      const result = await service.generateSite(
        buildPlan([
          {
            id: 'wb',
            type: PublishPlanItemType.Worldbuilding,
            categories: [],
            format: 'appendix',
            title: 'Cast',
          },
        ])
      );
      const { names, read } = await unzip(result.file!);
      const page = await read('cast.html');

      expect(page).not.toContain('url(x)');
      expect(page).toContain('id="evil">');
      expect(page).not.toContain('id="evil" style=');
      expect(page).toContain('style="--ink-wb-bg: #fafafa;"');
      expect(names).toContain('assets/media/bg-1.png');
      expect(page).toContain(
        'ink-wb-has-bg-image" id="picture" style="--ink-wb-bg: url(&quot;assets/media/bg-1.png&quot;);"'
      );
    });
  });
});
