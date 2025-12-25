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
import { AITextGenerationService } from 'api-client';
import { of } from 'rxjs';
import { type MockedObject, vi } from 'vitest';

import { AdminAiTextSettingsComponent } from './ai-text-settings.component';

async function flushPromises(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
}

describe('AdminAiTextSettingsComponent', () => {
  let component: AdminAiTextSettingsComponent;
  let mockConfigService: MockedObject<AdminConfigService>;
  let mockTextService: MockedObject<AITextGenerationService>;
  let mockSystemConfigService: {
    isAiKillSwitchEnabled: ReturnType<typeof signal<boolean>>;
    isAiKillSwitchLockedByEnv: ReturnType<typeof signal<boolean>>;
  };

  const createMockConfig = (
    overrides: Partial<Record<string, ConfigValue>> = {}
  ): Record<string, ConfigValue> => ({
    AI_TEXT_ENABLED: {
      key: 'AI_TEXT_ENABLED',
      value: 'true',
      source: 'database',
    },
    AI_TEXT_DEFAULT_PROVIDER: {
      key: 'AI_TEXT_DEFAULT_PROVIDER',
      value: 'openai',
      source: 'database',
    },
    AI_TEXT_LINT_MODEL: {
      key: 'AI_TEXT_LINT_MODEL',
      value: 'gpt-4o',
      source: 'database',
    },
    AI_TEXT_LINT_PROMPT: {
      key: 'AI_TEXT_LINT_PROMPT',
      value: '',
      source: 'default',
    },
    AI_TEXT_IMAGE_PROMPT_MODEL: {
      key: 'AI_TEXT_IMAGE_PROMPT_MODEL',
      value: '',
      source: 'default',
    },
    AI_TEXT_IMAGE_PROMPT_TEMPLATE: {
      key: 'AI_TEXT_IMAGE_PROMPT_TEMPLATE',
      value: '',
      source: 'default',
    },
    AI_TEXT_OPENAI_ENABLED: {
      key: 'AI_TEXT_OPENAI_ENABLED',
      value: 'true',
      source: 'database',
    },
    AI_TEXT_OPENROUTER_ENABLED: {
      key: 'AI_TEXT_OPENROUTER_ENABLED',
      value: 'false',
      source: 'default',
    },
    AI_TEXT_ANTHROPIC_ENABLED: {
      key: 'AI_TEXT_ANTHROPIC_ENABLED',
      value: 'false',
      source: 'default',
    },
    AI_OPENAI_API_KEY: {
      key: 'AI_OPENAI_API_KEY',
      value: '********',
      source: 'database',
    },
    AI_OPENROUTER_API_KEY: {
      key: 'AI_OPENROUTER_API_KEY',
      value: '',
      source: 'default',
    },
    AI_TEXT_ANTHROPIC_API_KEY: {
      key: 'AI_TEXT_ANTHROPIC_API_KEY',
      value: '',
      source: 'default',
    },
    AI_TEXT_OPENAI_MODELS: {
      key: 'AI_TEXT_OPENAI_MODELS',
      value: '',
      source: 'default',
    },
    AI_TEXT_OPENROUTER_MODELS: {
      key: 'AI_TEXT_OPENROUTER_MODELS',
      value: '',
      source: 'default',
    },
    AI_TEXT_ANTHROPIC_MODELS: {
      key: 'AI_TEXT_ANTHROPIC_MODELS',
      value: '',
      source: 'default',
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

    mockTextService = {
      getDefaultTextModels: vi.fn().mockReturnValue(
        of({
          providers: {
            openai: {
              name: 'OpenAI',
              models: [
                {
                  id: 'gpt-4o',
                  name: 'GPT-4o',
                  provider: 'openai',
                  maxTokens: 128000,
                  supportsJsonMode: true,
                  supportsStreaming: true,
                  description: 'Most capable GPT-4 model',
                  costTier: 4,
                },
                {
                  id: 'gpt-4o-mini',
                  name: 'GPT-4o Mini',
                  provider: 'openai',
                  maxTokens: 128000,
                  supportsJsonMode: true,
                  supportsStreaming: true,
                  description: 'Fast and cost-effective',
                  costTier: 2,
                },
              ],
            },
            openrouter: {
              name: 'OpenRouter',
              models: [
                {
                  id: 'anthropic/claude-3.5-sonnet',
                  name: 'Claude 3.5 Sonnet',
                  provider: 'openrouter',
                  maxTokens: 200000,
                  supportsJsonMode: true,
                  supportsStreaming: true,
                  description: 'Excellent balance',
                  costTier: 3,
                },
              ],
            },
            anthropic: {
              name: 'Anthropic',
              models: [
                {
                  id: 'claude-3-5-sonnet-20241022',
                  name: 'Claude 3.5 Sonnet',
                  provider: 'anthropic',
                  maxTokens: 200000,
                  supportsJsonMode: true,
                  supportsStreaming: true,
                  description: 'Excellent balance',
                  costTier: 3,
                },
              ],
            },
          },
        })
      ),
    } as unknown as MockedObject<AITextGenerationService>;

    mockSystemConfigService = {
      isAiKillSwitchEnabled: signal(false),
      isAiKillSwitchLockedByEnv: signal(false),
    };

    await TestBed.configureTestingModule({
      imports: [
        AdminAiTextSettingsComponent,
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
        { provide: AITextGenerationService, useValue: mockTextService },
        { provide: SystemConfigService, useValue: mockSystemConfigService },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AdminAiTextSettingsComponent);
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

  describe('Configuration Loading', () => {
    it('should load configuration on init', async () => {
      await component.loadConfig();
      await flushPromises();

      expect(component.textGenerationEnabled()).toBe(true);
      expect(component.defaultProvider()).toBe('openai');
    });

    it('should fetch default models from API', async () => {
      await component.loadConfig();
      await flushPromises();

      expect(mockTextService.getDefaultTextModels).toHaveBeenCalled();
    });

    it('should parse OpenAI models correctly', async () => {
      await component.loadConfig();
      await flushPromises();

      const models = component.openaiModels();
      expect(models.length).toBeGreaterThan(0);
      expect(models[0].id).toBe('gpt-4o');
    });

    it('should set lint model from config', async () => {
      await component.loadConfig();
      await flushPromises();

      expect(component.lintModel()).toBe('gpt-4o');
    });
  });

  describe('Global Settings', () => {
    it('should save global enabled setting', async () => {
      await component.loadConfig();
      await flushPromises();

      await component.saveGlobalEnabled(false);

      expect(mockConfigService.setConfig).toHaveBeenCalledWith(
        'AI_TEXT_ENABLED',
        'false'
      );
    });

    it('should save default provider', async () => {
      await component.loadConfig();
      await flushPromises();

      await component.saveDefaultProvider('anthropic');

      expect(mockConfigService.setConfig).toHaveBeenCalledWith(
        'AI_TEXT_DEFAULT_PROVIDER',
        'anthropic'
      );
    });
  });

  describe('Lint Settings', () => {
    it('should save lint model', async () => {
      await component.loadConfig();
      await flushPromises();

      await component.saveLintModel('gpt-4o-mini');

      expect(mockConfigService.setConfig).toHaveBeenCalledWith(
        'AI_TEXT_LINT_MODEL',
        'gpt-4o-mini'
      );
    });

    it('should save lint prompt', async () => {
      await component.loadConfig();
      await flushPromises();

      component.lintPrompt.set('Custom prompt');
      await component.saveLintPrompt();

      expect(mockConfigService.setConfig).toHaveBeenCalledWith(
        'AI_TEXT_LINT_PROMPT',
        'Custom prompt'
      );
    });
  });

  describe('Model Management', () => {
    it('should toggle model enabled state', async () => {
      await component.loadConfig();
      await flushPromises();

      component.toggleModelEnabled('openai', 'gpt-4o', false);

      const models = component.openaiModels();
      const model = models.find((m: { id: string }) => m.id === 'gpt-4o');
      expect(model?.enabled).toBe(false);
      expect(component.openaiModelsModified()).toBe(true);
    });

    it('should save models', async () => {
      await component.loadConfig();
      await flushPromises();

      component.toggleModelEnabled('openai', 'gpt-4o', false);
      await component.saveModels('openai');

      expect(mockConfigService.setConfig).toHaveBeenCalledWith(
        'AI_TEXT_OPENAI_MODELS',
        expect.any(String)
      );
      expect(component.openaiModelsModified()).toBe(false);
    });
  });

  describe('Utility Functions', () => {
    it('should format token count correctly', () => {
      expect(component.formatTokenCount(128000)).toBe('128K tokens');
      expect(component.formatTokenCount(2000000)).toBe('2.0M tokens');
      expect(component.formatTokenCount(500)).toBe('500 tokens');
      expect(component.formatTokenCount(undefined)).toBe('');
    });

    it('should get cost tier label', () => {
      expect(component.getCostTierLabel(1)).toBe('Budget');
      expect(component.getCostTierLabel(3)).toBe('Standard');
      expect(component.getCostTierLabel(5)).toBe('Enterprise');
      expect(component.getCostTierLabel(undefined)).toBe('');
    });
  });

  describe('Available Models Computed', () => {
    it('should compute available models correctly', async () => {
      await component.loadConfig();
      await flushPromises();

      const availableModels = component.availableModels();
      // Only OpenAI is enabled, so only OpenAI models should be available
      expect(
        availableModels.some(
          (m: { provider: string }) => m.provider === 'OpenAI'
        )
      ).toBe(true);
    });

    it('should filter lint models by search term', async () => {
      await component.loadConfig();
      await flushPromises();

      // Set a search term
      component.lintModelSearch.set('gpt-4');

      const filtered = component.filteredLintModels();
      // All filtered models should match the search term
      expect(
        filtered.every(
          m =>
            m.name.toLowerCase().includes('gpt-4') ||
            m.id.toLowerCase().includes('gpt-4')
        )
      ).toBe(true);
    });

    it('should return all models when lint search is empty', async () => {
      await component.loadConfig();
      await flushPromises();

      component.lintModelSearch.set('');

      expect(component.filteredLintModels().length).toBe(
        component.availableModels().length
      );
    });

    it('should filter image prompt models by search term', async () => {
      await component.loadConfig();
      await flushPromises();

      component.imagePromptModelSearch.set('gpt-4');

      const filtered = component.filteredImagePromptModels();
      expect(
        filtered.every(
          m =>
            m.name.toLowerCase().includes('gpt-4') ||
            m.id.toLowerCase().includes('gpt-4')
        )
      ).toBe(true);
    });

    it('should return all models when image prompt search is empty', async () => {
      await component.loadConfig();
      await flushPromises();

      component.imagePromptModelSearch.set('');

      expect(component.filteredImagePromptModels().length).toBe(
        component.availableModels().length
      );
    });

    it('should filter by provider name', async () => {
      await component.loadConfig();
      await flushPromises();

      component.lintModelSearch.set('OpenAI');

      const filtered = component.filteredLintModels();
      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.every(m => m.provider === 'OpenAI')).toBe(true);
    });

    it('should handle whitespace in search term', async () => {
      await component.loadConfig();
      await flushPromises();

      component.lintModelSearch.set('  gpt-4  ');

      const filtered = component.filteredLintModels();
      expect(
        filtered.every(
          m =>
            m.name.toLowerCase().includes('gpt-4') ||
            m.id.toLowerCase().includes('gpt-4')
        )
      ).toBe(true);
    });

    it('should return empty array when search matches nothing', async () => {
      await component.loadConfig();
      await flushPromises();

      component.lintModelSearch.set('nonexistent-model-xyz');

      expect(component.filteredLintModels().length).toBe(0);
    });
  });

  describe('Image Prompt Settings', () => {
    it('should save image prompt model', async () => {
      await component.loadConfig();
      await flushPromises();

      await component.saveImagePromptModel('gpt-4o-mini');

      expect(mockConfigService.setConfig).toHaveBeenCalledWith(
        'AI_TEXT_IMAGE_PROMPT_MODEL',
        'gpt-4o-mini'
      );
      expect(component.imagePromptModel()).toBe('gpt-4o-mini');
    });

    it('should save image prompt template', async () => {
      await component.loadConfig();
      await flushPromises();

      component.imagePromptTemplate.set('Custom template');
      await component.saveImagePromptTemplate();

      expect(mockConfigService.setConfig).toHaveBeenCalledWith(
        'AI_TEXT_IMAGE_PROMPT_TEMPLATE',
        'Custom template'
      );
    });

    it('should handle error when saving image prompt model', async () => {
      await component.loadConfig();
      await flushPromises();

      mockConfigService.setConfig.mockRejectedValueOnce(new Error('fail'));

      await component.saveImagePromptModel('gpt-4o');

      expect(component.isSaving()).toBe(false);
    });

    it('should handle error when saving image prompt template', async () => {
      await component.loadConfig();
      await flushPromises();

      mockConfigService.setConfig.mockRejectedValueOnce(new Error('fail'));

      await component.saveImagePromptTemplate();

      expect(component.isSaving()).toBe(false);
    });
  });

  describe('Provider Settings', () => {
    it('should save openai provider enabled', async () => {
      await component.loadConfig();
      await flushPromises();

      await component.saveProviderEnabled('openai', false);

      expect(mockConfigService.setConfig).toHaveBeenCalledWith(
        'AI_TEXT_OPENAI_ENABLED',
        'false'
      );
      expect(component.openaiConfig().enabled).toBe(false);
    });

    it('should save openrouter provider enabled', async () => {
      await component.loadConfig();
      await flushPromises();

      await component.saveProviderEnabled('openrouter', true);

      expect(mockConfigService.setConfig).toHaveBeenCalledWith(
        'AI_TEXT_OPENROUTER_ENABLED',
        'true'
      );
      expect(component.openrouterConfig().enabled).toBe(true);
    });

    it('should save anthropic provider enabled', async () => {
      await component.loadConfig();
      await flushPromises();

      await component.saveProviderEnabled('anthropic', true);

      expect(mockConfigService.setConfig).toHaveBeenCalledWith(
        'AI_TEXT_ANTHROPIC_ENABLED',
        'true'
      );
      expect(component.anthropicConfig().enabled).toBe(true);
    });

    it('should handle error when saving provider enabled', async () => {
      await component.loadConfig();
      await flushPromises();

      mockConfigService.setConfig.mockRejectedValueOnce(new Error('fail'));

      await component.saveProviderEnabled('openai', true);

      expect(component.isSaving()).toBe(false);
    });
  });

  describe('Anthropic API Key Management', () => {
    it('should save anthropic API key', async () => {
      await component.loadConfig();
      await flushPromises();

      component.anthropicConfig.update(c => ({ ...c, apiKey: 'sk-test-key' }));
      await component.saveAnthropicApiKey();

      expect(mockConfigService.setConfig).toHaveBeenCalledWith(
        'AI_ANTHROPIC_API_KEY',
        'sk-test-key'
      );
      expect(component.anthropicConfig().apiKey).toBe('');
      expect(component.anthropicConfig().hasApiKey).toBe(true);
      expect(component.editingAnthropicKey()).toBe(false);
    });

    it('should update anthropic API key locally', async () => {
      await component.loadConfig();
      await flushPromises();

      component.updateAnthropicApiKey('new-key');

      expect(component.anthropicConfig().apiKey).toBe('new-key');
    });

    it('should clear anthropic API key', async () => {
      await component.loadConfig();
      await flushPromises();

      component.anthropicConfig.update(c => ({
        ...c,
        apiKey: 'some-key',
        hasApiKey: true,
      }));

      component.clearAnthropicApiKey();
      await flushPromises();

      expect(component.anthropicConfig().hasApiKey).toBe(false);
      expect(mockConfigService.setConfig).toHaveBeenCalledWith(
        'AI_ANTHROPIC_API_KEY',
        ''
      );
    });

    it('should handle error when saving anthropic API key', async () => {
      await component.loadConfig();
      await flushPromises();

      mockConfigService.setConfig.mockRejectedValueOnce(new Error('fail'));

      await component.saveAnthropicApiKey();

      expect(component.isSaving()).toBe(false);
    });
  });

  describe('Unified Model Management', () => {
    it('should toggle unified model', async () => {
      await component.loadConfig();
      await flushPromises();

      component.toggleUnifiedModel('gpt-4o', false);

      const model = component
        .openaiModels()
        .find((m: { id: string }) => m.id === 'gpt-4o');
      expect(model?.enabled).toBe(false);
      expect(component.unifiedModelsModified()).toBe(true);
    });

    it('should handle non-existent model in toggleUnifiedModel', async () => {
      await component.loadConfig();
      await flushPromises();

      // Should not throw when model doesn't exist
      component.toggleUnifiedModel('non-existent-model', false);

      expect(component.unifiedModelsModified()).toBe(false);
    });

    it('should save all modified unified models', async () => {
      await component.loadConfig();
      await flushPromises();

      // Modify models across providers
      component.toggleModelEnabled('openai', 'gpt-4o', false);
      component.openaiModelsModified.set(true);

      await component.saveUnifiedModels();

      expect(mockConfigService.setConfig).toHaveBeenCalledWith(
        'AI_TEXT_OPENAI_MODELS',
        expect.any(String)
      );
      expect(component.unifiedModelsModified()).toBe(false);
    });

    it('should handle error when saving unified models', async () => {
      await component.loadConfig();
      await flushPromises();

      component.openaiModelsModified.set(true);
      mockConfigService.setConfig.mockRejectedValueOnce(new Error('fail'));

      await component.saveUnifiedModels();

      expect(component.isSaving()).toBe(false);
    });
  });

  describe('Reset Models', () => {
    it('should reset openai models to defaults', async () => {
      await component.loadConfig();
      await flushPromises();

      // First modify the models
      component.toggleModelEnabled('openai', 'gpt-4o', false);

      // Then reset
      component.resetModels('openai');

      const model = component
        .openaiModels()
        .find((m: { id: string }) => m.id === 'gpt-4o');
      expect(model?.enabled).toBe(true);
      expect(component.openaiModelsModified()).toBe(true);
    });

    it('should reset openrouter models to defaults', async () => {
      await component.loadConfig();
      await flushPromises();

      component.resetModels('openrouter');

      expect(component.openrouterModelsModified()).toBe(true);
    });

    it('should reset anthropic models to defaults', async () => {
      await component.loadConfig();
      await flushPromises();

      component.resetModels('anthropic');

      expect(component.anthropicModelsModified()).toBe(true);
    });
  });

  describe('Save Models for Different Providers', () => {
    it('should save openrouter models', async () => {
      await component.loadConfig();
      await flushPromises();

      component.toggleModelEnabled(
        'openrouter',
        'anthropic/claude-3.5-sonnet',
        false
      );
      await component.saveModels('openrouter');

      expect(mockConfigService.setConfig).toHaveBeenCalledWith(
        'AI_TEXT_OPENROUTER_MODELS',
        expect.any(String)
      );
      expect(component.openrouterModelsModified()).toBe(false);
    });

    it('should save anthropic models', async () => {
      await component.loadConfig();
      await flushPromises();

      component.toggleModelEnabled(
        'anthropic',
        'claude-3-5-sonnet-20241022',
        false
      );
      await component.saveModels('anthropic');

      expect(mockConfigService.setConfig).toHaveBeenCalledWith(
        'AI_TEXT_ANTHROPIC_MODELS',
        expect.any(String)
      );
      expect(component.anthropicModelsModified()).toBe(false);
    });

    it('should handle error when saving models', async () => {
      await component.loadConfig();
      await flushPromises();

      mockConfigService.setConfig.mockRejectedValueOnce(new Error('fail'));

      await component.saveModels('openai');

      expect(component.isSaving()).toBe(false);
    });
  });

  describe('Toggle Model Enabled for Different Providers', () => {
    it('should toggle openrouter model enabled', async () => {
      await component.loadConfig();
      await flushPromises();

      component.toggleModelEnabled(
        'openrouter',
        'anthropic/claude-3.5-sonnet',
        false
      );

      const model = component
        .openrouterModels()
        .find((m: { id: string }) => m.id === 'anthropic/claude-3.5-sonnet');
      expect(model?.enabled).toBe(false);
      expect(component.openrouterModelsModified()).toBe(true);
    });

    it('should toggle anthropic model enabled', async () => {
      await component.loadConfig();
      await flushPromises();

      component.toggleModelEnabled(
        'anthropic',
        'claude-3-5-sonnet-20241022',
        false
      );

      const model = component
        .anthropicModels()
        .find((m: { id: string }) => m.id === 'claude-3-5-sonnet-20241022');
      expect(model?.enabled).toBe(false);
      expect(component.anthropicModelsModified()).toBe(true);
    });
  });

  describe('Global Settings Error Handling', () => {
    it('should handle error when saving global enabled', async () => {
      await component.loadConfig();
      await flushPromises();

      mockConfigService.setConfig.mockRejectedValueOnce(new Error('fail'));

      await component.saveGlobalEnabled(false);

      expect(component.isSaving()).toBe(false);
    });

    it('should handle error when saving default provider', async () => {
      await component.loadConfig();
      await flushPromises();

      mockConfigService.setConfig.mockRejectedValueOnce(new Error('fail'));

      await component.saveDefaultProvider('anthropic');

      expect(component.isSaving()).toBe(false);
    });

    it('should handle error when saving lint model', async () => {
      await component.loadConfig();
      await flushPromises();

      mockConfigService.setConfig.mockRejectedValueOnce(new Error('fail'));

      await component.saveLintModel('gpt-4o');

      expect(component.isSaving()).toBe(false);
    });

    it('should handle error when saving lint prompt', async () => {
      await component.loadConfig();
      await flushPromises();

      mockConfigService.setConfig.mockRejectedValueOnce(new Error('fail'));

      await component.saveLintPrompt();

      expect(component.isSaving()).toBe(false);
    });
  });

  describe('Cost Tier Edge Cases', () => {
    it('should return empty string for invalid cost tier', () => {
      expect(component.getCostTierLabel(0)).toBe('');
      expect(component.getCostTierLabel(10)).toBe('');
    });
  });
});
