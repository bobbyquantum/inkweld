/**
 * Worldbuilding-rendering coverage spec for the four publish generators.
 *
 * The existing per-generator spec files focus on text/document chapters and
 * frontmatter. They do NOT exercise:
 *   - PublishPlanItemType.Worldbuilding items                           (all four)
 *   - PublishPlanItemType.Element pointing at a WORLDBUILDING element   (all four)
 *   - Folder elements containing WORLDBUILDING children                 (all four)
 *   - The mark-rendering branches in HtmlGeneratorService.applyMarks    (HTML)
 *   - The chapter-numbering branches (Numeric / Roman / Written)        (PDF)
 *
 * Those code paths are why CodeRabbit / Sonar flag ~180 uncovered new lines
 * across these services. This spec adds compact integration tests for each
 * branch via a stubbed WorldbuildingPublishRendererService so we don't have
 * to wire up a real worldbuilding domain.
 */

import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type Element, ElementType, type Project } from '@inkweld/index';
import { createDefaultPublishStyles } from '@models/publish-style';
// Import $typst from BOTH the bare module and the /contrib/snippet sub-path so
// we can defensively re-patch the same surfaces pdf-generator.service.spec.ts
// patches. Under `isolate: false` the shared module cache occasionally hands
// us a non-mocked $typst.pdf, which causes a hard "Typst compilation failed
// to produce PDF data" error in PdfGeneratorService.
import { $typst } from '@myriaddreamin/typst.ts';
import { $typst as $typstSnippet } from '@myriaddreamin/typst.ts/contrib/snippet';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ChapterNumbering,
  PublishFormat,
  type PublishPlan,
  PublishPlanItemType,
} from '../../models/publish-plan';
import { LoggerService } from '../core/logger.service';
import { LocalStorageService } from '../local/local-storage.service';
import { DocumentService } from '../project/document.service';
import { ProjectStateService } from '../project/project-state.service';
import { EpubGeneratorService } from './epub-generator.service';
import { HtmlGeneratorService } from './html-generator.service';
import { MarkdownGeneratorService } from './markdown-generator.service';
import { PdfGeneratorService } from './pdf-generator.service';
import {
  type RenderedWorldbuildingEntry,
  WorldbuildingPublishRendererService,
} from './worldbuilding-publish-renderer.service';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const PROJECT: Project = {
  id: 'proj-1',
  username: 'tester',
  slug: 'wb-cov',
  title: 'WB Coverage Project',
  description: '',
  createdDate: '2024-01-01',
  updatedDate: '2024-01-01',
};

// One folder containing one Item + one WORLDBUILDING child.
// Plus a top-level standalone WORLDBUILDING element used for the inline
// "Add everything" branch.
const ELEMENTS: Element[] = [
  {
    id: 'folder-1',
    name: 'Folder',
    type: ElementType.Folder,
    parentId: null,
    order: 0,
    level: 0,
    expandable: true,
    version: 1,
    metadata: {},
  },
  {
    id: 'doc-1',
    name: 'Chapter 1',
    type: ElementType.Item,
    parentId: 'folder-1',
    order: 0,
    level: 1,
    expandable: false,
    version: 1,
    metadata: {},
  },
  {
    id: 'wb-child',
    name: 'Aragorn',
    // String literal matches the API enum value the runtime uses.
    type: 'WORLDBUILDING' as ElementType,
    parentId: 'folder-1',
    order: 1,
    level: 1,
    expandable: false,
    version: 1,
    metadata: {},
  },
  {
    id: 'wb-standalone',
    name: 'Gandalf',
    type: 'WORLDBUILDING' as ElementType,
    parentId: null,
    order: 1,
    level: 0,
    expandable: false,
    version: 1,
    metadata: {},
  },
];

const SAMPLE_ENTRY: RenderedWorldbuildingEntry = {
  elementId: 'wb-x',
  title: 'Sample Entry',
  schemaId: 'character',
  schemaLabel: 'Character',
  layout: 'card',
  description: 'A brief description.',
  imageRef: 'media/portrait.jpg',
  tabs: [
    {
      key: 'identity',
      label: 'Identity',
      fields: [
        {
          key: 'name',
          label: 'Name',
          rawValue: 'Aragorn',
          displayValue: 'Aragorn',
          type: 'text',
        },
        {
          key: 'role',
          label: 'Role',
          rawValue: 'Ranger',
          displayValue: 'Ranger',
          type: 'text',
        },
      ],
    },
  ],
};

function basePlan(format: PublishFormat): PublishPlan {
  return {
    id: 'plan-1',
    name: 'WB Plan',
    format,
    metadata: {
      title: 'WB Book',
      author: 'Tester',
      language: 'en',
    },
    options: {
      includeToc: false,
      includeCover: false,
      chapterNumbering: ChapterNumbering.None,
      sceneBreakText: '* * *',
      includeWordCounts: false,
    },
    styles: createDefaultPublishStyles(),
    items: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
}

// ---------------------------------------------------------------------------
// Shared TestBed setup
// ---------------------------------------------------------------------------

function makeMocks() {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const documentService = {
    getDocumentContent: vi.fn().mockResolvedValue([
      {
        nodeName: 'paragraph',
        children: ['Doc body.'],
      },
    ]),
  };
  const projectState = {
    project: signal<Project | null>(PROJECT),
    elements: signal<Element[]>(ELEMENTS),
    coverMediaId: signal<string | undefined>(undefined),
  };
  const localStorage = { getMedia: vi.fn().mockResolvedValue(null) };
  const wbRenderer = {
    renderItem: vi.fn().mockResolvedValue([SAMPLE_ENTRY]),
  };
  return { logger, documentService, projectState, localStorage, wbRenderer };
}

function configure(extra: unknown[] = []) {
  const mocks = makeMocks();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: LoggerService, useValue: mocks.logger },
      { provide: DocumentService, useValue: mocks.documentService },
      { provide: ProjectStateService, useValue: mocks.projectState },
      { provide: LocalStorageService, useValue: mocks.localStorage },
      {
        provide: WorldbuildingPublishRendererService,
        useValue: mocks.wbRenderer,
      },
      ...extra,
    ],
  });
  return mocks;
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

describe('MarkdownGeneratorService – worldbuilding paths', () => {
  let mocks: ReturnType<typeof makeMocks>;
  let service: MarkdownGeneratorService;

  beforeEach(() => {
    mocks = configure([MarkdownGeneratorService]);
    service = TestBed.inject(MarkdownGeneratorService);
  });

  it('renders a Worldbuilding plan item', async () => {
    const plan = basePlan(PublishFormat.MARKDOWN);
    plan.items = [
      {
        id: 'wb-1',
        type: PublishPlanItemType.Worldbuilding,
        categories: [],
        format: 'appendix',
        title: 'Cast',
      },
    ];
    const result = await service.generateMarkdown(plan);
    expect(result.success).toBe(true);
    const text = await result.file!.text();
    expect(text).toContain('## Cast');
    expect(text).toContain('### Sample Entry');
    expect(text).toContain('- **Name:** Aragorn');
    expect(mocks.wbRenderer.renderItem).toHaveBeenCalled();
  });

  it('renders an Element item pointing at a WORLDBUILDING element (inline)', async () => {
    const plan = basePlan(PublishFormat.MARKDOWN);
    plan.items = [
      {
        id: 'el-wb',
        type: PublishPlanItemType.Element,
        elementId: 'wb-standalone',
        includeChildren: false,
        isChapter: false,
      },
    ];
    const result = await service.generateMarkdown(plan);
    expect(result.success).toBe(true);
    const text = await result.file!.text();
    // Inline WB rendering uses singleEntryWbItem (no section heading).
    expect(text).toContain('### Sample Entry');
  });

  it('renders folder children including WORLDBUILDING child', async () => {
    const plan = basePlan(PublishFormat.MARKDOWN);
    plan.items = [
      {
        id: 'el-folder',
        type: PublishPlanItemType.Element,
        elementId: 'folder-1',
        includeChildren: true,
        isChapter: false,
      },
    ];
    const result = await service.generateMarkdown(plan);
    expect(result.success).toBe(true);
    const text = await result.file!.text();
    expect(text).toContain('### Sample Entry');
  });
});

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

describe('HtmlGeneratorService – worldbuilding + marks', () => {
  let mocks: ReturnType<typeof makeMocks>;
  let service: HtmlGeneratorService;

  beforeEach(() => {
    mocks = configure([HtmlGeneratorService]);
    service = TestBed.inject(HtmlGeneratorService);
  });

  it('renders a Worldbuilding plan item with section title', async () => {
    const plan = basePlan(PublishFormat.HTML);
    plan.items = [
      {
        id: 'wb-1',
        type: PublishPlanItemType.Worldbuilding,
        categories: [],
        format: 'appendix',
        title: 'Cast',
      },
    ];
    const result = await service.generateHtml(plan);
    expect(result.success).toBe(true);
    const html = await result.file!.text();
    expect(html).toContain('ink-wb-section');
    expect(html).toContain('ink-wb-section-title');
    expect(html).toContain('ink-wb-entry');
    expect(html).toContain('ink-wb-layout-card');
    expect(html).toContain('ink-wb-schema-character');
    expect(html).toContain('ink-wb-entry-image');
    expect(html).toContain('Sample Entry');
  });

  it('renders an inline WORLDBUILDING element via Element item', async () => {
    const plan = basePlan(PublishFormat.HTML);
    plan.items = [
      {
        id: 'el-wb',
        type: PublishPlanItemType.Element,
        elementId: 'wb-standalone',
        includeChildren: false,
        isChapter: false,
      },
    ];
    const result = await service.generateHtml(plan);
    const html = await result.file!.text();
    expect(html).toContain('ink-wb-section');
    expect(html).toContain('ink-wb-entry');
  });

  it('renders folder children including WORLDBUILDING child', async () => {
    const plan = basePlan(PublishFormat.HTML);
    plan.items = [
      {
        id: 'el-folder',
        type: PublishPlanItemType.Element,
        elementId: 'folder-1',
        includeChildren: true,
        isChapter: false,
      },
    ];
    const result = await service.generateHtml(plan);
    const html = await result.file!.text();
    expect(html).toContain('ink-wb-entry');
  });

  it('applies all supported marks (bold/italic/underline/strike/code/sub/sup/link)', async () => {
    mocks.documentService.getDocumentContent.mockResolvedValue([
      {
        nodeName: 'paragraph',
        children: [
          { type: 'text', text: 'B', marks: [{ type: 'bold' }] },
          { type: 'text', text: 'I', marks: [{ type: 'italic' }] },
          { type: 'text', text: 'U', marks: [{ type: 'underline' }] },
          { type: 'text', text: 'S', marks: [{ type: 'strike' }] },
          { type: 'text', text: 'C', marks: [{ type: 'code' }] },
          { type: 'text', text: 'sub', marks: [{ type: 'subscript' }] },
          { type: 'text', text: 'sup', marks: [{ type: 'superscript' }] },
          {
            type: 'text',
            text: 'ext',
            marks: [{ type: 'link', attrs: { href: 'https://example.com/' } }],
          },
          {
            type: 'text',
            text: 'int',
            marks: [{ type: 'link', attrs: { href: '#anchor' } }],
          },
          {
            type: 'text',
            // Empty href -> link wrapper dropped, text retained.
            text: 'noLink',
            marks: [{ type: 'link', attrs: { href: '' } }],
          },
          {
            // 'comment' marks are intentionally stripped from publish output.
            type: 'text',
            text: 'visible',
            marks: [{ type: 'comment' }, { type: 'bold' }],
          },
        ],
      },
    ]);
    const plan = basePlan(PublishFormat.HTML);
    plan.items = [
      {
        id: 'el-doc',
        type: PublishPlanItemType.Element,
        elementId: 'doc-1',
        includeChildren: false,
        isChapter: false,
      },
    ];
    const result = await service.generateHtml(plan);
    const html = await result.file!.text();
    expect(html).toContain('ink-mark-bold');
    expect(html).toContain('ink-mark-italic');
    expect(html).toContain('ink-mark-underline');
    expect(html).toContain('ink-mark-strike');
    expect(html).toContain('ink-mark-code');
    expect(html).toContain('ink-mark-subscript');
    expect(html).toContain('ink-mark-superscript');
    // External link gets target=_blank + noopener.
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('href="https://example.com/"');
    // Internal anchor link does NOT get target=_blank.
    expect(html).toContain('href="#anchor"');
    // Empty-href text retained, no <a> wrapper.
    expect(html).toContain('noLink');
    // 'comment' mark suppressed -> "visible" still rendered (with bold).
    expect(html).toContain('visible');
  });
});

// ---------------------------------------------------------------------------
// EPUB
// ---------------------------------------------------------------------------

describe('EpubGeneratorService – worldbuilding paths', () => {
  let service: EpubGeneratorService;

  beforeEach(() => {
    configure([EpubGeneratorService]);
    service = TestBed.inject(EpubGeneratorService);
  });

  it('renders a Worldbuilding plan item as a chapter', async () => {
    const plan = basePlan(PublishFormat.EPUB);
    plan.items = [
      {
        id: 'wb-1',
        type: PublishPlanItemType.Worldbuilding,
        categories: [],
        format: 'appendix',
        title: 'Cast',
      },
    ];
    const result = await service.generateEpub(plan);
    expect(result.success).toBe(true);
    expect(result.file).toBeTruthy();
    // Chapter file name: worldbuilding_<3-digit-order>.xhtml
    expect(result.stats!.chapterCount).toBeGreaterThan(0);
  });

  it('renders an inline WORLDBUILDING element via Element item', async () => {
    const plan = basePlan(PublishFormat.EPUB);
    plan.items = [
      {
        id: 'el-wb',
        type: PublishPlanItemType.Element,
        elementId: 'wb-standalone',
        includeChildren: false,
        isChapter: false,
      },
    ];
    const result = await service.generateEpub(plan);
    expect(result.success).toBe(true);
  });

  it('renders folder children including WORLDBUILDING child', async () => {
    const plan = basePlan(PublishFormat.EPUB);
    plan.items = [
      {
        id: 'el-folder',
        type: PublishPlanItemType.Element,
        elementId: 'folder-1',
        includeChildren: true,
        isChapter: false,
      },
    ];
    const result = await service.generateEpub(plan);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

describe('PdfGeneratorService – worldbuilding + chapter numbering', () => {
  let service: PdfGeneratorService;

  beforeEach(() => {
    // Re-patch $typst on both module surfaces — see import-block comment.
    const setupCompiler = vi.fn().mockReturnValue(undefined);
    const setupRenderer = vi.fn().mockReturnValue(undefined);
    const pdfFn = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
    const mapShadowFn = vi.fn().mockResolvedValue(undefined);
    const svgFn = vi.fn().mockResolvedValue('<svg></svg>');
    const useFn = vi.fn().mockReturnValue(undefined);
    for (const target of [$typst, $typstSnippet] as any[]) {
      target.setCompilerInitOptions = setupCompiler;
      target.setRendererInitOptions = setupRenderer;
      target.pdf = pdfFn;
      target.mapShadow = mapShadowFn;
      target.svg = svgFn;
      target.use = useFn;
    }
    // Stub fetch so any data/asset fetches in the service succeed.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      })
    );
    configure([PdfGeneratorService]);
    service = TestBed.inject(PdfGeneratorService);
  });

  it('renders a Worldbuilding plan item', async () => {
    const plan = basePlan(PublishFormat.PDF_SIMPLE);
    plan.items = [
      {
        id: 'wb-1',
        type: PublishPlanItemType.Worldbuilding,
        categories: [],
        format: 'appendix',
        title: 'Cast',
      },
    ];
    const result = await service.generatePdf(plan);
    expect(result.success).toBe(true);
  });

  it('renders an inline WORLDBUILDING element via Element item', async () => {
    const plan = basePlan(PublishFormat.PDF_SIMPLE);
    plan.items = [
      {
        id: 'el-wb',
        type: PublishPlanItemType.Element,
        elementId: 'wb-standalone',
        includeChildren: false,
        isChapter: false,
      },
    ];
    const result = await service.generatePdf(plan);
    expect(result.success).toBe(true);
  });

  it('renders folder children including WORLDBUILDING child', async () => {
    const plan = basePlan(PublishFormat.PDF_SIMPLE);
    plan.items = [
      {
        id: 'el-folder',
        type: PublishPlanItemType.Element,
        elementId: 'folder-1',
        includeChildren: true,
        isChapter: false,
      },
    ];
    const result = await service.generatePdf(plan);
    expect(result.success).toBe(true);
  });

  it('renders TableOfContents item (Typst outline)', async () => {
    const plan = basePlan(PublishFormat.PDF_SIMPLE);
    plan.items = [
      {
        id: 'toc-1',
        type: PublishPlanItemType.TableOfContents,
        title: 'Contents',
        depth: 2,
        includePageNumbers: true,
      },
    ];
    const result = await service.generatePdf(plan);
    expect(result.success).toBe(true);
  });

  for (const numbering of [
    ChapterNumbering.Numeric,
    ChapterNumbering.Roman,
    ChapterNumbering.Written,
  ]) {
    it(`emits chapter pagebreak for chapterNumbering=${numbering}`, async () => {
      const plan = basePlan(PublishFormat.PDF_SIMPLE);
      plan.options.chapterNumbering = numbering;
      plan.items = [
        {
          id: 'el-doc',
          type: PublishPlanItemType.Element,
          elementId: 'doc-1',
          includeChildren: false,
          isChapter: true,
        },
      ];
      const result = await service.generatePdf(plan);
      expect(result.success).toBe(true);
    });
  }
});
