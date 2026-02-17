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
import { DocumentService } from '../project/document.service';
import { ProjectStateService } from '../project/project-state.service';
import {
  MarkdownGeneratorService,
  MarkdownPhase,
  MarkdownProgress,
} from './markdown-generator.service';

describe('MarkdownGeneratorService', () => {
  let service: MarkdownGeneratorService;
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
      parentId: null,
      order: 0,
      level: 0,
      expandable: false,
      version: 1,
      metadata: {},
    } as Element,
  ];

  const mockPlan: PublishPlan = {
    id: 'plan-1',
    name: 'Test Plan',
    format: PublishFormat.MARKDOWN,
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
    items: [],
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
        MarkdownGeneratorService,
        { provide: LoggerService, useValue: loggerMock },
        { provide: DocumentService, useValue: documentServiceMock },
        { provide: ProjectStateService, useValue: projectStateMock },
      ],
    });

    service = TestBed.inject(MarkdownGeneratorService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('progress$', () => {
    it('should emit initial idle state', () => {
      let progress: MarkdownProgress | undefined;
      service.progress$.subscribe(p => (progress = p));

      expect(progress).toBeDefined();
      expect(progress!.phase).toBe(MarkdownPhase.Idle);
      expect(progress!.overallProgress).toBe(0);
    });
  });

  describe('complete$', () => {
    it('should be an observable', () => {
      expect(service.complete$).toBeDefined();
      expect(typeof service.complete$.subscribe).toBe('function');
    });
  });

  describe('generateMarkdown', () => {
    it('should generate markdown with empty plan', async () => {
      const result = await service.generateMarkdown(mockPlan);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
    });

    it('should generate filename from title', async () => {
      const result = await service.generateMarkdown(mockPlan);

      expect(result.filename).toContain('test-book');
      expect(result.filename).toContain('.md');
    });

    it('should include stats in result', async () => {
      const result = await service.generateMarkdown(mockPlan);

      expect(result.stats).toBeDefined();
      expect(result.stats!.wordCount).toBeGreaterThanOrEqual(0);
      expect(result.stats!.generationTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should return blob file', async () => {
      const result = await service.generateMarkdown(mockPlan);

      expect(result.file).toBeInstanceOf(Blob);
      expect(result.file!.type).toContain('text/markdown');
    });

    it('should handle plan with frontmatter', async () => {
      const planWithFrontmatter: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'front-1',
            type: PublishPlanItemType.Frontmatter,
            contentType: FrontmatterType.TitlePage,
          },
        ],
      };

      const result = await service.generateMarkdown(planWithFrontmatter);

      expect(result.success).toBe(true);
    });

    it('should handle plan with separator', async () => {
      const planWithSeparator: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'sep-1',
            type: PublishPlanItemType.Separator,
            style: SeparatorStyle.SceneBreak,
          },
        ],
      };

      const result = await service.generateMarkdown(planWithSeparator);

      expect(result.success).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      projectStateMock.elements = (() => {
        throw new Error('Test error');
      }) as unknown as ReturnType<typeof signal<Element[]>>;

      const result = await service.generateMarkdown(mockPlan);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should include TOC when enabled', async () => {
      const planWithToc: PublishPlan = {
        ...mockPlan,
        options: { ...mockPlan.options, includeToc: true },
      };

      const result = await service.generateMarkdown(planWithToc);

      expect(result.success).toBe(true);
    });

    it('should skip TOC when disabled', async () => {
      const planWithoutToc: PublishPlan = {
        ...mockPlan,
        options: { ...mockPlan.options, includeToc: false },
      };

      const result = await service.generateMarkdown(planWithoutToc);

      expect(result.success).toBe(true);
    });

    it('should process element with document content', async () => {
      const planWithElement: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'item-1',
            type: PublishPlanItemType.Element,
            elementId: 'doc-1',
            includeChildren: false,
            isChapter: true,
          },
        ],
      };

      const result = await service.generateMarkdown(planWithElement);

      expect(result.success).toBe(true);
      expect(result.stats!.documentCount).toBe(1);
    });

    it('should handle Table of Contents item', async () => {
      const planWithToc: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'toc-1',
            type: PublishPlanItemType.TableOfContents,
            title: 'Contents',
            depth: 2,
            includePageNumbers: false,
          },
        ],
      };

      const result = await service.generateMarkdown(planWithToc);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      // Real TOC is generated — check for the heading
      expect(text).toContain('## Table of Contents');
    });

    it('should generate real TOC with element links', async () => {
      const planWithTocAndElement: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'toc-1',
            type: PublishPlanItemType.TableOfContents,
            title: 'Contents',
            depth: 2,
            includePageNumbers: false,
          },
          {
            id: 'item-1',
            type: PublishPlanItemType.Element,
            elementId: 'doc-1',
            includeChildren: false,
            isChapter: true,
          },
        ],
      };

      const result = await service.generateMarkdown(planWithTocAndElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('## Table of Contents');
      // The element item 'Chapter 1' should appear as a TOC link
      expect(text).toContain('[Chapter 1]');
    });

    it('should render folder elements as bold section headers in TOC', async () => {
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

      projectStateMock.elements = signal([folderElement]);

      const planWithFolderToc: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'toc-1',
            type: PublishPlanItemType.TableOfContents,
            title: 'Contents',
            depth: 2,
            includePageNumbers: false,
          },
          {
            id: 'item-1',
            type: PublishPlanItemType.Element,
            elementId: 'folder-1',
            includeChildren: true,
            isChapter: false,
          },
        ],
      };

      const result = await service.generateMarkdown(planWithFolderToc);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('## Table of Contents');
      // Folder entries should show as bold section headers, not links
      expect(text).toContain('**Part One**');
    });

    it('should handle chapter break separator', async () => {
      const planWithChapterBreak: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'sep-1',
            type: PublishPlanItemType.Separator,
            style: SeparatorStyle.ChapterBreak,
          },
        ],
      };

      const result = await service.generateMarkdown(planWithChapterBreak);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('---');
    });

    it('should handle page break separator', async () => {
      const planWithPageBreak: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'sep-1',
            type: PublishPlanItemType.Separator,
            style: SeparatorStyle.PageBreak,
          },
        ],
      };

      const result = await service.generateMarkdown(planWithPageBreak);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('page-break-after');
    });

    it('should handle copyright frontmatter', async () => {
      const planWithCopyright: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'fm-1',
            type: PublishPlanItemType.Frontmatter,
            contentType: FrontmatterType.Copyright,
          },
        ],
      };

      const result = await service.generateMarkdown(planWithCopyright);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('Copyright');
    });

    it('should handle custom frontmatter', async () => {
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
        ],
      };

      const result = await service.generateMarkdown(planWithCustom);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('Acknowledgements');
      expect(text).toContain('Thank you all');
    });

    it('should format chapters with numeric numbering', async () => {
      const planWithNumbering: PublishPlan = {
        ...mockPlan,
        options: {
          ...mockPlan.options,
          chapterNumbering: ChapterNumbering.Numeric,
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
      };

      const result = await service.generateMarkdown(planWithNumbering);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('Chapter 1:');
    });

    it('should format chapters with Roman numeral numbering', async () => {
      const planWithNumbering: PublishPlan = {
        ...mockPlan,
        options: {
          ...mockPlan.options,
          chapterNumbering: ChapterNumbering.Roman,
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
      };

      const result = await service.generateMarkdown(planWithNumbering);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('Chapter I:');
    });

    it('should format chapters with written numbering', async () => {
      const planWithNumbering: PublishPlan = {
        ...mockPlan,
        options: {
          ...mockPlan.options,
          chapterNumbering: ChapterNumbering.Written,
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
      };

      const result = await service.generateMarkdown(planWithNumbering);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('Chapter One:');
    });

    it('should include metadata keywords in frontmatter', async () => {
      const planWithKeywords: PublishPlan = {
        ...mockPlan,
        metadata: {
          ...mockPlan.metadata,
          keywords: ['fantasy', 'adventure'],
        },
      };

      const result = await service.generateMarkdown(planWithKeywords);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('keywords:');
      expect(text).toContain('fantasy');
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

      const result = await service.generateMarkdown(planWithMissingElement);

      expect(result.success).toBe(true);
    });

    it('should handle document content retrieval failure', async () => {
      documentServiceMock.getDocumentContent.mockRejectedValue(
        new Error('Content error')
      );

      const planWithElement: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'item-1',
            type: PublishPlanItemType.Element,
            elementId: 'doc-1',
            includeChildren: false,
            isChapter: true,
          },
        ],
      };

      const result = await service.generateMarkdown(planWithElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('Content unavailable');
    });

    it('should handle null document content', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue(null);

      const planWithElement: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'item-1',
            type: PublishPlanItemType.Element,
            elementId: 'doc-1',
            includeChildren: false,
            isChapter: true,
          },
        ],
      };

      const result = await service.generateMarkdown(planWithElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('Document is empty');
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
            titleOverride: 'Custom Title',
          },
        ],
      };

      const result = await service.generateMarkdown(planWithTitleOverride);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('Custom Title');
    });
  });

  describe('ProseMirror conversion', () => {
    it('should convert heading nodes with levels', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ text: 'H1 Heading' }],
        },
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ text: 'H3 Heading' }],
        },
      ]);

      const planWithElement: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'item-1',
            type: PublishPlanItemType.Element,
            elementId: 'doc-1',
            includeChildren: false,
            isChapter: true,
          },
        ],
      };

      const result = await service.generateMarkdown(planWithElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('# H1 Heading');
      expect(text).toContain('### H3 Heading');
    });

    it('should convert blockquote nodes', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'blockquote',
          content: [
            { type: 'paragraph', content: [{ text: 'A famous quote' }] },
          ],
        },
      ]);

      const planWithElement: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'item-1',
            type: PublishPlanItemType.Element,
            elementId: 'doc-1',
            includeChildren: false,
            isChapter: true,
          },
        ],
      };

      const result = await service.generateMarkdown(planWithElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('> ');
    });

    it('should convert bullet_list nodes', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'bullet_list',
          content: [
            { type: 'list_item', content: [{ text: 'Item one' }] },
            { type: 'list_item', content: [{ text: 'Item two' }] },
          ],
        },
      ]);

      const planWithElement: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'item-1',
            type: PublishPlanItemType.Element,
            elementId: 'doc-1',
            includeChildren: false,
            isChapter: true,
          },
        ],
      };

      const result = await service.generateMarkdown(planWithElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('- Item one');
      expect(text).toContain('- Item two');
    });

    it('should convert ordered_list nodes', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'ordered_list',
          content: [
            { type: 'list_item', content: [{ text: 'First' }] },
            { type: 'list_item', content: [{ text: 'Second' }] },
          ],
        },
      ]);

      const planWithElement: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'item-1',
            type: PublishPlanItemType.Element,
            elementId: 'doc-1',
            includeChildren: false,
            isChapter: true,
          },
        ],
      };

      const result = await service.generateMarkdown(planWithElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('1. First');
      expect(text).toContain('2. Second');
    });

    it('should convert code_block nodes', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        { type: 'code_block', content: [{ text: 'const x = 1;' }] },
      ]);

      const planWithElement: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'item-1',
            type: PublishPlanItemType.Element,
            elementId: 'doc-1',
            includeChildren: false,
            isChapter: true,
          },
        ],
      };

      const result = await service.generateMarkdown(planWithElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('```');
      expect(text).toContain('const x = 1;');
    });

    it('should convert horizontal_rule nodes', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        { type: 'horizontal_rule' },
      ]);

      const planWithElement: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'item-1',
            type: PublishPlanItemType.Element,
            elementId: 'doc-1',
            includeChildren: false,
            isChapter: true,
          },
        ],
      };

      const result = await service.generateMarkdown(planWithElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('---');
    });

    it('should convert hard_break nodes', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'paragraph',
          content: [
            { text: 'Line one' },
            { type: 'hard_break' },
            { text: 'Line two' },
          ],
        },
      ]);

      const planWithElement: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'item-1',
            type: PublishPlanItemType.Element,
            elementId: 'doc-1',
            includeChildren: false,
            isChapter: true,
          },
        ],
      };

      const result = await service.generateMarkdown(planWithElement);

      expect(result.success).toBe(true);
    });

    it('should handle bold marks', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'paragraph',
          content: [{ text: 'Bold text', marks: [{ type: 'bold' }] }],
        },
      ]);

      const planWithElement: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'item-1',
            type: PublishPlanItemType.Element,
            elementId: 'doc-1',
            includeChildren: false,
            isChapter: true,
          },
        ],
      };

      const result = await service.generateMarkdown(planWithElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('**Bold text**');
    });

    it('should handle italic marks', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'paragraph',
          content: [{ text: 'Italic text', marks: [{ type: 'italic' }] }],
        },
      ]);

      const planWithElement: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'item-1',
            type: PublishPlanItemType.Element,
            elementId: 'doc-1',
            includeChildren: false,
            isChapter: true,
          },
        ],
      };

      const result = await service.generateMarkdown(planWithElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('*Italic text*');
    });

    it('should handle code marks', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'paragraph',
          content: [{ text: 'inline code', marks: [{ type: 'code' }] }],
        },
      ]);

      const planWithElement: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'item-1',
            type: PublishPlanItemType.Element,
            elementId: 'doc-1',
            includeChildren: false,
            isChapter: true,
          },
        ],
      };

      const result = await service.generateMarkdown(planWithElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('`inline code`');
    });

    it('should handle strikethrough marks', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'paragraph',
          content: [{ text: 'deleted text', marks: [{ type: 'strike' }] }],
        },
      ]);

      const planWithElement: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'item-1',
            type: PublishPlanItemType.Element,
            elementId: 'doc-1',
            includeChildren: false,
            isChapter: true,
          },
        ],
      };

      const result = await service.generateMarkdown(planWithElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('~~deleted text~~');
    });

    it('should handle strong marks (alias for bold)', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'paragraph',
          content: [{ text: 'Strong text', marks: [{ type: 'strong' }] }],
        },
      ]);

      const planWithElement: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'item-1',
            type: PublishPlanItemType.Element,
            elementId: 'doc-1',
            includeChildren: false,
            isChapter: true,
          },
        ],
      };

      const result = await service.generateMarkdown(planWithElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('**Strong text**');
    });

    it('should handle em marks (alias for italic)', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'paragraph',
          content: [{ text: 'Emphasized text', marks: [{ type: 'em' }] }],
        },
      ]);

      const planWithElement: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'item-1',
            type: PublishPlanItemType.Element,
            elementId: 'doc-1',
            includeChildren: false,
            isChapter: true,
          },
        ],
      };

      const result = await service.generateMarkdown(planWithElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('*Emphasized text*');
    });

    it('should handle link marks with href', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'paragraph',
          content: [
            {
              text: 'Visit us',
              marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
            },
          ],
        },
      ]);

      const planWithElement: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'item-1',
            type: PublishPlanItemType.Element,
            elementId: 'doc-1',
            includeChildren: false,
            isChapter: true,
          },
        ],
      };

      const result = await service.generateMarkdown(planWithElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('[Visit us](https://example.com)');
    });

    it('should handle link marks with href and title', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'paragraph',
          content: [
            {
              text: 'Hover me',
              marks: [
                {
                  type: 'link',
                  attrs: { href: 'https://example.com', title: 'Example' },
                },
              ],
            },
          ],
        },
      ]);

      const planWithElement: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'item-1',
            type: PublishPlanItemType.Element,
            elementId: 'doc-1',
            includeChildren: false,
            isChapter: true,
          },
        ],
      };

      const result = await service.generateMarkdown(planWithElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('[Hover me](https://example.com "Example")');
    });

    it('should handle underline marks as HTML', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'paragraph',
          content: [{ text: 'underlined', marks: [{ type: 'u' }] }],
        },
      ]);

      const planWithElement: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'item-1',
            type: PublishPlanItemType.Element,
            elementId: 'doc-1',
            includeChildren: false,
            isChapter: true,
          },
        ],
      };

      const result = await service.generateMarkdown(planWithElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('<u>underlined</u>');
    });

    it('should handle superscript marks as HTML', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'paragraph',
          content: [{ text: '2', marks: [{ type: 'sup' }] }],
        },
      ]);

      const planWithElement: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'item-1',
            type: PublishPlanItemType.Element,
            elementId: 'doc-1',
            includeChildren: false,
            isChapter: true,
          },
        ],
      };

      const result = await service.generateMarkdown(planWithElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('<sup>2</sup>');
    });

    it('should handle subscript marks as HTML', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'paragraph',
          content: [{ text: '2', marks: [{ type: 'sub' }] }],
        },
      ]);

      const planWithElement: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'item-1',
            type: PublishPlanItemType.Element,
            elementId: 'doc-1',
            includeChildren: false,
            isChapter: true,
          },
        ],
      };

      const result = await service.generateMarkdown(planWithElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('<sub>2</sub>');
    });

    it('should render image nodes as Markdown image syntax', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'image',
          attrs: { src: 'https://example.com/photo.jpg', alt: 'A sunset' },
        },
      ]);

      const planWithElement: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'item-1',
            type: PublishPlanItemType.Element,
            elementId: 'doc-1',
            includeChildren: false,
            isChapter: true,
          },
        ],
      };

      const result = await service.generateMarkdown(planWithElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('![A sunset](https://example.com/photo.jpg)');
    });

    it('should render image nodes with title', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'image',
          attrs: {
            src: 'https://example.com/photo.jpg',
            alt: 'A sunset',
            title: 'Caption',
          },
        },
      ]);

      const planWithElement: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'item-1',
            type: PublishPlanItemType.Element,
            elementId: 'doc-1',
            includeChildren: false,
            isChapter: true,
          },
        ],
      };

      const result = await service.generateMarkdown(planWithElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain(
        '![A sunset](https://example.com/photo.jpg "Caption")'
      );
    });

    it('should handle nested list with sub-items', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'bullet_list',
          content: [
            {
              type: 'list_item',
              content: [
                { type: 'paragraph', content: [{ text: 'Parent item' }] },
                {
                  type: 'bullet_list',
                  content: [
                    {
                      type: 'list_item',
                      content: [
                        {
                          type: 'paragraph',
                          content: [{ text: 'Child item' }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ]);

      const planWithElement: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'item-1',
            type: PublishPlanItemType.Element,
            elementId: 'doc-1',
            includeChildren: false,
            isChapter: true,
          },
        ],
      };

      const result = await service.generateMarkdown(planWithElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('- Parent item');
      expect(text).toContain('  - Child item');
    });

    it('should handle string marks in marks array', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'paragraph',
          content: [{ text: 'Mixed format', marks: ['bold', 'italic'] }],
        },
      ]);

      const planWithElement: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'item-1',
            type: PublishPlanItemType.Element,
            elementId: 'doc-1',
            includeChildren: false,
            isChapter: true,
          },
        ],
      };

      const result = await service.generateMarkdown(planWithElement);

      expect(result.success).toBe(true);
    });

    it('should handle nodeName property (alternative to type)', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        { nodeName: 'paragraph', children: [{ text: 'Text using nodeName' }] },
      ]);

      const planWithElement: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'item-1',
            type: PublishPlanItemType.Element,
            elementId: 'doc-1',
            includeChildren: false,
            isChapter: true,
          },
        ],
      };

      const result = await service.generateMarkdown(planWithElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('Text using nodeName');
    });

    it('should handle object as top-level data', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ text: 'Single object' }] }],
      });

      const planWithElement: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'item-1',
            type: PublishPlanItemType.Element,
            elementId: 'doc-1',
            includeChildren: false,
            isChapter: true,
          },
        ],
      };

      const result = await service.generateMarkdown(planWithElement);

      expect(result.success).toBe(true);
    });

    it('should handle array of string nodes', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        'Plain text node',
      ]);

      const planWithElement: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'item-1',
            type: PublishPlanItemType.Element,
            elementId: 'doc-1',
            includeChildren: false,
            isChapter: true,
          },
        ],
      };

      const result = await service.generateMarkdown(planWithElement);

      expect(result.success).toBe(true);
    });

    it('should handle nested array nodes', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        [{ type: 'paragraph', content: [{ text: 'Nested' }] }],
      ]);

      const planWithElement: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'item-1',
            type: PublishPlanItemType.Element,
            elementId: 'doc-1',
            includeChildren: false,
            isChapter: true,
          },
        ],
      };

      const result = await service.generateMarkdown(planWithElement);

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

      const result = await service.generateMarkdown(planWithFolder);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('Chapter in folder');
    });
  });

  describe('written number conversion', () => {
    it('should convert numbers 20-59 correctly', async () => {
      // Create 25 chapters to test numbers in 20s range
      const elements: Element[] = [];
      const items: (typeof mockPlan.items)[0][] = [];

      for (let i = 0; i < 25; i++) {
        elements.push({
          id: `doc-${i}`,
          name: `Chapter ${i + 1}`,
          type: ElementType.Item,
          parentId: null,
          order: i,
          level: 0,
          expandable: false,
          version: 1,
          metadata: {},
        } as Element);

        items.push({
          id: `item-${i}`,
          type: PublishPlanItemType.Element,
          elementId: `doc-${i}`,
          includeChildren: false,
          isChapter: true,
        });
      }

      projectStateMock.elements = signal(elements);

      const planWithManyChapters: PublishPlan = {
        ...mockPlan,
        options: {
          ...mockPlan.options,
          chapterNumbering: ChapterNumbering.Written,
        },
        items,
      };

      const result = await service.generateMarkdown(planWithManyChapters);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('Chapter Twenty-Five:');
    });

    it('should fall back to numeric for numbers >= 60', async () => {
      // Create 60 chapters to trigger the fallback
      const elements: Element[] = [];
      const items: (typeof mockPlan.items)[0][] = [];

      for (let i = 0; i < 60; i++) {
        elements.push({
          id: `doc-${i}`,
          name: `Chapter ${i + 1}`,
          type: ElementType.Item,
          parentId: null,
          order: i,
          level: 0,
          expandable: false,
          version: 1,
          metadata: {},
        } as Element);

        items.push({
          id: `item-${i}`,
          type: PublishPlanItemType.Element,
          elementId: `doc-${i}`,
          includeChildren: false,
          isChapter: true,
        });
      }

      projectStateMock.elements = signal(elements);

      const planWithManyChapters: PublishPlan = {
        ...mockPlan,
        options: {
          ...mockPlan.options,
          chapterNumbering: ChapterNumbering.Written,
        },
        items,
      };

      const result = await service.generateMarkdown(planWithManyChapters);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('Chapter 60:');
    });
  });
});
