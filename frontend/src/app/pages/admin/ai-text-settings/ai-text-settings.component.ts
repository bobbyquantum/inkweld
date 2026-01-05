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
import { RouterModule } from '@angular/router';
import { AdminConfigService } from '@services/admin/admin-config.service';
import { SystemConfigService } from '@services/core/system-config.service';
import {
  AIProvidersService,
  AITextGenerationService,
  DefaultTextModelsResponse,
  OpenRouterModel,
  TextModelInfo,
} from 'api-client';
import { firstValueFrom } from 'rxjs';

interface ProviderConfig {
  enabled: boolean;
  apiKey: string;
  hasApiKey: boolean;
  models?: string; // JSON string of model configurations
}

/** Model info with enabled flag for UI */
interface ModelConfig {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  maxTokens?: number;
  supportsJsonMode?: boolean;
  supportsStreaming?: boolean;
  costTier?: number;
}

/** Unified model for the simplified model list */
interface UnifiedModel {
  id: string;
  name: string;
  provider: string;
  providerName: string;
  description?: string;
  enabled: boolean;
  maxTokens?: number;
  costTier?: number;
}

@Component({
  selector: 'app-admin-ai-text-settings',
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
    RouterModule,
  ],
  templateUrl: './ai-text-settings.component.html',
  styleUrl: './ai-text-settings.component.scss',
})
export class AdminAiTextSettingsComponent implements OnInit {
  private readonly configService = inject(AdminConfigService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly textService = inject(AITextGenerationService);
  private readonly providersService = inject(AIProvidersService);
  private readonly systemConfigService = inject(SystemConfigService);

  // AI Kill Switch state from system config
  readonly isAiKillSwitchEnabled =
    this.systemConfigService.isAiKillSwitchEnabled;
  readonly isAiKillSwitchLockedByEnv =
    this.systemConfigService.isAiKillSwitchLockedByEnv;

  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly error = signal<Error | null>(null);

  // Global text generation settings
  readonly textGenerationEnabled = signal(false);
  readonly defaultProvider = signal<string>('openai');

  // Lint model settings
  readonly lintModel = signal<string>('');
  readonly lintPrompt = signal<string>('');

  // Image prompt optimization settings
  readonly imagePromptModel = signal<string>('');
  readonly imagePromptTemplate = signal<string>('');

  // OpenAI settings (shares API key with image gen)
  readonly openaiConfig = signal<ProviderConfig>({
    enabled: false,
    apiKey: '',
    hasApiKey: false,
  });

  // OpenRouter settings (shares API key with image gen)
  readonly openrouterConfig = signal<ProviderConfig>({
    enabled: false,
    apiKey: '',
    hasApiKey: false,
  });

  // Anthropic settings (new, text-only provider)
  readonly anthropicConfig = signal<ProviderConfig>({
    enabled: false,
    apiKey: '',
    hasApiKey: false,
  });

  // Track which API key fields are being edited
  readonly editingAnthropicKey = signal(false);

  // Model configurations as lists with enabled flags
  readonly openaiModels = signal<ModelConfig[]>([]);
  readonly openrouterModels = signal<ModelConfig[]>([]);
  readonly anthropicModels = signal<ModelConfig[]>([]);

  // Cached default models from backend API (single source of truth)
  private readonly defaultModelsCache =
    signal<DefaultTextModelsResponse | null>(null);

  // Dynamic OpenRouter models (fetched from OpenRouter API)
  private readonly dynamicOpenrouterModels = signal<OpenRouterModel[]>([]);

  // Track if models have been modified
  readonly openaiModelsModified = signal(false);
  readonly openrouterModelsModified = signal(false);
  readonly anthropicModelsModified = signal(false);

  // Computed: count enabled models
  readonly openaiEnabledCount = computed(
    () => this.openaiModels().filter(m => m.enabled).length
  );
  readonly openrouterEnabledCount = computed(
    () => this.openrouterModels().filter(m => m.enabled).length
  );
  readonly anthropicEnabledCount = computed(
    () => this.anthropicModels().filter(m => m.enabled).length
  );

  // Track if unified models have been modified
  readonly unifiedModelsModified = signal(false);

  /** Unified model list combining all providers */
  readonly unifiedModels = computed(() => {
    const models: UnifiedModel[] = [];

    // Add OpenAI models if provider has API key
    if (this.openaiConfig().hasApiKey) {
      for (const model of this.openaiModels()) {
        models.push({
          id: model.id,
          name: model.name,
          provider: 'openai',
          providerName: 'OpenAI',
          description: model.description,
          enabled: model.enabled,
          maxTokens: model.maxTokens,
          costTier: model.costTier,
        });
      }
    }

    // Add OpenRouter models if provider has API key
    if (this.openrouterConfig().hasApiKey) {
      for (const model of this.openrouterModels()) {
        models.push({
          id: model.id,
          name: model.name,
          provider: 'openrouter',
          providerName: 'OpenRouter',
          description: model.description,
          enabled: model.enabled,
          maxTokens: model.maxTokens,
          costTier: model.costTier,
        });
      }
    }

    // Add Anthropic models if provider has API key
    if (this.anthropicConfig().hasApiKey) {
      for (const model of this.anthropicModels()) {
        models.push({
          id: model.id,
          name: model.name,
          provider: 'anthropic',
          providerName: 'Anthropic',
          description: model.description,
          enabled: model.enabled,
          maxTokens: model.maxTokens,
          costTier: model.costTier,
        });
      }
    }

    return models;
  });

  /** Models grouped by provider */
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

  // Computed: available models for lint and image prompt dropdowns
  // Shows all models from providers that have API keys configured
  readonly availableModels = computed(() => {
    const models: { id: string; name: string; provider: string }[] = [];

    if (this.openaiConfig().hasApiKey) {
      this.openaiModels().forEach(m =>
        models.push({ id: m.id, name: m.name, provider: 'OpenAI' })
      );
    }

    if (this.openrouterConfig().hasApiKey) {
      // Use dynamic models if available, fall back to static models
      const dynamicModels = this.dynamicOpenrouterModels();
      if (dynamicModels.length > 0) {
        dynamicModels.forEach(m =>
          models.push({ id: m.id, name: m.name, provider: 'OpenRouter' })
        );
      } else {
        this.openrouterModels().forEach(m =>
          models.push({ id: m.id, name: m.name, provider: 'OpenRouter' })
        );
      }
    }

    if (this.anthropicConfig().hasApiKey) {
      this.anthropicModels().forEach(m =>
        models.push({ id: m.id, name: m.name, provider: 'Anthropic' })
      );
    }

    return models;
  });

  // Search filters for model dropdowns
  readonly lintModelSearch = signal('');
  readonly imagePromptModelSearch = signal('');

  // Filtered models for lint dropdown
  readonly filteredLintModels = computed(() => {
    const search = this.lintModelSearch().toLowerCase().trim();
    if (!search) {
      return this.availableModels();
    }
    return this.availableModels().filter(
      m =>
        m.name.toLowerCase().includes(search) ||
        m.id.toLowerCase().includes(search) ||
        m.provider.toLowerCase().includes(search)
    );
  });

  // Filtered models for image prompt dropdown
  readonly filteredImagePromptModels = computed(() => {
    const search = this.imagePromptModelSearch().toLowerCase().trim();
    if (!search) {
      return this.availableModels();
    }
    return this.availableModels().filter(
      m =>
        m.name.toLowerCase().includes(search) ||
        m.id.toLowerCase().includes(search) ||
        m.provider.toLowerCase().includes(search)
    );
  });

  ngOnInit(): void {
    void this.loadConfig();
  }

  async loadConfig(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      // Fetch default models from API first
      await this.fetchDefaultModels();

      // Load all config keys
      const config = await this.configService.getAllConfig();

      // Global settings
      this.textGenerationEnabled.set(
        config['AI_TEXT_ENABLED']?.value === 'true'
      );
      this.defaultProvider.set(
        config['AI_TEXT_DEFAULT_PROVIDER']?.value || 'openai'
      );

      // Lint settings
      this.lintModel.set(config['AI_TEXT_LINT_MODEL']?.value || '');
      this.lintPrompt.set(config['AI_TEXT_LINT_PROMPT']?.value || '');

      // Image prompt optimization settings
      this.imagePromptModel.set(
        config['AI_TEXT_IMAGE_PROMPT_MODEL']?.value || ''
      );
      this.imagePromptTemplate.set(
        config['AI_TEXT_IMAGE_PROMPT_TEMPLATE']?.value || ''
      );

      // OpenAI text config (uses shared API key from image gen)
      const openaiHasKey = config['AI_OPENAI_API_KEY']?.value === '********';
      const openaiModelsJson = config['AI_TEXT_OPENAI_MODELS']?.value || '';
      this.openaiConfig.set({
        enabled: config['AI_TEXT_OPENAI_ENABLED']?.value === 'true',
        apiKey: '',
        hasApiKey: openaiHasKey,
        models: openaiModelsJson,
      });

      // OpenRouter text config (uses shared API key from image gen)
      const openrouterHasKey =
        config['AI_OPENROUTER_API_KEY']?.value === '********';
      const openrouterModelsJson =
        config['AI_TEXT_OPENROUTER_MODELS']?.value || '';
      this.openrouterConfig.set({
        enabled: config['AI_TEXT_OPENROUTER_ENABLED']?.value === 'true',
        apiKey: '',
        hasApiKey: openrouterHasKey,
        models: openrouterModelsJson,
      });

      // Anthropic config - uses shared provider key AI_ANTHROPIC_API_KEY
      const anthropicHasKey =
        config['AI_ANTHROPIC_API_KEY']?.value === '********';
      const anthropicModelsJson =
        config['AI_TEXT_ANTHROPIC_MODELS']?.value || '';
      this.anthropicConfig.set({
        enabled: config['AI_TEXT_ANTHROPIC_ENABLED']?.value === 'true',
        apiKey: '',
        hasApiKey: anthropicHasKey,
        models: anthropicModelsJson,
      });

      // Parse model configs
      this.openaiModels.set(this.parseModelsConfig(openaiModelsJson, 'openai'));
      this.openrouterModels.set(
        this.parseModelsConfig(openrouterModelsJson, 'openrouter')
      );
      this.anthropicModels.set(
        this.parseModelsConfig(anthropicModelsJson, 'anthropic')
      );
    } catch (err) {
      this.error.set(
        err instanceof Error ? err : new Error('Failed to load configuration')
      );
    } finally {
      this.isLoading.set(false);
    }
  }

  /** Fetch default models from the backend API */
  private async fetchDefaultModels(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.textService.getDefaultTextModels()
      );
      this.defaultModelsCache.set(response);
    } catch (err) {
      console.error('Failed to fetch default text models:', err);
      // Continue with empty defaults - the component will still work
    }

    // Also try to fetch dynamic OpenRouter models
    await this.fetchOpenRouterModels();
  }

  /** Fetch dynamic models from OpenRouter API */
  private async fetchOpenRouterModels(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.providersService.getOpenRouterModels()
      );
      this.dynamicOpenrouterModels.set(response.models || []);
    } catch (err) {
      // This will fail if OpenRouter key not configured - that's OK
      console.debug('OpenRouter models not available:', err);
    }
  }

  /** Get default models for a provider from the cached API response */
  private getDefaultModelsForProvider(
    provider: 'openai' | 'openrouter' | 'anthropic'
  ): TextModelInfo[] {
    const cache = this.defaultModelsCache();
    if (!cache?.providers) {
      return [];
    }
    return cache.providers[provider]?.models || [];
  }

  /** Convert API model info to UI model config */
  private apiModelToModelConfig(model: TextModelInfo): ModelConfig {
    return {
      id: model.id,
      name: model.name,
      description: model.description,
      enabled: true, // Default to enabled
      maxTokens: model.maxTokens,
      supportsJsonMode: model.supportsJsonMode,
      supportsStreaming: model.supportsStreaming,
      costTier: model.costTier,
    };
  }

  /** Parse stored models config or use defaults from API */
  private parseModelsConfig(
    modelsJson: string | undefined,
    provider: 'openai' | 'openrouter' | 'anthropic'
  ): ModelConfig[] {
    const defaultModels = this.getDefaultModelsForProvider(provider);

    if (!modelsJson || !modelsJson.trim()) {
      // No stored config - use API defaults (all enabled)
      return defaultModels.map(m => this.apiModelToModelConfig(m));
    }

    try {
      const stored = JSON.parse(modelsJson) as ModelConfig[];
      // Merge with defaults - ensure all default models exist, keep stored enabled state
      const storedMap = new Map(stored.map(m => [m.id, m]));

      return defaultModels.map(defaultModel => {
        const stored = storedMap.get(defaultModel.id);
        if (stored) {
          return {
            ...this.apiModelToModelConfig(defaultModel),
            enabled: stored.enabled,
          };
        }
        return this.apiModelToModelConfig(defaultModel);
      });
    } catch {
      return defaultModels.map(m => this.apiModelToModelConfig(m));
    }
  }

  // === Save Methods ===

  async saveGlobalEnabled(enabled: boolean): Promise<void> {
    this.isSaving.set(true);
    try {
      await this.configService.setConfig('AI_TEXT_ENABLED', String(enabled));
      this.textGenerationEnabled.set(enabled);
      this.showSuccess('Text generation ' + (enabled ? 'enabled' : 'disabled'));
    } catch {
      this.showError('Failed to save setting');
    } finally {
      this.isSaving.set(false);
    }
  }

  async saveDefaultProvider(provider: string): Promise<void> {
    this.isSaving.set(true);
    try {
      await this.configService.setConfig('AI_TEXT_DEFAULT_PROVIDER', provider);
      this.defaultProvider.set(provider);
      this.showSuccess('Default provider updated');
    } catch {
      this.showError('Failed to save setting');
    } finally {
      this.isSaving.set(false);
    }
  }

  async saveLintModel(model: string): Promise<void> {
    this.isSaving.set(true);
    try {
      await this.configService.setConfig('AI_TEXT_LINT_MODEL', model);
      this.lintModel.set(model);
      this.showSuccess('Lint model updated');
    } catch {
      this.showError('Failed to save setting');
    } finally {
      this.isSaving.set(false);
    }
  }

  async saveLintPrompt(): Promise<void> {
    this.isSaving.set(true);
    try {
      await this.configService.setConfig(
        'AI_TEXT_LINT_PROMPT',
        this.lintPrompt()
      );
      this.showSuccess('Lint prompt updated');
    } catch {
      this.showError('Failed to save setting');
    } finally {
      this.isSaving.set(false);
    }
  }

  async saveImagePromptModel(model: string): Promise<void> {
    this.isSaving.set(true);
    try {
      await this.configService.setConfig('AI_TEXT_IMAGE_PROMPT_MODEL', model);
      this.imagePromptModel.set(model);
      this.showSuccess('Image prompt optimization model updated');
    } catch {
      this.showError('Failed to save setting');
    } finally {
      this.isSaving.set(false);
    }
  }

  async saveImagePromptTemplate(): Promise<void> {
    this.isSaving.set(true);
    try {
      await this.configService.setConfig(
        'AI_TEXT_IMAGE_PROMPT_TEMPLATE',
        this.imagePromptTemplate()
      );
      this.showSuccess('Image prompt template updated');
    } catch {
      this.showError('Failed to save setting');
    } finally {
      this.isSaving.set(false);
    }
  }

  // === Provider Settings ===

  async saveProviderEnabled(
    provider: 'openai' | 'openrouter' | 'anthropic',
    enabled: boolean
  ): Promise<void> {
    this.isSaving.set(true);
    const configKey = {
      openai: 'AI_TEXT_OPENAI_ENABLED',
      openrouter: 'AI_TEXT_OPENROUTER_ENABLED',
      anthropic: 'AI_TEXT_ANTHROPIC_ENABLED',
    }[provider];

    try {
      await this.configService.setConfig(configKey, String(enabled));

      switch (provider) {
        case 'openai':
          this.openaiConfig.update(c => ({ ...c, enabled }));
          break;
        case 'openrouter':
          this.openrouterConfig.update(c => ({ ...c, enabled }));
          break;
        case 'anthropic':
          this.anthropicConfig.update(c => ({ ...c, enabled }));
          break;
      }

      this.showSuccess(
        `${provider} text generation ${enabled ? 'enabled' : 'disabled'}`
      );
    } catch {
      this.showError('Failed to save setting');
    } finally {
      this.isSaving.set(false);
    }
  }

  async saveAnthropicApiKey(): Promise<void> {
    this.isSaving.set(true);
    try {
      const key = this.anthropicConfig().apiKey;
      await this.configService.setConfig('AI_ANTHROPIC_API_KEY', key);
      this.anthropicConfig.update(c => ({
        ...c,
        apiKey: '',
        hasApiKey: !!key,
      }));
      this.editingAnthropicKey.set(false);
      this.showSuccess('Anthropic API key saved');
    } catch {
      this.showError('Failed to save API key');
    } finally {
      this.isSaving.set(false);
    }
  }

  updateAnthropicApiKey(value: string): void {
    this.anthropicConfig.update(c => ({ ...c, apiKey: value }));
  }

  clearAnthropicApiKey(): void {
    this.anthropicConfig.update(c => ({
      ...c,
      apiKey: '',
      hasApiKey: false,
    }));
    void this.saveAnthropicApiKey();
  }

  // === Model Management ===

  /** Toggle a model's enabled state from the unified list */
  toggleUnifiedModel(modelId: string, enabled: boolean): void {
    // Find which provider this model belongs to
    const model = this.unifiedModels().find(m => m.id === modelId);
    if (model) {
      this.toggleModelEnabled(
        model.provider as 'openai' | 'openrouter' | 'anthropic',
        modelId,
        enabled
      );
      this.unifiedModelsModified.set(true);
    }
  }

  /** Save all modified models from unified list */
  async saveUnifiedModels(): Promise<void> {
    this.isSaving.set(true);
    try {
      const promises: Promise<void>[] = [];

      if (this.openaiModelsModified()) {
        promises.push(this.saveModelsInternal('openai'));
      }
      if (this.openrouterModelsModified()) {
        promises.push(this.saveModelsInternal('openrouter'));
      }
      if (this.anthropicModelsModified()) {
        promises.push(this.saveModelsInternal('anthropic'));
      }

      await Promise.all(promises);
      this.unifiedModelsModified.set(false);
      this.showSuccess('Model settings saved');
    } catch {
      this.showError('Failed to save models');
    } finally {
      this.isSaving.set(false);
    }
  }

  /** Internal save method without UI updates */
  private async saveModelsInternal(
    provider: 'openai' | 'openrouter' | 'anthropic'
  ): Promise<void> {
    const configKey = {
      openai: 'AI_TEXT_OPENAI_MODELS',
      openrouter: 'AI_TEXT_OPENROUTER_MODELS',
      anthropic: 'AI_TEXT_ANTHROPIC_MODELS',
    }[provider];

    const models = {
      openai: this.openaiModels(),
      openrouter: this.openrouterModels(),
      anthropic: this.anthropicModels(),
    }[provider];

    await this.configService.setConfig(configKey, JSON.stringify(models));

    switch (provider) {
      case 'openai':
        this.openaiModelsModified.set(false);
        break;
      case 'openrouter':
        this.openrouterModelsModified.set(false);
        break;
      case 'anthropic':
        this.anthropicModelsModified.set(false);
        break;
    }
  }

  toggleModelEnabled(
    provider: 'openai' | 'openrouter' | 'anthropic',
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
      case 'anthropic':
        this.anthropicModels.update(models =>
          models.map(m => (m.id === modelId ? { ...m, enabled } : m))
        );
        this.anthropicModelsModified.set(true);
        break;
    }
  }

  async saveModels(
    provider: 'openai' | 'openrouter' | 'anthropic'
  ): Promise<void> {
    this.isSaving.set(true);
    const configKey = {
      openai: 'AI_TEXT_OPENAI_MODELS',
      openrouter: 'AI_TEXT_OPENROUTER_MODELS',
      anthropic: 'AI_TEXT_ANTHROPIC_MODELS',
    }[provider];

    const models = {
      openai: this.openaiModels(),
      openrouter: this.openrouterModels(),
      anthropic: this.anthropicModels(),
    }[provider];

    try {
      await this.configService.setConfig(configKey, JSON.stringify(models));

      switch (provider) {
        case 'openai':
          this.openaiModelsModified.set(false);
          break;
        case 'openrouter':
          this.openrouterModelsModified.set(false);
          break;
        case 'anthropic':
          this.anthropicModelsModified.set(false);
          break;
      }

      this.showSuccess(`${provider} models saved`);
    } catch {
      this.showError('Failed to save models');
    } finally {
      this.isSaving.set(false);
    }
  }

  resetModels(provider: 'openai' | 'openrouter' | 'anthropic'): void {
    const defaultModels = this.getDefaultModelsForProvider(provider).map(m =>
      this.apiModelToModelConfig(m)
    );

    switch (provider) {
      case 'openai':
        this.openaiModels.set(defaultModels);
        this.openaiModelsModified.set(true);
        break;
      case 'openrouter':
        this.openrouterModels.set(defaultModels);
        this.openrouterModelsModified.set(true);
        break;
      case 'anthropic':
        this.anthropicModels.set(defaultModels);
        this.anthropicModelsModified.set(true);
        break;
    }
  }

  // === Helpers ===

  private showSuccess(message: string): void {
    this.snackBar.open(message, 'OK', { duration: 3000 });
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'OK', {
      duration: 5000,
      panelClass: 'error-snackbar',
    });
  }

  getCostTierLabel(tier: number | undefined): string {
    if (!tier) return '';
    const labels = [
      '',
      'Budget',
      'Economy',
      'Standard',
      'Premium',
      'Enterprise',
    ];
    return labels[tier] || '';
  }

  formatTokenCount(tokens: number | undefined): string {
    if (!tokens) return '';
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M tokens`;
    }
    if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(0)}K tokens`;
    }
    return `${tokens} tokens`;
  }
}
