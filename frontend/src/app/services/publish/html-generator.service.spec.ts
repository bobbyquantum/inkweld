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
import { OfflineStorageService } from '../offline/offline-storage.service';
import { DocumentService } from '../project/document.service';
import { ProjectStateService } from '../project/project-state.service';
import {
  HtmlGeneratorService,
  HtmlPhase,
  HtmlProgress,
} from './html-generator.service';

describe('HtmlGeneratorService', () => {
  let service: HtmlGeneratorService;
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
  let offlineStorageMock: {
    getProjectCover: ReturnType<typeof vi.fn>;
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
    format: PublishFormat.HTML,
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

    offlineStorageMock = {
      getProjectCover: vi.fn().mockResolvedValue(null),
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
        HtmlGeneratorService,
        { provide: LoggerService, useValue: loggerMock },
        { provide: DocumentService, useValue: documentServiceMock },
        { provide: ProjectStateService, useValue: projectStateMock },
        { provide: OfflineStorageService, useValue: offlineStorageMock },
      ],
    });

    service = TestBed.inject(HtmlGeneratorService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('progress$', () => {
    it('should emit initial idle state', () => {
      let progress: HtmlProgress | undefined;
      service.progress$.subscribe(p => (progress = p));

      expect(progress).toBeDefined();
      expect(progress!.phase).toBe(HtmlPhase.Idle);
      expect(progress!.overallProgress).toBe(0);
    });
  });

  describe('complete$', () => {
    it('should be an observable', () => {
      expect(service.complete$).toBeDefined();
      expect(typeof service.complete$.subscribe).toBe('function');
    });
  });

  describe('generateHtml', () => {
    it('should generate HTML with empty plan', async () => {
      const result = await service.generateHtml(mockPlan);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
    });

    it('should generate filename from title', async () => {
      const result = await service.generateHtml(mockPlan);

      expect(result.filename).toContain('test-book');
      expect(result.filename).toContain('.html');
    });

    it('should include stats in result', async () => {
      const result = await service.generateHtml(mockPlan);

      expect(result.stats).toBeDefined();
      expect(result.stats!.wordCount).toBeGreaterThanOrEqual(0);
      expect(result.stats!.generationTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should return blob file', async () => {
      const result = await service.generateHtml(mockPlan);

      expect(result.file).toBeInstanceOf(Blob);
      expect(result.file!.type).toContain('text/html');
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

      const result = await service.generateHtml(planWithFrontmatter);

      expect(result.success).toBe(true);
    });

    it('should handle plan with separator', async () => {
      const planWithSeparator: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'sep-1',
            type: PublishPlanItemType.Separator,
            style: SeparatorStyle.PageBreak,
          },
        ],
      };

      const result = await service.generateHtml(planWithSeparator);

      expect(result.success).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      projectStateMock.elements = (() => {
        throw new Error('Test error');
      }) as unknown as ReturnType<typeof signal<Element[]>>;

      const result = await service.generateHtml(mockPlan);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
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

      const result = await service.generateHtml(planWithElement);

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

      const result = await service.generateHtml(planWithToc);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('Table of Contents');
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

      const result = await service.generateHtml(planWithChapterBreak);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('chapter-break');
    });

    it('should handle scene break separator', async () => {
      const planWithSceneBreak: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'sep-1',
            type: PublishPlanItemType.Separator,
            style: SeparatorStyle.SceneBreak,
          },
        ],
      };

      const result = await service.generateHtml(planWithSceneBreak);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('scene-break');
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

      const result = await service.generateHtml(planWithCopyright);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('copyright');
    });

    it('should handle dedication frontmatter', async () => {
      const planWithDedication: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'fm-1',
            type: PublishPlanItemType.Frontmatter,
            contentType: FrontmatterType.Dedication,
            customContent: 'To my readers',
          },
        ],
      };

      const result = await service.generateHtml(planWithDedication);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('dedication');
      expect(text).toContain('To my readers');
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

      const result = await service.generateHtml(planWithCustom);

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

      const result = await service.generateHtml(planWithNumbering);

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

      const result = await service.generateHtml(planWithNumbering);

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

      const result = await service.generateHtml(planWithNumbering);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('Chapter One:');
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

      const result = await service.generateHtml(planWithMissingElement);

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

      const result = await service.generateHtml(planWithElement);

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

      const result = await service.generateHtml(planWithElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('Document is empty');
    });

    it('should include cover when enabled and available', async () => {
      const mockCoverBlob = new Blob(['fake image'], { type: 'image/png' });
      offlineStorageMock.getProjectCover.mockResolvedValue(mockCoverBlob);

      const planWithCover: PublishPlan = {
        ...mockPlan,
        options: { ...mockPlan.options, includeCover: true },
        items: [
          {
            id: 'fm-1',
            type: PublishPlanItemType.Frontmatter,
            contentType: FrontmatterType.TitlePage,
          },
        ],
      };

      const result = await service.generateHtml(planWithCover);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('cover-image');
    });

    it('should include subtitle when available', async () => {
      const planWithSubtitle: PublishPlan = {
        ...mockPlan,
        metadata: {
          ...mockPlan.metadata,
          subtitle: 'A Great Adventure',
        },
        items: [
          {
            id: 'fm-1',
            type: PublishPlanItemType.Frontmatter,
            contentType: FrontmatterType.TitlePage,
          },
        ],
      };

      const result = await service.generateHtml(planWithSubtitle);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('A Great Adventure');
    });

    it('should include publisher and ISBN in copyright', async () => {
      const planWithPublisher: PublishPlan = {
        ...mockPlan,
        metadata: {
          ...mockPlan.metadata,
          publisher: 'Test Publisher',
          isbn: '978-1234567890',
        },
        items: [
          {
            id: 'fm-1',
            type: PublishPlanItemType.Frontmatter,
            contentType: FrontmatterType.Copyright,
          },
        ],
      };

      const result = await service.generateHtml(planWithPublisher);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('Test Publisher');
      expect(text).toContain('978-1234567890');
    });

    it('should include description meta tag', async () => {
      const planWithDescription: PublishPlan = {
        ...mockPlan,
        metadata: {
          ...mockPlan.metadata,
          description: 'An exciting story',
        },
      };

      const result = await service.generateHtml(planWithDescription);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('An exciting story');
    });

    it('should include custom CSS when provided', async () => {
      const planWithCss: PublishPlan = {
        ...mockPlan,
        options: {
          ...mockPlan.options,
          customCss: '.chapter { background: red; }',
        },
      };

      const result = await service.generateHtml(planWithCss);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('.chapter { background: red; }');
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

      const result = await service.generateHtml(planWithTitleOverride);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('Custom Title');
    });
  });

  describe('ProseMirror conversion', () => {
    it('should convert heading nodes', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        { type: 'heading', content: [{ text: 'My Heading' }] },
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

      const result = await service.generateHtml(planWithElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('<h2>');
    });

    it('should convert blockquote nodes', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'blockquote',
          content: [{ type: 'paragraph', content: [{ text: 'A quote' }] }],
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

      const result = await service.generateHtml(planWithElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('<blockquote>');
    });

    it('should convert bullet_list nodes', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'bullet_list',
          content: [{ type: 'list_item', content: [{ text: 'Item' }] }],
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

      const result = await service.generateHtml(planWithElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('<ul>');
      expect(text).toContain('<li>');
    });

    it('should convert ordered_list nodes', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'ordered_list',
          content: [{ type: 'list_item', content: [{ text: 'First' }] }],
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

      const result = await service.generateHtml(planWithElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('<ol>');
    });

    it('should convert hard_break nodes', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        { type: 'hard_break' },
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

      const result = await service.generateHtml(planWithElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('<br />');
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

      const result = await service.generateHtml(planWithElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('<hr />');
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

      const result = await service.generateHtml(planWithElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('<p>');
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

      const result = await service.generateHtml(planWithElement);

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

      const result = await service.generateHtml(planWithElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('Plain text node');
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

      const result = await service.generateHtml(planWithElement);

      expect(result.success).toBe(true);
    });

    it('should escape HTML special characters', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'paragraph',
          content: [{ text: '<script>alert("xss")</script>' }],
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

      const result = await service.generateHtml(planWithElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('&lt;script&gt;');
      expect(text).not.toContain('<script>');
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

      const result = await service.generateHtml(planWithFolder);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('Chapter in folder');
    });
  });

  describe('cover image handling', () => {
    it('should handle cover loading when no project is set', async () => {
      projectStateMock.project = signal(null);

      const planWithCover: PublishPlan = {
        ...mockPlan,
        options: { ...mockPlan.options, includeCover: true },
      };

      const result = await service.generateHtml(planWithCover);

      expect(result.success).toBe(true);
      expect(offlineStorageMock.getProjectCover).not.toHaveBeenCalled();
    });

    it('should handle cover loading error gracefully', async () => {
      offlineStorageMock.getProjectCover.mockRejectedValue(
        new Error('Storage error')
      );

      const planWithCover: PublishPlan = {
        ...mockPlan,
        options: { ...mockPlan.options, includeCover: true },
      };

      const result = await service.generateHtml(planWithCover);

      expect(result.success).toBe(true);
      expect(loggerMock.warn).toHaveBeenCalled();
    });
  });

  describe('written number conversion', () => {
    it('should convert numbers 20-59 correctly', async () => {
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

      const result = await service.generateHtml(planWithManyChapters);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('Chapter Twenty-Five:');
    });

    it('should fall back to numeric for numbers >= 60', async () => {
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

      const result = await service.generateHtml(planWithManyChapters);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('Chapter 60:');
    });
  });

  describe('text formatting marks', () => {
    it('should render bold text', async () => {
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

      const result = await service.generateHtml(planWithElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('<strong>Bold text</strong>');
    });

    it('should render italic text', async () => {
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

      const result = await service.generateHtml(planWithElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('<em>Italic text</em>');
    });

    it('should render code text', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'paragraph',
          content: [{ text: 'const x = 1', marks: [{ type: 'code' }] }],
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

      const result = await service.generateHtml(planWithElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('<code>const x = 1</code>');
    });

    it('should render strikethrough text', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'paragraph',
          content: [{ text: 'Deleted', marks: [{ type: 'strike' }] }],
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

      const result = await service.generateHtml(planWithElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('<del>Deleted</del>');
    });

    it('should render combined marks (bold + italic)', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'paragraph',
          content: [
            {
              text: 'Bold and italic',
              marks: [{ type: 'bold' }, { type: 'italic' }],
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

      const result = await service.generateHtml(planWithElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      // Note: marks are applied in order: bold wraps first, then italic wraps the result
      expect(text).toContain('<em><strong>Bold and italic</strong></em>');
    });

    it('should handle text with string marks', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue([
        {
          type: 'paragraph',
          content: [{ text: 'String mark', marks: ['bold'] }],
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

      const result = await service.generateHtml(planWithElement);

      expect(result.success).toBe(true);
      const text = await result.file!.text();
      expect(text).toContain('<strong>String mark</strong>');
    });
  });

  describe('edge cases', () => {
    it('should handle unknown plan item types', async () => {
      const planWithUnknown: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'item-1',
            type: 'unknown' as PublishPlanItemType,
          } as unknown as (typeof mockPlan.items)[0],
        ],
      };

      const result = await service.generateHtml(planWithUnknown);

      expect(result.success).toBe(true);
    });

    it('should handle unknown separator styles', async () => {
      const planWithUnknownSeparator: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'item-1',
            type: PublishPlanItemType.Separator,
            style: 'unknown' as SeparatorStyle,
          },
        ],
      };

      const result = await service.generateHtml(planWithUnknownSeparator);

      expect(result.success).toBe(true);
    });

    it('should handle unknown frontmatter types', async () => {
      const planWithUnknownFrontmatter: PublishPlan = {
        ...mockPlan,
        items: [
          {
            id: 'item-1',
            type: PublishPlanItemType.Frontmatter,
            contentType: 'unknown' as FrontmatterType,
          },
        ],
      };

      const result = await service.generateHtml(planWithUnknownFrontmatter);

      expect(result.success).toBe(true);
    });

    it('should handle prosemirror data returning empty string', async () => {
      documentServiceMock.getDocumentContent.mockResolvedValue('');

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

      const result = await service.generateHtml(planWithElement);

      expect(result.success).toBe(true);
    });
  });
});
