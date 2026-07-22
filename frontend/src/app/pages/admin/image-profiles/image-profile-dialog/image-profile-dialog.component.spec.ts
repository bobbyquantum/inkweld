import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import {
  type AdminImageModelProfile,
  AdminImageModelProfileProvider,
  type AdminListImageProviders200ResponseInner,
  AIImageGenerationService,
  AIProvidersService,
  CreateImageModelProfileRequestProvider,
  type ImageModelInfo,
  ImageProviderType,
} from 'api-client';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { translocoTestProvider } from '../../../../../testing/transloco-test-provider';

import {
  ImageProfileDialogComponent,
  type ImageProfileDialogData,
} from './image-profile-dialog.component';

describe('ImageProfileDialogComponent', () => {
  let component: ImageProfileDialogComponent;
  let mockDialogRef: { close: ReturnType<typeof vi.fn> };
  let mockAiImageService: {
    getProviderModels: ReturnType<typeof vi.fn>;
  };
  let mockAiProvidersService: {
    getOpenRouterImageModels: ReturnType<typeof vi.fn>;
    getFalaiModels: ReturnType<typeof vi.fn>;
    getWorkersAiImageModels: ReturnType<typeof vi.fn>;
  };

  const mockProviders: AdminListImageProviders200ResponseInner[] = [
    { id: 'openai', name: 'OpenAI' },
    { id: 'openrouter', name: 'OpenRouter' },
    { id: 'falai', name: 'Fal.ai' },
    { id: 'stable-diffusion', name: 'Stable Diffusion' },
  ];

  const mockModels: ImageModelInfo[] = [
    {
      id: 'black-forest-labs/flux-pro',
      name: 'FLUX Pro',
      provider: ImageProviderType.Openrouter,
      supportedSizes: ['1024x1024', '1024x768'],
      supportsQuality: false,
      supportsStyle: false,
      maxImages: 1,
    },
    {
      id: 'black-forest-labs/flux-schnell',
      name: 'FLUX Schnell',
      provider: ImageProviderType.Openrouter,
      supportedSizes: ['1024x1024'],
      supportsQuality: false,
      supportsStyle: false,
      maxImages: 1,
    },
    {
      id: 'stability-ai/sdxl',
      name: 'Stable Diffusion XL',
      provider: ImageProviderType.Openrouter,
      supportedSizes: ['1024x1024'],
      supportsQuality: false,
      supportsStyle: false,
      maxImages: 1,
    },
  ];

  const createComponent = async (data: ImageProfileDialogData) => {
    mockDialogRef = { close: vi.fn() };
    mockAiImageService = {
      getProviderModels: vi.fn().mockReturnValue(of({ models: mockModels })),
    };
    // Mock the new dynamic model fetching service
    const mockImageModels = mockModels.map(m => ({
      id: m.id,
      name: m.name,
      description: m.description,
      provider: m.provider,
    }));
    mockAiProvidersService = {
      getOpenRouterImageModels: vi
        .fn()
        .mockReturnValue(of({ models: mockImageModels, cached: false })),
      getFalaiModels: vi
        .fn()
        .mockReturnValue(of({ models: mockImageModels, cached: false })),
      getWorkersAiImageModels: vi
        .fn()
        .mockReturnValue(of({ models: mockImageModels, cached: false })),
    };

    await TestBed.configureTestingModule({
      imports: [
        translocoTestProvider(),
        ImageProfileDialogComponent,
        MatDialogModule,
      ],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: AIImageGenerationService, useValue: mockAiImageService },
        { provide: AIProvidersService, useValue: mockAiProvidersService },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ImageProfileDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  describe('create mode', () => {
    beforeEach(async () => {
      await createComponent({
        mode: 'create',
        providers: mockProviders,
      });
    });

    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should be in create mode', () => {
      expect(component.isEditMode).toBe(false);
    });

    it('should have empty form fields', () => {
      expect(component.model().name).toBe('');
      expect(component.model().provider).toBe('');
      expect(component.model().modelId).toBe('');
      expect(component.model().enabled).toBe(true);
    });

    it('should require name and provider', () => {
      expect(component.form().valid()).toBe(false);

      component.form.name().value.set('Test Profile');
      component.form.provider().value.set('openai');
      component.form.modelId().value.set('gpt-image-1');

      expect(component.form().valid()).toBe(true);
    });

    it('should submit form with values', () => {
      component.model.set({
        name: 'Test Profile',
        description: 'A test profile',
        provider: 'openai',
        modelId: 'gpt-image-1',
        enabled: true,
        supportsImageInput: false,
        supportsCustomResolutions: false,
        usesAspectRatioOnly: false,
        supportedSizes: [],
        defaultSize: '',
        sortOrder: 0,
        modelConfigJson: '',
      });

      component.onSubmit();

      expect(mockDialogRef.close).toHaveBeenCalledWith({
        name: 'Test Profile',
        description: 'A test profile',
        provider: CreateImageModelProfileRequestProvider.Openai,
        modelId: 'gpt-image-1',
        enabled: true,
        supportsImageInput: false,
        supportsCustomResolutions: false,
        supportedSizes: undefined,
        defaultSize: undefined,
        sortOrder: 0,
        modelConfig: undefined,
        usesAspectRatioOnly: false,
      });
    });

    it('should cancel dialog', () => {
      component.onCancel();
      expect(mockDialogRef.close).toHaveBeenCalledWith();
    });
  });

  describe('edit mode', () => {
    const existingProfile: AdminImageModelProfile = {
      id: 'profile-1',
      name: 'GPT Image 1 High Quality',
      description: 'High-quality images',
      provider: AdminImageModelProfileProvider.Openai,
      modelId: 'gpt-image-1',
      enabled: true,
      supportsImageInput: false,
      supportsCustomResolutions: false,
      supportedSizes: ['1024x1024', '1792x1024'],
      defaultSize: '1024x1024',
      sortOrder: 5,
      modelConfig: { quality: 'hd' },
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      usesAspectRatioOnly: false,
      creditCost: 1,
    };

    beforeEach(async () => {
      await createComponent({
        mode: 'edit',
        profile: existingProfile,
        providers: mockProviders,
      });
    });

    it('should be in edit mode', () => {
      expect(component.isEditMode).toBe(true);
    });

    it('should populate form with existing values', () => {
      expect(component.model().name).toBe('GPT Image 1 High Quality');
      expect(component.model().description).toBe('High-quality images');
      expect(component.model().provider).toBe('openai');
      expect(component.model().modelId).toBe('gpt-image-1');
      expect(component.model().enabled).toBe(true);
      expect(component.model().sortOrder).toBe(5);
    });

    it('should populate sizes array', () => {
      expect(component.sizesArray.length).toBe(2);
      expect(component.sizesArray[0]).toBe('1024x1024');
      expect(component.sizesArray[1]).toBe('1792x1024');
    });

    it('should show model config when profile has config', () => {
      expect(component.showModelConfig()).toBe(true);
    });
  });

  describe('sizes management', () => {
    beforeEach(async () => {
      await createComponent({
        mode: 'create',
        providers: mockProviders,
      });
    });

    it('should add size', () => {
      expect(component.sizesArray.length).toBe(0);
      component.addSize();
      expect(component.sizesArray.length).toBe(1);
    });

    it('should remove size', () => {
      component.addSize();
      component.addSize();
      expect(component.sizesArray.length).toBe(2);

      component.removeSize(0);
      expect(component.sizesArray.length).toBe(1);
    });
  });

  describe('model config toggle', () => {
    beforeEach(async () => {
      await createComponent({
        mode: 'create',
        providers: mockProviders,
      });
    });

    it('should toggle model config visibility', () => {
      expect(component.showModelConfig()).toBe(false);
      component.toggleModelConfig();
      expect(component.showModelConfig()).toBe(true);
      component.toggleModelConfig();
      expect(component.showModelConfig()).toBe(false);
    });
  });

  describe('model browsing', () => {
    beforeEach(async () => {
      await createComponent({
        mode: 'create',
        providers: mockProviders,
      });
    });

    it('should indicate browsable providers', () => {
      expect(component.browsableProviders).toContain('openrouter');
      expect(component.browsableProviders).toContain('falai');
      expect(component.browsableProviders).not.toContain('openai');
    });

    it('should not allow browsing for non-browsable providers', () => {
      component.form.provider().value.set('openai');
      expect(component.canBrowseModels()).toBe(false);
    });

    it('should allow browsing for OpenRouter', () => {
      component.form.provider().value.set('openrouter');
      expect(component.canBrowseModels()).toBe(true);
    });

    it('should allow browsing for Fal.ai', () => {
      component.form.provider().value.set('falai');
      expect(component.canBrowseModels()).toBe(true);
    });

    it('should load models when provider is browsable', async () => {
      component.form.provider().value.set('openrouter');
      await component.loadModelsForProvider();

      expect(
        mockAiProvidersService.getOpenRouterImageModels
      ).toHaveBeenCalled();
      expect(component.availableModels().length).toBe(3);
    });

    it('should not load models when provider is not browsable', async () => {
      component.form.provider().value.set('openai');
      await component.loadModelsForProvider();

      expect(
        mockAiProvidersService.getOpenRouterImageModels
      ).not.toHaveBeenCalled();
      expect(mockAiProvidersService.getFalaiModels).not.toHaveBeenCalled();
      expect(component.availableModels().length).toBe(0);
    });

    it('should handle model loading error gracefully', async () => {
      mockAiProvidersService.getOpenRouterImageModels.mockReturnValue(
        throwError(() => new Error('API Error'))
      );
      component.form.provider().value.set('openrouter');
      await component.loadModelsForProvider();

      expect(component.availableModels().length).toBe(0);
      expect(component.isLoadingModels()).toBe(false);
    });

    it('should filter models by search term', async () => {
      component.form.provider().value.set('openrouter');
      await component.loadModelsForProvider();

      component.modelSearchTerm.set('flux');
      const filtered = component.filteredModels();

      expect(filtered.length).toBe(2);
      expect(filtered[0].name).toBe('FLUX Pro');
      expect(filtered[1].name).toBe('FLUX Schnell');
    });

    it('should filter models by ID', async () => {
      component.form.provider().value.set('openrouter');
      await component.loadModelsForProvider();

      component.modelSearchTerm.set('stability');
      const filtered = component.filteredModels();

      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe('stability-ai/sdxl');
    });

    it('should select model and populate form', async () => {
      component.form.provider().value.set('openrouter');
      await component.loadModelsForProvider();

      const model = mockModels[0];
      component.selectModel(model);

      expect(component.model().modelId).toBe('black-forest-labs/flux-pro');
      expect(component.sizesArray.length).toBe(2);
      expect(component.sizesArray[0]).toBe('1024x1024');
      expect(component.model().defaultSize).toBe('1024x1024');
    });

    it('should display model name correctly', () => {
      const model = mockModels[0];
      expect(component.displayModel(model)).toBe('FLUX Pro');
    });

    it('should handle model without name in display', () => {
      const model = { id: 'some-model' } as unknown as ImageModelInfo;
      expect(component.displayModel(model)).toBe('');
    });

    it('should call loadModelsForProvider on provider change for browsable providers', () => {
      // Set provider to openrouter (a browsable provider)
      component.form.provider().value.set('openrouter');
      const loadSpy = vi.spyOn(component, 'loadModelsForProvider');
      component.onProviderChange();
      expect(loadSpy).toHaveBeenCalled();
    });

    it('should not call loadModelsForProvider for OpenAI (uses hardcoded models)', () => {
      component.form.provider().value.set('openai');
      const loadSpy = vi.spyOn(component, 'loadModelsForProvider');
      component.onProviderChange();
      expect(loadSpy).not.toHaveBeenCalled();
    });

    it('should not call loadModelsForProvider immediately for Fal.ai (waits for category)', () => {
      component.form.provider().value.set('falai');
      const loadSpy = vi.spyOn(component, 'loadModelsForProvider');
      component.onProviderChange();
      expect(loadSpy).not.toHaveBeenCalled();
    });

    it('should update search term on input', () => {
      const event = { target: { value: 'test search' } } as unknown as Event;
      component.onModelSearchInput(event);
      expect(component.modelSearchTerm()).toBe('test search');
    });
  });
});
