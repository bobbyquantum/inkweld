import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import {
  AdminImageModelProfile,
  AdminImageModelProfileProvider,
  AdminListImageProviders200ResponseInner,
  AIImageGenerationService,
  AIProvidersService,
  CreateImageModelProfileRequestProvider,
  ImageModelInfo,
  ImageProviderType,
} from 'api-client';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';

import {
  ImageProfileDialogComponent,
  ImageProfileDialogData,
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
    };

    await TestBed.configureTestingModule({
      imports: [
        ImageProfileDialogComponent,
        FormsModule,
        ReactiveFormsModule,
        MatAutocompleteModule,
        MatButtonModule,
        MatCheckboxModule,
        MatDialogModule,
        MatFormFieldModule,
        MatIconModule,
        MatInputModule,
        MatProgressSpinnerModule,
        MatSelectModule,
        MatSlideToggleModule,
        MatTooltipModule,
      ],
      providers: [
        provideZonelessChangeDetection(),
        provideNoopAnimations(),
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
      expect(component.form.get('name')?.value).toBe('');
      expect(component.form.get('provider')?.value).toBe('');
      expect(component.form.get('modelId')?.value).toBe('');
      expect(component.form.get('enabled')?.value).toBe(true);
    });

    it('should require name and provider', () => {
      expect(component.form.valid).toBe(false);

      component.form.patchValue({
        name: 'Test Profile',
        provider: 'openai',
        modelId: 'gpt-image-1',
      });

      expect(component.form.valid).toBe(true);
    });

    it('should submit form with values', () => {
      component.form.patchValue({
        name: 'Test Profile',
        description: 'A test profile',
        provider: 'openai',
        modelId: 'gpt-image-1',
        enabled: true,
        supportsImageInput: false,
        supportsCustomResolutions: false,
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
      expect(component.form.get('name')?.value).toBe(
        'GPT Image 1 High Quality'
      );
      expect(component.form.get('description')?.value).toBe(
        'High-quality images'
      );
      expect(component.form.get('provider')?.value).toBe('openai');
      expect(component.form.get('modelId')?.value).toBe('gpt-image-1');
      expect(component.form.get('enabled')?.value).toBe(true);
      expect(component.form.get('sortOrder')?.value).toBe(5);
    });

    it('should populate sizes array', () => {
      expect(component.sizesArray.length).toBe(2);
      expect(component.sizesArray.at(0).value).toBe('1024x1024');
      expect(component.sizesArray.at(1).value).toBe('1792x1024');
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
      component.form.patchValue({ provider: 'openai' });
      expect(component.canBrowseModels()).toBe(false);
    });

    it('should allow browsing for OpenRouter', () => {
      component.form.patchValue({ provider: 'openrouter' });
      expect(component.canBrowseModels()).toBe(true);
    });

    it('should allow browsing for Fal.ai', () => {
      component.form.patchValue({ provider: 'falai' });
      expect(component.canBrowseModels()).toBe(true);
    });

    it('should load models when provider is browsable', async () => {
      component.form.patchValue({ provider: 'openrouter' });
      await component.loadModelsForProvider();

      expect(
        mockAiProvidersService.getOpenRouterImageModels
      ).toHaveBeenCalled();
      expect(component.availableModels().length).toBe(3);
    });

    it('should not load models when provider is not browsable', async () => {
      component.form.patchValue({ provider: 'openai' });
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
      component.form.patchValue({ provider: 'openrouter' });
      await component.loadModelsForProvider();

      expect(component.availableModels().length).toBe(0);
      expect(component.isLoadingModels()).toBe(false);
    });

    it('should filter models by search term', async () => {
      component.form.patchValue({ provider: 'openrouter' });
      await component.loadModelsForProvider();

      component.modelSearchTerm.set('flux');
      const filtered = component.filteredModels();

      expect(filtered.length).toBe(2);
      expect(filtered[0].name).toBe('FLUX Pro');
      expect(filtered[1].name).toBe('FLUX Schnell');
    });

    it('should filter models by ID', async () => {
      component.form.patchValue({ provider: 'openrouter' });
      await component.loadModelsForProvider();

      component.modelSearchTerm.set('stability');
      const filtered = component.filteredModels();

      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe('stability-ai/sdxl');
    });

    it('should select model and populate form', async () => {
      component.form.patchValue({ provider: 'openrouter' });
      await component.loadModelsForProvider();

      const model = mockModels[0];
      component.selectModel(model);

      expect(component.form.get('modelId')?.value).toBe(
        'black-forest-labs/flux-pro'
      );
      expect(component.sizesArray.length).toBe(2);
      expect(component.sizesArray.at(0).value).toBe('1024x1024');
      expect(component.form.get('defaultSize')?.value).toBe('1024x1024');
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
      component.form.patchValue({ provider: 'openrouter' });
      const loadSpy = vi.spyOn(component, 'loadModelsForProvider');
      component.onProviderChange();
      expect(loadSpy).toHaveBeenCalled();
    });

    it('should not call loadModelsForProvider for OpenAI (uses hardcoded models)', () => {
      component.form.patchValue({ provider: 'openai' });
      const loadSpy = vi.spyOn(component, 'loadModelsForProvider');
      component.onProviderChange();
      expect(loadSpy).not.toHaveBeenCalled();
    });

    it('should not call loadModelsForProvider immediately for Fal.ai (waits for category)', () => {
      component.form.patchValue({ provider: 'falai' });
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
