import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type Element, ElementType, type Project } from '@inkweld/index';
import { createDefaultPublishStyles } from '@models/publish-style';
import { CoverSourceService } from '@services/project/cover-source.service';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCoverSourceMock } from '../../../testing/cover-source.mock';
import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import {
  BackmatterType,
  ChapterNumbering,
  FrontmatterType,
  PublishFormat,
  type PublishPlan,
  PublishPlanItemType,
  SeparatorStyle,
} from '../../models/publish-plan';
import { LoggerService } from '../core/logger.service';
import { LocalStorageService } from '../local/local-storage.service';
import { DocumentService } from '../project/document.service';
import { ProjectStateService } from '../project/project-state.service';
import {
  EpubGeneratorService,
  EpubPhase,
  type EpubProgress,
  type EpubResult,
} from './epub-generator.service';

// Uses real JSZip (same as project-export and project-import specs).
// Avoids vi.mock('@progress/jszip-esm') which intermittently fails with
// "Cannot read properties of undefined (reading 'trim')" in Angular's
// vitest-mock-patch when isolate: false shares module cache across files.

describe('EpubGeneratorService', () => {
  let service: EpubGeneratorService;
  let loggerMock: {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  let documentServiceMock: {
    getDocumentContent: ReturnType<
      typeof vi.fn<(documentId: string) => Promise<unknown>>
    >;
  };
  let projectStateMock: {
    project: ReturnType<typeof signal<Project | null>>;
    elements: ReturnType<typeof signal<Element[]>>;
    coverMediaId: ReturnType<typeof signal<string | undefined>>;
  };
  let localStorageMock: {
    getMedia: ReturnType<
      typeof vi.fn<
        (projectKey: string, mediaId: string) => Promise<Blob | null>
      >
    >;
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

  const mockElements: Element[] = [
    {
      id: 'doc-1',
      name: 'Chapter 1',
      type: ElementType.Item,
    } as Element,
    {
      id: 'doc-2',
      name: 'Chapter 2',
      type: ElementType.Item,
    } as Element,
  ];

  const mockPlan: PublishPlan = {
    id: 'plan-1',
    name: 'Test Plan',
    format: PublishFormat.EPUB,
    metadata: {
      title: 'Test Book',
      author: 'Test Author',
      language: 'en',
    },
    options: {
      includeToc: true,
      includeCover: false,
      chapterNumbering: ChapterNumbering.None,
      sceneBreakText: '* * *',
      includeWordCounts: false,
    },
    styles: createDefaultPublishStyles(),
    items: [
      {
        id: 'item-1',
        type: PublishPlanItemType.Element,
        elementId: 'doc-1',
        includeChildren: false,
        isChapter: true,
      },
    ],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    loggerMock = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    documentServiceMock = {
      getDocumentContent: vi.fn().mockResolvedValue([
        {
          nodeName: 'paragraph',
          children: ['Sample document text content.'],
        },
      ]),
    };

    projectStateMock = {
      project: signal(mockProject),
      elements: signal(mockElements),
      coverMediaId: signal<string | undefined>(undefined),
    };

    localStorageMock = {
      getMedia: vi.fn().mockResolvedValue(null),
    };

    // Mock IndexedDB
    const mockIndexedDB = {
      open: vi.fn().mockImplementation(() => {
        const request = {
          onsuccess: null as ((event: Event) => void) | null,
          onerror: null as ((event: Event) => void) | null,
          result: {
            objectStoreNames: { length: 0, contains: () => false },
            close: vi.fn(),
            transaction: vi.fn().mockReturnValue({
              objectStore: vi.fn().mockReturnValue({
                get: vi.fn().mockImplementation(() => {
                  const getRequest = {
                    onsuccess: null as ((event: Event) => void) | null,
                    onerror: null as ((event: Event) => void) | null,
                    result: null,
                  };
                  setTimeout(() => {
                    if (getRequest.onsuccess) {
                      getRequest.onsuccess({
                        target: { result: null },
                      } as unknown as Event);
                    }
                  }, 0);
                  return getRequest;
                }),
              }),
            }),
          },
        };
        setTimeout(() => {
          if (request.onsuccess) {
            request.onsuccess({} as Event);
          }
        }, 0);
        return request;
      }),
    };
    vi.stubGlobal('indexedDB', mockIndexedDB);

    TestBed.configureTestingModule({
      imports: [translocoTestProvider()],
      providers: [
        provideZonelessChangeDetection(),
        EpubGeneratorService,
        { provide: LoggerService, useValue: loggerMock },
        { provide: DocumentService, useValue: documentServiceMock },
        { provide: ProjectStateService, useValue: projectStateMock },
        { provide: CoverSourceService, useValue: createCoverSourceMock() },
        { provide: LocalStorageService, useValue: localStorageMock },
      ],
    });

    service = TestBed.inject(EpubGeneratorService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('progress$', () => {
    it('should emit initial idle state', () => {
      let progress: EpubProgress | undefined;
      service.progress$.subscribe(p => {
        progress = p;
      });

      expect(progress).toBeDefined();
      expect(progress!.phase).toBe(EpubPhase.Idle);
      expect(progress!.message).toBe('Ready');
    });
  });

  describe('cancel', () => {
    it('should update progress to idle with cancelled message', () => {
      service.cancel();

      let progress: EpubProgress | undefined;
      service.progress$.subscribe(p => {
        progress = p;
      });

      expect(progress!.phase).toBe(EpubPhase.Idle);
      expect(progress!.message).toBe('Generation cancelled');
    });
  });

  describe('generateEpub', () => {
    it('should generate EPUB successfully', async () => {
      const result = await service.generateEpub(mockPlan);

      expect(result.success).toBe(true);
      expect(result.file).toBeDefined();
      expect(result.filename).toBeDefined();
      expect(result.filename).toContain('.epub');
    });

    it('should update progress through phases', async () => {
      const phases: EpubPhase[] = [];
      service.progress$.subscribe(p => {
        if (!phases.includes(p.phase)) {
          phases.push(p.phase);
        }
      });

      await service.generateEpub(mockPlan);

      expect(phases).toContain(EpubPhase.Initializing);
      expect(phases).toContain(EpubPhase.ProcessingContent);
      expect(phases).toContain(EpubPhase.PackagingEpub);
      expect(phases).toContain(EpubPhase.Complete);
    });

    it('should include stats in successful result', async () => {
      const result = await service.generateEpub(mockPlan);

      expect(result.success).toBe(true);
      expect(result.stats).toBeDefined();
      expect(result.stats!.fileSize).toBeGreaterThan(0);
      expect(result.stats!.generationTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should emit complete event', async () => {
      let completedResult: EpubResult | undefined;
      service.complete$.subscribe(r => {
        completedResult = r;
      });

      await service.generateEpub(mockPlan);

      expect(completedResult).toBeDefined();
      expect(completedResult!.success).toBe(true);
    });

    it('should handle cancellation during generation', async () => {
      const generatePromise = service.generateEpub(mockPlan);
      service.cancel();

      const result = await generatePromise;

      // May or may not be cancelled depending on timing
      expect(result).toBeDefined();
    });

    it('should load cover image when includeCover is true', async () => {
      const planWithCover = {
        ...mockPlan,
        options: { ...mockPlan.options, includeCover: true },
        styles: createDefaultPublishStyles(),
      };

      await service.generateEpub(planWithCover);

      expect(localStorageMock.getMedia).toHaveBeenCalledWith(
        'testuser/test-project',
        'cover'
      );
    });

    it('should not load cover when includeCover is false', async () => {
      await service.generateEpub(mockPlan);

      expect(localStorageMock.getMedia).not.toHaveBeenCalled();
    });

    it('should handle empty plan items', async () => {
      const emptyPlan = { ...mockPlan, items: [] };

      const result = await service.generateEpub(emptyPlan);

      expect(result.success).toBe(true);
      expect(result.stats!.documentCount).toBe(0);
    });

    it('should generate filename from title', async () => {
      const result = await service.generateEpub(mockPlan);

      expect(result.filename).toContain('test-book');
    });

    it('should handle errors gracefully', async () => {
      projectStateMock.elements = (() => {
        throw new Error('Test error');
      }) as unknown as ReturnType<typeof signal<Element[]>>;

      const result = await service.generateEpub(mockPlan);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Test error');
      expect(loggerMock.error).toHaveBeenCalled();
    });

    it('should set error phase on failure', async () => {
      projectStateMock.elements = (() => {
        throw new Error('Test error');
      }) as unknown as ReturnType<typeof signal<Element[]>>;

      await service.generateEpub(mockPlan);

      let progress: EpubProgress | undefined;
      service.progress$.subscribe(p => {
        progress = p;
      });

      expect(progress!.phase).toBe(EpubPhase.Error);
    });
  });

  describe('complete$', () => {
    it('should emit result when generation completes', async () => {
      const results: EpubResult[] = [];
      service.complete$.subscribe(r => results.push(r));

      await service.generateEpub(mockPlan);

      expect(results.length).toBeGreaterThan(0);
      expect(results.at(-1)?.success).toBe(true);
    });

    it('should emit result on error', async () => {
      projectStateMock.elements = (() => {
        throw new Error('Test error');
      }) as unknown as ReturnType<typeof signal<Element[]>>;

      const results: EpubResult[] = [];
      service.complete$.subscribe(r => results.push(r));

      await service.generateEpub(mockPlan);

      expect(results.length).toBeGreaterThan(0);
      expect(results.at(-1)?.success).toBe(false);
    });
  });

  describe('cover image handling', () => {
    it('should handle cover image loading error gracefully', async () => {
      localStorageMock.getMedia.mockRejectedValue(new Error('Storage error'));

      const planWithCover = {
        ...mockPlan,
        options: { ...mockPlan.options, includeCover: true },
        styles: createDefaultPublishStyles(),
      };

      const result = await service.generateEpub(planWithCover);

      expect(result.success).toBe(true);
      expect(loggerMock.warn).toHaveBeenCalled();
    });

    it('should skip cover loading when no project', async () => {
      projectStateMock.project = signal(null);

      const planWithCover = {
        ...mockPlan,
        options: { ...mockPlan.options, includeCover: true },
        styles: createDefaultPublishStyles(),
      };

      const result = await service.generateEpub(planWithCover);

      expect(result.success).toBe(true);
      expect(localStorageMock.getMedia).not.toHaveBeenCalled();
    });
  });

  describe('frontmatter items', () => {
    it('should process title page frontmatter', async () => {
      const planWithFrontmatter: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'fm-1',
            type: PublishPlanItemType.Frontmatter,
            contentType: FrontmatterType.TitlePage,
          },
          ...mockPlan.items,
        ],
      };

      const result = await service.generateEpub(planWithFrontmatter);

      expect(result.success).toBe(true);
    });

    it('should process copyright frontmatter', async () => {
      const planWithFrontmatter: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'fm-1',
            type: PublishPlanItemType.Frontmatter,
            contentType: FrontmatterType.Copyright,
          },
          ...mockPlan.items,
        ],
      };

      const result = await service.generateEpub(planWithFrontmatter);

      expect(result.success).toBe(true);
    });

    it('should process dedication frontmatter', async () => {
      const planWithFrontmatter: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'fm-1',
            type: PublishPlanItemType.Frontmatter,
            contentType: FrontmatterType.Dedication,
            customContent: 'To my readers',
          },
          ...mockPlan.items,
        ],
      };

      const result = await service.generateEpub(planWithFrontmatter);

      expect(result.success).toBe(true);
    });
  });

  describe('separator items', () => {
    it('should process separator items', async () => {
      const planWithSeparator: PublishPlan = {
        ...mockPlan,
        items: [
          ...mockPlan.items,
          {
            id: 'sep-1',
            type: PublishPlanItemType.Separator,
            style: SeparatorStyle.SceneBreak,
          },
        ],
      };

      const result = await service.generateEpub(planWithSeparator);

      expect(result.success).toBe(true);
    });
  });

  describe('chapter numbering', () => {
    it('should handle numeric chapter numbering', async () => {
      const planWithNumbering = {
        ...mockPlan,
        options: {
          ...mockPlan.options,
          chapterNumbering: ChapterNumbering.Numeric,
        },
        styles: createDefaultPublishStyles(),
      };

      const result = await service.generateEpub(planWithNumbering);

      expect(result.success).toBe(true);
    });

    it('should handle Roman numeral chapter numbering', async () => {
      const planWithNumbering = {
        ...mockPlan,
        options: {
          ...mockPlan.options,
          chapterNumbering: ChapterNumbering.Roman,
        },
        styles: createDefaultPublishStyles(),
      };

      const result = await service.generateEpub(planWithNumbering);

      expect(result.success).toBe(true);
    });

    it('should handle written chapter numbering', async () => {
      const planWithNumbering = {
        ...mockPlan,
        options: {
          ...mockPlan.options,
          chapterNumbering: ChapterNumbering.Written,
        },
        styles: createDefaultPublishStyles(),
      };

      const result = await service.generateEpub(planWithNumbering);

      expect(result.success).toBe(true);
    });
  });

  describe('table of contents', () => {
    it('should include TOC when enabled', async () => {
      const planWithToc = {
        ...mockPlan,
        options: { ...mockPlan.options, includeToc: true },
        styles: createDefaultPublishStyles(),
      };

      const result = await service.generateEpub(planWithToc);

      expect(result.success).toBe(true);
    });

    it('should exclude TOC when disabled', async () => {
      const planWithoutToc = {
        ...mockPlan,
        options: { ...mockPlan.options, includeToc: false },
        styles: createDefaultPublishStyles(),
      };

      const result = await service.generateEpub(planWithoutToc);

      expect(result.success).toBe(true);
    });
  });

  describe('multiple chapters', () => {
    it('should handle plan with multiple element items', async () => {
      // Note: With mocked IndexedDB returning empty content, chapters won't be
      // populated. This test verifies the service handles multi-item plans gracefully.
      const multiChapterPlan: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'item-1',
            type: PublishPlanItemType.Element,
            elementId: 'doc-1',
            includeChildren: false,
            isChapter: true,
          },
          {
            id: 'item-2',
            type: PublishPlanItemType.Element,
            elementId: 'doc-2',
            includeChildren: false,
            isChapter: true,
          },
        ],
      };

      const result = await service.generateEpub(multiChapterPlan);

      // Service completes successfully even when document content is unavailable
      expect(result.success).toBe(true);
      expect(result.stats).toBeDefined();
      expect(result.stats!.chapterCount).toBeGreaterThanOrEqual(0);
      expect(result.stats!.documentCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('metadata', () => {
    it('should include author in metadata', async () => {
      const result = await service.generateEpub(mockPlan);

      expect(result.success).toBe(true);
      // EPUB contains OPF file with metadata
    });

    it('should include language in metadata', async () => {
      const planWithLanguage = {
        ...mockPlan,
        metadata: { ...mockPlan.metadata, language: 'fr' },
      };

      const result = await service.generateEpub(planWithLanguage);

      expect(result.success).toBe(true);
    });
  });

  describe('ProseMirror conversion', () => {
    it('should convert heading nodes', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ text: 'My Heading' }],
        },
      ]);

      const result = await service.generateEpub(mockPlan);

      expect(result.success).toBe(true);
    });

    it('should convert tables, including header cells and column alignment', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'table',
          content: [
            {
              type: 'table_row',
              content: [
                {
                  type: 'table_header',
                  attrs: { colspan: 1 },
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: 'Name' }],
                    },
                  ],
                },
                {
                  type: 'table_header',
                  attrs: { colspan: 1, align: 'right' },
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: 'Age' }],
                    },
                  ],
                },
              ],
            },
            {
              type: 'table_row',
              content: [
                {
                  type: 'table_cell',
                  attrs: { colspan: 1 },
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: 'Alice' }],
                    },
                  ],
                },
                {
                  type: 'table_cell',
                  attrs: { colspan: 1, align: 'center' },
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: '30' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ]);

      const result = await service.generateEpub(mockPlan);
      expect(result.success).toBe(true);

      // Find the chapter document by content rather than by index — an EPUB
      // also contains nav/cover XHTML whose order is not guaranteed.
      const zip = await new JSZip().loadAsync(result.file!);
      const candidates = zip.file(/\.xhtml$/);
      const bodies = await Promise.all(candidates.map(f => f.async('string')));
      const xhtml = bodies.find(b => b.includes('<table'));
      expect(xhtml).toBeDefined();

      expect(xhtml).toContain('<table class="ink-doc-table">');
      expect(xhtml).toContain('<tr class="ink-doc-table-row">');
      expect(xhtml).toContain('<th class="ink-doc-table-header"');
      expect(xhtml).toContain(
        'class="ink-doc-table-header ink-doc-align-right"'
      );
      expect(xhtml).toContain(
        'class="ink-doc-table-cell ink-doc-align-center"'
      );
      expect(xhtml).toContain('Name');
      expect(xhtml).toContain('Alice');
    });

    it('should include table styling in the EPUB stylesheet', async () => {
      const result = await service.generateEpub(mockPlan);
      expect(result.success).toBe(true);

      const zip = await new JSZip().loadAsync(result.file!);
      const css = zip.file(/\.css$/)[0];
      expect(css).toBeTruthy();
      const styles = await css.async('string');

      expect(styles).toContain('.ink-doc-table');
      expect(styles).toContain('.ink-doc-align-center');
    });

    it('should convert blockquote nodes', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'blockquote',
          content: [{ type: 'paragraph', content: [{ text: 'A quote' }] }],
        },
      ]);

      const result = await service.generateEpub(mockPlan);

      expect(result.success).toBe(true);
    });

    it('should convert bullet_list nodes', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'bullet_list',
          content: [{ type: 'list_item', content: [{ text: 'Item' }] }],
        },
      ]);

      const result = await service.generateEpub(mockPlan);

      expect(result.success).toBe(true);
    });

    it('should convert ordered_list nodes', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'ordered_list',
          content: [{ type: 'list_item', content: [{ text: 'First' }] }],
        },
      ]);

      const result = await service.generateEpub(mockPlan);

      expect(result.success).toBe(true);
    });

    it('should convert code_block nodes', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        { type: 'code_block', content: [{ text: 'const x = 1;' }] },
      ]);

      const result = await service.generateEpub(mockPlan);

      expect(result.success).toBe(true);
    });

    it('should convert hard_break nodes', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        { type: 'hard_break' },
      ]);

      const result = await service.generateEpub(mockPlan);

      expect(result.success).toBe(true);
    });

    it('should convert horizontal_rule nodes', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        { type: 'horizontal_rule' },
      ]);

      const result = await service.generateEpub(mockPlan);

      expect(result.success).toBe(true);
    });

    it('should handle nodeName property (alternative to type)', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        { nodeName: 'paragraph', children: [{ text: 'Text using nodeName' }] },
      ]);

      const result = await service.generateEpub(mockPlan);

      expect(result.success).toBe(true);
    });

    it('should handle object as top-level data', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ text: 'Single object' }] }],
      });

      const result = await service.generateEpub(mockPlan);

      expect(result.success).toBe(true);
    });

    it('should handle array of string nodes', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        'Plain text node',
      ]);

      const result = await service.generateEpub(mockPlan);

      expect(result.success).toBe(true);
    });

    it.each<{ label: string; text: string; mark: string }>([
      { label: 'bold', text: 'Bold text', mark: 'bold' },
      { label: 'italic', text: 'Italic text', mark: 'italic' },
      { label: 'code', text: 'inline code', mark: 'code' },
      { label: 'strikethrough', text: 'deleted text', mark: 'strike' },
    ])('should handle $label marks', async ({ text, mark }) => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'paragraph',
          content: [{ text, marks: [{ type: mark }] }],
        },
      ]);

      const result = await service.generateEpub(mockPlan);

      expect(result.success).toBe(true);
    });

    it('should handle nested array nodes', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        [{ type: 'paragraph', content: [{ text: 'Nested' }] }],
      ]);

      const result = await service.generateEpub(mockPlan);

      expect(result.success).toBe(true);
    });
  });

  describe('document content handling', () => {
    it('should handle null document content', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue(null);

      const result = await service.generateEpub(mockPlan);

      expect(result.success).toBe(true);
    });

    it('should handle document content retrieval failure', async () => {
      documentServiceMock.getDocumentContent.mockRejectedValue(
        new Error('Content error')
      );

      const result = await service.generateEpub(mockPlan);

      expect(result.success).toBe(true);
    });

    it('should handle element that is not found', async () => {
      const planWithMissingElement: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'item-1',
            type: PublishPlanItemType.Element,
            elementId: 'non-existent-id',
            includeChildren: false,
            isChapter: true,
          },
        ],
      };

      const result = await service.generateEpub(planWithMissingElement);

      expect(result.success).toBe(true);
    });

    it('should handle title override for elements', async () => {
      const planWithTitleOverride: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'item-1',
            type: PublishPlanItemType.Element,
            elementId: 'doc-1',
            includeChildren: false,
            isChapter: true,
            titleOverride: 'Custom Chapter Title',
          },
        ],
      };

      const result = await service.generateEpub(planWithTitleOverride);

      expect(result.success).toBe(true);
    });
  });

  describe('folder with children', () => {
    it('should process folder with includeChildren', async () => {
      const folderElement: Element = {
        id: 'folder-1',
        name: 'Part One',
        type: ElementType.Folder,
        parentId: null,
        order: 0,
        level: 0,
        expandable: true,
        version: 1,
        metadata: {},
      };

      const childElement: Element = {
        id: 'child-1',
        name: 'Chapter in folder',
        type: ElementType.Item,
        parentId: 'folder-1',
        order: 0,
        level: 1,
        expandable: false,
        version: 1,
        metadata: {},
      };

      projectStateMock.elements = signal([folderElement, childElement]);

      const planWithFolder: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'item-1',
            type: PublishPlanItemType.Element,
            elementId: 'folder-1',
            includeChildren: true,
            isChapter: false,
          },
        ],
      };

      const result = await service.generateEpub(planWithFolder);

      expect(result.success).toBe(true);
    });

    it('skips notes when expanding folder children', async () => {
      const folderElement: Element = {
        id: 'folder-1',
        name: 'Part One',
        type: ElementType.Folder,
        parentId: null,
        order: 0,
        level: 0,
        expandable: true,
        version: 1,
        metadata: {},
      };
      const sceneChild: Element = {
        id: 'scene-1',
        name: 'Scene',
        type: ElementType.Item,
        parentId: 'folder-1',
        order: 0,
        level: 1,
        expandable: false,
        version: 1,
        metadata: { role: 'scene' },
      };
      const noteChild: Element = {
        id: 'note-1',
        name: 'Research',
        type: ElementType.Item,
        parentId: 'folder-1',
        order: 1,
        level: 1,
        expandable: false,
        version: 1,
        metadata: { role: 'note' },
      };
      projectStateMock.elements = signal([
        folderElement,
        sceneChild,
        noteChild,
      ]);
      documentServiceMock.getDocumentContent.mockClear();

      const result = await service.generateEpub({
        ...mockPlan,
        items: [
          {
            id: 'item-1',
            type: PublishPlanItemType.Element,
            elementId: 'folder-1',
            includeChildren: true,
            isChapter: false,
          },
        ],
      });

      expect(result.success).toBe(true);
      const fetched = documentServiceMock.getDocumentContent.mock.calls.map(
        c => c[0]
      );
      expect(fetched.some(id => id.endsWith('scene-1'))).toBe(true);
      expect(fetched.some(id => id.endsWith('note-1'))).toBe(false);
    });
  });

  describe('additional frontmatter types', () => {
    it('should process custom frontmatter', async () => {
      const planWithCustom: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'fm-1',
            type: PublishPlanItemType.Frontmatter,
            contentType: FrontmatterType.Custom,
            customTitle: 'Acknowledgements',
            customContent: 'Thank you all',
          },
          ...mockPlan.items,
        ],
      };

      const result = await service.generateEpub(planWithCustom);

      expect(result.success).toBe(true);
    });
  });

  describe('additional separator styles', () => {
    it('should process page break separator', async () => {
      const planWithPageBreak: PublishPlan = {
        ...mockPlan,
        items: [
          ...mockPlan.items,
          {
            id: 'sep-1',
            type: PublishPlanItemType.Separator,
            style: SeparatorStyle.PageBreak,
          },
        ],
      };

      const result = await service.generateEpub(planWithPageBreak);

      expect(result.success).toBe(true);
    });

    it('should process chapter break separator', async () => {
      const planWithChapterBreak: PublishPlan = {
        ...mockPlan,
        items: [
          ...mockPlan.items,
          {
            id: 'sep-1',
            type: PublishPlanItemType.Separator,
            style: SeparatorStyle.ChapterBreak,
          },
        ],
      };

      const result = await service.generateEpub(planWithChapterBreak);

      expect(result.success).toBe(true);
    });
  });

  describe('metadata fields', () => {
    it('should include subtitle when available', async () => {
      const planWithSubtitle = {
        ...mockPlan,
        metadata: {
          ...mockPlan.metadata,
          subtitle: 'A Great Adventure',
        },
      };

      const result = await service.generateEpub(planWithSubtitle);

      expect(result.success).toBe(true);
    });

    it('should include description when available', async () => {
      const planWithDescription = {
        ...mockPlan,
        metadata: {
          ...mockPlan.metadata,
          description: 'An exciting story',
        },
      };

      const result = await service.generateEpub(planWithDescription);

      expect(result.success).toBe(true);
    });

    it('should include publisher and ISBN', async () => {
      const planWithPublisher = {
        ...mockPlan,
        metadata: {
          ...mockPlan.metadata,
          publisher: 'Test Publisher',
          isbn: '978-1234567890',
        },
      };

      const result = await service.generateEpub(planWithPublisher);

      expect(result.success).toBe(true);
    });

    it('should include keywords', async () => {
      const planWithKeywords = {
        ...mockPlan,
        metadata: {
          ...mockPlan.metadata,
          keywords: ['fantasy', 'adventure'],
        },
      };

      const result = await service.generateEpub(planWithKeywords);

      expect(result.success).toBe(true);
    });
  });

  describe('cover image with blob', () => {
    it('should include cover when blob is available', async () => {
      const mockCoverBlob = new Blob(['fake image'], { type: 'image/png' });
      localStorageMock.getMedia.mockResolvedValue(mockCoverBlob);

      const planWithCover = {
        ...mockPlan,
        options: { ...mockPlan.options, includeCover: true },
        styles: createDefaultPublishStyles(),
      };

      const result = await service.generateEpub(planWithCover);

      expect(result.success).toBe(true);
    });
  });

  describe('MARK_TAGS rendering', () => {
    it('should apply bold mark tags to ProseMirror text nodes', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Bold text',
              marks: [{ type: 'bold' }],
            },
          ],
        },
      ]);

      const result = await service.generateEpub(mockPlan);

      expect(result.success).toBe(true);
    });

    it('should apply multiple mark tags to a single text node', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Bold italic text',
              marks: [{ type: 'bold' }, { type: 'italic' }],
            },
          ],
        },
      ]);

      const result = await service.generateEpub(mockPlan);

      expect(result.success).toBe(true);
    });

    it('should skip unknown mark types gracefully', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Styled text',
              marks: [{ type: 'unknown-mark' }],
            },
          ],
        },
      ]);

      const result = await service.generateEpub(mockPlan);

      expect(result.success).toBe(true);
    });
  });

  describe('elementRef rendering', () => {
    it('should render elementRef with displayText as escaped text', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'paragraph',
          content: [
            {
              type: 'elementRef',
              attrs: {
                elementId: 'ref-1',
                displayText: 'Referenced Element',
              },
            },
          ],
        },
      ]);

      const result = await service.generateEpub(mockPlan);
      expect(result.success).toBe(true);
    });

    it('should render elementRef without displayText as empty string', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'paragraph',
          content: [
            {
              type: 'elementRef',
              attrs: { elementId: 'ref-2' },
            },
          ],
        },
      ]);

      const result = await service.generateEpub(mockPlan);
      expect(result.success).toBe(true);
    });
  });

  describe('EPUB package quality', () => {
    type Zip = Awaited<ReturnType<JSZip['loadAsync']>>;

    const PNG_BYTES = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
    ]);

    async function build(plan: PublishPlan): Promise<{
      result: EpubResult;
      zip: Zip;
      read: (path: string) => Promise<string>;
    }> {
      const result = await service.generateEpub(plan);
      expect(result.success).toBe(true);
      const zip = await new JSZip().loadAsync(result.file!);
      const read = async (path: string): Promise<string> => {
        const file = zip.file(path);
        expect(file, `missing ${path}`).toBeTruthy();
        return file!.async('string');
      };
      return { result, zip, read };
    }

    function planWith(
      items: PublishPlan['items'],
      overrides: Partial<PublishPlan> = {}
    ): PublishPlan {
      return { ...mockPlan, ...overrides, items };
    }

    function chapterItem(id: string, elementId: string) {
      return {
        id,
        type: PublishPlanItemType.Element as const,
        elementId,
        includeChildren: false,
        isChapter: true,
      };
    }

    function contentByDoc(docs: Record<string, unknown>) {
      documentServiceMock.getDocumentContent.mockImplementation(
        (fullId: string) =>
          Promise.resolve(docs[fullId.split(':').pop()!] ?? null)
      );
    }

    function para(text: string) {
      return { type: 'paragraph', content: [{ type: 'text', text }] };
    }

    function manifestHrefs(opf: string): string[] {
      return [...opf.matchAll(/<item [^>]*href="([^"]+)"/g)].map(m => m[1]);
    }

    function expectWellFormed(xml: string, label: string): void {
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      const errors = doc.getElementsByTagName('parsererror');
      expect(errors.length, `${label} is not well-formed XML`).toBe(0);
    }

    it('gives every chapter its own file, in reading order', async () => {
      contentByDoc({
        'doc-1': [para('First chapter text')],
        'doc-2': [para('Second chapter text')],
      });
      const { zip, read } = await build(
        planWith([
          {
            id: 'fm-1',
            type: PublishPlanItemType.Frontmatter,
            contentType: FrontmatterType.TitlePage,
          },
          {
            id: 'fm-2',
            type: PublishPlanItemType.Frontmatter,
            contentType: FrontmatterType.Copyright,
          },
          chapterItem('i1', 'doc-1'),
          chapterItem('i2', 'doc-2'),
        ])
      );

      const opf = await read('OEBPS/content.opf');
      const hrefs = manifestHrefs(opf);
      expect(new Set(hrefs).size).toBe(hrefs.length);
      for (const href of hrefs) {
        expect(zip.file(`OEBPS/${href}`), href).toBeTruthy();
      }

      const spineIds = [...opf.matchAll(/<itemref idref="([^"]+)"/g)].map(
        m => m[1]
      );
      const hrefById = new Map(
        [...opf.matchAll(/<item id="([^"]+)" href="([^"]+)"/g)].map(m => [
          m[1],
          m[2],
        ])
      );
      const spineBodies = await Promise.all(
        spineIds.map(id => read(`OEBPS/${hrefById.get(id)}`))
      );
      const first = spineBodies.findIndex(b => b.includes('First chapter'));
      const second = spineBodies.findIndex(b => b.includes('Second chapter'));
      expect(first).toBeGreaterThan(-1);
      expect(second).toBeGreaterThan(first);
      expect(spineBodies[0]).toContain('epub:type="titlepage"');
      expect(spineBodies[1]).toContain('epub:type="copyright-page"');
    });

    it('produces well-formed XML even from hostile content', async () => {
      contentByDoc({
        'doc-1': [
          {
            type: 'paragraph',
            attrs: { align: 'center', 'bad attr"': 'x', style: 'color:red' },
            content: [
              { type: 'text', text: 'Bell\u0007 & <tag> "quotes"' },
              {
                type: 'text',
                text: 'link',
                marks: [
                  { type: 'link', attrs: { href: 'javascript:alert(1)' } },
                ],
              },
            ],
          },
          { type: 'script>', content: [para('inside unknown')] },
          { type: 'heading', attrs: { level: 2, indent: 3 }, content: [] },
          {
            type: 'table',
            content: [
              {
                type: 'table_row',
                content: [
                  {
                    type: 'table_cell',
                    attrs: { colspan: 2, colwidth: [100, 200] },
                    content: [para('cell')],
                  },
                ],
              },
            ],
          },
        ],
      });
      const { zip, read } = await build(
        planWith(
          [
            chapterItem('i1', 'doc-1'),
            {
              id: 'fm-1',
              type: PublishPlanItemType.Frontmatter,
              contentType: FrontmatterType.Dedication,
              customContent: 'For <b>Ann</b> & Bob\n\nand everyone',
            },
            {
              id: 'bm-1',
              type: PublishPlanItemType.Backmatter,
              contentType: BackmatterType.AboutAuthor,
            },
          ],
          {
            metadata: {
              ...mockPlan.metadata,
              author: 'Smith & <Jones>',
              language: 'not a language!',
            },
          }
        )
      );

      const files = zip.file(/\.(xhtml|opf|ncx)$/);
      expect(files.length).toBeGreaterThan(3);
      for (const file of files) {
        expectWellFormed(await file.async('string'), file.name);
      }

      const chapter = (
        await Promise.all(
          zip.file(/chapter_.*\.xhtml$/).map(f => f.async('string'))
        )
      ).join('');
      expect(chapter).not.toContain('\u0007');
      expect(chapter).not.toContain('javascript:');
      expect(chapter).not.toContain('<script');
      expect(chapter).not.toContain('colwidth');
      expect(chapter).toContain('colspan="2"');
      expect(chapter).toContain('inside unknown');
      expect(chapter).toContain('ink-doc-align-center');
      expect(chapter).toContain('ink-doc-indent-3');

      const opf = await read('OEBPS/content.opf');
      expect(opf).toContain('<dc:language>en</dc:language>');
      expect(opf).toContain('Smith &amp; &lt;Jones&gt;');
    });

    it('writes valid package metadata with a stable identifier', async () => {
      const plan = planWith([chapterItem('i1', 'doc-1')], {
        metadata: {
          ...mockPlan.metadata,
          subtitle: 'A Tale',
          authorSort: 'Author, Test',
          copyright: '© 2026 Test Author',
          keywords: ['fantasy', ' '],
          series: 'The Saga',
          seriesNumber: 2,
        },
      });
      const first = await build(plan);
      const opf = await first.read('OEBPS/content.opf');
      const ncx = await first.read('OEBPS/toc.ncx');

      expect(opf).toMatch(
        /<meta property="dcterms:modified">\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ<\/meta>/
      );
      const id = /<dc:identifier id="BookId">([^<]+)</.exec(opf)![1];
      expect(id).toMatch(/^urn:uuid:[0-9a-f-]{36}$/);
      expect(ncx).toContain(`<meta name="dtb:uid" content="${id}"/>`);

      const again = await build(plan);
      expect(await again.read('OEBPS/content.opf')).toContain(id);

      expect(opf).toContain('property="title-type">subtitle</meta>');
      expect(opf).toContain('property="file-as">Author, Test</meta>');
      expect(opf).toContain('<dc:rights>© 2026 Test Author</dc:rights>');
      expect(opf).toContain('<dc:subject>fantasy</dc:subject>');
      expect(opf.match(/<dc:subject>/g)).toHaveLength(1);
      expect(opf).toContain('property="belongs-to-collection"');
      expect(opf).toContain('property="group-position">2</meta>');
      expect(opf).toContain('schema:accessMode');
      expect(opf).toContain('schema:accessibilitySummary');
    });

    it('uses the ISBN as the identifier when one is valid', async () => {
      const { read } = await build(
        planWith([chapterItem('i1', 'doc-1')], {
          metadata: { ...mockPlan.metadata, isbn: '978-3-16-148410-0' },
        })
      );
      expect(await read('OEBPS/content.opf')).toContain(
        'urn:isbn:9783161484100'
      );
    });

    it('packages document images with a detected media type', async () => {
      localStorageMock.getMedia.mockImplementation(
        (_project: string, id: string) =>
          Promise.resolve(
            id === 'img-1' ? new Blob([PNG_BYTES], { type: '' }) : null
          )
      );
      contentByDoc({
        'doc-1': [
          {
            type: 'paragraph',
            content: [
              { type: 'image', attrs: { src: 'media:img-1', alt: 'A map' } },
              { type: 'image', attrs: { src: 'media:img-1', alt: 'Again' } },
              { type: 'image', attrs: { src: 'media:gone', alt: 'Lost' } },
            ],
          },
        ],
      });
      const { result, zip, read } = await build(
        planWith([chapterItem('i1', 'doc-1')])
      );

      const opf = await read('OEBPS/content.opf');
      expect(opf).toContain(
        'href="images/image_001.png" media-type="image/png"'
      );
      expect(opf).not.toContain('image_002');
      expect(zip.file('OEBPS/images/image_001.png')).toBeTruthy();
      expect(opf).toContain('<meta property="schema:accessMode">visual</meta>');

      const chapter = await read('OEBPS/chapter_001.xhtml');
      expect(chapter).toContain('src="images/image_001.png" alt="A map"');
      expect(chapter).toContain('Image unavailable: Lost');
      expect(chapter).not.toContain('media:');
      expect(result.warnings.some(w => w.includes('media:gone'))).toBe(true);
    });

    it('decodes data URL images and rejects unsupported types', async () => {
      const b64 = btoa(String.fromCodePoint(...PNG_BYTES));
      contentByDoc({
        'doc-1': [
          {
            type: 'paragraph',
            content: [
              { type: 'image', attrs: { src: `data:image/png;base64,${b64}` } },
              {
                type: 'image',
                attrs: { src: `data:image/bmp;base64,${btoa('BM000')}` },
              },
            ],
          },
        ],
      });
      const { result, read } = await build(
        planWith([chapterItem('i1', 'doc-1')])
      );
      const chapter = await read('OEBPS/chapter_001.xhtml');
      expect(chapter).toContain('src="images/image_001.png"');
      expect(chapter).not.toContain('data:');
      expect(result.warnings.some(w => w.includes('image/bmp'))).toBe(true);
    });

    it('copies remote images into the package when they can be fetched', async () => {
      const fetchMock = vi.fn((url: string) =>
        Promise.resolve({
          ok: url.includes('ok'),
          blob: () => Promise.resolve(new Blob([PNG_BYTES])),
        })
      );
      vi.stubGlobal('fetch', fetchMock);
      contentByDoc({
        'doc-1': [
          {
            type: 'paragraph',
            content: [
              { type: 'image', attrs: { src: 'https://example.com/ok.png' } },
              { type: 'image', attrs: { src: 'https://example.com/missing' } },
            ],
          },
        ],
      });
      const { result, read } = await build(
        planWith([chapterItem('i1', 'doc-1')])
      );
      const chapter = await read('OEBPS/chapter_001.xhtml');
      expect(chapter).toContain('src="images/image_001.png"');
      expect(chapter).not.toContain('https://example.com');
      expect(chapter).toContain('Image unavailable');
      expect(result.warnings.some(w => w.includes('/missing'))).toBe(true);
    });

    it('nests folder children and headings in the navigation', async () => {
      projectStateMock.elements.set([
        { id: 'f1', name: 'Part One', type: ElementType.Folder, level: 0 },
        { id: 'c1', name: 'Arrival', type: ElementType.Item, level: 1 },
        { id: 'c2', name: 'Departure', type: ElementType.Item, level: 1 },
      ] as Element[]);
      contentByDoc({
        c1: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: 'Arrival' }],
          },
          para('text'),
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'At the Gate' }],
          },
        ],
        c2: [para('more')],
      });
      const { read } = await build(
        planWith([
          {
            id: 'toc',
            type: PublishPlanItemType.TableOfContents,
            title: 'Contents',
            depth: 2,
            includePageNumbers: false,
          },
          {
            id: 'i1',
            type: PublishPlanItemType.Element,
            elementId: 'f1',
            includeChildren: true,
            isChapter: false,
          },
        ])
      );

      const nav = await read('OEBPS/nav.xhtml');
      expect(nav).toContain('<span>Part One</span>');
      expect(nav).toMatch(
        /<span>Part One<\/span>\s*<ol>\s*<li[^>]*><a href="chapter_001.xhtml">Arrival<\/a>/
      );
      // Depth 2: the heading level below chapters is hidden on the page.
      expect(nav).toMatch(
        /<ol hidden="">\s*<li[^>]*><a href="chapter_001.xhtml#ink-h-2">At the Gate/
      );
      expect(nav).not.toContain('>Arrival</a>\n        <ol'); // duplicate title heading skipped
      expect(nav).toContain('<h1 class="ink-toc-title">Contents</h1>');
      expect(nav).toContain('epub:type="landmarks"');

      const opf = await read('OEBPS/content.opf');
      expect(opf).toMatch(/<spine[^>]*>\s*<itemref idref="nav"\/>/);
      expect(opf).toContain('<reference type="toc"');

      const ncx = await read('OEBPS/toc.ncx');
      expect(ncx).toContain('<meta name="dtb:depth" content="3"/>');
      // The group entry points at its first child.
      expect(ncx).toMatch(
        /<text>Part One<\/text>\s*<\/navLabel>\s*<content src="chapter_001.xhtml"\/>/
      );
    });

    it('does not put the visible TOC in the spine without a TOC item', async () => {
      const { read } = await build(planWith([chapterItem('i1', 'doc-1')]));
      const opf = await read('OEBPS/content.opf');
      expect(opf).not.toContain('<itemref idref="nav"/>');
      expect(opf).toContain('properties="nav"');
    });

    it('attaches scene breaks to the preceding chapter', async () => {
      contentByDoc({ 'doc-1': [para('one')], 'doc-2': [para('two')] });
      const { zip, read } = await build(
        planWith([
          chapterItem('i1', 'doc-1'),
          {
            id: 's1',
            type: PublishPlanItemType.Separator,
            style: SeparatorStyle.SceneBreak,
          },
          {
            id: 's2',
            type: PublishPlanItemType.Separator,
            style: SeparatorStyle.PageBreak,
          },
          chapterItem('i2', 'doc-2'),
        ])
      );
      expect(zip.file(/separator/)).toHaveLength(0);
      const first = await read('OEBPS/chapter_001.xhtml');
      expect(first).toContain('one');
      expect(first).toContain(
        '<p class="ink-scene-break" role="separator">* * *</p>'
      );
    });

    it('links element references to the chapter that holds them', async () => {
      contentByDoc({
        'doc-1': [
          {
            type: 'paragraph',
            content: [
              {
                type: 'elementRef',
                attrs: { elementId: 'doc-2', displayText: 'see two' },
              },
              {
                type: 'elementRef',
                attrs: { elementId: 'elsewhere', displayText: 'not here' },
              },
            ],
          },
        ],
        'doc-2': [para('two')],
      });
      const { read } = await build(
        planWith([chapterItem('i1', 'doc-1'), chapterItem('i2', 'doc-2')])
      );
      const first = await read('OEBPS/chapter_001.xhtml');
      expect(first).toContain('href="chapter_002.xhtml">see two</a>');
      expect(first).toContain('not here');
      expect(first).not.toContain('inkweld-element:');
    });

    it('keeps safe links and inline colours', async () => {
      contentByDoc({
        'doc-1': [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'site',
                marks: [
                  {
                    type: 'link',
                    attrs: { href: 'https://example.com/?a=1&b=2' },
                  },
                ],
              },
              {
                type: 'text',
                text: 'red',
                marks: [
                  {
                    type: 'text_color',
                    attrs: { color: 'red;background:url(x)' },
                  },
                  'strong',
                ],
              },
            ],
          },
        ],
      });
      const { read } = await build(planWith([chapterItem('i1', 'doc-1')]));
      const chapter = await read('OEBPS/chapter_001.xhtml');
      expect(chapter).toContain('href="https://example.com/?a=1&amp;b=2"');
      expect(chapter).not.toContain('url(x)');
      expect(chapter).toContain('<strong class="ink-mark-bold">red</strong>');
    });

    it('marks right-to-left books', async () => {
      const { read } = await build(
        planWith([chapterItem('i1', 'doc-1')], {
          metadata: { ...mockPlan.metadata, language: 'ar' },
        })
      );
      expect(await read('OEBPS/content.opf')).toContain(
        'page-progression-direction="rtl"'
      );
      expect(await read('OEBPS/chapter_001.xhtml')).toContain(
        'xml:lang="ar" lang="ar" dir="rtl"'
      );
    });

    it('adds EPUB 2 cover hints alongside the EPUB 3 cover', async () => {
      localStorageMock.getMedia.mockResolvedValue(
        new Blob([PNG_BYTES], { type: 'application/octet-stream' })
      );
      const { read } = await build(
        planWith([chapterItem('i1', 'doc-1')], {
          options: { ...mockPlan.options, includeCover: true },
        })
      );
      const opf = await read('OEBPS/content.opf');
      expect(opf).toContain('<meta name="cover" content="cover-image"/>');
      expect(opf).toContain(
        'href="images/cover.png" media-type="image/png" properties="cover-image"'
      );
      expect(opf).toContain('<reference type="cover"');
      const cover = await read('OEBPS/cover.xhtml');
      expect(cover).toContain('epub:type="cover"');
      expect(cover).toContain('alt="Cover of Test Book"');
    });
  });
});
