import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
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
import { RouterModule } from '@angular/router';
import { AdminConfigService } from '@services/admin/admin-config.service';
import { SystemConfigService } from '@services/core/system-config.service';
import {
  AdminImageModelProfile,
  AdminImageProfilesService,
  AdminListImageProviders200ResponseInner,
  AIImageGenerationService,
  AIProvidersService,
  CreateImageModelProfileRequest,
  CustomImageSize,
  DefaultTextToImageModelsResponse,
  ImageModelInfo,
  ProviderStatus,
  UpdateImageModelProfileRequest,
} from 'api-client';
import { firstValueFrom } from 'rxjs';

import { ImageProfileDialogComponent } from '../image-profiles/image-profile-dialog/image-profile-dialog.component';

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

/** Unified model for the simplified model list */
interface UnifiedModel {
  id: string;
  name: string;
  provider: string;
  providerName: string;
  description?: string;
  enabled: boolean;
  isDefault: boolean;
}

@Component({
  selector: 'app-admin-ai-settings',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatChipsModule,
    MatDialogModule,
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
    RouterModule,
  ],
  templateUrl: './ai-settings.component.html',
  styleUrl: './ai-settings.component.scss',
})
export class AdminAiSettingsComponent implements OnInit {
  private readonly configService = inject(AdminConfigService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly imageService = inject(AIImageGenerationService);
  private readonly providersService = inject(AIProvidersService);
  private readonly profilesService = inject(AdminImageProfilesService);
  private readonly dialog = inject(MatDialog);
  private readonly systemConfigService = inject(SystemConfigService);

  // AI Kill Switch state from system config
  readonly isAiKillSwitchEnabled =
    this.systemConfigService.isAiKillSwitchEnabled;
  readonly isAiKillSwitchLockedByEnv =
    this.systemConfigService.isAiKillSwitchLockedByEnv;

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

  // Cached default models from backend API (single source of truth)
  private readonly defaultModelsCache =
    signal<DefaultTextToImageModelsResponse | null>(null);

  // Track if models have been modified
  readonly openaiModelsModified = signal(false);
  readonly openrouterModelsModified = signal(false);
  readonly falaiModelsModified = signal(false);
  readonly unifiedModelsModified = signal(false);

  // Provider status from AI Providers API
  readonly providerStatus = signal<ProviderStatus[]>([]);

  // Unified model list (enabled models from configured providers)
  readonly unifiedModels = signal<UnifiedModel[]>([]);

  // Custom image sizes
  readonly customSizes = signal<CustomImageSize[]>([]);
  readonly customSizesModified = signal(false);
  readonly editingNewSize = signal(false);
  readonly newSize = signal<Partial<CustomImageSize>>({
    name: '',
    width: 1024,
    height: 1024,
  });

  // Image profiles
  readonly imageProfiles = signal<AdminImageModelProfile[]>([]);
  readonly imageProfileProviders = signal<
    AdminListImageProviders200ResponseInner[]
  >([]);
  readonly isLoadingProfiles = signal(false);

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

  /** Sorted unified models - default model at top, then by provider and name */
  readonly sortedUnifiedModels = computed(() => {
    const models = [...this.unifiedModels()];
    return models.sort((a, b) => {
      // Default model always first
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      // Then sort by provider, then by name
      if (a.providerName !== b.providerName) {
        return a.providerName.localeCompare(b.providerName);
      }
      return a.name.localeCompare(b.name);
    });
  });

  /** Get the current default model (for display at top) */
  readonly defaultModelInfo = computed(() => {
    return this.unifiedModels().find(m => m.isDefault) || null;
  });

  /** Models grouped by provider (excluding the default model display) */
  readonly modelsByProvider = computed(() => {
    const models = this.unifiedModels();
    const grouped = new Map<string, UnifiedModel[]>();

    for (const model of models) {
      const existing = grouped.get(model.provider) || [];
      existing.push(model);
      grouped.set(model.provider, existing);
    }

    // Convert to array and sort providers alphabetically
    return Array.from(grouped.entries())
      .map(([providerId, providerModels]) => ({
        providerId,
        providerName: providerModels[0]?.providerName || providerId,
        models: providerModels.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.providerName.localeCompare(b.providerName));
  });

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
    void this.loadImageProfiles();
  }

  async loadConfig(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      // First, fetch default models from the backend (single source of truth)
      await this.fetchDefaultModels();

      const config = await this.configService.getAllConfig();

      // Global settings
      this.imageGenerationEnabled.set(
        config['AI_IMAGE_ENABLED']?.value === 'true'
      );
      this.defaultProvider.set(
        config['AI_IMAGE_DEFAULT_PROVIDER']?.value || 'openai'
      );
      this.defaultModel.set(config['AI_IMAGE_DEFAULT_MODEL']?.value || '');

      // OpenAI - uses shared provider key AI_OPENAI_API_KEY
      const openaiHasKey = config['AI_OPENAI_API_KEY']?.value === '********';
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

      // OpenRouter - uses shared provider key AI_OPENROUTER_API_KEY
      const openrouterHasKey =
        config['AI_OPENROUTER_API_KEY']?.value === '********';
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

      // Stable Diffusion - uses shared provider keys AI_SD_API_KEY and AI_SD_ENDPOINT
      const sdHasKey = config['AI_SD_API_KEY']?.value === '********';
      this.sdConfig.set({
        enabled: config['AI_IMAGE_SD_ENABLED']?.value === 'true',
        apiKey: '',
        endpoint: config['AI_SD_ENDPOINT']?.value || '',
        hasApiKey: sdHasKey,
      });

      // Fal.ai - uses shared provider key AI_FALAI_API_KEY
      const falaiHasKey = config['AI_FALAI_API_KEY']?.value === '********';
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

      // Fetch provider status and build unified model list
      await this.loadProviderStatus();
      this.buildUnifiedModels();
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

  /** Load provider status from the AI Providers service */
  private async loadProviderStatus(): Promise<void> {
    try {
      const status = await firstValueFrom(
        this.providersService.getAiProvidersStatus()
      );
      this.providerStatus.set(status.providers);
    } catch (err) {
      console.error('Failed to load provider status:', err);
      this.providerStatus.set([]);
    }
  }

  /**
   * Fetch default models from backend API.
   * This is the single source of truth for available text-to-image models.
   */
  private async fetchDefaultModels(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.imageService.getDefaultTextToImageModels()
      );
      this.defaultModelsCache.set(response);
      console.log(
        '[AI Settings] Loaded default models from backend:',
        response.providers
      );
    } catch (err) {
      console.error('Failed to fetch default models from backend:', err);
      // Continue with empty cache - parseModelsConfig will return empty arrays
      this.defaultModelsCache.set(null);
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
      await this.configService.setConfig('AI_OPENAI_API_KEY', apiKey);
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
      await this.configService.deleteConfig('AI_OPENAI_API_KEY');
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
      await this.configService.setConfig('AI_OPENROUTER_API_KEY', apiKey);
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
      await this.configService.deleteConfig('AI_OPENROUTER_API_KEY');
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
      await this.configService.setConfig('AI_SD_ENDPOINT', endpoint);
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
      await this.configService.setConfig('AI_SD_API_KEY', apiKey);
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
      await this.configService.deleteConfig('AI_SD_API_KEY');
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
      await this.configService.setConfig('AI_FALAI_API_KEY', apiKey);
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
      await this.configService.deleteConfig('AI_FALAI_API_KEY');
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

  /**
   * Convert ImageModelInfo from API to ModelConfig for UI.
   * Adds an 'enabled' flag for toggle controls.
   */
  private apiModelToModelConfig(model: ImageModelInfo): ModelConfig {
    return {
      id: model.id,
      name: model.name,
      description: model.description,
      enabled: true, // Default to enabled
      supportedSizes: model.supportedSizes,
      supportsQuality: model.supportsQuality,
      supportsStyle: model.supportsStyle,
      maxImages: model.maxImages,
    };
  }

  /**
   * Get default models for a provider from the cached API response.
   * Returns an empty array if cache is not available.
   */
  private getDefaultModelsForProvider(
    provider: 'openai' | 'openrouter' | 'falai'
  ): ModelConfig[] {
    const cache = this.defaultModelsCache();
    if (!cache?.providers) {
      console.warn(
        `[AI Settings] No default models cache for provider: ${provider}`
      );
      return [];
    }

    const providerData = cache.providers[provider];
    if (!providerData?.models) {
      return [];
    }

    return providerData.models.map(m => this.apiModelToModelConfig(m));
  }

  /** Parse models JSON string or return defaults from backend API */
  private parseModelsConfig(
    json: string,
    provider: 'openai' | 'openrouter' | 'falai'
  ): ModelConfig[] {
    const defaults = this.getDefaultModelsForProvider(provider);

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
    this.openaiModels.set(this.getDefaultModelsForProvider('openai'));
    this.openaiModelsModified.set(true);
  }

  /** Reset OpenRouter models to defaults */
  resetOpenrouterModels(): void {
    this.openrouterModels.set(this.getDefaultModelsForProvider('openrouter'));
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
    this.falaiModels.set(this.getDefaultModelsForProvider('falai'));
    this.falaiModelsModified.set(true);
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

  // =========================================================================
  // Unified Model List Management
  // =========================================================================

  /** Build the unified models list from all configured providers */
  private buildUnifiedModels(): void {
    const providers = this.providerStatus();
    const currentDefault = this.defaultModel();
    const unified: UnifiedModel[] = [];

    // Map provider IDs to their display names
    const providerNames: Record<string, string> = {
      openai: 'OpenAI',
      openrouter: 'OpenRouter',
      falai: 'Fal.ai',
      sd: 'Stable Diffusion',
    };

    // Process each provider that has an API key and supports images
    for (const provider of providers) {
      if (!provider.hasApiKey || !provider.supportsImages) continue;

      let models: ModelConfig[] = [];
      switch (provider.id) {
        case 'openai':
          models = this.openaiModels();
          break;
        case 'openrouter':
          models = this.openrouterModels();
          break;
        case 'falai':
          models = this.falaiModels();
          break;
        // SD doesn't have a model list, skip
      }

      for (const model of models) {
        unified.push({
          id: model.id,
          name: model.name,
          provider: provider.id,
          providerName: providerNames[provider.id] || provider.name,
          description: model.description,
          enabled: model.enabled,
          isDefault: model.id === currentDefault,
        });
      }
    }

    this.unifiedModels.set(unified);
    this.unifiedModelsModified.set(false);
  }

  /** Toggle a model's enabled state in the unified list */
  toggleUnifiedModel(modelId: string, enabled: boolean): void {
    this.unifiedModels.update(models =>
      models.map(m => (m.id === modelId ? { ...m, enabled } : m))
    );
    this.unifiedModelsModified.set(true);

    // Also update the underlying provider's model list
    const model = this.unifiedModels().find(m => m.id === modelId);
    if (model) {
      this.updateProviderModel(model.provider, modelId, enabled);
    }
  }

  /** Update a model in the underlying provider's model list */
  private updateProviderModel(
    provider: string,
    modelId: string,
    enabled: boolean
  ): void {
    switch (provider) {
      case 'openai':
        this.openaiModels.update(models =>
          models.map(m => (m.id === modelId ? { ...m, enabled } : m))
        );
        this.openaiModelsModified.set(true);
        break;
      case 'openrouter':
        this.openrouterModels.update(models =>
          models.map(m => (m.id === modelId ? { ...m, enabled } : m))
        );
        this.openrouterModelsModified.set(true);
        break;
      case 'falai':
        this.falaiModels.update(models =>
          models.map(m => (m.id === modelId ? { ...m, enabled } : m))
        );
        this.falaiModelsModified.set(true);
        break;
    }
  }

  /** Set a model as the default */
  async setAsDefaultModel(modelId: string): Promise<void> {
    const model = this.unifiedModels().find(m => m.id === modelId);
    if (!model) return;

    // Update the default model and provider
    this.defaultModel.set(modelId);
    this.defaultProvider.set(model.provider);

    // Update the unified models list - only one can be default
    this.unifiedModels.update(models =>
      models.map(m => ({ ...m, isDefault: m.id === modelId }))
    );

    // Auto-save the default model immediately
    this.isSaving.set(true);
    try {
      await this.configService.setConfig(
        'AI_IMAGE_DEFAULT_PROVIDER',
        model.provider
      );
      await this.configService.setConfig('AI_IMAGE_DEFAULT_MODEL', modelId);
      this.snackBar.open(`${model.name} set as default`, 'Close', {
        duration: 2000,
      });
    } catch (err) {
      console.error('Failed to save default model:', err);
      this.snackBar.open('Failed to save default model', 'Close', {
        duration: 3000,
      });
    } finally {
      this.isSaving.set(false);
    }
  }

  /** Save the unified model configuration */
  async saveUnifiedModels(): Promise<void> {
    this.isSaving.set(true);
    try {
      // Save the default provider and model
      await this.configService.setConfig(
        'AI_IMAGE_DEFAULT_PROVIDER',
        this.defaultProvider()
      );
      await this.configService.setConfig(
        'AI_IMAGE_DEFAULT_MODEL',
        this.defaultModel()
      );

      // Save each provider's model list if modified
      if (this.openaiModelsModified()) {
        const modelsJson = JSON.stringify(
          this.openaiModels().map(m => ({ id: m.id, enabled: m.enabled }))
        );
        await this.configService.setConfig(
          'AI_IMAGE_OPENAI_MODELS',
          modelsJson
        );
        this.openaiModelsModified.set(false);
      }

      if (this.openrouterModelsModified()) {
        const modelsJson = JSON.stringify(
          this.openrouterModels().map(m => ({ id: m.id, enabled: m.enabled }))
        );
        await this.configService.setConfig(
          'AI_IMAGE_OPENROUTER_MODELS',
          modelsJson
        );
        this.openrouterModelsModified.set(false);
      }

      if (this.falaiModelsModified()) {
        const modelsJson = JSON.stringify(
          this.falaiModels().map(m => ({ id: m.id, enabled: m.enabled }))
        );
        await this.configService.setConfig('AI_IMAGE_FALAI_MODELS', modelsJson);
        this.falaiModelsModified.set(false);
      }

      this.unifiedModelsModified.set(false);
      this.snackBar.open('Model configuration saved', 'Close', {
        duration: 2000,
      });
    } catch (err) {
      console.error('Failed to save model configuration:', err);
      this.snackBar.open('Failed to save configuration', 'Close', {
        duration: 3000,
      });
    } finally {
      this.isSaving.set(false);
    }
  }

  // =========================================================================
  // Image Profiles Management
  // =========================================================================

  /**
   * Load image profiles and their available providers.
   */
  async loadImageProfiles(): Promise<void> {
    this.isLoadingProfiles.set(true);

    try {
      const [profilesResponse, providersResponse] = await Promise.all([
        firstValueFrom(this.profilesService.adminListImageProfiles()),
        firstValueFrom(this.profilesService.adminListImageProviders()),
      ]);

      this.imageProfiles.set(profilesResponse);
      this.imageProfileProviders.set(providersResponse);
    } catch (err) {
      console.error('Failed to load image profiles:', err);
      this.snackBar.open('Failed to load image profiles', 'Close', {
        duration: 3000,
      });
    } finally {
      this.isLoadingProfiles.set(false);
    }
  }

  /**
   * Get display name for a provider by ID.
   */
  getProfileProviderName(providerId: string): string {
    const provider = this.imageProfileProviders().find(
      p => p.id === providerId
    );
    return provider?.name ?? providerId;
  }

  /**
   * Open dialog to create a new image profile.
   */
  openCreateProfileDialog(): void {
    const dialogRef = this.dialog.open(ImageProfileDialogComponent, {
      width: '600px',
      data: {
        mode: 'create',
        providers: this.imageProfileProviders(),
      },
    });

    dialogRef
      .afterClosed()
      .subscribe((result: CreateImageModelProfileRequest | undefined) => {
        if (result) {
          void this.createImageProfile(result);
        }
      });
  }

  /**
   * Open dialog to edit an existing image profile.
   */
  openEditProfileDialog(profile: AdminImageModelProfile): void {
    const dialogRef = this.dialog.open(ImageProfileDialogComponent, {
      width: '600px',
      data: {
        mode: 'edit',
        profile,
        providers: this.imageProfileProviders(),
      },
    });

    dialogRef
      .afterClosed()
      .subscribe((result: UpdateImageModelProfileRequest | undefined) => {
        if (result) {
          void this.updateImageProfile(profile.id, result);
        }
      });
  }

  /**
   * Create a new image profile.
   */
  async createImageProfile(
    data: CreateImageModelProfileRequest
  ): Promise<void> {
    this.isSaving.set(true);

    try {
      await firstValueFrom(this.profilesService.adminCreateImageProfile(data));
      this.snackBar.open('Profile created successfully', 'Dismiss', {
        duration: 3000,
      });
      await this.loadImageProfiles();
    } catch (err) {
      console.error('Failed to create profile:', err);
      this.snackBar.open('Failed to create profile', 'Dismiss', {
        duration: 5000,
      });
    } finally {
      this.isSaving.set(false);
    }
  }

  /**
   * Update an existing image profile.
   */
  async updateImageProfile(
    id: string,
    data: UpdateImageModelProfileRequest
  ): Promise<void> {
    this.isSaving.set(true);

    try {
      await firstValueFrom(
        this.profilesService.adminUpdateImageProfile(id, data)
      );
      this.snackBar.open('Profile updated successfully', 'Dismiss', {
        duration: 3000,
      });
      await this.loadImageProfiles();
    } catch (err) {
      console.error('Failed to update profile:', err);
      this.snackBar.open('Failed to update profile', 'Dismiss', {
        duration: 5000,
      });
    } finally {
      this.isSaving.set(false);
    }
  }

  /**
   * Delete an image profile.
   */
  async deleteImageProfile(profile: AdminImageModelProfile): Promise<void> {
    if (
      !confirm(`Are you sure you want to delete the profile "${profile.name}"?`)
    ) {
      return;
    }

    this.isSaving.set(true);

    try {
      await firstValueFrom(
        this.profilesService.adminDeleteImageProfile(profile.id)
      );
      this.snackBar.open('Profile deleted successfully', 'Dismiss', {
        duration: 3000,
      });
      await this.loadImageProfiles();
    } catch (err) {
      console.error('Failed to delete profile:', err);
      this.snackBar.open('Failed to delete profile', 'Dismiss', {
        duration: 5000,
      });
    } finally {
      this.isSaving.set(false);
    }
  }

  /**
   * Toggle the enabled state of an image profile.
   */
  async toggleProfileEnabled(profile: AdminImageModelProfile): Promise<void> {
    try {
      await firstValueFrom(
        this.profilesService.adminUpdateImageProfile(profile.id, {
          enabled: !profile.enabled,
        })
      );
      await this.loadImageProfiles();
    } catch (err) {
      console.error('Failed to toggle profile:', err);
      this.snackBar.open('Failed to update profile', 'Dismiss', {
        duration: 5000,
      });
    }
  }
}
