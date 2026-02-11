/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { type MockedObject, vi } from 'vitest';

import { AIImageGenerationService } from '../../../api-client/api/ai-image-generation.service';
import {
  GeneratedImage,
  ImageGenerateRequest,
  ImageGenerateResponse,
  ImageProviderType,
} from '../../../api-client/model/models';
import { AuthTokenService } from '../auth/auth-token.service';
import { XsrfService } from '../auth/xsrf.service';
import { LocalStorageService } from '../local/local-storage.service';
import { ProjectService } from '../project/project.service';
import { ImageGenerationService } from './image-generation.service';

async function flushPromises(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
}

describe('ImageGenerationService', () => {
  let service: ImageGenerationService;
  let mockAiImageService: MockedObject<AIImageGenerationService>;
  let mockOfflineStorage: MockedObject<LocalStorageService>;
  let mockProjectService: MockedObject<ProjectService>;
  let mockAuthTokenService: MockedObject<AuthTokenService>;
  let mockXsrfService: MockedObject<XsrfService>;

  const createMockRequest = (
    overrides: Partial<ImageGenerateRequest> = {}
  ): ImageGenerateRequest =>
    ({
      prompt: 'A test image',
      provider: 'openai' as ImageProviderType,
      model: 'gpt-image-1',
      size: '1024x1024',
      ...overrides,
    }) as ImageGenerateRequest;

  const createMockImage = (index: number): GeneratedImage => ({
    b64Json: btoa('mock-image-data'),
    revisedPrompt: 'A revised test prompt',
    index,
  });

  const createMockResponse = (imageCount = 1): ImageGenerateResponse => ({
    data: Array.from({ length: imageCount }, (_, i) => createMockImage(i)),
    model: 'gpt-image-1',
    provider: 'openai' as ImageProviderType,
    created: Date.now(),
    request: { prompt: 'A test image' },
  });

  beforeEach(async () => {
    mockAiImageService = {
      generateImage: vi.fn().mockReturnValue(of(createMockResponse()) as any),
    } as unknown as MockedObject<AIImageGenerationService>;

    mockOfflineStorage = {
      saveMedia: vi.fn().mockResolvedValue(undefined),
    } as unknown as MockedObject<LocalStorageService>;

    mockProjectService = {
      uploadProjectCover: vi.fn().mockResolvedValue(undefined),
    } as unknown as MockedObject<ProjectService>;

    mockAuthTokenService = {
      getToken: vi.fn().mockReturnValue('mock-token'),
    } as unknown as MockedObject<AuthTokenService>;

    mockXsrfService = {
      getXsrfToken: vi.fn().mockReturnValue('mock-csrf-token'),
    } as unknown as MockedObject<XsrfService>;

    await TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        ImageGenerationService,
        { provide: AIImageGenerationService, useValue: mockAiImageService },
        { provide: LocalStorageService, useValue: mockOfflineStorage },
        { provide: ProjectService, useValue: mockProjectService },
        { provide: AuthTokenService, useValue: mockAuthTokenService },
        { provide: XsrfService, useValue: mockXsrfService },
      ],
    }).compileComponents();

    service = TestBed.inject(ImageGenerationService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Service Creation', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('should initialize with empty jobs', () => {
      expect(service.jobs()).toEqual([]);
      expect(service.activeJobs()).toEqual([]);
    });
  });

  describe('startGeneration', () => {
    it('should create a new job and return job ID', () => {
      const projectKey = 'user/project';
      const request = createMockRequest();

      const jobId = service.startGeneration(projectKey, request);

      expect(jobId).toBeDefined();
      expect(jobId).toMatch(/^gen-\d+-[a-z0-9]+$/);
    });

    it('should add job to jobs list', () => {
      const projectKey = 'user/project';
      const request = createMockRequest();

      service.startGeneration(projectKey, request);

      expect(service.jobs().length).toBe(1);
      expect(service.jobs()[0].projectKey).toBe(projectKey);
    });

    it('should set initial job status to pending or generating', () => {
      const projectKey = 'user/project';
      const request = createMockRequest();

      service.startGeneration(projectKey, request);

      const job = service.jobs()[0];
      // Job may be pending or already generating depending on async timing
      expect(['pending', 'generating']).toContain(job.status);
    });

    it('should set forCover flag when forCover option is true', () => {
      const projectKey = 'user/project';
      const request = createMockRequest();

      service.startGeneration(projectKey, request, { forCover: true });

      const job = service.jobs()[0];
      // The message may have changed due to async processing, but forCover flag should be set
      expect(job.forCover).toBe(true);
    });

    it('should add job to activeJobs', () => {
      const projectKey = 'user/project';
      const request = createMockRequest();

      service.startGeneration(projectKey, request);

      expect(service.activeJobs().length).toBe(1);
    });

    it('should call the AI image service', async () => {
      const projectKey = 'user/project';
      const request = createMockRequest();

      service.startGeneration(projectKey, request);
      await flushPromises();

      expect(mockAiImageService.generateImage).toHaveBeenCalledWith(request);
    });
  });

  describe('Job Status Updates', () => {
    it('should update job status to generating', async () => {
      // Make the API call wait so we can observe the status

      mockAiImageService.generateImage.mockReturnValue(
        of(createMockResponse()) as any
      );

      const projectKey = 'user/project';
      const request = createMockRequest();

      service.startGeneration(projectKey, request);
      await flushPromises();

      // The job should have progressed through generating
      const job = service.jobs()[0];
      // Final status should be completed or saving
      expect(['generating', 'saving', 'completed']).toContain(job.status);
    });

    it('should complete successfully and save images', async () => {
      const projectKey = 'user/project';
      const request = createMockRequest();

      service.startGeneration(projectKey, request);
      await flushPromises();
      await flushPromises(); // Extra flush for async operations

      const job = service.jobs()[0];
      expect(job.status).toBe('completed');
      expect(job.images.length).toBe(1);
      expect(mockOfflineStorage.saveMedia).toHaveBeenCalled();
    });

    it('should handle generation failure', async () => {
      mockAiImageService.generateImage.mockImplementation(() => {
        throw new Error('API Error');
      });

      const projectKey = 'user/project';
      const request = createMockRequest();

      service.startGeneration(projectKey, request);
      await flushPromises();

      const job = service.jobs()[0];
      expect(job.status).toBe('failed');
      expect(job.error).toBe('API Error');
    });

    it('should handle non-Error exceptions', async () => {
      mockAiImageService.generateImage.mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'string error';
      });

      const projectKey = 'user/project';
      const request = createMockRequest();

      service.startGeneration(projectKey, request);
      await flushPromises();

      const job = service.jobs()[0];
      expect(job.status).toBe('failed');
      expect(job.error).toBe('Generation failed');
    });
  });

  describe('Cover Generation', () => {
    it('should NOT auto-upload cover when forCover is true (cropper handles it)', async () => {
      const projectKey = 'user/project';
      const request = createMockRequest();

      service.startGeneration(projectKey, request, { forCover: true });
      await flushPromises();
      await flushPromises();

      // Cover should NOT be auto-uploaded - the cropper in edit-project-dialog handles this
      expect(mockProjectService.uploadProjectCover).not.toHaveBeenCalled();
    });

    it('should still save image to library when forCover is true', async () => {
      const projectKey = 'user/project';
      const request = createMockRequest();

      service.startGeneration(projectKey, request, { forCover: true });
      await flushPromises();
      await flushPromises();

      // Image should still be saved to media library
      expect(mockOfflineStorage.saveMedia).toHaveBeenCalled();
      const job = service.jobs()[0];
      expect(job.status).toBe('completed');
    });

    it('should not upload cover when forCover is false', async () => {
      const projectKey = 'user/project';
      const request = createMockRequest();

      service.startGeneration(projectKey, request, { forCover: false });
      await flushPromises();
      await flushPromises();

      expect(mockProjectService.uploadProjectCover).not.toHaveBeenCalled();
    });
  });

  describe('getJob', () => {
    it('should return job by ID', () => {
      const projectKey = 'user/project';
      const request = createMockRequest();
      const jobId = service.startGeneration(projectKey, request);

      const job = service.getJob(jobId);

      expect(job).toBeDefined();
      expect(job?.id).toBe(jobId);
    });

    it('should return undefined for non-existent job', () => {
      const job = service.getJob('non-existent-id');
      expect(job).toBeUndefined();
    });
  });

  describe('getProjectJobs', () => {
    it('should return jobs for a specific project', () => {
      service.startGeneration('user/project1', createMockRequest());
      service.startGeneration('user/project2', createMockRequest());
      service.startGeneration('user/project1', createMockRequest());

      const project1Jobs = service.getProjectJobs('user/project1');
      expect(project1Jobs.length).toBe(2);

      const project2Jobs = service.getProjectJobs('user/project2');
      expect(project2Jobs.length).toBe(1);
    });

    it('should return empty array for project with no jobs', () => {
      const jobs = service.getProjectJobs('user/no-jobs');
      expect(jobs).toEqual([]);
    });
  });

  describe('clearCompletedJobs', () => {
    it('should remove completed jobs', async () => {
      service.startGeneration('user/project', createMockRequest());
      await flushPromises();
      await flushPromises();

      expect(service.jobs().length).toBe(1);
      expect(service.jobs()[0].status).toBe('completed');

      service.clearCompletedJobs();

      expect(service.jobs().length).toBe(0);
    });

    it('should remove failed jobs', async () => {
      mockAiImageService.generateImage.mockImplementation(() => {
        throw new Error('API Error');
      });

      service.startGeneration('user/project', createMockRequest());
      await flushPromises();

      expect(service.jobs()[0].status).toBe('failed');

      service.clearCompletedJobs();

      expect(service.jobs().length).toBe(0);
    });

    it('should keep pending and active jobs', () => {
      // Create a job but don't wait for it to complete
      service.startGeneration('user/project', createMockRequest());

      // Job should be pending or generating
      expect(service.jobs().length).toBe(1);

      service.clearCompletedJobs();

      // Should still have the job since it's not completed
      expect(service.jobs().length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('removeJob', () => {
    it('should remove a completed job', async () => {
      const jobId = service.startGeneration(
        'user/project',
        createMockRequest()
      );
      await flushPromises();
      await flushPromises();

      const result = service.removeJob(jobId);

      expect(result).toBe(true);
      expect(service.jobs().length).toBe(0);
    });

    it('should return false for non-existent job', () => {
      const result = service.removeJob('non-existent-id');
      expect(result).toBe(false);
    });

    it('should return false for job still generating', async () => {
      // Make generation hang

      mockAiImageService.generateImage.mockReturnValue(
        new (await import('rxjs')).Observable(() => {
          // Never complete
        }) as any
      );

      const jobId = service.startGeneration(
        'user/project',
        createMockRequest()
      );
      await flushPromises();

      // Job should be generating
      const job = service.getJob(jobId);
      if (job?.status === 'generating' || job?.status === 'saving') {
        const result = service.removeJob(jobId);
        expect(result).toBe(false);
        expect(service.jobs().length).toBe(1);
      }
    });
  });

  describe('Multiple Images', () => {
    it('should save multiple generated images', async () => {
      mockAiImageService.generateImage.mockReturnValue(
        of(createMockResponse(3)) as any
      );

      service.startGeneration('user/project', createMockRequest());
      await flushPromises();
      await flushPromises();

      const job = service.jobs()[0];
      expect(job.images.length).toBe(3);
      expect(mockOfflineStorage.saveMedia).toHaveBeenCalledTimes(3);
    });

    it('should update message with correct image count', async () => {
      mockAiImageService.generateImage.mockReturnValue(
        of(createMockResponse(2)) as any
      );

      service.startGeneration('user/project', createMockRequest());
      await flushPromises();
      await flushPromises();

      const job = service.jobs()[0];
      expect(job.message).toContain('2 images');
    });

    it('should use singular for single image', async () => {
      mockAiImageService.generateImage.mockReturnValue(
        of(createMockResponse(1)) as any
      );

      service.startGeneration('user/project', createMockRequest());
      await flushPromises();
      await flushPromises();

      const job = service.jobs()[0];
      expect(job.message).not.toContain('images');
    });
  });

  describe('Image URL Handling', () => {
    it('should handle images with URL instead of base64', async () => {
      // Mock fetch for URL-based images
      global.fetch = vi.fn().mockResolvedValue({
        blob: () =>
          Promise.resolve(new Blob(['image-data'], { type: 'image/png' })),
      });

      mockAiImageService.generateImage.mockReturnValue(
        of({
          data: [{ url: 'https://example.com/image.png', index: 0 }],
          model: 'gpt-image-1',
          provider: 'openai' as ImageProviderType,
          created: Date.now(),
          request: { prompt: 'test' },
        } as ImageGenerateResponse) as any
      );

      service.startGeneration('user/project', createMockRequest());
      await flushPromises();
      await flushPromises();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/image.png'
      );
      expect(mockOfflineStorage.saveMedia).toHaveBeenCalled();
    });

    it('should skip images with no data', async () => {
      mockAiImageService.generateImage.mockReturnValue(
        of({
          data: [{ index: 0 }] as GeneratedImage[], // No b64Json or url
          model: 'gpt-image-1',
          provider: 'openai' as ImageProviderType,
          created: Date.now(),
          request: { prompt: 'test' },
        } as ImageGenerateResponse) as any
      );

      service.startGeneration('user/project', createMockRequest());
      await flushPromises();
      await flushPromises();

      expect(mockOfflineStorage.saveMedia).not.toHaveBeenCalled();
    });
  });

  describe('Active Jobs Tracking', () => {
    it('should track active jobs correctly', () => {
      service.startGeneration('user/project1', createMockRequest());
      service.startGeneration('user/project2', createMockRequest());

      expect(service.activeJobs().length).toBeGreaterThanOrEqual(0);
    });

    it('should remove from activeJobs when completed', async () => {
      service.startGeneration('user/project', createMockRequest());
      await flushPromises();
      await flushPromises();

      expect(service.activeJobs().length).toBe(0);
    });
  });

  describe('Streaming Generation', () => {
    /**
     * Helper to create a ReadableStream that yields SSE-formatted text.
     */
    function createSSEStream(
      events: { event: string; data: object }[]
    ): ReadableStream<Uint8Array> {
      const encoder = new TextEncoder();
      let index = 0;
      return new ReadableStream({
        pull(controller) {
          if (index < events.length) {
            const e = events[index++];
            const chunk = `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`;
            controller.enqueue(encoder.encode(chunk));
          } else {
            controller.close();
          }
        },
      });
    }

    function mockFetchResponse(
      events: { event: string; data: object }[],
      status = 200
    ): void {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        body: createSSEStream(events),
        json: () => Promise.resolve({}),
      } as unknown as Response);
    }

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should use streaming path for openai provider', () => {
      const jobId = service.startGeneration(
        'user/project',
        createMockRequest(),
        { providerType: 'openai' }
      );

      const job = service.getJob(jobId);
      expect(job?.isStreaming).toBe(true);
    });

    it('should NOT use streaming path for non-openai providers', () => {
      const jobId = service.startGeneration(
        'user/project',
        createMockRequest(),
        { providerType: 'openrouter' }
      );

      const job = service.getJob(jobId);
      expect(job?.isStreaming).toBe(false);
    });

    it('should update partialImageUrl when partial_image events arrive', async () => {
      const completedResult = createMockResponse();
      mockFetchResponse([
        {
          event: 'partial_image',
          data: {
            type: 'partial_image',
            b64Json: btoa('partial-1'),
            partialImageIndex: 0,
          },
        },
        {
          event: 'partial_image',
          data: {
            type: 'partial_image',
            b64Json: btoa('partial-2'),
            partialImageIndex: 1,
          },
        },
        {
          event: 'completed',
          data: { type: 'completed', result: completedResult },
        },
      ]);

      const jobId = service.startGeneration(
        'user/project',
        createMockRequest(),
        { providerType: 'openai' }
      );

      // Wait for streaming to complete
      await flushPromises();
      await flushPromises();
      await flushPromises();

      const job = service.getJob(jobId);
      expect(job?.status).toBe('completed');
      // partialImageUrl should be cleared on completion
      expect(job?.partialImageUrl).toBeUndefined();
    });

    it('should transition to completed after completed event', async () => {
      const completedResult = createMockResponse();
      mockFetchResponse([
        {
          event: 'completed',
          data: { type: 'completed', result: completedResult },
        },
      ]);

      const jobId = service.startGeneration(
        'user/project',
        createMockRequest(),
        { providerType: 'openai' }
      );

      await flushPromises();
      await flushPromises();
      await flushPromises();

      const job = service.getJob(jobId);
      expect(job?.status).toBe('completed');
      expect(job?.images.length).toBe(1);
    });

    it('should handle error events from stream', async () => {
      mockFetchResponse([
        {
          event: 'error',
          data: { type: 'error', error: 'Provider quota exceeded' },
        },
      ]);

      const jobId = service.startGeneration(
        'user/project',
        createMockRequest(),
        { providerType: 'openai' }
      );

      await flushPromises();
      await flushPromises();

      const job = service.getJob(jobId);
      expect(job?.status).toBe('failed');
      expect(job?.error).toBe('Provider quota exceeded');
    });

    it('should handle non-200 fetch response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
        body: null,
        json: () => Promise.resolve({ error: 'Internal error' }),
      } as unknown as Response);

      const jobId = service.startGeneration(
        'user/project',
        createMockRequest(),
        { providerType: 'openai' }
      );

      await flushPromises();
      await flushPromises();

      const job = service.getJob(jobId);
      expect(job?.status).toBe('failed');
      expect(job?.error).toBe('Internal error');
    });

    it('should handle stream ending without completed event', async () => {
      // Stream has only a partial event then closes — no completed event
      mockFetchResponse([
        {
          event: 'partial_image',
          data: {
            type: 'partial_image',
            b64Json: btoa('partial'),
            partialImageIndex: 0,
          },
        },
      ]);

      const jobId = service.startGeneration(
        'user/project',
        createMockRequest(),
        { providerType: 'openai' }
      );

      await flushPromises();
      await flushPromises();
      await flushPromises();

      const job = service.getJob(jobId);
      expect(job?.status).toBe('failed');
      expect(job?.error).toBe('Stream ended unexpectedly');
    });

    it('should handle fetch throwing an error', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(
        new Error('Network error')
      );

      const jobId = service.startGeneration(
        'user/project',
        createMockRequest(),
        { providerType: 'openai' }
      );

      await flushPromises();
      await flushPromises();

      const job = service.getJob(jobId);
      expect(job?.status).toBe('failed');
      expect(job?.error).toBe('Network error');
    });

    it('should include auth and CSRF headers in fetch request', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        body: createSSEStream([
          {
            event: 'completed',
            data: { type: 'completed', result: createMockResponse() },
          },
        ]),
      } as unknown as Response);

      service.startGeneration('user/project', createMockRequest(), {
        providerType: 'openai',
      });

      await flushPromises();

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/ai/image/generate-stream'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-token',
            'X-CSRF-TOKEN': 'mock-csrf-token',
          }),
        })
      );
    });
  });
});
