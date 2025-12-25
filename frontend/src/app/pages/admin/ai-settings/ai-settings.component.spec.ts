/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import {
  AdminConfigService,
  ConfigValue,
} from '@services/admin/admin-config.service';
import { SystemConfigService } from '@services/core/system-config.service';
import { AIImageGenerationService } from 'api-client';
import { of } from 'rxjs';
import { type MockedObject, vi } from 'vitest';

import { AdminAiSettingsComponent } from './ai-settings.component';

async function flushPromises(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
}

describe('AdminAiSettingsComponent', () => {
  let component: AdminAiSettingsComponent;
  let mockConfigService: MockedObject<AdminConfigService>;
  let mockImageService: MockedObject<AIImageGenerationService>;
  let mockSystemConfigService: {
    isAiKillSwitchEnabled: ReturnType<typeof signal<boolean>>;
    isAiKillSwitchLockedByEnv: ReturnType<typeof signal<boolean>>;
  };

  const createMockConfig = (
    overrides: Partial<Record<string, ConfigValue>> = {}
  ): Record<string, ConfigValue> => ({
    AI_IMAGE_ENABLED: {
      key: 'AI_IMAGE_ENABLED',
      value: 'true',
      source: 'database',
    },
    AI_IMAGE_DEFAULT_PROVIDER: {
      key: 'AI_IMAGE_DEFAULT_PROVIDER',
      value: 'openai',
      source: 'database',
    },
    OPENAI_API_KEY: {
      key: 'OPENAI_API_KEY',
      value: '********',
      source: 'database',
    },
    AI_IMAGE_OPENAI_ENABLED: {
      key: 'AI_IMAGE_OPENAI_ENABLED',
      value: 'true',
      source: 'database',
    },
    AI_IMAGE_OPENAI_MODELS: {
      key: 'AI_IMAGE_OPENAI_MODELS',
      value: '',
      source: 'database',
    },
    AI_IMAGE_OPENROUTER_API_KEY: {
      key: 'AI_IMAGE_OPENROUTER_API_KEY',
      value: '',
      source: 'database',
    },
    AI_IMAGE_OPENROUTER_ENABLED: {
      key: 'AI_IMAGE_OPENROUTER_ENABLED',
      value: 'false',
      source: 'database',
    },
    AI_IMAGE_OPENROUTER_MODELS: {
      key: 'AI_IMAGE_OPENROUTER_MODELS',
      value: '',
      source: 'database',
    },
    AI_IMAGE_SD_API_KEY: {
      key: 'AI_IMAGE_SD_API_KEY',
      value: '',
      source: 'database',
    },
    AI_IMAGE_SD_ENABLED: {
      key: 'AI_IMAGE_SD_ENABLED',
      value: 'false',
      source: 'database',
    },
    AI_IMAGE_SD_ENDPOINT: {
      key: 'AI_IMAGE_SD_ENDPOINT',
      value: 'http://localhost:7860',
      source: 'database',
    },
    ...overrides,
  });

  beforeEach(async () => {
    mockConfigService = {
      getAllConfig: vi.fn().mockResolvedValue(createMockConfig()),
      setConfig: vi.fn().mockResolvedValue(undefined),
      deleteConfig: vi.fn().mockResolvedValue(undefined),
      getConfig: vi.fn().mockResolvedValue(null),
    } as unknown as MockedObject<AdminConfigService>;

    mockImageService = {
      getCustomImageSizes: vi.fn().mockReturnValue(of({ sizes: [], total: 0 })),
      updateCustomImageSizes: vi
        .fn()
        .mockReturnValue(of({ sizes: [], total: 0 })),
    } as unknown as MockedObject<AIImageGenerationService>;

    mockSystemConfigService = {
      isAiKillSwitchEnabled: signal(false),
      isAiKillSwitchLockedByEnv: signal(false),
    };

    await TestBed.configureTestingModule({
      imports: [
        AdminAiSettingsComponent,
        FormsModule,
        MatButtonModule,
        MatCardModule,
        MatDividerModule,
        MatExpansionModule,
        MatFormFieldModule,
        MatIconModule,
        MatInputModule,
        MatListModule,
        MatProgressSpinnerModule,
        MatSelectModule,
        MatSlideToggleModule,
        MatSnackBarModule,
        MatTooltipModule,
      ],
      providers: [
        provideZonelessChangeDetection(),
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AdminConfigService, useValue: mockConfigService },
        { provide: AIImageGenerationService, useValue: mockImageService },
        { provide: SystemConfigService, useValue: mockSystemConfigService },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AdminAiSettingsComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Component Creation', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should initialize with loading state', () => {
      expect(component.isLoading()).toBe(true);
      expect(component.isSaving()).toBe(false);
      expect(component.error()).toBeNull();
    });
  });

  describe('ngOnInit and Configuration Loading', () => {
    it('should load configuration on init', async () => {
      component.ngOnInit();
      await flushPromises();

      expect(mockConfigService.getAllConfig).toHaveBeenCalled();
      expect(component.isLoading()).toBe(false);
    });

    it('should set image generation enabled from config', async () => {
      component.ngOnInit();
      await flushPromises();

      expect(component.imageGenerationEnabled()).toBe(true);
    });

    it('should set default provider from config', async () => {
      component.ngOnInit();
      await flushPromises();

      expect(component.defaultProvider()).toBe('openai');
    });

    it('should detect OpenAI API key presence', async () => {
      component.ngOnInit();
      await flushPromises();

      expect(component.openaiConfig().hasApiKey).toBe(true);
      expect(component.openaiConfig().enabled).toBe(true);
    });

    it('should detect OpenRouter config', async () => {
      mockConfigService.getAllConfig.mockResolvedValue(
        createMockConfig({
          AI_IMAGE_OPENROUTER_API_KEY: {
            key: 'AI_IMAGE_OPENROUTER_API_KEY',
            value: '********',
            source: 'database',
          },
          AI_IMAGE_OPENROUTER_ENABLED: {
            key: 'AI_IMAGE_OPENROUTER_ENABLED',
            value: 'true',
            source: 'database',
          },
        })
      );

      component.ngOnInit();
      await flushPromises();

      expect(component.openrouterConfig().hasApiKey).toBe(true);
      expect(component.openrouterConfig().enabled).toBe(true);
    });

    it('should detect Stable Diffusion config', async () => {
      mockConfigService.getAllConfig.mockResolvedValue(
        createMockConfig({
          AI_IMAGE_SD_API_KEY: {
            key: 'AI_IMAGE_SD_API_KEY',
            value: '********',
            source: 'database',
          },
          AI_IMAGE_SD_ENABLED: {
            key: 'AI_IMAGE_SD_ENABLED',
            value: 'true',
            source: 'database',
          },
        })
      );

      component.ngOnInit();
      await flushPromises();

      expect(component.sdConfig().hasApiKey).toBe(true);
      expect(component.sdConfig().enabled).toBe(true);
      expect(component.sdConfig().endpoint).toBe('http://localhost:7860');
    });

    it('should handle config load error', async () => {
      mockConfigService.getAllConfig.mockRejectedValue(
        new Error('Network error')
      );

      component.ngOnInit();
      await flushPromises();

      expect(component.error()).toBeInstanceOf(Error);
      expect(component.isLoading()).toBe(false);
    });

    it('should convert non-Error exceptions to Error objects', async () => {
      mockConfigService.getAllConfig.mockRejectedValue('string error');

      component.ngOnInit();
      await flushPromises();

      expect(component.error()).toBeInstanceOf(Error);
      expect(component.error()?.message).toBe('Failed to load configuration');
    });
  });

  describe('Global Settings', () => {
    beforeEach(async () => {
      component.ngOnInit();
      await flushPromises();
    });

    it('should save global enabled setting', async () => {
      await component.saveGlobalEnabled(false);

      expect(mockConfigService.setConfig).toHaveBeenCalledWith(
        'AI_IMAGE_ENABLED',
        'false'
      );
      expect(component.imageGenerationEnabled()).toBe(false);
    });

    it('should revert on save global enabled error', async () => {
      mockConfigService.setConfig.mockRejectedValue(new Error('Save failed'));

      await component.saveGlobalEnabled(false);

      // Should revert to opposite of what was passed
      expect(component.imageGenerationEnabled()).toBe(true);
    });

    it('should save default provider', async () => {
      await component.saveDefaultProvider('openrouter');

      expect(mockConfigService.setConfig).toHaveBeenCalledWith(
        'AI_IMAGE_DEFAULT_PROVIDER',
        'openrouter'
      );
      expect(component.defaultProvider()).toBe('openrouter');
    });

    it('should handle save default provider error', async () => {
      mockConfigService.setConfig.mockRejectedValue(new Error('Save failed'));

      // Should not throw
      await component.saveDefaultProvider('openrouter');

      expect(component.isSaving()).toBe(false);
    });
  });

  describe('OpenAI Settings', () => {
    beforeEach(async () => {
      component.ngOnInit();
      await flushPromises();
    });

    it('should toggle OpenAI enabled', async () => {
      await component.toggleOpenai(false);

      expect(mockConfigService.setConfig).toHaveBeenCalledWith(
        'AI_IMAGE_OPENAI_ENABLED',
        'false'
      );
      expect(component.openaiConfig().enabled).toBe(false);
    });

    it('should revert OpenAI toggle on error', async () => {
      mockConfigService.setConfig.mockRejectedValue(new Error('Failed'));

      await component.toggleOpenai(false);

      // Should revert
      expect(component.openaiConfig().enabled).toBe(true);
    });

    it('should save OpenAI API key', async () => {
      component.updateOpenaiApiKey('sk-test-key');
      await component.saveOpenaiApiKey();

      expect(mockConfigService.setConfig).toHaveBeenCalledWith(
        'OPENAI_API_KEY',
        'sk-test-key'
      );
      expect(component.openaiConfig().hasApiKey).toBe(true);
      expect(component.openaiConfig().apiKey).toBe('');
      expect(component.editingOpenaiKey()).toBe(false);
    });

    it('should not save empty OpenAI API key', async () => {
      component.updateOpenaiApiKey('');
      await component.saveOpenaiApiKey();

      expect(mockConfigService.setConfig).not.toHaveBeenCalled();
    });

    it('should handle save OpenAI API key error', async () => {
      mockConfigService.setConfig.mockRejectedValue(new Error('Failed'));
      component.updateOpenaiApiKey('sk-test-key');

      await component.saveOpenaiApiKey();

      expect(component.isSaving()).toBe(false);
    });

    it('should clear OpenAI API key', async () => {
      await component.clearOpenaiApiKey();

      expect(mockConfigService.deleteConfig).toHaveBeenCalledWith(
        'OPENAI_API_KEY'
      );
      expect(component.openaiConfig().hasApiKey).toBe(false);
    });

    it('should handle clear OpenAI API key error', async () => {
      mockConfigService.deleteConfig.mockRejectedValue(new Error('Failed'));

      await component.clearOpenaiApiKey();

      expect(component.isSaving()).toBe(false);
    });
  });

  describe('OpenRouter Settings', () => {
    beforeEach(async () => {
      component.ngOnInit();
      await flushPromises();
    });

    it('should toggle OpenRouter enabled', async () => {
      await component.toggleOpenrouter(true);

      expect(mockConfigService.setConfig).toHaveBeenCalledWith(
        'AI_IMAGE_OPENROUTER_ENABLED',
        'true'
      );
      expect(component.openrouterConfig().enabled).toBe(true);
    });

    it('should revert OpenRouter toggle on error', async () => {
      mockConfigService.setConfig.mockRejectedValue(new Error('Failed'));

      await component.toggleOpenrouter(true);

      expect(component.openrouterConfig().enabled).toBe(false);
    });

    it('should save OpenRouter API key', async () => {
      component.updateOpenrouterApiKey('sk-or-test-key');
      await component.saveOpenrouterApiKey();

      expect(mockConfigService.setConfig).toHaveBeenCalledWith(
        'AI_IMAGE_OPENROUTER_API_KEY',
        'sk-or-test-key'
      );
      expect(component.openrouterConfig().hasApiKey).toBe(true);
      expect(component.editingOpenrouterKey()).toBe(false);
    });

    it('should not save empty OpenRouter API key', async () => {
      component.updateOpenrouterApiKey('');
      await component.saveOpenrouterApiKey();

      expect(mockConfigService.setConfig).not.toHaveBeenCalled();
    });

    it('should clear OpenRouter API key', async () => {
      await component.clearOpenrouterApiKey();

      expect(mockConfigService.deleteConfig).toHaveBeenCalledWith(
        'AI_IMAGE_OPENROUTER_API_KEY'
      );
      expect(component.openrouterConfig().hasApiKey).toBe(false);
    });
  });

  describe('Stable Diffusion Settings', () => {
    beforeEach(async () => {
      component.ngOnInit();
      await flushPromises();
    });

    it('should toggle SD enabled', async () => {
      await component.toggleSd(true);

      expect(mockConfigService.setConfig).toHaveBeenCalledWith(
        'AI_IMAGE_SD_ENABLED',
        'true'
      );
      expect(component.sdConfig().enabled).toBe(true);
    });

    it('should revert SD toggle on error', async () => {
      mockConfigService.setConfig.mockRejectedValue(new Error('Failed'));

      await component.toggleSd(true);

      expect(component.sdConfig().enabled).toBe(false);
    });

    it('should save SD endpoint', async () => {
      component.updateSdEndpoint('http://custom:7860');
      await component.saveSdEndpoint();

      expect(mockConfigService.setConfig).toHaveBeenCalledWith(
        'AI_IMAGE_SD_ENDPOINT',
        'http://custom:7860'
      );
    });

    it('should not save empty SD endpoint', async () => {
      component.updateSdEndpoint('');
      await component.saveSdEndpoint();

      expect(mockConfigService.setConfig).not.toHaveBeenCalled();
    });

    it('should save SD API key', async () => {
      component.updateSdApiKey('sd-test-key');
      await component.saveSdApiKey();

      expect(mockConfigService.setConfig).toHaveBeenCalledWith(
        'AI_IMAGE_SD_API_KEY',
        'sd-test-key'
      );
      expect(component.sdConfig().hasApiKey).toBe(true);
      expect(component.editingSdKey()).toBe(false);
    });

    it('should not save empty SD API key', async () => {
      component.updateSdApiKey('');
      await component.saveSdApiKey();

      expect(mockConfigService.setConfig).not.toHaveBeenCalled();
    });

    it('should clear SD API key', async () => {
      await component.clearSdApiKey();

      expect(mockConfigService.deleteConfig).toHaveBeenCalledWith(
        'AI_IMAGE_SD_API_KEY'
      );
      expect(component.sdConfig().hasApiKey).toBe(false);
    });
  });

  describe('Model Configuration', () => {
    beforeEach(async () => {
      component.ngOnInit();
      await flushPromises();
    });

    it('should load default OpenAI models', () => {
      const models = component.openaiModels();
      expect(models.length).toBeGreaterThan(0);
      expect(models.some(m => m.id === 'gpt-image-1')).toBe(true);
    });

    it('should load default OpenRouter models', () => {
      const models = component.openrouterModels();
      expect(models.length).toBeGreaterThan(0);
      expect(models.some(m => m.id === 'black-forest-labs/flux-1.1-pro')).toBe(
        true
      );
    });

    it('should parse custom models from config', async () => {
      mockConfigService.getAllConfig.mockResolvedValue(
        createMockConfig({
          AI_IMAGE_OPENAI_MODELS: {
            key: 'AI_IMAGE_OPENAI_MODELS',
            value: JSON.stringify([
              { id: 'custom-model', name: 'Custom Model', enabled: true },
            ]),
            source: 'database',
          },
        })
      );

      await component.loadConfig();

      const models = component.openaiModels();
      expect(models.some(m => m.id === 'custom-model')).toBe(true);
    });

    it('should handle invalid JSON in models config', async () => {
      mockConfigService.getAllConfig.mockResolvedValue(
        createMockConfig({
          AI_IMAGE_OPENAI_MODELS: {
            key: 'AI_IMAGE_OPENAI_MODELS',
            value: 'invalid-json',
            source: 'database',
          },
        })
      );

      await component.loadConfig();

      // Should fall back to defaults
      const models = component.openaiModels();
      expect(models.some(m => m.id === 'gpt-image-1')).toBe(true);
    });

    it('should toggle OpenAI model enabled state', () => {
      component.toggleOpenaiModel('gpt-image-1', false);

      const models = component.openaiModels();
      const model = models.find(m => m.id === 'gpt-image-1');
      expect(model?.enabled).toBe(false);
      expect(component.openaiModelsModified()).toBe(true);
    });

    it('should toggle OpenRouter model enabled state', () => {
      component.toggleOpenrouterModel('black-forest-labs/flux-1.1-pro', false);

      const models = component.openrouterModels();
      const model = models.find(m => m.id === 'black-forest-labs/flux-1.1-pro');
      expect(model?.enabled).toBe(false);
      expect(component.openrouterModelsModified()).toBe(true);
    });

    it('should calculate enabled model counts', () => {
      expect(component.openaiEnabledCount()).toBeGreaterThan(0);
      expect(component.openrouterEnabledCount()).toBeGreaterThan(0);
    });

    it('should save OpenAI model configuration', async () => {
      await component.saveOpenaiModels();

      expect(mockConfigService.setConfig).toHaveBeenCalledWith(
        'AI_IMAGE_OPENAI_MODELS',
        expect.any(String)
      );
      expect(component.openaiModelsModified()).toBe(false);
    });

    it('should not save models if none are enabled', async () => {
      // Disable all models
      component.openaiModels().forEach(m => {
        component.toggleOpenaiModel(m.id, false);
      });

      await component.saveOpenaiModels();

      // setConfig should not have been called for models
      expect(mockConfigService.setConfig).not.toHaveBeenCalledWith(
        'AI_IMAGE_OPENAI_MODELS',
        expect.any(String)
      );
    });

    it('should save OpenRouter model configuration', async () => {
      await component.saveOpenrouterModels();

      expect(mockConfigService.setConfig).toHaveBeenCalledWith(
        'AI_IMAGE_OPENROUTER_MODELS',
        expect.any(String)
      );
      expect(component.openrouterModelsModified()).toBe(false);
    });

    it('should reset OpenAI models to defaults', () => {
      // Modify a model
      component.toggleOpenaiModel('gpt-image-1', false);

      // Reset
      component.resetOpenaiModels();

      const models = component.openaiModels();
      const model = models.find(m => m.id === 'gpt-image-1');
      expect(model?.enabled).toBe(true);
      expect(component.openaiModelsModified()).toBe(true);
    });

    it('should reset OpenRouter models to defaults', () => {
      // Modify a model
      component.toggleOpenrouterModel('black-forest-labs/flux-1.1-pro', false);

      // Reset
      component.resetOpenrouterModels();

      const models = component.openrouterModels();
      const model = models.find(m => m.id === 'black-forest-labs/flux-1.1-pro');
      expect(model?.enabled).toBe(true);
      expect(component.openrouterModelsModified()).toBe(true);
    });
  });

  describe('Default Model Lists', () => {
    it('should return valid OpenAI default models', () => {
      const models = component.getDefaultOpenaiModelsList();
      expect(models.length).toBe(2);
      expect(models[0].id).toBe('gpt-image-1');
      expect(models[0].supportedSizes).toBeDefined();
      expect(models[0].supportsQuality).toBe(true);
    });

    it('should return valid OpenRouter default models', () => {
      const models = component.getDefaultOpenrouterModelsList();
      expect(models.length).toBe(4);
      expect(models[0].id).toBe('black-forest-labs/flux-1.1-pro');
      expect(models.some(m => m.id.startsWith('google/'))).toBe(true);
    });
  });

  describe('Input Update Methods', () => {
    it('should update OpenAI API key', () => {
      component.updateOpenaiApiKey('new-key');
      expect(component.openaiConfig().apiKey).toBe('new-key');
    });

    it('should update OpenRouter API key', () => {
      component.updateOpenrouterApiKey('new-key');
      expect(component.openrouterConfig().apiKey).toBe('new-key');
    });

    it('should update SD API key', () => {
      component.updateSdApiKey('new-key');
      expect(component.sdConfig().apiKey).toBe('new-key');
    });

    it('should update SD endpoint', () => {
      component.updateSdEndpoint('http://new-endpoint:7860');
      expect(component.sdConfig().endpoint).toBe('http://new-endpoint:7860');
    });

    it('should update Fal.ai API key', () => {
      component.updateFalaiApiKey('falai-key');
      expect(component.falaiConfig().apiKey).toBe('falai-key');
    });
  });

  describe('Fal.ai Settings', () => {
    beforeEach(async () => {
      component.ngOnInit();
      await flushPromises();
    });

    it('should initialize Fal.ai config', () => {
      expect(component.falaiConfig()).toBeDefined();
      expect(component.falaiConfig().enabled).toBe(false);
    });

    it('should toggle Fal.ai enabled', async () => {
      mockConfigService.setConfig.mockResolvedValue(undefined);
      await component.toggleFalai(true);
      expect(mockConfigService.setConfig).toHaveBeenCalledWith(
        'AI_IMAGE_FALAI_ENABLED',
        'true'
      );
    });

    it('should set editing Fal.ai API key', () => {
      component.editingFalaiKey.set(true);
      expect(component.editingFalaiKey()).toBe(true);
    });

    it('should save Fal.ai API key', async () => {
      component.falaiConfig.update(c => ({ ...c, apiKey: 'test-falai-key' }));
      mockConfigService.setConfig.mockResolvedValue(undefined);
      await component.saveFalaiApiKey();
      expect(mockConfigService.setConfig).toHaveBeenCalledWith(
        'AI_IMAGE_FALAI_API_KEY',
        'test-falai-key'
      );
    });

    it('should clear Fal.ai API key', async () => {
      mockConfigService.deleteConfig.mockResolvedValue(undefined);
      await component.clearFalaiApiKey();
      expect(mockConfigService.deleteConfig).toHaveBeenCalledWith(
        'AI_IMAGE_FALAI_API_KEY'
      );
    });

    it('should get default Fal.ai models list', () => {
      const models = component.getDefaultFalaiModelsList();
      expect(models.length).toBeGreaterThan(0);
      // Should include FLUX 2 Pro
      expect(models.some(m => m.id === 'fal-ai/flux-2-pro')).toBe(true);
      // Should include Nano Banana Pro
      expect(models.some(m => m.id === 'fal-ai/nano-banana-pro')).toBe(true);
    });

    it('should reset Fal.ai models to defaults', () => {
      component.falaiModels.set([]);
      component.resetFalaiModels();
      expect(component.falaiModels().length).toBeGreaterThan(0);
    });
  });

  describe('Custom Sizes', () => {
    beforeEach(async () => {
      component.ngOnInit();
      await flushPromises();
    });

    it('should load custom sizes on init', () => {
      expect(mockImageService.getCustomImageSizes).toHaveBeenCalled();
    });

    it('should start adding a new size', () => {
      component.startAddingSize();
      expect(component.editingNewSize()).toBe(true);
      expect(component.newSize()).toEqual({
        name: '',
        width: 1024,
        height: 1024,
      });
    });

    it('should cancel adding a new size', () => {
      component.startAddingSize();
      component.cancelAddingSize();
      expect(component.editingNewSize()).toBe(false);
    });

    it('should update new size name', () => {
      component.startAddingSize();
      component.updateNewSizeName('My Custom');
      expect(component.newSize().name).toBe('My Custom');
    });

    it('should update new size width', () => {
      component.startAddingSize();
      component.updateNewSizeWidth(1920);
      expect(component.newSize().width).toBe(1920);
    });

    it('should update new size height', () => {
      component.startAddingSize();
      component.updateNewSizeHeight(1080);
      expect(component.newSize().height).toBe(1080);
    });

    it('should add a custom size to local list', () => {
      component.startAddingSize();
      component.updateNewSizeName('HD Size');
      component.updateNewSizeWidth(1920);
      component.updateNewSizeHeight(1080);

      const initialCount = component.customSizes().length;
      component.addCustomSize();

      // Should add to local list
      expect(component.customSizes().length).toBe(initialCount + 1);
      // Should set modified flag
      expect(component.customSizesModified()).toBe(true);
      // Should stop editing
      expect(component.editingNewSize()).toBe(false);
    });

    it('should not add custom size with missing name', () => {
      component.startAddingSize();
      component.updateNewSizeName(''); // Empty name
      component.updateNewSizeWidth(1920);
      component.updateNewSizeHeight(1080);

      const initialCount = component.customSizes().length;
      component.addCustomSize();

      // Should not add
      expect(component.customSizes().length).toBe(initialCount);
    });

    it('should not add custom size with invalid dimensions', () => {
      component.startAddingSize();
      component.updateNewSizeName('Invalid');
      component.updateNewSizeWidth(100); // Less than 256
      component.updateNewSizeHeight(1080);

      const initialCount = component.customSizes().length;
      component.addCustomSize();

      // Should not add
      expect(component.customSizes().length).toBe(initialCount);
    });

    it('should remove a custom size', () => {
      component.customSizes.set([
        { id: 'size-1', name: 'Test', width: 100, height: 100 },
      ]);

      component.removeCustomSize('size-1');
      // Should be removed from local list
      expect(component.customSizes()).toEqual([]);
    });

    it('should reset custom sizes and mark as modified', () => {
      component.customSizes.set([
        { id: 'size-1', name: 'Test', width: 100, height: 100 },
      ]);
      component.customSizesModified.set(false);

      component.resetCustomSizes();
      expect(component.customSizes()).toEqual([]);
      // Resetting is a modification, so flag should be true
      expect(component.customSizesModified()).toBe(true);
    });

    it('should save custom sizes to backend', async () => {
      component.customSizes.set([
        { id: 'size-1', name: 'Test', width: 1024, height: 1024 },
      ]);
      component.customSizesModified.set(true);

      mockImageService.updateCustomImageSizes.mockReturnValue(
        of({
          sizes: [{ id: 'size-1', name: 'Test', width: 1024, height: 1024 }],
          total: 1,
        }) as any
      );

      await component.saveCustomSizes();
      expect(mockImageService.updateCustomImageSizes).toHaveBeenCalled();
      expect(component.customSizesModified()).toBe(false);
    });

    it('should get size string for custom size', () => {
      const size = { id: 'test', name: 'Test', width: 1920, height: 1080 };
      expect(component.getSizeString(size)).toBe('1920x1080');
    });

    it('should get aspect ratio label for common ratios', () => {
      // Square
      expect(
        component.getAspectRatioLabel({
          id: '1',
          name: 'Square',
          width: 512,
          height: 512,
        })
      ).toBe('Square');
      // Widescreen 16:9
      expect(
        component.getAspectRatioLabel({
          id: '2',
          name: 'Wide',
          width: 1920,
          height: 1080,
        })
      ).toBe('Widescreen');
      // Portrait 9:16
      expect(
        component.getAspectRatioLabel({
          id: '3',
          name: 'Port',
          width: 1080,
          height: 1920,
        })
      ).toBe('Portrait');
      // Standard 4:3
      expect(
        component.getAspectRatioLabel({
          id: '4',
          name: 'Std',
          width: 800,
          height: 600,
        })
      ).toBe('Standard');
      // Custom ratio
      expect(
        component.getAspectRatioLabel({
          id: '5',
          name: 'Custom',
          width: 500,
          height: 300,
        })
      ).toBe('5:3');
    });

    it('should update new size description', () => {
      component.startAddingSize();
      component.updateNewSizeDescription('My description');
      expect(component.newSize().description).toBe('My description');
    });
  });

  describe('Saving State', () => {
    beforeEach(async () => {
      component.ngOnInit();
      await flushPromises();
    });

    it('should set isSaving during save operations', async () => {
      let savingDuringCall = false;

      mockConfigService.setConfig.mockImplementation(async () => {
        savingDuringCall = component.isSaving();
        return Promise.resolve();
      });

      await component.saveGlobalEnabled(false);

      expect(savingDuringCall).toBe(true);
      expect(component.isSaving()).toBe(false);
    });
  });
});
