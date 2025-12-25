/**
 * Unified image generation service that manages multiple providers.
 * Handles provider configuration, selection, and image generation.
 */
import { configService } from './config.service';
import {
  FalAiImageProvider,
  OpenAIImageProvider,
  OpenRouterImageProvider,
  StableDiffusionProvider,
} from './image-providers/index';
import type { IImageProvider } from '../types/image-generation';
import type {
  ImageGenerateRequest,
  ImageGenerateResponse,
  ImageGenerationStatus,
  ImageProviderType,
} from '../types/image-generation';
import type { DatabaseInstance } from '../types/context';

/**
 * Service for managing image generation across multiple providers.
 */
class ImageGenerationService {
  private providers: Map<ImageProviderType, IImageProvider> = new Map();
  private initialized = false;

  constructor() {
    // Create provider instances (not yet configured)
    this.providers.set('openai', new OpenAIImageProvider());
    this.providers.set('openrouter', new OpenRouterImageProvider());
    this.providers.set('stable-diffusion', new StableDiffusionProvider());
    this.providers.set('falai', new FalAiImageProvider());
  }

  /**
   * Initialize or update provider configurations from database settings.
   * Should be called before using the service.
   */
  async configure(db: DatabaseInstance): Promise<void> {
    console.log('[ImageGenerationService] Configuring providers from database...');

    // Check if image generation is globally enabled
    const globalEnabled = await configService.getBoolean(db, 'AI_IMAGE_ENABLED');
    if (!globalEnabled) {
      console.log('[ImageGenerationService] Image generation is globally disabled');
      // Disable all providers
      for (const provider of this.providers.values()) {
        (provider as OpenAIImageProvider).configure({ enabled: false });
      }
      this.initialized = true;
      return;
    }

    // Configure OpenAI provider
    const openaiProvider = this.providers.get('openai') as OpenAIImageProvider;
    const openaiEnabled = await configService.getBoolean(db, 'AI_IMAGE_OPENAI_ENABLED');
    const openaiApiKey = await this.getConfigValue(db, 'AI_OPENAI_API_KEY');
    const openaiEndpoint = await this.getConfigValue(db, 'AI_OPENAI_ENDPOINT');
    openaiProvider.configure({
      enabled: openaiEnabled || !!openaiApiKey, // Auto-enable if API key is set
      apiKey: openaiApiKey,
      endpoint: openaiEndpoint,
    });
    // Load custom model configuration for OpenAI
    const openaiModelsJson = await this.getConfigValue(db, 'AI_IMAGE_OPENAI_MODELS');
    if (openaiModelsJson) {
      try {
        const customModels = JSON.parse(openaiModelsJson);
        if (Array.isArray(customModels) && customModels.length > 0) {
          openaiProvider.setModels(customModels);
          console.log(`[ImageGenerationService] OpenAI using ${customModels.length} custom models`);
        }
      } catch (e) {
        console.warn('[ImageGenerationService] Failed to parse OpenAI models config:', e);
      }
    }

    // Configure OpenRouter provider
    const openrouterProvider = this.providers.get('openrouter') as OpenRouterImageProvider;
    const openrouterEnabled = await configService.getBoolean(db, 'AI_IMAGE_OPENROUTER_ENABLED');
    const openrouterApiKey = await this.getConfigValue(db, 'AI_OPENROUTER_API_KEY');
    openrouterProvider.configure({
      enabled: openrouterEnabled,
      apiKey: openrouterApiKey,
    });
    // Load custom model configuration for OpenRouter
    const openrouterModelsJson = await this.getConfigValue(db, 'AI_IMAGE_OPENROUTER_MODELS');
    if (openrouterModelsJson) {
      try {
        const customModels = JSON.parse(openrouterModelsJson);
        if (Array.isArray(customModels) && customModels.length > 0) {
          openrouterProvider.setModels(customModels);
          console.log(
            `[ImageGenerationService] OpenRouter using ${customModels.length} custom models`
          );
        }
      } catch (e) {
        console.warn('[ImageGenerationService] Failed to parse OpenRouter models config:', e);
      }
    }

    // Configure Stable Diffusion provider
    const sdProvider = this.providers.get('stable-diffusion') as StableDiffusionProvider;
    const sdEnabled = await configService.getBoolean(db, 'AI_IMAGE_SD_ENABLED');
    const sdEndpoint = await this.getConfigValue(db, 'AI_SD_ENDPOINT');
    const sdApiKey = await this.getConfigValue(db, 'AI_SD_API_KEY');
    sdProvider.configure({
      enabled: sdEnabled,
      endpoint: sdEndpoint,
      apiKey: sdApiKey,
    });

    // Configure Fal.ai provider
    const falaiProvider = this.providers.get('falai') as FalAiImageProvider;
    const falaiEnabled = await configService.getBoolean(db, 'AI_IMAGE_FALAI_ENABLED');
    const falaiApiKey = await this.getConfigValue(db, 'AI_FALAI_API_KEY');
    falaiProvider.configure({
      enabled: falaiEnabled,
      apiKey: falaiApiKey,
    });
    // Load custom model configuration for Fal.ai
    const falaiModelsJson = await this.getConfigValue(db, 'AI_IMAGE_FALAI_MODELS');
    if (falaiModelsJson) {
      try {
        const customModels = JSON.parse(falaiModelsJson);
        if (Array.isArray(customModels) && customModels.length > 0) {
          falaiProvider.setModels(customModels);
          console.log(`[ImageGenerationService] Fal.ai using ${customModels.length} custom models`);
        }
      } catch (e) {
        console.warn('[ImageGenerationService] Failed to parse Fal.ai models config:', e);
      }
    }

    this.initialized = true;
    console.log('[ImageGenerationService] Provider configuration complete');
  }

  /**
   * Get a config value (empty string if not set)
   */
  private async getConfigValue(db: DatabaseInstance, key: string): Promise<string | undefined> {
    try {
      // Use type assertion since we're accessing keys dynamically
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dynamic config key access
      const configValue = await configService.get(db, key as any);
      return configValue.value || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Get the status of all providers and overall availability.
   */
  async getStatus(db: DatabaseInstance): Promise<ImageGenerationStatus> {
    // Ensure we're configured
    if (!this.initialized) {
      await this.configure(db);
    }

    const providers = Array.from(this.providers.values()).map((p) => p.getStatus());
    const availableProviders = providers.filter((p) => p.available);

    // Get default provider from config
    let defaultProvider: ImageProviderType | undefined;
    try {
      const defaultProviderConfig = await this.getConfigValue(db, 'AI_IMAGE_DEFAULT_PROVIDER');
      if (defaultProviderConfig && this.providers.has(defaultProviderConfig as ImageProviderType)) {
        const provider = this.providers.get(defaultProviderConfig as ImageProviderType);
        if (provider?.isAvailable()) {
          defaultProvider = defaultProviderConfig as ImageProviderType;
        }
      }
    } catch {
      // Ignore errors getting default provider
    }

    // If no default set, use first available
    if (!defaultProvider && availableProviders.length > 0) {
      defaultProvider = availableProviders[0].type;
    }

    return {
      available: availableProviders.length > 0,
      providers,
      defaultProvider,
    };
  }

  /**
   * Generate images using the specified or default provider.
   */
  async generate(
    db: DatabaseInstance,
    request: ImageGenerateRequest
  ): Promise<ImageGenerateResponse> {
    // Ensure we're configured
    if (!this.initialized) {
      await this.configure(db);
    }

    // Get provider
    let provider = this.providers.get(request.provider);

    if (!provider || !provider.isAvailable()) {
      // Try to get default provider
      const status = await this.getStatus(db);
      if (status.defaultProvider) {
        provider = this.providers.get(status.defaultProvider);
      }
    }

    if (!provider || !provider.isAvailable()) {
      throw new Error(
        'No image generation provider is available. Please configure at least one provider.'
      );
    }

    // If no model specified, try to use the default model from config
    if (!request.model) {
      const defaultModel = await this.getConfigValue(db, 'AI_IMAGE_DEFAULT_MODEL');
      if (defaultModel) {
        request = { ...request, model: defaultModel };
      }
    }

    console.log(
      `[ImageGenerationService] Generating image with provider: ${provider.name}, model: ${request.model || 'default'}`
    );

    return provider.generate(request);
  }

  /**
   * Get a specific provider by type.
   */
  getProvider(type: ImageProviderType): IImageProvider | undefined {
    return this.providers.get(type);
  }

  /**
   * Check if any provider is available.
   */
  async isAvailable(db: DatabaseInstance): Promise<boolean> {
    const status = await this.getStatus(db);
    return status.available;
  }

  /**
   * Force reconfiguration (e.g., after admin changes settings)
   */
  invalidateConfiguration(): void {
    this.initialized = false;
  }
}

// Singleton instance
export const imageGenerationService = new ImageGenerationService();
