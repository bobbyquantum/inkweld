import { Route } from '@playwright/test';

import { mockApi } from './index';

/**
 * AI Image Generation handler for mock API
 * Handles image generation status, models, and generation requests
 */
export function setupAiImageHandlers(): void {
  // GET /api/v1/ai/image/status - Image generation status
  mockApi.addHandler('**/api/v1/ai/image/status', async (route: Route) => {
    console.log('Handling AI image status request');

    // Return data matching ImageGenerationStatus type
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        available: true,
        defaultProvider: 'openai',
        providers: [
          {
            type: 'openai',
            name: 'OpenAI',
            enabled: true,
            available: true,
            models: [
              {
                id: 'gpt-image-1',
                name: 'GPT Image 1',
                provider: 'openai',
                supportedSizes: ['1024x1024', '1024x1536', '1536x1024', 'auto'],
                supportsQuality: true,
                supportsStyle: false,
                maxImages: 1,
                description: 'Latest GPT image model with best quality',
              },
              {
                id: 'gpt-image-1-mini',
                name: 'GPT Image 1 Mini',
                provider: 'openai',
                supportedSizes: ['1024x1024', '1024x1536', '1536x1024', 'auto'],
                supportsQuality: true,
                supportsStyle: false,
                maxImages: 1,
                description: 'Fast and efficient image generation',
              },
            ],
          },
          {
            type: 'openrouter',
            name: 'OpenRouter',
            enabled: true,
            available: true,
            models: [
              {
                id: 'black-forest-labs/flux-1.1-pro',
                name: 'FLUX 1.1 Pro',
                provider: 'openrouter',
                supportedSizes: ['1024x1024', '1024x1792', '1792x1024'],
                supportsQuality: false,
                supportsStyle: false,
                maxImages: 1,
                description:
                  'High-quality image generation by Black Forest Labs',
              },
              {
                id: 'black-forest-labs/flux.2-flex',
                name: 'FLUX 2 Flex',
                provider: 'openrouter',
                supportedSizes: ['1024x1024', '1024x1792', '1792x1024'],
                supportsQuality: false,
                supportsStyle: false,
                maxImages: 1,
                description: 'Flexible FLUX model with fast generation',
              },
              {
                id: 'google/gemini-2.5-flash-image',
                name: 'Gemini 2.5 Flash Image',
                provider: 'openrouter',
                supportedSizes: ['1024x1024'],
                supportsQuality: false,
                supportsStyle: false,
                maxImages: 1,
                description: 'Google Gemini 2.5 Flash with image generation',
              },
              {
                id: 'google/gemini-3-pro-image-preview',
                name: 'Gemini 3 Pro Image (Preview)',
                provider: 'openrouter',
                supportedSizes: ['1024x1024'],
                supportsQuality: false,
                supportsStyle: false,
                maxImages: 1,
                description: 'Google Gemini 3 Pro image generation preview',
              },
            ],
          },
          {
            type: 'stable-diffusion',
            name: 'Stable Diffusion',
            enabled: false,
            available: false,
            models: [],
          },
        ],
      }),
    });
  });

  // GET /api/v1/ai/image/models/:provider - Get models for provider
  mockApi.addHandler('**/api/v1/ai/image/models/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const pathParts = url.pathname.split('/');
    const provider = pathParts[pathParts.length - 1];

    console.log(`Handling AI image models request for provider: ${provider}`);

    interface ImageModelInfo {
      id: string;
      name: string;
      provider: string;
      supportedSizes: string[];
      supportsQuality: boolean;
      supportsStyle: boolean;
      maxImages: number;
      description?: string;
    }

    let models: ImageModelInfo[] = [];

    switch (provider) {
      case 'openai':
        models = [
          {
            id: 'gpt-image-1',
            name: 'GPT Image 1',
            provider: 'openai',
            supportedSizes: ['1024x1024', '1024x1536', '1536x1024', 'auto'],
            supportsQuality: true,
            supportsStyle: false,
            maxImages: 1,
            description: 'Latest GPT image model with best quality',
          },
          {
            id: 'gpt-image-1-mini',
            name: 'GPT Image 1 Mini',
            provider: 'openai',
            supportedSizes: ['1024x1024', '1024x1536', '1536x1024', 'auto'],
            supportsQuality: true,
            supportsStyle: false,
            maxImages: 1,
            description: 'Fast and efficient image generation',
          },
        ];
        break;
      case 'openrouter':
        models = [
          {
            id: 'black-forest-labs/flux-1.1-pro',
            name: 'FLUX 1.1 Pro',
            provider: 'openrouter',
            supportedSizes: ['1024x1024', '1024x1792', '1792x1024'],
            supportsQuality: false,
            supportsStyle: false,
            maxImages: 1,
            description: 'High-quality image generation by Black Forest Labs',
          },
          {
            id: 'black-forest-labs/flux.2-flex',
            name: 'FLUX 2 Flex',
            provider: 'openrouter',
            supportedSizes: ['1024x1024', '1024x1792', '1792x1024'],
            supportsQuality: false,
            supportsStyle: false,
            maxImages: 1,
            description: 'Flexible FLUX model with fast generation',
          },
          {
            id: 'black-forest-labs/flux.2-pro',
            name: 'FLUX 2 Pro',
            provider: 'openrouter',
            supportedSizes: ['1024x1024', '1024x1792', '1792x1024'],
            supportsQuality: false,
            supportsStyle: false,
            maxImages: 1,
            description: 'High end FLUX model with fast generation',
          },
          {
            id: 'black-forest-labs/flux.2-max',
            name: 'FLUX 2 Max',
            provider: 'openrouter',
            supportedSizes: ['1024x1024', '1024x1792', '1792x1024'],
            supportsQuality: false,
            supportsStyle: false,
            maxImages: 1,
            description: 'Top tier FLUX model with fast generation',
          },
          {
            id: 'google/gemini-2.5-flash-image',
            name: 'Gemini 2.5 Flash Image',
            provider: 'openrouter',
            supportedSizes: ['1024x1024'],
            supportsQuality: false,
            supportsStyle: false,
            maxImages: 1,
            description: 'Google Gemini 2.5 Flash with image generation',
          },
          {
            id: 'google/gemini-3-pro-image-preview',
            name: 'Gemini 3 Pro Image (Preview)',
            provider: 'openrouter',
            supportedSizes: ['1024x1024'],
            supportsQuality: false,
            supportsStyle: false,
            maxImages: 1,
            description: 'Google Gemini 3 Pro image generation preview',
          },
        ];
        break;
      default:
        models = [];
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ models }),
    });
  });

  // POST /api/v1/ai/image/generate - Generate image
  mockApi.addHandler('**/api/v1/ai/image/generate', async (route: Route) => {
    const request = route.request();
    const method = request.method();

    if (method !== 'POST') {
      await route.continue();
      return;
    }

    console.log('Handling AI image generation request');

    // Parse request body
    let body: {
      prompt: string;
      provider?: string;
      model?: string;
      n?: number;
      size?: string;
    } = { prompt: '' };

    try {
      const postData = request.postData();
      if (postData) {
        body = JSON.parse(postData) as typeof body;
      }
    } catch (e) {
      console.error('Failed to parse request body:', e);
    }

    const prompt = body.prompt || 'A beautiful image';
    const provider = body.provider || 'openai';
    const model =
      body.model || (provider === 'openai' ? 'dall-e-3' : 'flux-schnell');
    const n = body.n || 1;

    // Generate mock image data (1x1 pixel placeholder PNG in base64)
    // This is a tiny valid PNG that can be displayed
    const mockImageBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    // Generate n images
    const images = [];
    for (let i = 0; i < n; i++) {
      images.push({
        b64Json: mockImageBase64,
        revisedPrompt: `Generated image ${i + 1} for: ${prompt}`,
      });
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        created: Math.floor(Date.now() / 1000),
        data: images,
        provider,
        model,
        request: {
          prompt,
          n,
          size: body.size || '1024x1024',
        },
      }),
    });
  });
}
