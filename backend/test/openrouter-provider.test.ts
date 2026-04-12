import { describe, it, expect, beforeEach } from 'bun:test';
import { OpenRouterImageProvider } from '../src/services/image-providers/openrouter-provider';
import { TEST_API_KEYS } from './test-credentials';

describe('OpenRouterImageProvider', () => {
  let provider: OpenRouterImageProvider;

  beforeEach(() => {
    provider = new OpenRouterImageProvider();
  });

  describe('constructor and type', () => {
    it('should have correct type', () => {
      expect(provider.type).toBe('openrouter');
    });

    it('should have correct name', () => {
      expect(provider.name).toBe('OpenRouter');
    });
  });

  describe('isAvailable', () => {
    it('should return false when not configured', () => {
      expect(provider.isAvailable()).toBe(false);
    });

    it('should return true when configured with API key and enabled', () => {
      provider.configure({ apiKey: TEST_API_KEYS.GENERIC, enabled: true });
      expect(provider.isAvailable()).toBe(true);
    });

    it('should return false when API key set but not enabled', () => {
      provider.configure({ apiKey: TEST_API_KEYS.GENERIC, enabled: false });
      expect(provider.isAvailable()).toBe(false);
    });

    it('should return false when enabled but no API key', () => {
      provider.configure({ enabled: true });
      expect(provider.isAvailable()).toBe(false);
    });
  });

  describe('configure', () => {
    it('should configure with API key and enabled', () => {
      provider.configure({ apiKey: TEST_API_KEYS.GENERIC, enabled: true });
      expect(provider.isAvailable()).toBe(true);
    });

    it('should configure with custom models', () => {
      const customModels = [{ id: 'openrouter/flux', name: 'FLUX' }];
      provider.configure({
        apiKey: TEST_API_KEYS.GENERIC,
        enabled: true,
        models: customModels,
      });
      const models = provider.getModels();
      expect(models.length).toBe(1);
      expect(models[0].id).toBe('openrouter/flux');
    });

    it('should keep empty models when configuring without models', () => {
      provider.configure({ apiKey: TEST_API_KEYS.GENERIC, enabled: true });
      // OpenRouter starts with no default models
      expect(provider.getModels()).toEqual([]);
    });
  });

  describe('getModels', () => {
    it('should return empty array by default (no built-in defaults)', () => {
      expect(provider.getModels()).toEqual([]);
    });
  });

  describe('setModels', () => {
    it('should update models list', () => {
      const newModels = [
        { id: 'flux/schnell', name: 'FLUX Schnell' },
        { id: 'gemini/vision', name: 'Gemini Vision' },
      ];
      provider.setModels(newModels);
      expect(provider.getModels().length).toBe(2);
    });

    it('should set provider field to openrouter', () => {
      provider.setModels([{ id: 'test', name: 'Test' }]);
      expect(provider.getModels()[0].provider).toBe('openrouter');
    });

    it('should keep existing models when setting empty array', () => {
      provider.setModels([{ id: 'model', name: 'M' }]);
      provider.setModels([]); // Should not clear
      expect(provider.getModels().length).toBe(1);
    });
  });

  describe('generate', () => {
    it('should throw error when not configured', async () => {
      await expect(
        provider.generate({
          prompt: 'test',
          profileId: 'p1',
          provider: 'openrouter',
          model: 'test-model',
        })
      ).rejects.toThrow('not available');
    });
  });

  describe('getStatus', () => {
    it('should return unavailable status when not configured', () => {
      const status = provider.getStatus();
      expect(status.type).toBe('openrouter');
      expect(status.name).toBe('OpenRouter');
      expect(status.available).toBe(false);
      expect(status.enabled).toBe(false);
    });

    it('should return available status when configured', () => {
      provider.configure({ apiKey: TEST_API_KEYS.GENERIC, enabled: true });
      const status = provider.getStatus();
      expect(status.available).toBe(true);
      expect(status.enabled).toBe(true);
      expect(status.error).toBeUndefined();
    });

    it('should include error when enabled but unavailable', () => {
      provider.configure({ enabled: true }); // No API key
      const status = provider.getStatus();
      expect(status.available).toBe(false);
      expect(status.enabled).toBe(true);
      expect(status.error).toBeDefined();
    });
  });
});
