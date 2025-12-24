/**
 * Base abstract class for image generation providers.
 * Provides common functionality and defines the interface for all providers.
 */
import type {
  IImageProvider,
  ImageGenerateRequest,
  ImageGenerateResponse,
  ImageModelInfo,
  ImageProviderStatus,
  ImageProviderType,
} from '../../types/image-generation';

export abstract class BaseImageProvider implements IImageProvider {
  abstract readonly type: ImageProviderType;
  abstract readonly name: string;

  protected apiKey: string | null = null;
  protected endpoint: string | null = null;
  protected enabled: boolean = false;

  constructor(config?: { apiKey?: string; endpoint?: string; enabled?: boolean }) {
    if (config) {
      this.apiKey = config.apiKey ?? null;
      this.endpoint = config.endpoint ?? null;
      this.enabled = config.enabled ?? false;
    }
  }

  /**
   * Update provider configuration
   */
  configure(config: { apiKey?: string; endpoint?: string; enabled?: boolean }): void {
    if (config.apiKey !== undefined) {
      this.apiKey = config.apiKey || null;
    }
    if (config.endpoint !== undefined) {
      this.endpoint = config.endpoint || null;
    }
    if (config.enabled !== undefined) {
      this.enabled = config.enabled;
    }
  }

  /**
   * Check if the provider is available
   */
  abstract isAvailable(): boolean;

  /**
   * Get available models
   */
  abstract getModels(): ImageModelInfo[];

  /**
   * Generate images
   */
  abstract generate(request: ImageGenerateRequest): Promise<ImageGenerateResponse>;

  /**
   * Get provider status
   */
  getStatus(): ImageProviderStatus {
    return {
      type: this.type,
      name: this.name,
      available: this.isAvailable(),
      enabled: this.enabled,
      models: this.getModels(),
      error: !this.isAvailable() && this.enabled ? this.getUnavailableReason() : undefined,
    };
  }

  /**
   * Get the reason why the provider is unavailable
   */
  protected getUnavailableReason(): string {
    if (!this.enabled) {
      return 'Provider is disabled';
    }
    if (!this.apiKey && this.requiresApiKey()) {
      return 'API key not configured';
    }
    if (!this.endpoint && this.requiresEndpoint()) {
      return 'Endpoint not configured';
    }
    return 'Unknown error';
  }

  /**
   * Whether this provider requires an API key
   */
  protected requiresApiKey(): boolean {
    return true;
  }

  /**
   * Whether this provider requires a custom endpoint
   */
  protected requiresEndpoint(): boolean {
    return false;
  }

  /**
   * Build the final prompt including worldbuilding context
   */
  protected buildPromptWithContext(request: ImageGenerateRequest): string {
    let prompt = request.prompt;

    // Add worldbuilding context if provided
    if (request.worldbuildingContext && request.worldbuildingContext.length > 0) {
      const contextParts: string[] = [];

      for (const ctx of request.worldbuildingContext) {
        // Create a context entry with the element's role
        const rolePrefix = this.getRolePrefix(ctx.role);
        const contextData = JSON.stringify(ctx.data, null, 2);
        contextParts.push(
          `${rolePrefix} "${ctx.name}" (${ctx.type}):\n${ctx.roleDescription || ''}\nData: ${contextData}`
        );
      }

      // Append context to prompt
      if (contextParts.length > 0) {
        prompt = `${prompt}\n\n--- Worldbuilding Context ---\n${contextParts.join('\n\n')}`;
      }
    }

    return prompt;
  }

  /**
   * Get prefix text for a worldbuilding element role
   */
  private getRolePrefix(role: string): string {
    switch (role) {
      case 'subject':
        return '[Main Subject]';
      case 'setting':
        return '[Setting/Location]';
      case 'style':
        return '[Style Reference]';
      case 'reference':
        return '[Additional Reference]';
      default:
        return '[Context]';
    }
  }
}
