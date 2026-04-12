import { describe, it, expect, beforeEach } from 'bun:test';
import { StableDiffusionProvider } from '../src/services/image-providers/stable-diffusion-provider';
import { TEST_API_KEYS } from './test-credentials';

describe('StableDiffusionProvider', () => {
  let provider: StableDiffusionProvider;

  beforeEach(() => {
    provider = new StableDiffusionProvider();
  });

  describe('constructor and type', () => {
    it('should have correct type', () => {
      expect(provider.type).toBe('stable-diffusion');
    });

    it('should have correct name', () => {
      expect(provider.name).toBe('Stable Diffusion');
    });
  });

  describe('isAvailable', () => {
    it('should return false when not configured', () => {
      expect(provider.isAvailable()).toBe(false);
    });

    it('should return true when configured with endpoint and enabled', () => {
      provider.configure({ endpoint: 'http://localhost:7860', enabled: true });
      expect(provider.isAvailable()).toBe(true);
    });

    it('should return true without API key (key is optional for SD)', () => {
      provider.configure({ endpoint: 'http://localhost:7860', enabled: true });
      expect(provider.isAvailable()).toBe(true);
    });

    it('should return false when enabled but no endpoint', () => {
      provider.configure({ enabled: true });
      expect(provider.isAvailable()).toBe(false);
    });

    it('should return false when endpoint set but not enabled', () => {
      provider.configure({ endpoint: 'http://localhost:7860', enabled: false });
      expect(provider.isAvailable()).toBe(false);
    });
  });

  describe('configure', () => {
    it('should configure with endpoint and enabled', () => {
      provider.configure({ endpoint: 'http://localhost:7860', enabled: true });
      expect(provider.isAvailable()).toBe(true);
    });

    it('should configure with optional API key', () => {
      provider.configure({
        apiKey: TEST_API_KEYS.GENERIC,
        endpoint: 'http://localhost:7860',
        enabled: true,
      });
      expect(provider.isAvailable()).toBe(true);
    });
  });

  describe('getModels', () => {
    it('should return default models when not configured', () => {
      const models = provider.getModels();
      expect(models.length).toBeGreaterThan(0);
      expect(models[0].id).toBe('sd-default');
      expect(models[0].name).toBe('Default Model');
      expect(models[0].provider).toBe('stable-diffusion');
    });
  });

  describe('generate', () => {
    it('should throw error when not configured', async () => {
      await expect(
        provider.generate({
          prompt: 'test',
          profileId: 'p1',
          provider: 'stable-diffusion',
          model: 'sd-default',
        })
      ).rejects.toThrow('not available');
    });
  });

  describe('fetchModels', () => {
    it('should return defaults when not available', async () => {
      const models = await provider.fetchModels();
      expect(models.length).toBeGreaterThan(0);
      expect(models[0].id).toBe('sd-default');
    });
  });

  describe('getStatus', () => {
    it('should return unavailable status when not configured', () => {
      const status = provider.getStatus();
      expect(status.type).toBe('stable-diffusion');
      expect(status.name).toBe('Stable Diffusion');
      expect(status.available).toBe(false);
      expect(status.enabled).toBe(false);
    });

    it('should return available status when configured', () => {
      provider.configure({ endpoint: 'http://localhost:7860', enabled: true });
      const status = provider.getStatus();
      expect(status.available).toBe(true);
      expect(status.enabled).toBe(true);
      expect(status.error).toBeUndefined();
    });

    it('should include error when enabled but no endpoint', () => {
      provider.configure({ enabled: true });
      const status = provider.getStatus();
      expect(status.available).toBe(false);
      expect(status.enabled).toBe(true);
      expect(status.error).toBeDefined();
      expect(status.error).toContain('Endpoint');
    });
  });

  describe('default model properties', () => {
    it('should have models with expected properties', () => {
      for (const model of provider.getModels()) {
        expect(model).toHaveProperty('id');
        expect(model).toHaveProperty('name');
        expect(model).toHaveProperty('provider');
        expect(model.provider).toBe('stable-diffusion');
        expect(model).toHaveProperty('supportedSizes');
        expect(model.supportedSizes.length).toBeGreaterThan(0);
      }
    });

    it('default model should not support quality or style', () => {
      const model = provider.getModels()[0];
      expect(model.supportsQuality).toBe(false);
      expect(model.supportsStyle).toBe(false);
    });

    it('default model should limit to 4 images', () => {
      expect(provider.getModels()[0].maxImages).toBe(4);
    });
  });
});
