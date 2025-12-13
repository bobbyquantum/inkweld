import { describe, it, expect, beforeEach } from 'bun:test';
import { FalAiImageProvider } from '../src/services/image-providers/falai-provider.js';

describe('FalAiImageProvider', () => {
  let provider: FalAiImageProvider;

  beforeEach(() => {
    provider = new FalAiImageProvider();
  });

  describe('constructor and type', () => {
    it('should have correct type', () => {
      expect(provider.type).toBe('falai');
    });

    it('should have correct name', () => {
      expect(provider.name).toBe('Fal.ai');
    });
  });

  describe('isAvailable', () => {
    it('should return false when not configured', () => {
      expect(provider.isAvailable()).toBe(false);
    });

    it('should return true when configured with API key and enabled', () => {
      provider.configure({ apiKey: 'test-key', enabled: true });
      expect(provider.isAvailable()).toBe(true);
    });

    it('should return false when API key set but not enabled', () => {
      provider.configure({ apiKey: 'test-key', enabled: false });
      expect(provider.isAvailable()).toBe(false);
    });
  });

  describe('configure', () => {
    it('should configure with API key and enabled', () => {
      provider.configure({ apiKey: 'test-api-key', enabled: true });
      expect(provider.isAvailable()).toBe(true);
    });

    it('should configure with custom models', () => {
      const customModels = [{ id: 'custom/model', name: 'Custom Model' }];
      provider.configure({
        apiKey: 'test-key',
        enabled: true,
        models: customModels,
      });
      const models = provider.getModels();
      expect(models.length).toBe(1);
      expect(models[0].id).toBe('custom/model');
    });
  });

  describe('getModels', () => {
    it('should return default models when not configured', () => {
      const models = provider.getModels();
      expect(models.length).toBeGreaterThan(0);
      // Check that default models include FLUX 2 Pro and Nano Banana Pro
      const modelIds = models.map((m) => m.id);
      expect(modelIds).toContain('fal-ai/flux-2-pro');
      expect(modelIds).toContain('fal-ai/nano-banana-pro');
    });

    it('should return custom models after setModels', () => {
      const customModels = [
        { id: 'test/model-1', name: 'Test Model 1' },
        { id: 'test/model-2', name: 'Test Model 2' },
      ];
      provider.setModels(customModels);
      const models = provider.getModels();
      expect(models.length).toBe(2);
      expect(models[0].id).toBe('test/model-1');
      expect(models[1].id).toBe('test/model-2');
    });
  });

  describe('setModels', () => {
    it('should update models list', () => {
      const newModels = [{ id: 'new/model', name: 'New Model' }];
      provider.setModels(newModels);
      expect(provider.getModels().length).toBe(1);
      expect(provider.getModels()[0].id).toBe('new/model');
    });

    it('should keep default models when setting empty array', () => {
      const originalCount = provider.getModels().length;
      provider.setModels([]);
      // Empty array should not change models (keeps defaults)
      expect(provider.getModels().length).toBe(originalCount);
    });
  });

  describe('generate', () => {
    it('should throw error when not configured', async () => {
      await expect(provider.generate({ prompt: 'test' })).rejects.toThrow(
        'Fal.ai image generation is not available'
      );
    });
  });

  describe('default model properties', () => {
    it('should have models with expected properties', () => {
      const models = provider.getModels();
      for (const model of models) {
        expect(model).toHaveProperty('id');
        expect(model).toHaveProperty('name');
        expect(typeof model.id).toBe('string');
        expect(typeof model.name).toBe('string');
      }
    });

    it('should have FLUX 2 Pro as the first default model', () => {
      const models = provider.getModels();
      expect(models[0].id).toBe('fal-ai/flux-2-pro');
      expect(models[0].name).toBe('FLUX 2 Pro');
    });

    it('should have Nano Banana Pro as the second default model', () => {
      const models = provider.getModels();
      expect(models[1].id).toBe('fal-ai/nano-banana-pro');
      expect(models[1].name).toBe('Nano Banana Pro');
    });

    it('FLUX 2 Pro should use dimensions mode with HD and ebook cover sizes', () => {
      const models = provider.getModels();
      const flux = models.find((m) => m.id === 'fal-ai/flux-2-pro');
      expect(flux).toBeDefined();
      expect(flux!.sizeMode).toBe('dimensions');
      const sizes = flux!.supportedSizes || [];
      expect(sizes).toContain('1920x1080'); // HD 1080p landscape
      expect(sizes).toContain('1080x1920'); // HD 1080p portrait
      expect(sizes).toContain('1600x2560'); // Ebook cover
    });

    it('Nano Banana Pro should use aspect_ratio mode', () => {
      const models = provider.getModels();
      const nano = models.find((m) => m.id === 'fal-ai/nano-banana-pro');
      expect(nano).toBeDefined();
      expect(nano!.sizeMode).toBe('aspect_ratio');
      expect(nano!.resolutions).toContain('1K');
      expect(nano!.resolutions).toContain('2K');
      expect(nano!.resolutions).toContain('4K');
      expect(nano!.aspectRatios).toContain('16:9');
      expect(nano!.aspectRatios).toContain('9:16');
      // Size format should be ratio@resolution
      const sizes = nano!.supportedSizes || [];
      expect(sizes).toContain('16:9@4K');
      expect(sizes).toContain('9:16@4K');
    });
  });
});
