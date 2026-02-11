import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AIImageGenerationService } from '../../../api-client/api/ai-image-generation.service';
import {
  GeneratedImage,
  ImageGenerateRequest,
  ImageGenerateResponse,
} from '../../../api-client/model/models';
import { environment } from '../../../environments/environment';
import { AuthTokenService } from '../auth/auth-token.service';
import { XsrfService } from '../auth/xsrf.service';
import {
  GenerationMetadata,
  LocalStorageService,
} from '../local/local-storage.service';
import { ProjectService } from '../project/project.service';

/**
 * SSE stream event shapes (matching backend ImageStreamEvent types)
 */
interface StreamPartialImageEvent {
  type: 'partial_image';
  b64Json: string;
  partialImageIndex: number;
}

interface StreamCompletedEvent {
  type: 'completed';
  result: ImageGenerateResponse;
}

interface StreamErrorEvent {
  type: 'error';
  error: string;
}

type StreamEvent =
  | StreamPartialImageEvent
  | StreamCompletedEvent
  | StreamErrorEvent;

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
  /**
   * Base64 data URI of the latest partial image during streaming generation.
   * Updated progressively as intermediate renders arrive from the provider.
   */
  partialImageUrl?: string;
  /** Whether this job is using streaming generation */
  isStreaming?: boolean;
}

/**
 * Options for starting a generation job
 */
export interface StartGenerationOptions {
  /** Whether this is for a project cover - will auto-upload first image as cover */
  forCover?: boolean;
  /** Provider type hint — used to choose streaming vs non-streaming path */
  providerType?: string;
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
  private readonly authTokenService = inject(AuthTokenService);
  private readonly xsrfService = inject(XsrfService);

  /** All active and recent generation jobs */
  readonly jobs = signal<GenerationJob[]>([]);

  /** Jobs that are currently in progress */
  readonly activeJobs = signal<GenerationJob[]>([]);

  /**
   * Providers that support streaming partial images.
   */
  private static readonly STREAMING_PROVIDERS = new Set(['openai']);

  /**
   * Start a new image generation job.
   * The job runs in the background and saves results to the media library.
   * For OpenAI provider, uses streaming to show partial image previews.
   *
   * @param projectKey - Project key (username/slug)
   * @param request - Generation request parameters
   * @param options - Additional options (e.g., forCover, provider hint)
   * @returns The job ID
   */
  startGeneration(
    projectKey: string,
    request: ImageGenerateRequest,
    options?: StartGenerationOptions
  ): string {
    const jobId = `gen-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Determine if this provider supports streaming
    const providerType = options?.providerType;
    const useStreaming =
      !!providerType &&
      ImageGenerationService.STREAMING_PROVIDERS.has(providerType);

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
      isStreaming: useStreaming,
    };

    // Add to jobs list
    this.jobs.update(jobs => [job, ...jobs]);
    this.updateActiveJobs();

    // Start generation in background (don't await)
    if (useStreaming) {
      void this.runStreamingGeneration(jobId);
    } else {
      void this.runGeneration(jobId);
    }

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
   * Run streaming generation using SSE (Server-Sent Events).
   * Shows partial images progressively as the provider generates them.
   */
  private async runStreamingGeneration(jobId: string): Promise<void> {
    this.updateJob(jobId, {
      status: 'generating',
      message: 'Generating image (streaming)...',
    });

    try {
      const job = this.getJob(jobId);
      if (!job) return;

      // Build request headers matching what the interceptors would add
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      };

      const token = this.authTokenService.getToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const csrfToken = this.xsrfService.getXsrfToken();
      if (csrfToken) {
        headers['X-CSRF-TOKEN'] = csrfToken;
      }

      const response = await fetch(
        `${environment.apiUrl}/api/v1/ai/image/generate-stream`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(job.request),
          credentials: 'include',
        }
      );

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        const errorMsg = errorBody?.error || `Server error: ${response.status}`;
        this.updateJob(jobId, {
          status: 'failed',
          message: 'Generation failed',
          error: errorMsg,
        });
        this.updateActiveJobs();
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const events = buffer.split('\n\n');
        // Keep the last (possibly incomplete) chunk in the buffer
        buffer = events.pop() || '';

        for (const eventBlock of events) {
          if (!eventBlock.trim()) continue;

          let eventType = '';
          let eventData = '';

          for (const line of eventBlock.split('\n')) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              eventData = line.slice(6);
            }
          }

          if (!eventType || !eventData) continue;

          try {
            const parsed = JSON.parse(eventData) as StreamEvent;

            if (
              parsed.type === 'partial_image' &&
              eventType === 'partial_image'
            ) {
              // Update partial image preview
              this.updateJob(jobId, {
                partialImageUrl: `data:image/png;base64,${parsed.b64Json}`,
                message: `Rendering preview ${parsed.partialImageIndex + 1}...`,
              });
            } else if (
              parsed.type === 'completed' &&
              eventType === 'completed'
            ) {
              // Generation complete — transition to saving
              const result = parsed.result;
              this.updateJob(jobId, {
                status: 'saving',
                message: 'Saving to media library...',
                images: result.data,
                response: result,
                partialImageUrl: undefined, // Clear partial preview
              });

              // Save images
              const currentJob = this.getJob(jobId);
              if (currentJob) {
                const savedMediaIds = await this.saveGeneratedImages(
                  currentJob,
                  result
                );
                this.updateJob(jobId, {
                  status: 'completed',
                  message: currentJob.forCover
                    ? 'Image saved to library. Crop to set as cover.'
                    : `Generated ${result.data.length} image${result.data.length > 1 ? 's' : ''}`,
                  savedMediaIds,
                });
              }

              this.updateActiveJobs();
              return;
            } else if (parsed.type === 'error' && eventType === 'error') {
              this.updateJob(jobId, {
                status: 'failed',
                message: 'Generation failed',
                error: parsed.error || 'Unknown streaming error',
                partialImageUrl: undefined,
              });
              this.updateActiveJobs();
              return;
            }
          } catch {
            // Skip malformed JSON events
          }
        }
      }

      // If we reach here without a completed event, something went wrong
      const currentJob = this.getJob(jobId);
      if (
        currentJob &&
        currentJob.status !== 'completed' &&
        currentJob.status !== 'failed'
      ) {
        this.updateJob(jobId, {
          status: 'failed',
          message: 'Generation failed',
          error: 'Stream ended unexpectedly',
          partialImageUrl: undefined,
        });
      }
    } catch (err) {
      console.error('Streaming generation failed:', err);
      const errorMessage =
        err instanceof Error ? err.message : 'Streaming generation failed';
      this.updateJob(jobId, {
        status: 'failed',
        message: 'Generation failed',
        error: errorMessage,
        partialImageUrl: undefined,
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
