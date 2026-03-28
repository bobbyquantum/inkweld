import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, timeout, TimeoutError } from 'rxjs';

import { AIImageGenerationService } from '../../../api-client/api/ai-image-generation.service';
import {
  type GeneratedImage,
  type ImageGenerateRequest,
  type ImageGenerateResponse,
} from '../../../api-client/model/models';
import { environment } from '../../../environments/environment';
import { AuthTokenService } from '../auth/auth-token.service';
import { XsrfService } from '../auth/xsrf.service';
import {
  type GenerationMetadata,
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

      const response = await this.requestImageGeneration(job.request);
      if (this.handleTextOnlyResponse(jobId, response)) {
        return;
      }

      await this.completeJob(jobId, job, response);
    } catch (err) {
      console.error('Generation failed:', err);
      const failure = this.extractGenerationFailure(err);

      this.updateJob(jobId, {
        status: 'failed',
        message: failure.statusMessage,
        error: failure.errorMessage,
      });
    }

    this.updateActiveJobs();
  }

  private async requestImageGeneration(
    request: ImageGenerateRequest
  ): Promise<ImageGenerateResponse> {
    return firstValueFrom(
      this.aiImageService.generateImage(request).pipe(timeout(180_000))
    );
  }

  private handleTextOnlyResponse(
    jobId: string,
    response: ImageGenerateResponse
  ): boolean {
    if (!this.isTextOnlyResponse(response)) {
      return false;
    }

    this.updateJob(jobId, {
      status: 'failed',
      message: 'Generation failed',
      error: this.getTextOnlyResponseError(response.textContent),
      response,
    });
    this.updateActiveJobs();
    return true;
  }

  private isTextOnlyResponse(
    response: ImageGenerateResponse
  ): response is ImageGenerateResponse & { textContent: string } {
    return response.data.length === 0 && !!response.textContent;
  }

  private getTextOnlyResponseError(textContent: string): string {
    const prefix = this.isGenerationRefusal(textContent)
      ? 'Image generation was refused'
      : 'The model returned text instead of an image';
    return `${prefix}: ${textContent}`;
  }

  private isGenerationRefusal(textContent: string): boolean {
    const lowerContent = textContent.toLowerCase();
    return [
      'cannot',
      "can't",
      'unable',
      'sorry',
      'policy',
      'inappropriate',
      'violat',
    ].some(keyword => lowerContent.includes(keyword));
  }

  private async completeJob(
    jobId: string,
    job: GenerationJob,
    response: ImageGenerateResponse
  ): Promise<void> {
    this.markJobSaving(jobId, response);
    const savedMediaIds = await this.saveGeneratedImages(job, response);

    this.updateJob(jobId, {
      status: 'completed',
      message: this.getCompletionMessage(job.forCover, response.data.length),
      savedMediaIds,
    });
  }

  private markJobSaving(
    jobId: string,
    response: ImageGenerateResponse,
    options?: { clearPartialImageUrl?: boolean }
  ): void {
    this.updateJob(jobId, {
      status: 'saving',
      message: 'Saving to media library...',
      images: response.data,
      response,
      ...(options?.clearPartialImageUrl ? { partialImageUrl: undefined } : {}),
    });
  }

  private getCompletionMessage(
    forCover: boolean | undefined,
    imageCount: number
  ): string {
    if (forCover) {
      return 'Image saved to library. Crop to set as cover.';
    }

    return `Generated ${imageCount} ${imageCount === 1 ? 'image' : 'images'}`;
  }

  private extractGenerationFailure(err: unknown): {
    statusMessage: string;
    errorMessage: string;
  } {
    let errorMessage = 'Generation failed';

    if (err instanceof TimeoutError) {
      errorMessage =
        'Image generation timed out. The model may be overloaded — please try again.';
    } else if (err instanceof Error) {
      errorMessage = err.message;
    }

    if (err !== null && typeof err === 'object' && 'error' in err) {
      const errorBody = err.error;

      if (typeof errorBody === 'string') {
        errorMessage = errorBody;
      } else if (typeof errorBody === 'object' && errorBody !== null) {
        const structuredError = errorBody as Record<string, unknown>;
        if (typeof structuredError['error'] === 'string') {
          errorMessage = structuredError['error'];
        } else if (typeof structuredError['message'] === 'string') {
          errorMessage = structuredError['message'];
        }
      }
    }

    const isModerationBlock = errorMessage.includes('MODERATION_BLOCKED:');
    return {
      statusMessage: isModerationBlock
        ? 'Content blocked'
        : 'Generation failed',
      errorMessage: isModerationBlock
        ? errorMessage.replaceAll('MODERATION_BLOCKED:', '').trim()
        : errorMessage,
    };
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

      const response = await this.openStreamingResponse(job.request);

      if (!response.ok) {
        this.failStreamingJob(
          jobId,
          await this.getStreamingErrorMessage(response)
        );
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const streamCompleted = await this.processStream(jobId, reader);
      if (!streamCompleted) {
        this.failStreamingJob(jobId, 'Stream ended unexpectedly');
      }
    } catch (err) {
      console.error('Streaming generation failed:', err);
      this.failStreamingJob(
        jobId,
        err instanceof Error ? err.message : 'Streaming generation failed'
      );
    }
  }

  private createStreamingHeaders(): Record<string, string> {
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

    return headers;
  }

  private openStreamingResponse(
    request: ImageGenerateRequest
  ): Promise<Response> {
    return fetch(`${environment.apiUrl}/api/v1/ai/image/generate-stream`, {
      method: 'POST',
      headers: this.createStreamingHeaders(),
      body: JSON.stringify(request),
      credentials: 'include',
    });
  }

  private async getStreamingErrorMessage(response: Response): Promise<string> {
    const errorBody = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    return errorBody?.error || `Server error: ${response.status}`;
  }

  private async processStream(
    jobId: string,
    reader: ReadableStreamDefaultReader<Uint8Array>
  ): Promise<boolean> {
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        return false;
      }

      buffer += decoder.decode(value, { stream: true });
      const { eventBlocks, remainingBuffer } = this.extractEventBlocks(buffer);
      buffer = remainingBuffer;

      for (const eventBlock of eventBlocks) {
        const handledTerminalEvent = await this.handleStreamEventBlock(
          jobId,
          eventBlock
        );
        if (handledTerminalEvent) {
          return true;
        }
      }
    }
  }

  private extractEventBlocks(buffer: string): {
    eventBlocks: string[];
    remainingBuffer: string;
  } {
    const eventBlocks = buffer.split('\n\n');
    return {
      eventBlocks,
      remainingBuffer: eventBlocks.pop() || '',
    };
  }

  private async handleStreamEventBlock(
    jobId: string,
    eventBlock: string
  ): Promise<boolean> {
    if (!eventBlock.trim()) {
      return false;
    }

    try {
      const parsedEvent = this.parseStreamEventBlock(eventBlock);
      if (!parsedEvent) {
        return false;
      }

      return this.handleParsedStreamEvent(jobId, parsedEvent);
    } catch {
      return false;
    }
  }

  private parseStreamEventBlock(eventBlock: string): {
    eventType: string;
    event: StreamEvent;
  } | null {
    let eventType = '';
    let eventData = '';

    for (const line of eventBlock.split('\n')) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        eventData = line.slice(6);
      }
    }

    if (!eventType || !eventData) {
      return null;
    }

    return {
      eventType,
      event: JSON.parse(eventData) as StreamEvent,
    };
  }

  private async handleParsedStreamEvent(
    jobId: string,
    parsedEvent: { eventType: string; event: StreamEvent }
  ): Promise<boolean> {
    const { eventType, event } = parsedEvent;

    if (event.type === 'partial_image' && eventType === 'partial_image') {
      this.updatePartialImagePreview(jobId, event);
      return false;
    }

    if (event.type === 'completed' && eventType === 'completed') {
      await this.completeStreamingJob(jobId, event.result);
      return true;
    }

    if (event.type === 'error' && eventType === 'error') {
      this.failStreamingJob(jobId, event.error || 'Unknown streaming error');
      return true;
    }

    return false;
  }

  private updatePartialImagePreview(
    jobId: string,
    event: StreamPartialImageEvent
  ): void {
    this.updateJob(jobId, {
      partialImageUrl: `data:image/png;base64,${event.b64Json}`,
      message: `Rendering preview ${event.partialImageIndex + 1}...`,
    });
  }

  private async completeStreamingJob(
    jobId: string,
    response: ImageGenerateResponse
  ): Promise<void> {
    this.markJobSaving(jobId, response, { clearPartialImageUrl: true });

    const currentJob = this.getJob(jobId);
    if (!currentJob) {
      this.updateActiveJobs();
      return;
    }

    const savedMediaIds = await this.saveGeneratedImages(currentJob, response);
    this.updateJob(jobId, {
      status: 'completed',
      message: this.getCompletionMessage(
        currentJob.forCover,
        response.data.length
      ),
      savedMediaIds,
    });
    this.updateActiveJobs();
  }

  private failStreamingJob(jobId: string, error: string): void {
    this.updateJob(jobId, {
      status: 'failed',
      message: 'Generation failed',
      error,
      partialImageUrl: undefined,
    });
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
        let mimeType = image.mimeType || 'image/png';
        if (image.b64Json) {
          const binaryString = atob(image.b64Json);
          const bytes = new Uint8Array(binaryString.length);
          for (let j = 0; j < binaryString.length; j++) {
            bytes[j] = binaryString.codePointAt(j)!;
          }
          blob = new Blob([bytes], { type: mimeType });
        } else if (image.url) {
          const fetchResponse = await fetch(image.url);
          blob = await fetchResponse.blob();
          mimeType = blob.type || mimeType;
        } else {
          console.warn(`Image ${i} has no data, skipping`);
          continue;
        }

        // Generate unique ID
        const timestamp = Date.now();
        const mediaId = `generated-${timestamp}-${i}`;
        const ext = this.getExtensionForMimeType(mimeType);

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
          `ai-generated-${timestamp}-${i}.${ext}`,
          generation
        );

        savedMediaIds.push(mediaId);
      } catch (err) {
        console.error(`Failed to save image ${i}:`, err);
      }
    }

    return savedMediaIds;
  }

  private getExtensionForMimeType(mimeType: string): string {
    switch (mimeType) {
      case 'image/jpeg':
        return 'jpg';
      case 'image/webp':
        return 'webp';
      default:
        return 'png';
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
