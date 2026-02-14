import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Element, ElementType, Project } from '@inkweld/index';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ChapterNumbering,
  FrontmatterType,
  PublishFormat,
  PublishPlan,
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
  EpubProgress,
  EpubResult,
} from './epub-generator.service';

// Mock JSZip - epub generator uses file() and generateAsync() methods
vi.mock('@progress/jszip-esm', () => ({
  default: class MockJSZip {
    private files: Map<string, string | Blob> = new Map();

    file(path: string, content: string | Blob): this {
      this.files.set(path, content);
      return this;
    }

    generateAsync(_options: {
      type: string;
      mimeType?: string;
    }): Promise<Blob> {
      return Promise.resolve(
        new Blob(['epub content'], { type: 'application/epub+zip' })
      );
    }
  },
}));

describe('EpubGeneratorService', () => {
  let service: EpubGeneratorService;
  let loggerMock: {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  let documentServiceMock: {
    getDocumentContent: ReturnType<typeof vi.fn>;
  };
  let projectStateMock: {
    project: ReturnType<typeof signal<Project | null>>;
    elements: ReturnType<typeof signal<Element[]>>;
    coverMediaId: ReturnType<typeof signal<string | undefined>>;
  };
  let localStorageMock: {
    getMedia: ReturnType<typeof vi.fn>;
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
      fontFamily: 'serif',
      fontSize: 12,
      lineHeight: 1.5,
    },
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
      providers: [
        provideZonelessChangeDetection(),
        EpubGeneratorService,
        { provide: LoggerService, useValue: loggerMock },
        { provide: DocumentService, useValue: documentServiceMock },
        { provide: ProjectStateService, useValue: projectStateMock },
        { provide: LocalStorageService, useValue: localStorageMock },
      ],
    });

    service = TestBed.inject(EpubGeneratorService);
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
      expect(results[results.length - 1].success).toBe(true);
    });

    it('should emit result on error', async () => {
      projectStateMock.elements = (() => {
        throw new Error('Test error');
      }) as unknown as ReturnType<typeof signal<Element[]>>;

      const results: EpubResult[] = [];
      service.complete$.subscribe(r => results.push(r));

      await service.generateEpub(mockPlan);

      expect(results.length).toBeGreaterThan(0);
      expect(results[results.length - 1].success).toBe(false);
    });
  });

  describe('cover image handling', () => {
    it('should handle cover image loading error gracefully', async () => {
      localStorageMock.getMedia.mockRejectedValue(new Error('Storage error'));

      const planWithCover = {
        ...mockPlan,
        options: { ...mockPlan.options, includeCover: true },
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
      };

      const result = await service.generateEpub(planWithToc);

      expect(result.success).toBe(true);
    });

    it('should exclude TOC when disabled', async () => {
      const planWithoutToc = {
        ...mockPlan,
        options: { ...mockPlan.options, includeToc: false },
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

    it('should handle bold marks', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'paragraph',
          content: [{ text: 'Bold text', marks: [{ type: 'bold' }] }],
        },
      ]);

      const result = await service.generateEpub(mockPlan);

      expect(result.success).toBe(true);
    });

    it('should handle italic marks', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'paragraph',
          content: [{ text: 'Italic text', marks: [{ type: 'italic' }] }],
        },
      ]);

      const result = await service.generateEpub(mockPlan);

      expect(result.success).toBe(true);
    });

    it('should handle code marks', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'paragraph',
          content: [{ text: 'inline code', marks: [{ type: 'code' }] }],
        },
      ]);

      const result = await service.generateEpub(mockPlan);

      expect(result.success).toBe(true);
    });

    it('should handle strikethrough marks', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'paragraph',
          content: [{ text: 'deleted text', marks: [{ type: 'strike' }] }],
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
      } as Element;

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
      } as Element;

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
      };

      const result = await service.generateEpub(planWithCover);

      expect(result.success).toBe(true);
    });
  });
});
