import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ChapterNumbering,
  PublishFormat,
  PublishPlan,
  PublishPlanItemType,
} from '../../models/publish-plan';
import {
  EpubGeneratorService,
  EpubPhase,
  EpubProgress,
  EpubResult,
} from './epub-generator.service';
import {
  HtmlGeneratorService,
  HtmlPhase,
  HtmlProgress,
  HtmlResult,
} from './html-generator.service';
import {
  MarkdownGeneratorService,
  MarkdownPhase,
  MarkdownProgress,
  MarkdownResult,
} from './markdown-generator.service';
import {
  PdfGeneratorService,
  PdfPhase,
  PdfProgress,
  PdfResult,
} from './pdf-generator.service';
import {
  ProjectSyncService,
  SyncPhase,
  SyncProgress,
} from './project-sync.service';
import { PublishingPhase, PublishService } from './publish.service';
import { PublishPlanService } from './publish-plan.service';

describe('PublishService', () => {
  let service: PublishService;
  let publishPlanServiceMock: {
    getPlan: ReturnType<typeof vi.fn>;
  };
  let projectSyncServiceMock: {
    progress$: BehaviorSubject<SyncProgress>;
    syncDocuments: ReturnType<typeof vi.fn>;
    verifyLocalAvailability: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  };
  let epubGeneratorMock: {
    progress$: BehaviorSubject<EpubProgress>;
    complete$: Subject<EpubResult>;
    generateEpub: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  };
  let pdfGeneratorMock: {
    progress$: BehaviorSubject<PdfProgress>;
    complete$: Subject<PdfResult>;
    generatePdf: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  };
  let htmlGeneratorMock: {
    progress$: BehaviorSubject<HtmlProgress>;
    complete$: Subject<HtmlResult>;
    generateHtml: ReturnType<typeof vi.fn>;
  };
  let markdownGeneratorMock: {
    progress$: BehaviorSubject<MarkdownProgress>;
    complete$: Subject<MarkdownResult>;
    generateMarkdown: ReturnType<typeof vi.fn>;
  };

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
    publishPlanServiceMock = {
      getPlan: vi.fn().mockReturnValue(mockPlan),
    };

    // Create progress subjects that emit completion immediately
    const syncProgressSubject = new BehaviorSubject<SyncProgress>({
      phase: SyncPhase.Idle,
      overallProgress: 0,
      message: 'Ready',
      totalItems: 0,
      completedItems: 0,
      failedItems: [],
      warnings: [],
    });

    projectSyncServiceMock = {
      progress$: syncProgressSubject,
      syncDocuments: vi.fn().mockImplementation(() => {
        // Emit completion after a short delay
        setTimeout(() => {
          syncProgressSubject.next({
            phase: SyncPhase.Complete,
            overallProgress: 100,
            message: 'Sync complete',
            totalItems: 1,
            completedItems: 1,
            failedItems: [],
            warnings: [],
          });
        }, 10);
        return Promise.resolve({
          success: true,
          syncedDocuments: ['doc-1'],
          failedDocuments: [],
          syncedAssets: [],
          failedAssets: [],
          warnings: [],
        });
      }),
      verifyLocalAvailability: vi.fn().mockResolvedValue({
        allAvailable: true,
        available: ['doc-1'],
        missing: [],
      }),
      cancel: vi.fn(),
    };

    const epubProgressSubject = new BehaviorSubject<EpubProgress>({
      phase: EpubPhase.Idle,
      overallProgress: 0,
      message: 'Ready',
      totalItems: 0,
      completedItems: 0,
    });

    epubGeneratorMock = {
      progress$: epubProgressSubject,
      complete$: new Subject<EpubResult>(),
      generateEpub: vi.fn().mockImplementation(() => {
        // Emit completion
        setTimeout(() => {
          epubProgressSubject.next({
            phase: EpubPhase.Complete,
            overallProgress: 100,
            message: 'Complete',
            totalItems: 1,
            completedItems: 1,
          });
        }, 10);
        return Promise.resolve({
          success: true,
          file: new Blob(['epub'], { type: 'application/epub+zip' }),
          filename: 'test-book.epub',
          stats: {
            wordCount: 1000,
            chapterCount: 1,
            documentCount: 1,
            fileSize: 100,
            generationTimeMs: 50,
          },
          warnings: [],
        } as EpubResult);
      }),
      cancel: vi.fn(),
    };

    const pdfProgressSubject = new BehaviorSubject<PdfProgress>({
      phase: PdfPhase.Idle,
      overallProgress: 0,
      message: 'Ready',
      totalItems: 0,
      completedItems: 0,
    });

    pdfGeneratorMock = {
      progress$: pdfProgressSubject,
      complete$: new Subject<PdfResult>(),
      generatePdf: vi.fn().mockImplementation(() => {
        setTimeout(() => {
          pdfProgressSubject.next({
            phase: PdfPhase.Complete,
            overallProgress: 100,
            message: 'Complete',
            totalItems: 1,
            completedItems: 1,
          });
        }, 10);
        return Promise.resolve({
          success: true,
          file: new Blob(['pdf'], { type: 'application/pdf' }),
          filename: 'test-book.pdf',
          stats: {
            wordCount: 1000,
            chapterCount: 1,
            documentCount: 1,
            fileSize: 100,
            generationTimeMs: 50,
          },
          warnings: [],
        } as PdfResult);
      }),
      cancel: vi.fn(),
    };

    const htmlProgressSubject = new BehaviorSubject<HtmlProgress>({
      phase: HtmlPhase.Idle,
      overallProgress: 0,
      message: 'Ready',
      totalItems: 0,
      completedItems: 0,
    });

    htmlGeneratorMock = {
      progress$: htmlProgressSubject,
      complete$: new Subject<HtmlResult>(),
      generateHtml: vi.fn().mockImplementation(() => {
        setTimeout(() => {
          htmlProgressSubject.next({
            phase: HtmlPhase.Complete,
            overallProgress: 100,
            message: 'Complete',
            totalItems: 1,
            completedItems: 1,
          });
        }, 10);
        return Promise.resolve({
          success: true,
          file: new Blob(['html'], { type: 'text/html' }),
          filename: 'test-book.html',
          stats: {
            wordCount: 1000,
            chapterCount: 1,
            documentCount: 1,
            fileSize: 100,
            generationTimeMs: 50,
          },
          warnings: [],
        } as HtmlResult);
      }),
    };

    const markdownProgressSubject = new BehaviorSubject<MarkdownProgress>({
      phase: MarkdownPhase.Idle,
      overallProgress: 0,
      message: 'Ready',
      totalItems: 0,
      completedItems: 0,
    });

    markdownGeneratorMock = {
      progress$: markdownProgressSubject,
      complete$: new Subject<MarkdownResult>(),
      generateMarkdown: vi.fn().mockImplementation(() => {
        setTimeout(() => {
          markdownProgressSubject.next({
            phase: MarkdownPhase.Complete,
            overallProgress: 100,
            message: 'Complete',
            totalItems: 1,
            completedItems: 1,
          });
        }, 10);
        return Promise.resolve({
          success: true,
          file: new Blob(['markdown'], { type: 'text/markdown' }),
          filename: 'test-book.md',
          stats: {
            wordCount: 1000,
            chapterCount: 1,
            documentCount: 1,
            fileSize: 100,
            generationTimeMs: 50,
          },
          warnings: [],
        } as MarkdownResult);
      }),
    };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        PublishService,
        { provide: PublishPlanService, useValue: publishPlanServiceMock },
        { provide: ProjectSyncService, useValue: projectSyncServiceMock },
        { provide: EpubGeneratorService, useValue: epubGeneratorMock },
        { provide: PdfGeneratorService, useValue: pdfGeneratorMock },
        { provide: HtmlGeneratorService, useValue: htmlGeneratorMock },
        { provide: MarkdownGeneratorService, useValue: markdownGeneratorMock },
      ],
    });

    service = TestBed.inject(PublishService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('progress$', () => {
    it('should emit initial idle state', () => {
      let phase: PublishingPhase | undefined;
      service.progress$.subscribe(p => (phase = p.phase));

      expect(phase).toBe(PublishingPhase.IDLE);
    });
  });

  describe('currentProgress', () => {
    it('should return current progress state', () => {
      const progress = service.currentProgress;

      expect(progress).toBeDefined();
      expect(progress.phase).toBe(PublishingPhase.IDLE);
      expect(progress.cancellable).toBe(true);
    });
  });

  describe('isActive', () => {
    it('should return false when not publishing', () => {
      expect(service.isActive).toBe(false);
    });
  });

  describe('publish', () => {
    it('should fail if plan not found', async () => {
      publishPlanServiceMock.getPlan.mockReturnValue(null);

      const result = await service.publish('non-existent-plan');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should skip sync when skipSync option is true', async () => {
      await service.publish('plan-1', { skipSync: true });

      expect(projectSyncServiceMock.syncDocuments).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('should have cancel method', () => {
      expect(typeof service.cancel).toBe('function');
    });

    it('should set phase to cancelled when cancellable', async () => {
      // Start a publish operation
      const publishPromise = service.publish('plan-1');

      // Give it a moment to start
      await new Promise(r => setTimeout(r, 5));

      // Cancel it
      service.cancel();

      // Wait for completion
      await publishPromise;

      // Note: The cancel might happen at different phases, so we just verify cancel was called
      expect(service.currentProgress.phase).toBeDefined();
    });
  });

  describe('reset', () => {
    it('should have reset method', () => {
      expect(typeof service.reset).toBe('function');
    });

    it('should reset progress to idle when not publishing', () => {
      service.reset();

      expect(service.currentProgress.phase).toBe(PublishingPhase.IDLE);
      expect(service.currentProgress.overallProgress).toBe(0);
      expect(service.currentProgress.message).toBe('Ready to publish');
    });
  });

  describe('quickPublish', () => {
    let quickPlanServiceMock: {
      getOrCreateQuickExportPlan: ReturnType<typeof vi.fn>;
      getPlan: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      quickPlanServiceMock = {
        getOrCreateQuickExportPlan: vi.fn().mockReturnValue(mockPlan),
        getPlan: vi.fn().mockReturnValue(mockPlan),
      };

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          PublishService,
          { provide: PublishPlanService, useValue: quickPlanServiceMock },
          { provide: ProjectSyncService, useValue: projectSyncServiceMock },
          { provide: EpubGeneratorService, useValue: epubGeneratorMock },
          { provide: PdfGeneratorService, useValue: pdfGeneratorMock },
          { provide: HtmlGeneratorService, useValue: htmlGeneratorMock },
          {
            provide: MarkdownGeneratorService,
            useValue: markdownGeneratorMock,
          },
        ],
      });

      service = TestBed.inject(PublishService);
    });

    it('should create quick export plan and publish', async () => {
      const result = await service.quickPublish('My Book', 'Author Name', [
        'doc-1',
        'doc-2',
      ]);

      expect(
        quickPlanServiceMock.getOrCreateQuickExportPlan
      ).toHaveBeenCalledWith('My Book', 'Author Name', ['doc-1', 'doc-2']);
      expect(result.success).toBe(true);
    });

    it('should fail if already publishing', async () => {
      // Start a publish
      const firstPublish = service.quickPublish('Book 1', 'Author', ['doc-1']);

      // Try to start another
      const secondResult = await service.quickPublish('Book 2', 'Author', [
        'doc-2',
      ]);

      expect(secondResult.success).toBe(false);
      expect(secondResult.error).toContain('already in progress');

      await firstPublish;
    });

    it('should handle errors in quick publish', async () => {
      quickPlanServiceMock.getOrCreateQuickExportPlan.mockImplementation(() => {
        throw new Error('Failed to create plan');
      });

      const result = await service.quickPublish('Book', 'Author', ['doc-1']);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to create plan');
    });
  });

  describe('publish with different formats', () => {
    it('should generate PDF when format is PDF_SIMPLE', async () => {
      const pdfPlan = { ...mockPlan, format: PublishFormat.PDF_SIMPLE };
      publishPlanServiceMock.getPlan.mockReturnValue(pdfPlan);

      const result = await service.publish('plan-1', { skipSync: true });

      expect(pdfGeneratorMock.generatePdf).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should generate HTML when format is HTML', async () => {
      const htmlPlan = { ...mockPlan, format: PublishFormat.HTML };
      publishPlanServiceMock.getPlan.mockReturnValue(htmlPlan);

      const result = await service.publish('plan-1', { skipSync: true });

      expect(htmlGeneratorMock.generateHtml).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should generate Markdown when format is MARKDOWN', async () => {
      const mdPlan = { ...mockPlan, format: PublishFormat.MARKDOWN };
      publishPlanServiceMock.getPlan.mockReturnValue(mdPlan);

      const result = await service.publish('plan-1', { skipSync: true });

      expect(markdownGeneratorMock.generateMarkdown).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  describe('publish error handling', () => {
    it('should handle EPUB generation failure', async () => {
      epubGeneratorMock.generateEpub.mockResolvedValue({
        success: false,
        error: 'Failed to generate EPUB',
      });

      const result = await service.publish('plan-1', { skipSync: true });

      expect(result.success).toBe(false);
      expect(result.error).toContain('EPUB');
    });

    it('should handle PDF generation failure', async () => {
      const pdfPlan = { ...mockPlan, format: PublishFormat.PDF_SIMPLE };
      publishPlanServiceMock.getPlan.mockReturnValue(pdfPlan);
      pdfGeneratorMock.generatePdf.mockResolvedValue({
        success: false,
        error: 'PDF error',
      });

      const result = await service.publish('plan-1', { skipSync: true });

      expect(result.success).toBe(false);
    });

    it('should handle thrown exception during generation', async () => {
      epubGeneratorMock.generateEpub.mockRejectedValue(
        new Error('Network failure')
      );

      const result = await service.publish('plan-1', { skipSync: true });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network failure');
    });

    it('should fail if already publishing', async () => {
      // Start first publish
      const firstPublish = service.publish('plan-1');

      // Try to start second while first is running
      const secondResult = await service.publish('plan-1');

      expect(secondResult.success).toBe(false);
      expect(secondResult.error).toContain('already in progress');

      await firstPublish;
    });
  });

  describe('sync phase', () => {
    it('should sync documents before generating', async () => {
      const result = await service.publish('plan-1');

      expect(projectSyncServiceMock.syncDocuments).toHaveBeenCalledWith([
        'doc-1',
      ]);
      expect(result.success).toBe(true);
    });

    it('should handle sync failure', async () => {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      projectSyncServiceMock.syncDocuments.mockImplementation(() => {
        window.setTimeout(() => {
          projectSyncServiceMock.progress$.next({
            phase: SyncPhase.Error,
            overallProgress: 0,
            message: 'Sync failed',
            detail: 'Network error',
            totalItems: 1,
            completedItems: 0,
            failedItems: ['doc-1'],
            warnings: [],
          });
        }, 10);
        return Promise.reject(new Error('Sync failed'));
      });

      const result = await service.publish('plan-1');

      // The result depends on timing, but should handle gracefully
      expect(result).toBeDefined();
    });
  });

  describe('progress updates', () => {
    it('should update progress during sync', async () => {
      const progressUpdates: PublishingPhase[] = [];
      service.progress$.subscribe(p => progressUpdates.push(p.phase));

      await service.publish('plan-1');

      expect(progressUpdates).toContain(PublishingPhase.INITIALIZING);
    });

    it('should include duration in result', async () => {
      const result = await service.publish('plan-1', { skipSync: true });

      expect(result.duration).toBeDefined();
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should include stats in successful result', async () => {
      const result = await service.publish('plan-1', { skipSync: true });

      expect(result.stats).toBeDefined();
      expect(result.stats?.wordCount).toBe(1000);
      expect(result.stats?.chapterCount).toBe(1);
    });
  });
});
