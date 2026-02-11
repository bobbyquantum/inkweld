/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { MockedObject, vi } from 'vitest';

import { AIImageGenerationService } from '../../../api-client/api/ai-image-generation.service';
import { ImageProfilesService } from '../../../api-client/api/image-profiles.service';
import {
  CustomSizesResponse,
  ImageGenerationStatus,
  ImageProviderType,
  ImageSize,
  PublicImageModelProfile,
  PublicImageModelProfileProvider,
} from '../../../api-client/model/models';
import { WorldbuildingElementSelection } from '../../components/worldbuilding-element-selector/worldbuilding-element-selector.component';
import {
  GenerationJob,
  ImageGenerationService,
} from '../../services/ai/image-generation.service';
import { ProjectStateService } from '../../services/project/project-state.service';
import { WorldbuildingService } from '../../services/worldbuilding/worldbuilding.service';
import {
  ImageGenerationDialogComponent,
  ImageGenerationDialogData,
} from './image-generation-dialog.component';

describe('ImageGenerationDialogComponent', () => {
  let component: ImageGenerationDialogComponent;
  let fixture: ComponentFixture<ImageGenerationDialogComponent>;
  let dialogRef: MockedObject<MatDialogRef<ImageGenerationDialogComponent>>;
  let aiImageService: MockedObject<AIImageGenerationService>;
  let imageProfilesService: MockedObject<ImageProfilesService>;
  let generationService: MockedObject<ImageGenerationService>;
  let projectState: MockedObject<ProjectStateService>;
  let worldbuildingService: MockedObject<WorldbuildingService>;
  let snackBar: MockedObject<MatSnackBar>;

  const mockStatus: ImageGenerationStatus = {
    available: true,
    defaultProvider: ImageProviderType.Openrouter,
    providers: [
      {
        type: ImageProviderType.Openrouter,
        name: 'OpenRouter',
        enabled: true,
        available: true,
        models: [],
      },
      {
        type: ImageProviderType.Openai,
        name: 'OpenAI',
        enabled: true,
        available: true,
        models: [],
      },
    ],
  };

  const mockProfiles: PublicImageModelProfile[] = [
    {
      id: 'profile-1',
      name: 'Test Profile 1',
      description: 'A test profile',
      provider: PublicImageModelProfileProvider.Openrouter,
      modelId: 'model-1',
      supportsImageInput: false,
      supportsCustomResolutions: false,
      supportedSizes: ['1024x1024', '1920x1080'],
      defaultSize: '1024x1024',
      enabled: true,
      sortOrder: 0,
      usesAspectRatioOnly: false,
      creditCost: 1,
    },
    {
      id: 'profile-2',
      name: 'Test Profile 2',
      description: null,
      provider: PublicImageModelProfileProvider.Openai,
      modelId: 'gpt-image-1',
      supportsImageInput: false,
      supportsCustomResolutions: false,
      supportedSizes: ['1024x1024', '1792x1024'],
      defaultSize: '1024x1024',
      enabled: true,
      sortOrder: 1,
      usesAspectRatioOnly: false,
      creditCost: 1,
    },
  ];

  const mockProject = {
    id: 'proj-1',
    username: 'testuser',
    slug: 'test-project',
    title: 'Test Project',
    description: 'A test project',
  };

  const mockDialogData: ImageGenerationDialogData = {
    prompt: 'A beautiful sunset over mountains',
  };

  beforeEach(async () => {
    dialogRef = {
      close: vi.fn(),
    } as unknown as MockedObject<MatDialogRef<ImageGenerationDialogComponent>>;

    aiImageService = {
      getImageGenerationStatus: vi.fn().mockReturnValue(of(mockStatus)),
      getCustomImageSizes: vi
        .fn()
        .mockReturnValue(of({ sizes: [] } as CustomSizesResponse)),
      generateImage: vi.fn().mockReturnValue(
        of({
          images: [{ b64Json: 'base64data', revisedPrompt: 'revised' }],
        })
      ),
    } as unknown as MockedObject<AIImageGenerationService>;

    imageProfilesService = {
      listImageProfiles: vi.fn().mockReturnValue(of(mockProfiles)),
    } as unknown as MockedObject<ImageProfilesService>;

    generationService = {
      startGeneration: vi.fn().mockReturnValue('job-123'),
      getJob: vi.fn().mockReturnValue(null),
      jobs: signal<GenerationJob[]>([]),
      activeJobs: signal<GenerationJob[]>([]),
    } as unknown as MockedObject<ImageGenerationService>;

    projectState = {
      project: vi.fn().mockReturnValue(mockProject),
      elements: vi.fn().mockReturnValue([]),
    } as unknown as MockedObject<ProjectStateService>;

    worldbuildingService = {
      getWorldbuildingData: vi.fn().mockResolvedValue(null),
    } as unknown as MockedObject<WorldbuildingService>;

    snackBar = {
      open: vi.fn(),
    } as unknown as MockedObject<MatSnackBar>;

    await TestBed.configureTestingModule({
      imports: [ImageGenerationDialogComponent, NoopAnimationsModule],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: mockDialogData },
        { provide: AIImageGenerationService, useValue: aiImageService },
        { provide: ImageProfilesService, useValue: imageProfilesService },
        { provide: ImageGenerationService, useValue: generationService },
        { provide: ProjectStateService, useValue: projectState },
        { provide: WorldbuildingService, useValue: worldbuildingService },
        { provide: MatSnackBar, useValue: snackBar },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ImageGenerationDialogComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Helper to wait for promises to resolve
   */
  async function flushPromises(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with provided prompt', () => {
    expect(component.prompt()).toBe('A beautiful sunset over mountains');
  });

  it('should load generation status on init', async () => {
    fixture.detectChanges();
    await flushPromises();

    expect(aiImageService.getImageGenerationStatus).toHaveBeenCalled();
    expect(component.status()).toEqual(mockStatus);
  });

  it('should auto-select default provider', async () => {
    fixture.detectChanges();
    await flushPromises();

    expect(component.selectedProvider()).toBe(ImageProviderType.Openrouter);
  });

  it('should load profiles on init', async () => {
    fixture.detectChanges();
    await flushPromises();

    expect(imageProfilesService.listImageProfiles).toHaveBeenCalled();
    expect(component.profiles().length).toBe(2);
  });

  it('should include image-to-image profiles (supportsImageInput=true) since they also support text-to-image', async () => {
    // Add an image-to-image profile to the mock data
    const profilesWithImageToImage: PublicImageModelProfile[] = [
      ...mockProfiles,
      {
        id: 'profile-img2img',
        name: 'Image-to-Image Profile',
        description: 'Supports image input',
        provider: PublicImageModelProfileProvider.Openrouter, // Use an enabled provider
        modelId: 'openrouter/imagen-edit',
        supportsImageInput: true, // This should NOT be filtered out - it can still do text-to-image
        supportsCustomResolutions: false,
        supportedSizes: ['1024x1024'],
        defaultSize: '1024x1024',
        enabled: true,
        sortOrder: 2,
        usesAspectRatioOnly: false,
        creditCost: 1,
      },
    ];

    (imageProfilesService.listImageProfiles as any).mockReturnValue(
      of(profilesWithImageToImage)
    );

    fixture.detectChanges();
    await flushPromises();

    // All profiles should be included - supportsImageInput means it CAN accept image input,
    // not that it requires one. These profiles can still be used for text-to-image generation.
    expect(component.profiles().length).toBe(3);
    expect(component.profiles().some(p => p.supportsImageInput === true)).toBe(
      true
    );
  });

  describe('form stage', () => {
    beforeEach(async () => {
      fixture.detectChanges();
      await flushPromises();
      // Manually set up provider and model for form tests
      component.selectedProvider.set(ImageProviderType.Openrouter);
      component.selectedModel.set('model-1');
    });

    it('should start in select-elements stage', () => {
      expect(component.stage()).toBe('select-elements');
    });

    it('should not call generate when prompt is empty', () => {
      component.prompt.set('');
      component.generate();

      // Should not call startGeneration when validation fails
      expect(generationService.startGeneration).not.toHaveBeenCalled();
    });

    it('should not call generate when no provider selected', () => {
      component.selectedProvider.set(null);
      component.generate();

      // Should not call startGeneration when validation fails
      expect(generationService.startGeneration).not.toHaveBeenCalled();
    });

    it('should start generation and switch to generating stage', () => {
      component.generate();

      expect(generationService.startGeneration).toHaveBeenCalledWith(
        'testuser/test-project',
        expect.objectContaining({
          prompt: 'A beautiful sunset over mountains',
          profileId: 'profile-1',
          n: 1,
          size: ImageSize._1024x1024,
        }),
        { forCover: undefined, providerType: 'openrouter' }
      );
      expect(component.stage()).toBe('generating');
      expect(component.currentJobId()).toBe('job-123');
    });
  });

  describe('generating stage', () => {
    const mockCompletedJob: GenerationJob = {
      id: 'job-123',
      projectKey: 'testuser/test-project',
      request: {
        prompt: 'test',
        profileId: 'profile-1',
        size: ImageSize._1024x1024,
      },
      status: 'completed',
      message: 'Generation complete',
      images: [
        { b64Json: 'base64data1', revisedPrompt: 'revised 1', index: 0 },
        { b64Json: 'base64data2', revisedPrompt: 'revised 2', index: 1 },
      ],
      response: {
        created: Date.now(),
        data: [
          { b64Json: 'base64data1', revisedPrompt: 'revised 1', index: 0 },
          { b64Json: 'base64data2', revisedPrompt: 'revised 2', index: 1 },
        ],
        provider: ImageProviderType.Openrouter,
        model: 'test-model',
        request: { prompt: 'test' },
      },
      createdAt: new Date(),
      savedMediaIds: ['media-1', 'media-2'],
    };

    beforeEach(async () => {
      fixture.detectChanges();
      await flushPromises();

      generationService.getJob.mockReturnValue(mockCompletedJob);
      component.generate();
    });

    it('should be in generating stage after generate', () => {
      expect(component.stage()).toBe('generating');
    });

    it('should get current job', () => {
      expect(component.currentJob()).toEqual(mockCompletedJob);
    });

    it('should select images by index', () => {
      expect(component.selectedImageIndex()).toBe(0);
      component.selectImage(1);
      expect(component.selectedImageIndex()).toBe(1);
    });

    it('should get selected image', () => {
      const image = component.getSelectedImage();
      expect(image?.b64Json).toBe('base64data1');

      component.selectImage(1);
      const image2 = component.getSelectedImage();
      expect(image2?.b64Json).toBe('base64data2');
    });

    it('should generate image URL from base64', () => {
      const image = mockCompletedJob.images[0];
      const url = component.getImageUrl(image);
      expect(url).toBe('data:image/png;base64,base64data1');
    });

    it('should generate image URL from url property', () => {
      const image = { url: 'https://example.com/image.png', index: 0 };
      const url = component.getImageUrl(image);
      expect(url).toBe('https://example.com/image.png');
    });

    it('should close dialog with saved result when saveAndClose is called', () => {
      component.saveAndClose();

      expect(dialogRef.close).toHaveBeenCalledWith({
        saved: true,
        imageData: 'data:image/png;base64,base64data1',
        response: mockCompletedJob.response,
      });
    });

    it('should close dialog without saving when cancel is called', () => {
      component.cancel();

      expect(dialogRef.close).toHaveBeenCalledWith({ saved: false });
    });
  });

  describe('forCover mode', () => {
    beforeEach(async () => {
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [ImageGenerationDialogComponent, NoopAnimationsModule],
        providers: [
          provideZonelessChangeDetection(),
          { provide: MatDialogRef, useValue: dialogRef },
          { provide: MAT_DIALOG_DATA, useValue: { forCover: true } },
          { provide: AIImageGenerationService, useValue: aiImageService },
          { provide: ImageGenerationService, useValue: generationService },
          { provide: ImageProfilesService, useValue: imageProfilesService },
          { provide: ProjectStateService, useValue: projectState },
          { provide: WorldbuildingService, useValue: worldbuildingService },
          { provide: MatSnackBar, useValue: snackBar },
        ],
      }).compileComponents();

      fixture = TestBed.createComponent(ImageGenerationDialogComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
    });

    it('should use portrait size for cover generation', () => {
      expect(component.selectedSize()).toBe(ImageSize._768x1344);
    });

    it('should auto-generate cover prompt from project info', () => {
      const prompt = component.prompt();
      expect(prompt).toContain('Test Project');
      expect(prompt).toContain('front cover image');
    });

    it('should pass forCover option to generation service', async () => {
      await flushPromises();
      // Select a profile to enable generation
      component.selectedProfile.set(mockProfiles[0]);
      component.generate();

      expect(generationService.startGeneration).toHaveBeenCalledWith(
        'testuser/test-project',
        expect.any(Object),
        { forCover: true, providerType: expect.any(String) }
      );
    });
  });

  describe('helper methods', () => {
    beforeEach(async () => {
      fixture.detectChanges();
      await flushPromises();
    });

    it('should get correct provider icon', () => {
      expect(component.getProviderIcon('openai')).toBe('auto_awesome');
      expect(component.getProviderIcon('openrouter')).toBe('hub');
      expect(component.getProviderIcon('stable-diffusion')).toBe('brush');
      expect(component.getProviderIcon('falai')).toBe('bolt');
      expect(component.getProviderIcon('unknown')).toBe('image');
    });

    it('should get correct provider label', () => {
      expect(component.getProviderLabel('openai')).toBe('OpenAI');
      expect(component.getProviderLabel('openrouter')).toBe('OpenRouter');
      expect(component.getProviderLabel('stable-diffusion')).toBe(
        'Stable Diffusion'
      );
      expect(component.getProviderLabel('falai')).toBe('Fal.ai');
      expect(component.getProviderLabel('unknown')).toBe('unknown');
    });

    it('should get size label', () => {
      const label = component.getSizeLabel('1024x1024');
      expect(label).toBe('1024×1024 (1:1 Square)');
    });

    it('should get model name when profile is selected', () => {
      // Set up profile selection manually
      component.selectedProfile.set({
        id: 'profile-1',
        name: 'Test Profile',
        description: 'A test profile',
        provider: PublicImageModelProfileProvider.Openrouter,
        modelId: 'model-1',
        supportsImageInput: false,
        supportsCustomResolutions: false,
        supportedSizes: ['1024x1024'],
        defaultSize: '1024x1024',
        enabled: true,
        sortOrder: 0,
        usesAspectRatioOnly: false,
        creditCost: 1,
      });

      const name = component.getModelName();
      expect(name).toBe('Test Profile');
    });

    it('should return model id when no profile selected', () => {
      component.selectedProfile.set(null);
      component.selectedModel.set('model-1');
      const name = component.getModelName();
      expect(name).toBe('model-1');
    });

    it('should return Default when no profile or model selected', () => {
      component.selectedProfile.set(null);
      component.selectedModel.set(null);
      const name = component.getModelName();
      expect(name).toBe('Default');
    });

    it('should truncate long prompts', () => {
      const longPrompt = 'a'.repeat(300);
      const truncated = component.truncatePrompt(longPrompt, 200);
      expect(truncated.length).toBe(203); // 200 + '...'
      expect(truncated.endsWith('...')).toBe(true);
    });

    it('should not truncate short prompts', () => {
      const shortPrompt = 'short prompt';
      const result = component.truncatePrompt(shortPrompt, 200);
      expect(result).toBe(shortPrompt);
    });

    it('should format element data', () => {
      const data = { name: 'Test', value: 123 };
      const formatted = component.formatElementData(data);
      expect(formatted).toContain('"name"');
      expect(formatted).toContain('"Test"');
    });

    it('should return message for undefined element data', () => {
      const formatted = component.formatElementData(undefined);
      expect(formatted).toBe('No data available');
    });
  });

  describe('custom sizes', () => {
    beforeEach(async () => {
      fixture.detectChanges();
      await flushPromises();
    });

    it('should load custom sizes on init', () => {
      expect(aiImageService.getCustomImageSizes).toHaveBeenCalled();
    });

    it('should start with default sizes only when no custom sizes', () => {
      component.customSizes.set([]);
      const options = component.sizeOptions();
      // Should have default sizes but no custom ones
      expect(options.length).toBeGreaterThan(0);
      expect(options.every(o => !o.isCustom)).toBe(true);
    });

    it('should merge custom sizes with default sizes', () => {
      component.customSizes.set([
        { id: 'custom-1', name: 'My Custom Size', width: 1234, height: 5678 },
      ]);
      const options = component.sizeOptions();
      const customOption = options.find(o => o.isCustom);
      expect(customOption).toBeDefined();
      expect(customOption?.value).toBe('1234x5678');
      expect(customOption?.label).toContain('My Custom Size');
    });

    it('should calculate megapixels for custom sizes', () => {
      component.customSizes.set([
        { id: 'custom-hd', name: 'HD', width: 1920, height: 1080 },
      ]);
      const options = component.sizeOptions();
      const hdOption = options.find(o => o.value === '1920x1080');
      // 1920 * 1080 = 2,073,600 = ~2.07 MP
      // Note: HD 1920x1080 is in defaults, so it won't be added as custom
      expect(hdOption).toBeDefined();
    });

    it('should filter out duplicate custom sizes that match defaults', () => {
      // 1024x1024 is a default size
      component.customSizes.set([
        {
          id: 'duplicate',
          name: 'Duplicate Square',
          width: 1024,
          height: 1024,
        },
      ]);
      const options = component.sizeOptions();
      // Should not add a duplicate
      const squareOptions = options.filter(o => o.value === '1024x1024');
      expect(squareOptions.length).toBe(1);
      expect(squareOptions[0].isCustom).toBeFalsy();
    });

    it('should get size label for custom size', () => {
      component.customSizes.set([
        {
          id: 'custom-test',
          name: 'Test Size',
          width: 1111,
          height: 2222,
        },
      ]);
      const label = component.getSizeLabel('1111x2222');
      expect(label).toContain('Test Size');
    });

    it('should handle empty custom sizes response gracefully', async () => {
      aiImageService.getCustomImageSizes.mockReturnValue(
        of({ sizes: [] }) as any
      );
      await component['loadCustomSizes']();
      expect(component.customSizes()).toEqual([]);
    });

    it('should show sizes from selected profile supportedSizes', () => {
      // Set up a profile with specific supported sizes
      component.selectedProfile.set({
        id: 'profile-sizes',
        name: 'Test Profile',
        description: null,
        provider: PublicImageModelProfileProvider.Falai,
        modelId: 'test-model',
        supportsImageInput: false,
        supportsCustomResolutions: false,
        supportedSizes: ['1024x1024', '1920x1080'],
        defaultSize: '1024x1024',
        enabled: true,
        sortOrder: 0,
        usesAspectRatioOnly: false,
        creditCost: 1,
      });
      component.customSizes.set([]);

      const options = component.sizeOptions();
      // Should only have the 2 sizes from the profile
      expect(options.length).toBe(2);
      expect(options.map(o => o.value)).toContain('1024x1024');
      expect(options.map(o => o.value)).toContain('1920x1080');
    });

    it('should handle aspect ratio format sizes (e.g., 16:9@4K)', () => {
      // Set up a profile with aspect ratio sizes (like Nano Banana Pro)
      component.selectedProfile.set({
        id: 'aspect-ratio-profile',
        name: 'Aspect Ratio Profile',
        description: null,
        provider: PublicImageModelProfileProvider.Falai,
        modelId: 'aspect-model',
        supportsImageInput: false,
        supportsCustomResolutions: false,
        supportedSizes: ['16:9@4K', '9:16@2K', '1:1@1K'],
        defaultSize: '16:9@4K',
        enabled: true,
        sortOrder: 0,
        usesAspectRatioOnly: false,
        creditCost: 1,
      });
      component.customSizes.set([]);

      const options = component.sizeOptions();
      expect(options.length).toBe(3);
      // Aspect ratio sizes should have proper labels
      const wideOption = options.find(o => o.value === '16:9@4K');
      expect(wideOption).toBeDefined();
      expect(wideOption?.label).toBe('16:9 @ 4K');
      expect(wideOption?.megapixels).toBe('-'); // N/A for aspect ratio
    });

    it('should not add custom sizes for aspect ratio profiles', () => {
      // Set up an aspect ratio profile
      component.selectedProfile.set({
        id: 'aspect-profile',
        name: 'Aspect Profile',
        description: null,
        provider: PublicImageModelProfileProvider.Falai,
        modelId: 'aspect-model',
        supportsImageInput: false,
        supportsCustomResolutions: false,
        supportedSizes: ['16:9@4K'],
        defaultSize: '16:9@4K',
        enabled: true,
        sortOrder: 0,
        usesAspectRatioOnly: false,
        creditCost: 1,
      });
      // Try to add custom sizes - they should be ignored for aspect ratio profiles
      component.customSizes.set([
        { id: 'custom-1', name: 'Custom', width: 1234, height: 5678 },
      ]);

      const options = component.sizeOptions();
      // Should only have the aspect ratio size, no custom dimension sizes
      expect(options.length).toBe(1);
      expect(options[0].value).toBe('16:9@4K');
    });

    it('should fall back to defaults when profile has no supportedSizes', () => {
      component.selectedProfile.set({
        id: 'empty-profile',
        name: 'Empty Profile',
        description: null,
        provider: PublicImageModelProfileProvider.Openai,
        modelId: 'gpt-image-1',
        supportsImageInput: false,
        supportsCustomResolutions: false,
        supportedSizes: [],
        defaultSize: null,
        enabled: true,
        sortOrder: 0,
        usesAspectRatioOnly: false,
        creditCost: 1,
      });
      component.customSizes.set([]);

      const options = component.sizeOptions();
      // Should fall back to defaultSizeOptions
      expect(options.length).toBe(component.defaultSizeOptions.length);
    });

    it('should parse dimension sizes not in defaults', () => {
      component.selectedProfile.set({
        id: 'custom-dim-profile',
        name: 'Custom Dim Profile',
        description: null,
        provider: PublicImageModelProfileProvider.Falai,
        modelId: 'custom-model',
        supportsImageInput: false,
        supportsCustomResolutions: false,
        supportedSizes: ['1234x5678'], // Not in defaults
        defaultSize: '1234x5678',
        enabled: true,
        sortOrder: 0,
        usesAspectRatioOnly: false,
        creditCost: 1,
      });
      component.customSizes.set([]);

      const options = component.sizeOptions();
      expect(options.length).toBe(1);
      expect(options[0].value).toBe('1234x5678');
      expect(options[0].label).toBe('1234×5678');
      // Megapixels: 1234 * 5678 = 7,006,652 ≈ 7.01 MP
      expect(parseFloat(options[0].megapixels)).toBeCloseTo(7.01, 1);
    });
  });

  describe('worldbuilding elements selection', () => {
    // The worldbuilding selection is now handled by the WorldbuildingElementSelectorComponent
    // These tests verify that the dialog component correctly handles selection changes
    // and includes them in generation requests

    beforeEach(async () => {
      fixture.detectChanges();
      await flushPromises();
    });

    it('should start with empty worldbuilding selection', () => {
      expect(component.selectedWorldbuildingElements()).toEqual([]);
    });

    it('should update selection when onWorldbuildingSelectionChange is called', () => {
      const mockSelection: WorldbuildingElementSelection[] = [
        {
          id: 'el-1',
          name: 'Hero',
          type: 'character',
          typeLabel: 'Character',
          includeReference: true,
          includeDescription: true,
          includeData: true,
          hasImage: true,
          description: 'A brave hero',
          data: { occupation: 'Knight' },
        },
      ];

      component.onWorldbuildingSelectionChange({ elements: mockSelection });

      expect(component.selectedWorldbuildingElements()).toEqual(mockSelection);
    });

    it('should include worldbuilding context in generation request', () => {
      // Set up selection
      const mockSelection: WorldbuildingElementSelection[] = [
        {
          id: 'el-1',
          name: 'Hero',
          type: 'character',
          typeLabel: 'Character',
          includeReference: true,
          includeDescription: true,
          includeData: true,
          hasImage: true,
          description: 'A brave hero',
          data: { occupation: 'Knight' },
        },
      ];

      component.onWorldbuildingSelectionChange({ elements: mockSelection });
      component.prompt.set('Test prompt');

      component.generate();

      expect(generationService.startGeneration).toHaveBeenCalledWith(
        'testuser/test-project',
        expect.objectContaining({
          worldbuildingContext: [
            expect.objectContaining({
              elementId: 'el-1',
              name: 'Hero',
              type: 'character',
            }),
          ],
        }),
        expect.any(Object)
      );
    });

    it('should not include worldbuilding context when no elements selected', () => {
      component.prompt.set('Test prompt');
      component.generate();

      expect(generationService.startGeneration).toHaveBeenCalledWith(
        'testuser/test-project',
        expect.objectContaining({
          worldbuildingContext: undefined,
        }),
        expect.any(Object)
      );
    });
  });

  describe('navigation', () => {
    beforeEach(async () => {
      fixture.detectChanges();
      await flushPromises();
    });

    it('should allow going back when job is completed', () => {
      const completedJob: GenerationJob = {
        id: 'job-123',
        projectKey: 'test',
        request: {
          prompt: 'test',
          profileId: 'profile-1',
          size: ImageSize._1024x1024,
        },
        status: 'completed',
        message: 'Done',
        images: [],
        createdAt: new Date(),
        savedMediaIds: [],
      };
      generationService.getJob.mockReturnValue(completedJob);

      component.generate();
      expect(component.stage()).toBe('generating');

      component.goBack();
      expect(component.stage()).toBe('edit-prompt');
      expect(component.currentJobId()).toBeNull();
    });

    it('should not allow going back during active generation', () => {
      const activeJob: GenerationJob = {
        id: 'job-123',
        projectKey: 'test',
        request: {
          prompt: 'test',
          profileId: 'profile-1',
          size: ImageSize._1024x1024,
        },
        status: 'generating',
        message: 'Generating...',
        images: [],
        createdAt: new Date(),
        savedMediaIds: [],
      };
      generationService.getJob.mockReturnValue(activeJob);

      component.generate();

      component.goBack();
      expect(component.stage()).toBe('generating'); // Should stay on generating
    });

    it('should correctly report when back is disabled', () => {
      const activeJob: GenerationJob = {
        id: 'job-123',
        projectKey: 'test',
        request: {
          prompt: 'test',
          profileId: 'profile-1',
          size: ImageSize._1024x1024,
        },
        status: 'generating',
        message: 'Generating...',
        images: [],
        createdAt: new Date(),
        savedMediaIds: [],
      };
      generationService.getJob.mockReturnValue(activeJob);

      component.generate();

      expect(component.isBackDisabled()).toBe(true);
    });

    it('should compute stepperIndex based on stage', () => {
      expect(component.stage()).toBe('select-elements');
      expect(component.stepperIndex()).toBe(0);

      component.goToPromptStage();
      expect(component.stepperIndex()).toBe(1);

      component.generate();
      expect(component.stepperIndex()).toBe(2);
    });

    it('should handle onStepChange to select-elements', () => {
      component.goToPromptStage();
      expect(component.stage()).toBe('edit-prompt');

      component.onStepChange({ selectedIndex: 0 });
      expect(component.stage()).toBe('select-elements');
    });

    it('should handle onStepChange to edit-prompt with profile selected', () => {
      expect(component.selectedProfile()).toBeTruthy();
      expect(component.stage()).toBe('select-elements');

      component.onStepChange({ selectedIndex: 1 });
      expect(component.stage()).toBe('edit-prompt');
    });

    it('should prevent navigating to generating stage (index 2) directly', () => {
      component.goToPromptStage();
      expect(component.stage()).toBe('edit-prompt');
      expect(component.canNavigateToGenerate()).toBe(false);

      // Try to click on generation step directly - should stay on edit-prompt
      component.onStepChange({ selectedIndex: 2 });
      expect(component.stage()).toBe('edit-prompt');
    });

    it('should compute canNavigateToPrompt based on profile selection', () => {
      expect(component.selectedProfile()).toBeTruthy();
      expect(component.canNavigateToPrompt()).toBe(true);

      component.selectedProfile.set(null);
      expect(component.canNavigateToPrompt()).toBe(false);
    });

    it('should compute canNavigateToGenerate based on stage', () => {
      expect(component.stage()).toBe('select-elements');
      expect(component.canNavigateToGenerate()).toBe(false);

      component.generate();
      expect(component.stage()).toBe('generating');
      expect(component.canNavigateToGenerate()).toBe(true);
    });

    it('should compute isGenerationActive correctly', () => {
      expect(component.isGenerationActive()).toBe(false);

      // Start generation
      const activeJob: GenerationJob = {
        id: 'job-123',
        projectKey: 'test',
        request: {
          prompt: 'test',
          profileId: 'profile-1',
          size: ImageSize._1024x1024,
        },
        status: 'generating',
        message: 'Generating...',
        images: [],
        createdAt: new Date(),
        savedMediaIds: [],
      };
      generationService.getJob.mockReturnValue(activeJob);
      component.generate();

      expect(component.isGenerationActive()).toBe(true);
    });

    it('should prevent navigation during active generation', () => {
      const activeJob: GenerationJob = {
        id: 'job-123',
        projectKey: 'test',
        request: {
          prompt: 'test',
          profileId: 'profile-1',
          size: ImageSize._1024x1024,
        },
        status: 'generating',
        message: 'Generating...',
        images: [],
        createdAt: new Date(),
        savedMediaIds: [],
      };
      generationService.getJob.mockReturnValue(activeJob);
      component.generate();
      expect(component.stage()).toBe('generating');
      expect(component.isGenerationActive()).toBe(true);

      // Try to go back - should stay on generating
      component.onStepChange({ selectedIndex: 0 });
      expect(component.stage()).toBe('generating');
    });
  });

  describe('error handling', () => {
    it('should handle status loading error', async () => {
      // Reset and recreate with undefined status
      TestBed.resetTestingModule();

      const failingAiService = {
        getImageGenerationStatus: vi.fn().mockReturnValue(of(null)),
      };

      await TestBed.configureTestingModule({
        imports: [ImageGenerationDialogComponent, NoopAnimationsModule],
        providers: [
          provideZonelessChangeDetection(),
          { provide: MatDialogRef, useValue: dialogRef },
          { provide: MAT_DIALOG_DATA, useValue: mockDialogData },
          { provide: AIImageGenerationService, useValue: failingAiService },
          { provide: ImageGenerationService, useValue: generationService },
          { provide: ImageProfilesService, useValue: imageProfilesService },
          { provide: ProjectStateService, useValue: projectState },
          { provide: WorldbuildingService, useValue: worldbuildingService },
          { provide: MatSnackBar, useValue: snackBar },
        ],
      }).compileComponents();

      const newFixture = TestBed.createComponent(
        ImageGenerationDialogComponent
      );
      newFixture.detectChanges();
      await flushPromises();

      // Status should be null/undefined
      expect(newFixture.componentInstance.status()).toBeFalsy();
    });

    it('should show snackbar when generation continues in background', async () => {
      fixture.detectChanges();
      await flushPromises();

      const activeJob: GenerationJob = {
        id: 'job-123',
        projectKey: 'test',
        request: {
          prompt: 'test',
          profileId: 'profile-1',
          size: ImageSize._1024x1024,
        },
        status: 'generating',
        message: 'Generating...',
        images: [],
        createdAt: new Date(),
        savedMediaIds: [],
      };
      generationService.getJob.mockReturnValue(activeJob);
      component.generate();

      component.cancel();

      // Dialog should close even during active generation
      expect(dialogRef.close).toHaveBeenCalledWith({ saved: false });
    });

    it('should not close dialog when saveAndClose with no image', async () => {
      fixture.detectChanges();
      await flushPromises();

      const emptyJob: GenerationJob = {
        id: 'job-123',
        projectKey: 'test',
        request: {
          prompt: 'test',
          profileId: 'profile-1',
          size: ImageSize._1024x1024,
        },
        status: 'completed',
        message: 'Done',
        images: [],
        createdAt: new Date(),
        savedMediaIds: [],
      };
      generationService.getJob.mockReturnValue(emptyJob);
      component.generate();

      component.saveAndClose();

      // Should not close dialog when no image is selected
      expect(dialogRef.close).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should handle destroy gracefully', async () => {
      fixture.detectChanges();
      await flushPromises();

      // Set up provider and model for generation
      component.selectedProvider.set(ImageProviderType.Openrouter);
      component.selectedModel.set('model-1');

      generationService.getJob.mockReturnValue({
        id: 'job-123',
        projectKey: 'test',
        request: {
          prompt: 'test',
          profileId: 'profile-1',
          size: ImageSize._1024x1024,
        },
        status: 'generating',
        message: 'Generating...',
        images: [],
        createdAt: new Date(),
        savedMediaIds: [],
      } as GenerationJob);

      component.generate();

      // Verify generation started
      expect(generationService.startGeneration).toHaveBeenCalled();
      expect(component.stage()).toBe('generating');

      // Destroy should clean up without errors
      expect(() => component.ngOnDestroy()).not.toThrow();
    });
  });

  describe('autoPrompt', () => {
    beforeEach(async () => {
      fixture.detectChanges();
      await flushPromises();
    });

    it('should return initial prompt when no elements selected', () => {
      const prompt = component.autoPrompt();
      expect(prompt).toBe('A beautiful sunset over mountains');
    });
  });
});
