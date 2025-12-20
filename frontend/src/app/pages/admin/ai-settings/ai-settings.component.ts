import { Component, computed, inject, OnInit, signal } from '@angular/core';
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
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AdminConfigService } from '@services/admin/admin-config.service';
import { AIImageGenerationService, CustomImageSize } from 'api-client';

interface ProviderConfig {
  enabled: boolean;
  apiKey: string;
  endpoint?: string;
  hasApiKey: boolean;
  models?: string; // JSON string of model configurations
}

/** Model info with enabled flag for UI */
interface ModelConfig {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  supportedSizes?: string[];
  supportsQuality?: boolean;
  supportsStyle?: boolean;
  maxImages?: number;
}

@Component({
  selector: 'app-admin-ai-settings',
  standalone: true,
  imports: [
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
  templateUrl: './ai-settings.component.html',
  styleUrl: './ai-settings.component.scss',
})
export class AdminAiSettingsComponent implements OnInit {
  private readonly configService = inject(AdminConfigService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly imageService = inject(AIImageGenerationService);

  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly error = signal<Error | null>(null);

  // Global settings
  readonly imageGenerationEnabled = signal(false);
  readonly defaultProvider = signal<string>('openai');
  readonly defaultModel = signal<string>('');

  // OpenAI settings
  readonly openaiConfig = signal<ProviderConfig>({
    enabled: false,
    apiKey: '',
    hasApiKey: false,
  });

  // OpenRouter settings
  readonly openrouterConfig = signal<ProviderConfig>({
    enabled: false,
    apiKey: '',
    hasApiKey: false,
  });

  // Stable Diffusion settings
  readonly sdConfig = signal<ProviderConfig>({
    enabled: false,
    apiKey: '',
    endpoint: '',
    hasApiKey: false,
  });

  // Fal.ai settings
  readonly falaiConfig = signal<ProviderConfig>({
    enabled: false,
    apiKey: '',
    hasApiKey: false,
  });

  // Track which API key fields are being edited
  readonly editingOpenaiKey = signal(false);
  readonly editingOpenrouterKey = signal(false);
  readonly editingSdKey = signal(false);
  readonly editingFalaiKey = signal(false);

  // Model configurations as lists with enabled flags
  readonly openaiModels = signal<ModelConfig[]>([]);
  readonly openrouterModels = signal<ModelConfig[]>([]);
  readonly falaiModels = signal<ModelConfig[]>([]);

  // Track if models have been modified
  readonly openaiModelsModified = signal(false);
  readonly openrouterModelsModified = signal(false);
  readonly falaiModelsModified = signal(false);

  // Custom image sizes
  readonly customSizes = signal<CustomImageSize[]>([]);
  readonly customSizesModified = signal(false);
  readonly editingNewSize = signal(false);
  readonly newSize = signal<Partial<CustomImageSize>>({
    name: '',
    width: 1024,
    height: 1024,
  });

  // Computed: count enabled models
  readonly openaiEnabledCount = computed(
    () => this.openaiModels().filter(m => m.enabled).length
  );
  readonly openrouterEnabledCount = computed(
    () => this.openrouterModels().filter(m => m.enabled).length
  );
  readonly falaiEnabledCount = computed(
    () => this.falaiModels().filter(m => m.enabled).length
  );

  // Computed: available models for the selected default provider
  readonly availableModelsForDefaultProvider = computed(() => {
    const provider = this.defaultProvider();
    switch (provider) {
      case 'openai':
        return this.openaiModels().filter(m => m.enabled);
      case 'openrouter':
        return this.openrouterModels().filter(m => m.enabled);
      case 'falai':
        return this.falaiModels().filter(m => m.enabled);
      default:
        return [];
    }
  });

  ngOnInit(): void {
    void this.loadConfig();
  }

  async loadConfig(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const config = await this.configService.getAllConfig();

      // Global settings
      this.imageGenerationEnabled.set(
        config['AI_IMAGE_ENABLED']?.value === 'true'
      );
      this.defaultProvider.set(
        config['AI_IMAGE_DEFAULT_PROVIDER']?.value || 'openai'
      );
      this.defaultModel.set(config['AI_IMAGE_DEFAULT_MODEL']?.value || '');

      // OpenAI
      const openaiHasKey = config['OPENAI_API_KEY']?.value === '********';
      const openaiModelsJson = config['AI_IMAGE_OPENAI_MODELS']?.value || '';
      this.openaiConfig.set({
        enabled:
          config['AI_IMAGE_OPENAI_ENABLED']?.value === 'true' || openaiHasKey,
        apiKey: '',
        hasApiKey: openaiHasKey,
        models: openaiModelsJson,
      });
      // Parse models or use defaults
      this.openaiModels.set(this.parseModelsConfig(openaiModelsJson, 'openai'));
      this.openaiModelsModified.set(false);

      // OpenRouter
      const openrouterHasKey =
        config['AI_IMAGE_OPENROUTER_API_KEY']?.value === '********';
      const openrouterModelsJson =
        config['AI_IMAGE_OPENROUTER_MODELS']?.value || '';
      this.openrouterConfig.set({
        enabled: config['AI_IMAGE_OPENROUTER_ENABLED']?.value === 'true',
        apiKey: '',
        hasApiKey: openrouterHasKey,
        models: openrouterModelsJson,
      });
      // Parse models or use defaults
      this.openrouterModels.set(
        this.parseModelsConfig(openrouterModelsJson, 'openrouter')
      );
      this.openrouterModelsModified.set(false);

      // Stable Diffusion
      const sdHasKey = config['AI_IMAGE_SD_API_KEY']?.value === '********';
      this.sdConfig.set({
        enabled: config['AI_IMAGE_SD_ENABLED']?.value === 'true',
        apiKey: '',
        endpoint: config['AI_IMAGE_SD_ENDPOINT']?.value || '',
        hasApiKey: sdHasKey,
      });

      // Fal.ai
      const falaiHasKey =
        config['AI_IMAGE_FALAI_API_KEY']?.value === '********';
      const falaiModelsJson = config['AI_IMAGE_FALAI_MODELS']?.value || '';
      this.falaiConfig.set({
        enabled: config['AI_IMAGE_FALAI_ENABLED']?.value === 'true',
        apiKey: '',
        hasApiKey: falaiHasKey,
        models: falaiModelsJson,
      });
      // Parse models or use defaults
      this.falaiModels.set(this.parseModelsConfig(falaiModelsJson, 'falai'));
      this.falaiModelsModified.set(false);

      // Load custom sizes
      await this.loadCustomSizes();
    } catch (err) {
      console.error('Failed to load AI config:', err);
      this.error.set(
        err instanceof Error ? err : new Error('Failed to load configuration')
      );
    } finally {
      this.isLoading.set(false);
    }
  }

  /** Load custom image sizes from the API */
  private async loadCustomSizes(): Promise<void> {
    try {
      const response = await this.imageService
        .getCustomImageSizes()
        .toPromise();
      this.customSizes.set(response?.sizes || []);
      this.customSizesModified.set(false);
    } catch (err) {
      console.error('Failed to load custom sizes:', err);
      this.customSizes.set([]);
    }
  }

  async saveGlobalEnabled(enabled: boolean): Promise<void> {
    this.isSaving.set(true);
    try {
      await this.configService.setConfig(
        'AI_IMAGE_ENABLED',
        enabled ? 'true' : 'false'
      );
      this.imageGenerationEnabled.set(enabled);
      this.snackBar.open('Setting saved', 'Close', { duration: 2000 });
    } catch (err) {
      console.error('Failed to save setting:', err);
      this.snackBar.open('Failed to save setting', 'Close', { duration: 3000 });
      this.imageGenerationEnabled.set(!enabled);
    } finally {
      this.isSaving.set(false);
    }
  }

  async saveDefaultProvider(provider: string): Promise<void> {
    this.isSaving.set(true);
    try {
      await this.configService.setConfig('AI_IMAGE_DEFAULT_PROVIDER', provider);
      this.defaultProvider.set(provider);
      this.snackBar.open('Default provider saved', 'Close', { duration: 2000 });
    } catch (err) {
      console.error('Failed to save setting:', err);
      this.snackBar.open('Failed to save setting', 'Close', { duration: 3000 });
    } finally {
      this.isSaving.set(false);
    }
  }

  async saveDefaultModel(model: string): Promise<void> {
    this.isSaving.set(true);
    try {
      await this.configService.setConfig('AI_IMAGE_DEFAULT_MODEL', model);
      this.defaultModel.set(model);
      this.snackBar.open('Default model saved', 'Close', { duration: 2000 });
    } catch (err) {
      console.error('Failed to save setting:', err);
      this.snackBar.open('Failed to save setting', 'Close', { duration: 3000 });
    } finally {
      this.isSaving.set(false);
    }
  }

  // OpenAI methods
  async toggleOpenai(enabled: boolean): Promise<void> {
    this.isSaving.set(true);
    try {
      await this.configService.setConfig(
        'AI_IMAGE_OPENAI_ENABLED',
        enabled ? 'true' : 'false'
      );
      this.openaiConfig.update(c => ({ ...c, enabled }));
      this.snackBar.open('OpenAI setting saved', 'Close', { duration: 2000 });
    } catch (err) {
      console.error('Failed to save setting:', err);
      this.snackBar.open('Failed to save setting', 'Close', { duration: 3000 });
      this.openaiConfig.update(c => ({ ...c, enabled: !enabled }));
    } finally {
      this.isSaving.set(false);
    }
  }

  async saveOpenaiApiKey(): Promise<void> {
    const apiKey = this.openaiConfig().apiKey;
    if (!apiKey) return;

    this.isSaving.set(true);
    try {
      await this.configService.setConfig('OPENAI_API_KEY', apiKey);
      this.openaiConfig.update(c => ({ ...c, apiKey: '', hasApiKey: true }));
      this.editingOpenaiKey.set(false);
      this.snackBar.open('API key saved', 'Close', { duration: 2000 });
    } catch (err) {
      console.error('Failed to save API key:', err);
      this.snackBar.open('Failed to save API key', 'Close', { duration: 3000 });
    } finally {
      this.isSaving.set(false);
    }
  }

  async clearOpenaiApiKey(): Promise<void> {
    this.isSaving.set(true);
    try {
      await this.configService.deleteConfig('OPENAI_API_KEY');
      this.openaiConfig.update(c => ({ ...c, apiKey: '', hasApiKey: false }));
      this.snackBar.open('API key cleared', 'Close', { duration: 2000 });
    } catch (err) {
      console.error('Failed to clear API key:', err);
      this.snackBar.open('Failed to clear API key', 'Close', {
        duration: 3000,
      });
    } finally {
      this.isSaving.set(false);
    }
  }

  // OpenRouter methods
  async toggleOpenrouter(enabled: boolean): Promise<void> {
    this.isSaving.set(true);
    try {
      await this.configService.setConfig(
        'AI_IMAGE_OPENROUTER_ENABLED',
        enabled ? 'true' : 'false'
      );
      this.openrouterConfig.update(c => ({ ...c, enabled }));
      this.snackBar.open('OpenRouter setting saved', 'Close', {
        duration: 2000,
      });
    } catch (err) {
      console.error('Failed to save setting:', err);
      this.snackBar.open('Failed to save setting', 'Close', { duration: 3000 });
      this.openrouterConfig.update(c => ({ ...c, enabled: !enabled }));
    } finally {
      this.isSaving.set(false);
    }
  }

  async saveOpenrouterApiKey(): Promise<void> {
    const apiKey = this.openrouterConfig().apiKey;
    if (!apiKey) return;

    this.isSaving.set(true);
    try {
      await this.configService.setConfig('AI_IMAGE_OPENROUTER_API_KEY', apiKey);
      this.openrouterConfig.update(c => ({
        ...c,
        apiKey: '',
        hasApiKey: true,
      }));
      this.editingOpenrouterKey.set(false);
      this.snackBar.open('API key saved', 'Close', { duration: 2000 });
    } catch (err) {
      console.error('Failed to save API key:', err);
      this.snackBar.open('Failed to save API key', 'Close', { duration: 3000 });
    } finally {
      this.isSaving.set(false);
    }
  }

  async clearOpenrouterApiKey(): Promise<void> {
    this.isSaving.set(true);
    try {
      await this.configService.deleteConfig('AI_IMAGE_OPENROUTER_API_KEY');
      this.openrouterConfig.update(c => ({
        ...c,
        apiKey: '',
        hasApiKey: false,
      }));
      this.snackBar.open('API key cleared', 'Close', { duration: 2000 });
    } catch (err) {
      console.error('Failed to clear API key:', err);
      this.snackBar.open('Failed to clear API key', 'Close', {
        duration: 3000,
      });
    } finally {
      this.isSaving.set(false);
    }
  }

  // Stable Diffusion methods
  async toggleSd(enabled: boolean): Promise<void> {
    this.isSaving.set(true);
    try {
      await this.configService.setConfig(
        'AI_IMAGE_SD_ENABLED',
        enabled ? 'true' : 'false'
      );
      this.sdConfig.update(c => ({ ...c, enabled }));
      this.snackBar.open('Stable Diffusion setting saved', 'Close', {
        duration: 2000,
      });
    } catch (err) {
      console.error('Failed to save setting:', err);
      this.snackBar.open('Failed to save setting', 'Close', { duration: 3000 });
      this.sdConfig.update(c => ({ ...c, enabled: !enabled }));
    } finally {
      this.isSaving.set(false);
    }
  }

  async saveSdEndpoint(): Promise<void> {
    const endpoint = this.sdConfig().endpoint;
    if (!endpoint) return;

    this.isSaving.set(true);
    try {
      await this.configService.setConfig('AI_IMAGE_SD_ENDPOINT', endpoint);
      this.snackBar.open('Endpoint saved', 'Close', { duration: 2000 });
    } catch (err) {
      console.error('Failed to save endpoint:', err);
      this.snackBar.open('Failed to save endpoint', 'Close', {
        duration: 3000,
      });
    } finally {
      this.isSaving.set(false);
    }
  }

  async saveSdApiKey(): Promise<void> {
    const apiKey = this.sdConfig().apiKey;
    if (!apiKey) return;

    this.isSaving.set(true);
    try {
      await this.configService.setConfig('AI_IMAGE_SD_API_KEY', apiKey);
      this.sdConfig.update(c => ({ ...c, apiKey: '', hasApiKey: true }));
      this.editingSdKey.set(false);
      this.snackBar.open('API key saved', 'Close', { duration: 2000 });
    } catch (err) {
      console.error('Failed to save API key:', err);
      this.snackBar.open('Failed to save API key', 'Close', { duration: 3000 });
    } finally {
      this.isSaving.set(false);
    }
  }

  async clearSdApiKey(): Promise<void> {
    this.isSaving.set(true);
    try {
      await this.configService.deleteConfig('AI_IMAGE_SD_API_KEY');
      this.sdConfig.update(c => ({ ...c, apiKey: '', hasApiKey: false }));
      this.snackBar.open('API key cleared', 'Close', { duration: 2000 });
    } catch (err) {
      console.error('Failed to clear API key:', err);
      this.snackBar.open('Failed to clear API key', 'Close', {
        duration: 3000,
      });
    } finally {
      this.isSaving.set(false);
    }
  }

  // Fal.ai methods
  async toggleFalai(enabled: boolean): Promise<void> {
    this.isSaving.set(true);
    try {
      await this.configService.setConfig(
        'AI_IMAGE_FALAI_ENABLED',
        enabled ? 'true' : 'false'
      );
      this.falaiConfig.update(c => ({ ...c, enabled }));
      this.snackBar.open('Fal.ai setting saved', 'Close', {
        duration: 2000,
      });
    } catch (err) {
      console.error('Failed to save setting:', err);
      this.snackBar.open('Failed to save setting', 'Close', { duration: 3000 });
      this.falaiConfig.update(c => ({ ...c, enabled: !enabled }));
    } finally {
      this.isSaving.set(false);
    }
  }

  async saveFalaiApiKey(): Promise<void> {
    const apiKey = this.falaiConfig().apiKey;
    if (!apiKey) return;

    this.isSaving.set(true);
    try {
      await this.configService.setConfig('AI_IMAGE_FALAI_API_KEY', apiKey);
      this.falaiConfig.update(c => ({
        ...c,
        apiKey: '',
        hasApiKey: true,
      }));
      this.editingFalaiKey.set(false);
      this.snackBar.open('API key saved', 'Close', { duration: 2000 });
    } catch (err) {
      console.error('Failed to save API key:', err);
      this.snackBar.open('Failed to save API key', 'Close', { duration: 3000 });
    } finally {
      this.isSaving.set(false);
    }
  }

  async clearFalaiApiKey(): Promise<void> {
    this.isSaving.set(true);
    try {
      await this.configService.deleteConfig('AI_IMAGE_FALAI_API_KEY');
      this.falaiConfig.update(c => ({
        ...c,
        apiKey: '',
        hasApiKey: false,
      }));
      this.snackBar.open('API key cleared', 'Close', { duration: 2000 });
    } catch (err) {
      console.error('Failed to clear API key:', err);
      this.snackBar.open('Failed to clear API key', 'Close', {
        duration: 3000,
      });
    } finally {
      this.isSaving.set(false);
    }
  }

  updateOpenaiApiKey(value: string): void {
    this.openaiConfig.update(c => ({ ...c, apiKey: value }));
  }

  updateOpenrouterApiKey(value: string): void {
    this.openrouterConfig.update(c => ({ ...c, apiKey: value }));
  }

  updateSdApiKey(value: string): void {
    this.sdConfig.update(c => ({ ...c, apiKey: value }));
  }

  updateSdEndpoint(value: string): void {
    this.sdConfig.update(c => ({ ...c, endpoint: value }));
  }

  updateFalaiApiKey(value: string): void {
    this.falaiConfig.update(c => ({ ...c, apiKey: value }));
  }

  // Model configuration methods

  /** Parse models JSON string or return defaults */
  private parseModelsConfig(
    json: string,
    provider: 'openai' | 'openrouter' | 'falai'
  ): ModelConfig[] {
    let defaults: ModelConfig[];
    switch (provider) {
      case 'openai':
        defaults = this.getDefaultOpenaiModelsList();
        break;
      case 'openrouter':
        defaults = this.getDefaultOpenrouterModelsList();
        break;
      case 'falai':
        defaults = this.getDefaultFalaiModelsList();
        break;
    }

    if (!json) {
      return defaults;
    }

    try {
      const parsed: unknown = JSON.parse(json);
      if (!Array.isArray(parsed)) return defaults;

      // Map parsed models, preserving enabled state (default to true)
      return (parsed as Record<string, unknown>[]).map(m => {
        const id = typeof m['id'] === 'string' ? m['id'] : '';
        const name = typeof m['name'] === 'string' ? m['name'] : id;
        const description =
          typeof m['description'] === 'string' ? m['description'] : undefined;
        return {
          id,
          name,
          description,
          enabled: m['enabled'] !== false, // Default to enabled if not specified
          supportedSizes: Array.isArray(m['supportedSizes'])
            ? (m['supportedSizes'] as string[])
            : undefined,
          supportsQuality: Boolean(m['supportsQuality']),
          supportsStyle: Boolean(m['supportsStyle']),
          maxImages: typeof m['maxImages'] === 'number' ? m['maxImages'] : 1,
        };
      });
    } catch {
      return defaults;
    }
  }

  /** Convert model list to JSON for saving */
  private modelsToJson(models: ModelConfig[]): string {
    const enabledModels = models
      .filter(m => m.enabled)
      .map(m => ({
        id: m.id,
        name: m.name,
        description: m.description,
        supportedSizes: m.supportedSizes,
        supportsQuality: m.supportsQuality,
        supportsStyle: m.supportsStyle,
        maxImages: m.maxImages,
      }));
    return JSON.stringify(enabledModels);
  }

  /** Toggle a model's enabled state */
  toggleOpenaiModel(modelId: string, enabled: boolean): void {
    this.openaiModels.update(models =>
      models.map(m => (m.id === modelId ? { ...m, enabled } : m))
    );
    this.openaiModelsModified.set(true);
  }

  toggleOpenrouterModel(modelId: string, enabled: boolean): void {
    this.openrouterModels.update(models =>
      models.map(m => (m.id === modelId ? { ...m, enabled } : m))
    );
    this.openrouterModelsModified.set(true);
  }

  toggleFalaiModel(modelId: string, enabled: boolean): void {
    this.falaiModels.update(models =>
      models.map(m => (m.id === modelId ? { ...m, enabled } : m))
    );
    this.falaiModelsModified.set(true);
  }

  /** Save OpenAI model configuration */
  async saveOpenaiModels(): Promise<void> {
    const models = this.openaiModels();
    const enabledModels = models.filter(m => m.enabled);

    if (enabledModels.length === 0) {
      this.snackBar.open('At least one model must be enabled', 'Close', {
        duration: 3000,
      });
      return;
    }

    this.isSaving.set(true);
    try {
      const modelsJson = this.modelsToJson(models);
      await this.configService.setConfig('AI_IMAGE_OPENAI_MODELS', modelsJson);
      this.openaiConfig.update(c => ({ ...c, models: modelsJson }));
      this.openaiModelsModified.set(false);
      this.snackBar.open('Model configuration saved', 'Close', {
        duration: 2000,
      });
    } catch (err) {
      console.error('Failed to save model config:', err);
      this.snackBar.open('Failed to save model configuration', 'Close', {
        duration: 3000,
      });
    } finally {
      this.isSaving.set(false);
    }
  }

  /** Save OpenRouter model configuration */
  async saveOpenrouterModels(): Promise<void> {
    const models = this.openrouterModels();
    const enabledModels = models.filter(m => m.enabled);

    if (enabledModels.length === 0) {
      this.snackBar.open('At least one model must be enabled', 'Close', {
        duration: 3000,
      });
      return;
    }

    this.isSaving.set(true);
    try {
      const modelsJson = this.modelsToJson(models);
      await this.configService.setConfig(
        'AI_IMAGE_OPENROUTER_MODELS',
        modelsJson
      );
      this.openrouterConfig.update(c => ({ ...c, models: modelsJson }));
      this.openrouterModelsModified.set(false);
      this.snackBar.open('Model configuration saved', 'Close', {
        duration: 2000,
      });
    } catch (err) {
      console.error('Failed to save model config:', err);
      this.snackBar.open('Failed to save model configuration', 'Close', {
        duration: 3000,
      });
    } finally {
      this.isSaving.set(false);
    }
  }

  /** Reset OpenAI models to defaults */
  resetOpenaiModels(): void {
    this.openaiModels.set(this.getDefaultOpenaiModelsList());
    this.openaiModelsModified.set(true);
  }

  /** Reset OpenRouter models to defaults */
  resetOpenrouterModels(): void {
    this.openrouterModels.set(this.getDefaultOpenrouterModelsList());
    this.openrouterModelsModified.set(true);
  }

  /** Save Fal.ai model configuration */
  async saveFalaiModels(): Promise<void> {
    const models = this.falaiModels();
    const enabledModels = models.filter(m => m.enabled);

    if (enabledModels.length === 0) {
      this.snackBar.open('At least one model must be enabled', 'Close', {
        duration: 3000,
      });
      return;
    }

    this.isSaving.set(true);
    try {
      const modelsJson = this.modelsToJson(models);
      await this.configService.setConfig('AI_IMAGE_FALAI_MODELS', modelsJson);
      this.falaiConfig.update(c => ({ ...c, models: modelsJson }));
      this.falaiModelsModified.set(false);
      this.snackBar.open('Model configuration saved', 'Close', {
        duration: 2000,
      });
    } catch (err) {
      console.error('Failed to save model config:', err);
      this.snackBar.open('Failed to save model configuration', 'Close', {
        duration: 3000,
      });
    } finally {
      this.isSaving.set(false);
    }
  }

  /** Reset Fal.ai models to defaults */
  resetFalaiModels(): void {
    this.falaiModels.set(this.getDefaultFalaiModelsList());
    this.falaiModelsModified.set(true);
  }

  /** Get default OpenAI models as a list */
  getDefaultOpenaiModelsList(): ModelConfig[] {
    return [
      {
        id: 'gpt-image-1',
        name: 'GPT Image 1',
        description: 'Latest GPT image model with best quality',
        enabled: true,
        supportedSizes: ['1024x1024', '1536x1024', '1024x1536', 'auto'],
        supportsQuality: true,
        supportsStyle: false,
        maxImages: 1,
      },
      {
        id: 'gpt-image-1-mini',
        name: 'GPT Image 1 Mini',
        description: 'Fast and efficient image generation',
        enabled: true,
        supportedSizes: ['1024x1024', '1536x1024', '1024x1536', 'auto'],
        supportsQuality: true,
        supportsStyle: false,
        maxImages: 1,
      },
    ];
  }

  /** Get default OpenRouter models as a list */
  getDefaultOpenrouterModelsList(): ModelConfig[] {
    return [
      {
        id: 'black-forest-labs/flux-1.1-pro',
        name: 'FLUX 1.1 Pro',
        description: 'High-quality image generation by Black Forest Labs',
        enabled: true,
        supportedSizes: ['1024x1024', '1024x1792', '1792x1024'],
        supportsQuality: false,
        supportsStyle: false,
        maxImages: 1,
      },
      {
        id: 'black-forest-labs/flux.2-flex',
        name: 'FLUX 2 Flex',
        description: 'Flexible FLUX model with fast generation',
        enabled: true,
        supportedSizes: ['1024x1024', '1024x1792', '1792x1024'],
        supportsQuality: false,
        supportsStyle: false,
        maxImages: 1,
      },
      {
        id: 'google/gemini-2.5-flash-image',
        name: 'Gemini 2.5 Flash Image',
        description: 'Google Gemini 2.5 Flash with image generation',
        enabled: true,
        supportedSizes: ['1024x1024'],
        supportsQuality: false,
        supportsStyle: false,
        maxImages: 1,
      },
      {
        id: 'google/gemini-3-pro-image-preview',
        name: 'Gemini 3 Pro Image (Preview)',
        description: 'Google Gemini 3 Pro image generation preview',
        enabled: true,
        supportedSizes: ['1024x1024'],
        supportsQuality: false,
        supportsStyle: false,
        maxImages: 1,
      },
    ];
  }

  /** Get default Fal.ai models as a list */
  getDefaultFalaiModelsList(): ModelConfig[] {
    // Nano Banana aspect ratio combinations
    const nanoBananaAspectRatios = [
      '1:1',
      '16:9',
      '9:16',
      '4:3',
      '3:4',
      '21:9',
      '9:21',
      '3:2',
      '2:3',
    ];
    const nanoBananaResolutions = ['1K', '2K', '4K'];
    const nanoBananaSizes: string[] = [];
    for (const ratio of nanoBananaAspectRatios) {
      for (const res of nanoBananaResolutions) {
        nanoBananaSizes.push(`${ratio}@${res}`);
      }
    }

    return [
      {
        id: 'fal-ai/flux-2-pro',
        name: 'FLUX 2 Pro',
        description: 'FLUX 2 Pro - excellent quality with flexible resolution',
        enabled: true,
        supportedSizes: [
          '1024x1024',
          '1920x1080',
          '1080x1920',
          '1600x2560',
          '2560x1600',
          '832x1248',
          '1248x832',
          '864x1184',
          '1184x864',
          '896x1152',
          '1152x896',
          '768x1344',
          '1344x768',
        ],
        supportsQuality: false,
        supportsStyle: false,
        maxImages: 4,
      },
      {
        id: 'fal-ai/nano-banana-pro',
        name: 'Nano Banana Pro',
        description:
          'Nano Banana Pro - fast generation with aspect ratio + resolution control',
        enabled: true,
        supportedSizes: nanoBananaSizes,
        supportsQuality: false,
        supportsStyle: false,
        maxImages: 4,
      },
    ];
  }

  // ========== Custom Sizes Methods ==========

  /** Start adding a new custom size */
  startAddingSize(): void {
    this.newSize.set({
      name: '',
      width: 1024,
      height: 1024,
    });
    this.editingNewSize.set(true);
  }

  /** Cancel adding a new custom size */
  cancelAddingSize(): void {
    this.editingNewSize.set(false);
    this.newSize.set({ name: '', width: 1024, height: 1024 });
  }

  /** Add a new custom size to the list */
  addCustomSize(): void {
    const size = this.newSize();
    if (!size.name || !size.width || !size.height) {
      this.snackBar.open('Please fill in all fields', 'Close', {
        duration: 3000,
      });
      return;
    }

    // Validate dimensions
    if (
      size.width < 256 ||
      size.width > 4096 ||
      size.height < 256 ||
      size.height > 4096
    ) {
      this.snackBar.open(
        'Dimensions must be between 256 and 4096 pixels',
        'Close',
        { duration: 3000 }
      );
      return;
    }

    // Generate a unique ID based on dimensions
    const id = `custom-${size.width}x${size.height}-${Date.now()}`;

    const newSize: CustomImageSize = {
      id,
      name: size.name,
      width: size.width,
      height: size.height,
      description: size.description,
    };

    this.customSizes.update(sizes => [...sizes, newSize]);
    this.customSizesModified.set(true);
    this.editingNewSize.set(false);
    this.newSize.set({ name: '', width: 1024, height: 1024 });
  }

  /** Remove a custom size from the list */
  removeCustomSize(id: string): void {
    this.customSizes.update(sizes => sizes.filter(s => s.id !== id));
    this.customSizesModified.set(true);
  }

  /** Update new size name */
  updateNewSizeName(value: string): void {
    this.newSize.update(s => ({ ...s, name: value }));
  }

  /** Update new size width */
  updateNewSizeWidth(value: number): void {
    this.newSize.update(s => ({ ...s, width: value }));
  }

  /** Update new size height */
  updateNewSizeHeight(value: number): void {
    this.newSize.update(s => ({ ...s, height: value }));
  }

  /** Update new size description */
  updateNewSizeDescription(value: string): void {
    this.newSize.update(s => ({ ...s, description: value }));
  }

  /** Get the size string for a custom size (e.g., "1920x1080") */
  getSizeString(size: CustomImageSize): string {
    return `${size.width}x${size.height}`;
  }

  /** Get the aspect ratio label for a custom size */
  getAspectRatioLabel(size: CustomImageSize): string {
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const divisor = gcd(size.width, size.height);
    const w = size.width / divisor;
    const h = size.height / divisor;

    // Check common aspect ratios
    if (w === h) return 'Square';
    if (w === 16 && h === 9) return 'Widescreen';
    if (w === 9 && h === 16) return 'Portrait';
    if (w === 4 && h === 3) return 'Standard';
    if (w === 3 && h === 4) return 'Portrait';
    if (w === 21 && h === 9) return 'Ultra-wide';

    return `${w}:${h}`;
  }

  /** Save custom sizes to the backend */
  async saveCustomSizes(): Promise<void> {
    this.isSaving.set(true);
    try {
      await this.imageService
        .updateCustomImageSizes({
          sizes: this.customSizes(),
        })
        .toPromise();
      this.customSizesModified.set(false);
      this.snackBar.open('Custom sizes saved', 'Close', { duration: 2000 });
    } catch (err) {
      console.error('Failed to save custom sizes:', err);
      this.snackBar.open('Failed to save custom sizes', 'Close', {
        duration: 3000,
      });
    } finally {
      this.isSaving.set(false);
    }
  }

  /** Reset custom sizes (clear all) */
  resetCustomSizes(): void {
    this.customSizes.set([]);
    this.customSizesModified.set(true);
  }
}
