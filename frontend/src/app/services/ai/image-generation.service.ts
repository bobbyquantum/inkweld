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

      this.updateJob(jobId, {
        status: 'saving',
        message: 'Saving to media library...',
        images: response.data,
        response,
      });

      // Save all generated images to IndexedDB
      const savedMediaIds = await this.saveGeneratedImages(job, response);

      // If this is a cover generation, upload the first image as the project cover
      if (job.forCover && response.data.length > 0) {
        this.updateJob(jobId, {
          status: 'saving',
          message: 'Setting as project cover...',
        });
        await this.uploadAsCover(job, response.data[0]);
      }

      this.updateJob(jobId, {
        status: 'completed',
        message: job.forCover
          ? 'Cover image generated and set!'
          : `Generated ${response.data.length} image${response.data.length > 1 ? 's' : ''}`,
        savedMediaIds,
      });
    } catch (err) {
      console.error('Generation failed:', err);
      const errorMessage =
        err instanceof Error ? err.message : 'Generation failed';
      this.updateJob(jobId, {
        status: 'failed',
        message: 'Generation failed',
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
   * Upload a generated image as the project cover
   */
  private async uploadAsCover(
    job: GenerationJob,
    image: GeneratedImage
  ): Promise<void> {
    // Parse username and slug from projectKey
    const [username, slug] = job.projectKey.split('/');
    if (!username || !slug) {
      console.error('Invalid projectKey for cover upload:', job.projectKey);
      return;
    }

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
        console.error('Image has no data for cover upload');
        return;
      }

      // Create a File from the blob
      const file = new File([blob], 'generated-cover.png', {
        type: 'image/png',
      });

      // Upload as project cover
      await this.projectService.uploadProjectCover(username, slug, file);
      console.log('Cover image uploaded successfully for', job.projectKey);
    } catch (err) {
      console.error('Failed to upload cover image:', err);
      // Don't throw - the images are still saved to the library
    }
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
