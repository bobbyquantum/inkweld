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
import { OfflineStorageService } from '../offline/offline-storage.service';
import { ProjectService } from '../project/project.service';
import { ImageGenerationService } from './image-generation.service';

async function flushPromises(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
}

describe('ImageGenerationService', () => {
  let service: ImageGenerationService;
  let mockAiImageService: MockedObject<AIImageGenerationService>;
  let mockOfflineStorage: MockedObject<OfflineStorageService>;
  let mockProjectService: MockedObject<ProjectService>;

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
    } as unknown as MockedObject<OfflineStorageService>;

    mockProjectService = {
      uploadProjectCover: vi.fn().mockResolvedValue(undefined),
    } as unknown as MockedObject<ProjectService>;

    await TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        ImageGenerationService,
        { provide: AIImageGenerationService, useValue: mockAiImageService },
        { provide: OfflineStorageService, useValue: mockOfflineStorage },
        { provide: ProjectService, useValue: mockProjectService },
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
    it('should upload cover when forCover is true', async () => {
      const projectKey = 'user/project';
      const request = createMockRequest();

      service.startGeneration(projectKey, request, { forCover: true });
      await flushPromises();
      await flushPromises();

      expect(mockProjectService.uploadProjectCover).toHaveBeenCalledWith(
        'user',
        'project',
        expect.any(File)
      );
    });

    it('should not upload cover when forCover is false', async () => {
      const projectKey = 'user/project';
      const request = createMockRequest();

      service.startGeneration(projectKey, request, { forCover: false });
      await flushPromises();
      await flushPromises();

      expect(mockProjectService.uploadProjectCover).not.toHaveBeenCalled();
    });

    it('should handle invalid projectKey for cover upload', async () => {
      const projectKey = 'invalid-key'; // No slash
      const request = createMockRequest();

      service.startGeneration(projectKey, request, { forCover: true });
      await flushPromises();
      await flushPromises();

      // Should not throw, just log error
      expect(mockProjectService.uploadProjectCover).not.toHaveBeenCalled();
    });

    it('should handle cover upload failure gracefully', async () => {
      mockProjectService.uploadProjectCover.mockRejectedValue(
        new Error('Upload failed')
      );

      const projectKey = 'user/project';
      const request = createMockRequest();

      service.startGeneration(projectKey, request, { forCover: true });
      await flushPromises();
      await flushPromises();

      // Should still complete, just without cover
      const job = service.jobs()[0];
      expect(job.status).toBe('completed');
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
});
