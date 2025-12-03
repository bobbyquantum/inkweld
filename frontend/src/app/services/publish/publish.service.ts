/**
 * PublishService - Main orchestration service for publishing projects
 *
 * This service coordinates the full publishing workflow:
 * 1. Sync verification - ensure all documents are available locally
 * 2. Content generation - create the output file (EPUB, etc.)
 * 3. Download - provide the final file to the user
 *
 * Provides unified progress tracking across all phases with detailed
 * status updates for user feedback.
 */

import { inject, Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject, take, takeUntil } from 'rxjs';

import {
  PublishFormat,
  type PublishPlan,
  PublishPlanItemType,
  type PublishResult,
  type PublishStats,
} from '../../models/publish-plan';
import { EpubGeneratorService, EpubPhase } from './epub-generator.service';
import { HtmlGeneratorService, HtmlPhase } from './html-generator.service';
import {
  MarkdownGeneratorService,
  MarkdownPhase,
} from './markdown-generator.service';
import { PdfGeneratorService, PdfPhase } from './pdf-generator.service';
import { ProjectSyncService, SyncPhase } from './project-sync.service';
import { PublishPlanService } from './publish-plan.service';

/**
 * Overall publishing phase
 */
export enum PublishingPhase {
  IDLE = 'idle',
  INITIALIZING = 'initializing',
  SYNCING = 'syncing',
  GENERATING = 'generating',
  FINALIZING = 'finalizing',
  COMPLETE = 'complete',
  ERROR = 'error',
  CANCELLED = 'cancelled',
}

/**
 * Unified progress for the entire publishing workflow
 */
export interface PublishingProgress {
  /** Current high-level phase */
  phase: PublishingPhase;

  /** Overall progress 0-100 */
  overallProgress: number;

  /** Human-readable status message */
  message: string;

  /** Optional detailed status */
  detail?: string;

  /** Current sub-phase details */
  subPhase?: {
    type: 'sync' | 'generate';
    phase: string; // SyncPhase, EpubPhase, PdfPhase, HtmlPhase, or MarkdownPhase
    progress: number;
    totalItems?: number;
    completedItems?: number;
    currentItem?: string;
  };

  /** Any errors that occurred */
  error?: string;

  /** Can the operation be cancelled? */
  cancellable: boolean;
}

/**
 * Options for the publish operation
 */
export interface PublishOptions {
  /** Skip sync verification (use with caution) */
  skipSync?: boolean;

  /** Force regeneration even if cached version exists */
  forceRegenerate?: boolean;

  /** Custom filename for the output (without extension) */
  filename?: string;
}

/**
 * Result of a publish operation
 */
export interface PublishingResult {
  /** Whether the operation succeeded */
  success: boolean;

  /** The result data if successful */
  result?: PublishResult;

  /** Error message if failed */
  error?: string;

  /** Was the operation cancelled? */
  cancelled?: boolean;

  /** Statistics about the publish operation */
  stats?: PublishStats;

  /** Duration in milliseconds */
  duration?: number;
}

@Injectable({
  providedIn: 'root',
})
export class PublishService {
  private readonly publishPlanService = inject(PublishPlanService);
  private readonly projectSyncService = inject(ProjectSyncService);
  private readonly epubGenerator = inject(EpubGeneratorService);
  private readonly pdfGenerator = inject(PdfGeneratorService);
  private readonly htmlGenerator = inject(HtmlGeneratorService);
  private readonly markdownGenerator = inject(MarkdownGeneratorService);

  // Progress tracking
  private readonly _progress$ = new BehaviorSubject<PublishingProgress>({
    phase: PublishingPhase.IDLE,
    overallProgress: 0,
    message: 'Ready to publish',
    cancellable: true,
  });

  /** Observable of publishing progress */
  readonly progress$ = this._progress$.asObservable();

  // Cancellation
  private readonly _cancel$ = new Subject<void>();
  private isPublishing = false;

  /**
   * Get current progress state
   */
  get currentProgress(): PublishingProgress {
    return this._progress$.value;
  }

  /**
   * Check if publishing is in progress
   */
  get isActive(): boolean {
    return this.isPublishing;
  }

  /**
   * Publish a project using the specified plan
   *
   * This is the main entry point for publishing. It:
   * 1. Loads the plan configuration
   * 2. Syncs all required documents
   * 3. Generates the output file
   * 4. Triggers the download
   *
   * @param planId - The ID of the publish plan to use
   * @param options - Optional configuration
   * @returns Result of the publishing operation
   */
  async publish(
    planId: string,
    options: PublishOptions = {}
  ): Promise<PublishingResult> {
    if (this.isPublishing) {
      return {
        success: false,
        error: 'Another publish operation is already in progress',
      };
    }

    const startTime = Date.now();
    this.isPublishing = true;

    try {
      // Initialize
      this.updateProgress({
        phase: PublishingPhase.INITIALIZING,
        overallProgress: 0,
        message: 'Loading publish plan...',
        cancellable: true,
      });

      // Load the plan
      const plan = this.publishPlanService.getPlan(planId);
      if (!plan) {
        throw new Error(`Publish plan not found: ${planId}`);
      }

      // Execute the publishing workflow
      const result = await this.executePublishWorkflow(plan, options);

      const duration = Date.now() - startTime;

      if (result.success && result.result) {
        // Trigger download
        this.updateProgress({
          phase: PublishingPhase.FINALIZING,
          overallProgress: 98,
          message: 'Preparing download...',
          cancellable: false,
        });

        this.triggerDownload(result.result, plan, options.filename);

        this.updateProgress({
          phase: PublishingPhase.COMPLETE,
          overallProgress: 100,
          message: 'Published successfully!',
          cancellable: false,
        });

        return {
          success: true,
          result: result.result,
          stats: result.stats,
          duration,
        };
      }

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      this.updateProgress({
        phase: PublishingPhase.ERROR,
        overallProgress: 0,
        message: 'Publishing failed',
        error: errorMessage,
        cancellable: false,
      });

      return {
        success: false,
        error: errorMessage,
        duration: Date.now() - startTime,
      };
    } finally {
      this.isPublishing = false;
    }
  }

  /**
   * Quick publish - uses or creates a quick export plan for all elements
   *
   * @param projectTitle - The project title for metadata
   * @param authorName - The author name for metadata
   * @param elementIds - Element IDs to include in export
   * @param options - Optional configuration
   * @returns Result of the publishing operation
   */
  async quickPublish(
    projectTitle: string,
    authorName: string,
    elementIds: string[],
    options: PublishOptions = {}
  ): Promise<PublishingResult> {
    if (this.isPublishing) {
      return {
        success: false,
        error: 'Another publish operation is already in progress',
      };
    }

    try {
      this.updateProgress({
        phase: PublishingPhase.INITIALIZING,
        overallProgress: 0,
        message: 'Preparing quick export...',
        cancellable: true,
      });

      // Get or create a quick export plan
      const plan = this.publishPlanService.getOrCreateQuickExportPlan(
        projectTitle,
        authorName,
        elementIds
      );

      // Delegate to main publish method
      return this.publish(plan.id, options);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      this.updateProgress({
        phase: PublishingPhase.ERROR,
        overallProgress: 0,
        message: 'Quick publish failed',
        error: errorMessage,
        cancellable: false,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Cancel the current publishing operation
   */
  cancel(): void {
    if (this.isPublishing && this._progress$.value.cancellable) {
      this._cancel$.next();
      this.updateProgress({
        phase: PublishingPhase.CANCELLED,
        overallProgress: 0,
        message: 'Publishing cancelled',
        cancellable: false,
      });
    }
  }

  /**
   * Reset progress to idle state
   */
  reset(): void {
    if (!this.isPublishing) {
      this.updateProgress({
        phase: PublishingPhase.IDLE,
        overallProgress: 0,
        message: 'Ready to publish',
        cancellable: true,
      });
    }
  }

  /**
   * Execute the full publishing workflow
   */
  private async executePublishWorkflow(
    plan: PublishPlan,
    options: PublishOptions
  ): Promise<PublishingResult> {
    const cancelled$ = this._cancel$.pipe(take(1));
    let wasCancelled = false;

    // Set up cancellation listener
    cancelled$.subscribe(() => {
      wasCancelled = true;
    });

    // Phase 1: Sync documents (unless skipped)
    if (!options.skipSync) {
      const syncResult = await this.executeSyncPhase(plan, cancelled$);
      if (!syncResult.success) {
        return syncResult;
      }
      if (wasCancelled) {
        return { success: false, cancelled: true };
      }
    }

    // Phase 2: Generate output
    const generateResult = await this.executeGeneratePhase(plan, cancelled$);
    if (wasCancelled) {
      return { success: false, cancelled: true };
    }

    return generateResult;
  }

  /**
   * Execute the sync phase
   */
  private executeSyncPhase(
    plan: PublishPlan,
    cancelled$: Observable<void>
  ): Promise<PublishingResult> {
    return new Promise(resolve => {
      this.updateProgress({
        phase: PublishingPhase.SYNCING,
        overallProgress: 5,
        message: 'Syncing documents...',
        cancellable: true,
        subPhase: {
          type: 'sync',
          phase: SyncPhase.Idle,
          progress: 0,
        },
      });

      // Extract element IDs from the plan
      const elementIds = plan.items
        .filter(item => item.type === PublishPlanItemType.Element)
        .map(item => {
          const elementItem = item as { elementId: string };
          return elementItem.elementId;
        });

      // Start sync
      void this.projectSyncService.syncDocuments(elementIds);

      // Monitor progress
      const progressSub = this.projectSyncService.progress$
        .pipe(takeUntil(cancelled$))
        .subscribe(syncProgress => {
          // Map sync progress to overall progress (5-45%)
          const syncOverall = 5 + syncProgress.overallProgress * 0.4;

          this.updateProgress({
            phase: PublishingPhase.SYNCING,
            overallProgress: syncOverall,
            message: syncProgress.message,
            detail: syncProgress.detail,
            cancellable: syncProgress.phase !== SyncPhase.Complete,
            subPhase: {
              type: 'sync',
              phase: syncProgress.phase,
              progress: syncProgress.overallProgress,
              totalItems: syncProgress.totalItems,
              completedItems: syncProgress.completedItems,
            },
          });

          // Check for completion
          if (syncProgress.phase === SyncPhase.Complete) {
            progressSub.unsubscribe();
            resolve({ success: true });
          } else if (syncProgress.phase === SyncPhase.Error) {
            progressSub.unsubscribe();
            resolve({
              success: false,
              error: syncProgress.detail || 'Sync failed',
            });
          }
        });

      // Handle cancellation
      cancelled$.subscribe(() => {
        progressSub.unsubscribe();
        resolve({ success: false, cancelled: true });
      });
    });
  }

  /**
   * Execute the generate phase
   */
  private executeGeneratePhase(
    plan: PublishPlan,
    cancelled$: Observable<void>
  ): Promise<PublishingResult> {
    return new Promise(resolve => {
      this.updateProgress({
        phase: PublishingPhase.GENERATING,
        overallProgress: 45,
        message: 'Generating output...',
        cancellable: true,
        subPhase: {
          type: 'generate',
          phase: EpubPhase.Initializing,
          progress: 0,
        },
      });

      // Start generation based on format
      switch (plan.format) {
        case PublishFormat.EPUB:
          this.generateEpub(plan, cancelled$, resolve);
          break;
        case PublishFormat.PDF_SIMPLE:
          this.generatePdf(plan, cancelled$, resolve);
          break;
        case PublishFormat.HTML:
          this.generateHtml(plan, cancelled$, resolve);
          break;
        case PublishFormat.MARKDOWN:
          this.generateMarkdown(plan, cancelled$, resolve);
          break;
        default: {
          const unsupportedFormat: string = plan.format;
          resolve({
            success: false,
            error: `Unsupported format: ${unsupportedFormat}`,
          });
        }
      }
    });
  }

  /**
   * Generate EPUB output
   */
  private generateEpub(
    plan: PublishPlan,
    cancelled$: Observable<void>,
    resolve: (result: PublishingResult) => void
  ): void {
    // Monitor progress
    const progressSub = this.epubGenerator.progress$
      .pipe(takeUntil(cancelled$))
      .subscribe(epubProgress => {
        // Map epub progress to overall progress (45-95%)
        const epubOverall = 45 + epubProgress.overallProgress * 0.5;

        this.updateProgress({
          phase: PublishingPhase.GENERATING,
          overallProgress: epubOverall,
          message: epubProgress.message,
          detail: epubProgress.detail,
          cancellable: epubProgress.phase !== EpubPhase.Complete,
          subPhase: {
            type: 'generate',
            phase: epubProgress.phase,
            progress: epubProgress.overallProgress,
            totalItems: epubProgress.totalItems,
            completedItems: epubProgress.completedItems,
            currentItem: epubProgress.currentItem,
          },
        });

        if (epubProgress.phase === EpubPhase.Complete) {
          progressSub.unsubscribe();
        } else if (epubProgress.phase === EpubPhase.Error) {
          progressSub.unsubscribe();
          resolve({
            success: false,
            error: epubProgress.detail || 'Generation failed',
          });
        }
      });

    // Start generation
    this.epubGenerator
      .generateEpub(plan)
      .then(epubResult => {
        progressSub.unsubscribe();

        if (epubResult.success && epubResult.file) {
          resolve({
            success: true,
            result: {
              success: true,
              file: epubResult.file,
              filename: epubResult.filename || 'book.epub',
              mimeType: 'application/epub+zip',
              warnings: epubResult.warnings || [],
              stats: epubResult.stats,
            },
            stats: epubResult.stats,
          });
        } else {
          resolve({
            success: false,
            error: epubResult.error || 'EPUB generation failed',
          });
        }
      })
      .catch(error => {
        progressSub.unsubscribe();
        resolve({
          success: false,
          error:
            error instanceof Error ? error.message : 'EPUB generation failed',
        });
      });

    // Handle cancellation
    cancelled$.subscribe(() => {
      progressSub.unsubscribe();
      resolve({ success: false, cancelled: true });
    });
  }

  /**
   * Generate PDF output
   */
  private generatePdf(
    plan: PublishPlan,
    cancelled$: Observable<void>,
    resolve: (result: PublishingResult) => void
  ): void {
    // Monitor progress
    const progressSub = this.pdfGenerator.progress$
      .pipe(takeUntil(cancelled$))
      .subscribe(pdfProgress => {
        const pdfOverall = 45 + pdfProgress.overallProgress * 0.5;

        this.updateProgress({
          phase: PublishingPhase.GENERATING,
          overallProgress: pdfOverall,
          message: pdfProgress.message,
          detail: pdfProgress.detail,
          cancellable: pdfProgress.phase !== PdfPhase.Complete,
          subPhase: {
            type: 'generate',
            phase: pdfProgress.phase,
            progress: pdfProgress.overallProgress,
            totalItems: pdfProgress.totalItems,
            completedItems: pdfProgress.completedItems,
            currentItem: pdfProgress.currentItem,
          },
        });

        if (
          pdfProgress.phase === PdfPhase.Complete ||
          pdfProgress.phase === PdfPhase.Error
        ) {
          progressSub.unsubscribe();
        }
      });

    // Start generation
    this.pdfGenerator
      .generatePdf(plan)
      .then(pdfResult => {
        progressSub.unsubscribe();

        if (pdfResult.success && pdfResult.file) {
          resolve({
            success: true,
            result: {
              success: true,
              file: pdfResult.file,
              filename: pdfResult.filename || 'book.pdf',
              mimeType: 'application/pdf',
              warnings: pdfResult.warnings || [],
              stats: pdfResult.stats,
            },
            stats: pdfResult.stats,
          });
        } else {
          resolve({
            success: false,
            error: pdfResult.error || 'PDF generation failed',
          });
        }
      })
      .catch(error => {
        progressSub.unsubscribe();
        resolve({
          success: false,
          error:
            error instanceof Error ? error.message : 'PDF generation failed',
        });
      });

    // Handle cancellation
    cancelled$.subscribe(() => {
      progressSub.unsubscribe();
      this.pdfGenerator.cancel();
      resolve({ success: false, cancelled: true });
    });
  }

  /**
   * Generate HTML output
   */
  private generateHtml(
    plan: PublishPlan,
    cancelled$: Observable<void>,
    resolve: (result: PublishingResult) => void
  ): void {
    // Monitor progress
    const progressSub = this.htmlGenerator.progress$
      .pipe(takeUntil(cancelled$))
      .subscribe(htmlProgress => {
        const htmlOverall = 45 + htmlProgress.overallProgress * 0.5;

        this.updateProgress({
          phase: PublishingPhase.GENERATING,
          overallProgress: htmlOverall,
          message: htmlProgress.message,
          cancellable: htmlProgress.phase !== HtmlPhase.Complete,
          subPhase: {
            type: 'generate',
            phase: htmlProgress.phase,
            progress: htmlProgress.overallProgress,
            totalItems: htmlProgress.totalItems,
            completedItems: htmlProgress.completedItems,
          },
        });

        if (
          htmlProgress.phase === HtmlPhase.Complete ||
          htmlProgress.phase === HtmlPhase.Error
        ) {
          progressSub.unsubscribe();
        }
      });

    // Start generation
    this.htmlGenerator
      .generateHtml(plan)
      .then(htmlResult => {
        progressSub.unsubscribe();

        if (htmlResult.success && htmlResult.file) {
          resolve({
            success: true,
            result: {
              success: true,
              file: htmlResult.file,
              filename: htmlResult.filename || 'book.html',
              mimeType: 'text/html',
              warnings: htmlResult.warnings || [],
              stats: htmlResult.stats,
            },
            stats: htmlResult.stats,
          });
        } else {
          resolve({
            success: false,
            error: htmlResult.error || 'HTML generation failed',
          });
        }
      })
      .catch(error => {
        progressSub.unsubscribe();
        resolve({
          success: false,
          error:
            error instanceof Error ? error.message : 'HTML generation failed',
        });
      });

    // Handle cancellation
    cancelled$.subscribe(() => {
      progressSub.unsubscribe();
      resolve({ success: false, cancelled: true });
    });
  }

  /**
   * Generate Markdown output
   */
  private generateMarkdown(
    plan: PublishPlan,
    cancelled$: Observable<void>,
    resolve: (result: PublishingResult) => void
  ): void {
    // Monitor progress
    const progressSub = this.markdownGenerator.progress$
      .pipe(takeUntil(cancelled$))
      .subscribe(mdProgress => {
        const mdOverall = 45 + mdProgress.overallProgress * 0.5;

        this.updateProgress({
          phase: PublishingPhase.GENERATING,
          overallProgress: mdOverall,
          message: mdProgress.message,
          cancellable: mdProgress.phase !== MarkdownPhase.Complete,
          subPhase: {
            type: 'generate',
            phase: mdProgress.phase,
            progress: mdProgress.overallProgress,
            totalItems: mdProgress.totalItems,
            completedItems: mdProgress.completedItems,
          },
        });

        if (
          mdProgress.phase === MarkdownPhase.Complete ||
          mdProgress.phase === MarkdownPhase.Error
        ) {
          progressSub.unsubscribe();
        }
      });

    // Start generation
    this.markdownGenerator
      .generateMarkdown(plan)
      .then(mdResult => {
        progressSub.unsubscribe();

        if (mdResult.success && mdResult.file) {
          resolve({
            success: true,
            result: {
              success: true,
              file: mdResult.file,
              filename: mdResult.filename || 'book.md',
              mimeType: 'text/markdown',
              warnings: mdResult.warnings || [],
              stats: mdResult.stats,
            },
            stats: mdResult.stats,
          });
        } else {
          resolve({
            success: false,
            error: mdResult.error || 'Markdown generation failed',
          });
        }
      })
      .catch(error => {
        progressSub.unsubscribe();
        resolve({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : 'Markdown generation failed',
        });
      });

    // Handle cancellation
    cancelled$.subscribe(() => {
      progressSub.unsubscribe();
      resolve({ success: false, cancelled: true });
    });
  }

  /**
   * Trigger browser download for the generated file
   */
  private triggerDownload(
    result: PublishResult,
    plan: PublishPlan,
    customFilename?: string
  ): void {
    if (!result.file) {
      return;
    }

    const filename = customFilename
      ? customFilename
      : result.filename || this.generateFilename(plan);

    const url = URL.createObjectURL(result.file);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up after a short delay
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * Generate a filename for the output
   */
  private generateFilename(plan: PublishPlan): string {
    // Use plan name, sanitized for filesystem
    const baseName = plan.name
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '-');

    // Add timestamp for uniqueness if needed
    const timestamp = new Date().toISOString().split('T')[0];

    // Map format enum to file extension
    const ext = this.getFileExtension(plan.format);

    return `${baseName}-${timestamp}.${ext}`;
  }

  /**
   * Get file extension for a format
   */
  private getFileExtension(format: PublishFormat): string {
    const extensions: Record<PublishFormat, string> = {
      [PublishFormat.EPUB]: 'epub',
      [PublishFormat.PDF_SIMPLE]: 'pdf',
      [PublishFormat.HTML]: 'html',
      [PublishFormat.MARKDOWN]: 'md',
    };
    return extensions[format] || 'bin';
  }

  /**
   * Get MIME type for a format
   */
  private getMimeType(format: string): string {
    const mimeTypes: Record<string, string> = {
      epub: 'application/epub+zip',
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      html: 'text/html',
      markdown: 'text/markdown',
    };
    return mimeTypes[format] || 'application/octet-stream';
  }

  /**
   * Update progress state
   */
  private updateProgress(progress: PublishingProgress): void {
    this._progress$.next(progress);
  }
}
