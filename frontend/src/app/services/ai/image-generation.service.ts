import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AIImageGenerationService } from '../../../api-client/api/ai-image-generation.service';
import {
  GeneratedImage,
  ImageGenerateRequest,
  ImageGenerateResponse,
} from '../../../api-client/model/models';
import {
  GenerationMetadata,
  LocalStorageService,
} from '../local/local-storage.service';
import { ProjectService } from '../project/project.service';

/**
 * Status of an image generation job
 */
export type GenerationJobStatus =
  | 'pending'
  | 'generating'
  | 'saving'
  | 'completed'
  | 'failed';

/**
 * Represents an active or completed image generation job
 */
export interface GenerationJob {
  /** Unique job ID */
  id: string;
  /** Project key (username/slug) */
  projectKey: string;
  /** The generation request */
  request: ImageGenerateRequest;
  /** Current status */
  status: GenerationJobStatus;
  /** Progress message */
  message: string;
  /** Generated images (available after completion) */
  images: GeneratedImage[];
  /** API response (available after completion) */
  response?: ImageGenerateResponse;
  /** Error message if failed */
  error?: string;
  /** Timestamp when job was created */
  createdAt: Date;
  /** Media IDs of saved images (after saving to IndexedDB) */
  savedMediaIds: string[];
  /** Whether this is a cover generation - will auto-set as project cover */
  forCover?: boolean;
}

/**
 * Options for starting a generation job
 */
export interface StartGenerationOptions {
  /** Whether this is for a project cover - will auto-upload first image as cover */
  forCover?: boolean;
}

/**
 * Service for managing image generation jobs that can run in the background.
 * Jobs persist even if the generation dialog is closed, and results are
 * automatically saved to the media library.
 */
@Injectable({
  providedIn: 'root',
})
export class ImageGenerationService {
  private readonly aiImageService = inject(AIImageGenerationService);
  private readonly localStorage = inject(LocalStorageService);
  private readonly projectService = inject(ProjectService);

  /** All active and recent generation jobs */
  readonly jobs = signal<GenerationJob[]>([]);

  /** Jobs that are currently in progress */
  readonly activeJobs = signal<GenerationJob[]>([]);

  /**
   * Start a new image generation job.
   * The job runs in the background and saves results to the media library.
   *
   * @param projectKey - Project key (username/slug)
   * @param request - Generation request parameters
   * @param options - Additional options (e.g., forCover)
   * @returns The job ID
   */
  startGeneration(
    projectKey: string,
    request: ImageGenerateRequest,
    options?: StartGenerationOptions
  ): string {
    const jobId = `gen-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const job: GenerationJob = {
      id: jobId,
      projectKey,
      request,
      status: 'pending',
      message: options?.forCover
        ? 'Starting cover generation...'
        : 'Starting generation...',
      images: [],
      createdAt: new Date(),
      savedMediaIds: [],
      forCover: options?.forCover,
    };

    // Add to jobs list
    this.jobs.update(jobs => [job, ...jobs]);
    this.updateActiveJobs();

    // Start generation in background (don't await)
    void this.runGeneration(jobId);

    return jobId;
  }

  /**
   * Get a specific job by ID
   */
  getJob(jobId: string): GenerationJob | undefined {
    return this.jobs().find(j => j.id === jobId);
  }

  /**
   * Get all jobs for a specific project
   */
  getProjectJobs(projectKey: string): GenerationJob[] {
    return this.jobs().filter(j => j.projectKey === projectKey);
  }

  /**
   * Clear completed/failed jobs from the list
   */
  clearCompletedJobs(): void {
    this.jobs.update(jobs =>
      jobs.filter(
        j =>
          j.status === 'pending' ||
          j.status === 'generating' ||
          j.status === 'saving'
      )
    );
    this.updateActiveJobs();
  }

  /**
   * Remove a specific job from the list (only if not in progress)
   */
  removeJob(jobId: string): boolean {
    const job = this.getJob(jobId);
    if (!job) return false;
    if (job.status === 'generating' || job.status === 'saving') return false;

    this.jobs.update(jobs => jobs.filter(j => j.id !== jobId));
    this.updateActiveJobs();
    return true;
  }

  /**
   * Run the generation process for a job
   */
  private async runGeneration(jobId: string): Promise<void> {
    this.updateJob(jobId, {
      status: 'generating',
      message: 'Generating images...',
    });

    try {
      const job = this.getJob(jobId);
      if (!job) return;

      // Call the API
      const response = await firstValueFrom(
        this.aiImageService.generateImage(job.request)
      );

      // Check if the model returned text instead of images
      // This happens when the model refuses or explains why it can't generate
      if (response.data.length === 0 && response.textContent) {
        // Determine if this is a refusal or just an explanation
        const lowerContent = response.textContent.toLowerCase();
        const isRefusal =
          lowerContent.includes('cannot') ||
          lowerContent.includes("can't") ||
          lowerContent.includes('unable') ||
          lowerContent.includes('sorry') ||
          lowerContent.includes('policy') ||
          lowerContent.includes('inappropriate') ||
          lowerContent.includes('violat');

        const errorMessage = isRefusal
          ? `Image generation was refused: ${response.textContent}`
          : `The model returned text instead of an image: ${response.textContent}`;

        this.updateJob(jobId, {
          status: 'failed',
          message: 'Generation failed',
          error: errorMessage,
          response, // Still include the response for debugging
        });
        this.updateActiveJobs();
        return;
      }

      this.updateJob(jobId, {
        status: 'saving',
        message: 'Saving to media library...',
        images: response.data,
        response,
      });

      // Save all generated images to IndexedDB
      const savedMediaIds = await this.saveGeneratedImages(job, response);

      // Note: For cover generation (forCover: true), the image is saved to
      // the media library, but we do NOT auto-set it as the project cover.
      // The user should crop the image first via the cropper in the
      // edit-project-dialog. The cropped version becomes the actual cover.

      this.updateJob(jobId, {
        status: 'completed',
        message: job.forCover
          ? 'Image saved to library. Crop to set as cover.'
          : `Generated ${response.data.length} image${response.data.length > 1 ? 's' : ''}`,
        savedMediaIds,
      });
    } catch (err) {
      console.error('Generation failed:', err);

      // Extract error message from various error formats
      let errorMessage = 'Generation failed';
      if (err instanceof Error) {
        errorMessage = err.message;
      }
      // Handle Angular HttpErrorResponse (from API calls)
      // HttpErrorResponse has an `error` property that can be an object or string
      if (
        err !== null &&
        typeof err === 'object' &&
        'error' in err &&
        err.error !== null
      ) {
        const errorBody = err.error as Record<string, unknown>;
        if (typeof errorBody === 'object') {
          if (typeof errorBody['error'] === 'string') {
            // API returns { error: "message" }
            errorMessage = errorBody['error'];
          } else if (typeof errorBody['message'] === 'string') {
            // API returns { message: "message" }
            errorMessage = errorBody['message'];
          }
        } else if (typeof errorBody === 'string') {
          // API returns plain string error
          errorMessage = errorBody;
        }
      }

      // Check for moderation block (special prefix from backend)
      const isModerationBlock = errorMessage.includes('MODERATION_BLOCKED:');
      if (isModerationBlock) {
        // Strip the prefix for display
        errorMessage = errorMessage.replace('MODERATION_BLOCKED:', '').trim();
      }

      this.updateJob(jobId, {
        status: 'failed',
        message: isModerationBlock ? 'Content blocked' : 'Generation failed',
        error: errorMessage,
      });
    }

    this.updateActiveJobs();
  }

  /**
   * Save generated images to IndexedDB with metadata
   */
  private async saveGeneratedImages(
    job: GenerationJob,
    response: ImageGenerateResponse
  ): Promise<string[]> {
    const savedMediaIds: string[] = [];
    const generatedAt = new Date().toISOString();

    for (let i = 0; i < response.data.length; i++) {
      const image = response.data[i];
      try {
        // Convert image to blob
        let blob: Blob;
        if (image.b64Json) {
          const binaryString = atob(image.b64Json);
          const bytes = new Uint8Array(binaryString.length);
          for (let j = 0; j < binaryString.length; j++) {
            bytes[j] = binaryString.charCodeAt(j);
          }
          blob = new Blob([bytes], { type: 'image/png' });
        } else if (image.url) {
          const fetchResponse = await fetch(image.url);
          blob = await fetchResponse.blob();
        } else {
          console.warn(`Image ${i} has no data, skipping`);
          continue;
        }

        // Generate unique ID
        const timestamp = Date.now();
        const mediaId = `generated-${timestamp}-${i}`;

        // Build generation metadata
        const generation: GenerationMetadata = {
          prompt: job.request.prompt,
          model: response.model,
          provider: response.provider,
          size: job.request.size || '1024x1024',
          generatedAt,
        };

        // Save to IndexedDB
        await this.localStorage.saveMedia(
          job.projectKey,
          mediaId,
          blob,
          `ai-generated-${timestamp}-${i}.png`,
          generation
        );

        savedMediaIds.push(mediaId);
      } catch (err) {
        console.error(`Failed to save image ${i}:`, err);
      }
    }

    return savedMediaIds;
  }

  /**
   * Update a job's properties
   */
  private updateJob(jobId: string, updates: Partial<GenerationJob>): void {
    this.jobs.update(jobs =>
      jobs.map(j => (j.id === jobId ? { ...j, ...updates } : j))
    );
  }

  /**
   * Update the active jobs signal
   */
  private updateActiveJobs(): void {
    this.activeJobs.set(
      this.jobs().filter(
        j =>
          j.status === 'pending' ||
          j.status === 'generating' ||
          j.status === 'saving'
      )
    );
  }
}
