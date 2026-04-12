import { describe, it, expect, beforeEach } from 'bun:test';
import {
  OpenAIImageProvider,
  DEFAULT_OPENAI_MODELS,
} from '../src/services/image-providers/openai-provider';
import { TEST_API_KEYS } from './test-credentials';

describe('OpenAIImageProvider', () => {
  let provider: OpenAIImageProvider;

  beforeEach(() => {
    provider = new OpenAIImageProvider();
  });

  describe('constructor and type', () => {
    it('should have correct type', () => {
      expect(provider.type).toBe('openai');
    });

    it('should have correct name', () => {
      expect(provider.name).toBe('OpenAI');
    });
  });

  describe('isAvailable', () => {
    it('should return false when not configured', () => {
      expect(provider.isAvailable()).toBe(false);
    });

    it('should return true when configured with API key and enabled', () => {
      provider = new OpenAIImageProvider({ apiKey: TEST_API_KEYS.OPENAI, enabled: true });
      expect(provider.isAvailable()).toBe(true);
    });

    it('should return false when API key set but not enabled', () => {
      provider = new OpenAIImageProvider({ apiKey: TEST_API_KEYS.OPENAI, enabled: false });
      expect(provider.isAvailable()).toBe(false);
    });

    it('should return false when enabled but no API key', () => {
      provider.configure({ enabled: true });
      expect(provider.isAvailable()).toBe(false);
    });
  });

  describe('configure', () => {
    it('should configure with API key and enabled', () => {
      provider.configure({ apiKey: TEST_API_KEYS.OPENAI, enabled: true });
      expect(provider.isAvailable()).toBe(true);
    });

    it('should configure with custom models', () => {
      const customModels = [
        {
          id: 'custom-model',
          name: 'Custom Model',
          provider: 'openai' as const,
          supportedSizes: ['1024x1024' as const],
          supportsQuality: true,
          supportsStyle: false,
          maxImages: 1,
        },
      ];
      provider.configure({ apiKey: TEST_API_KEYS.OPENAI, enabled: true, models: customModels });
      const models = provider.getModels();
      expect(models.length).toBe(1);
      expect(models[0].id).toBe('custom-model');
    });

    it('should keep default models when configuring without models', () => {
      provider.configure({ apiKey: TEST_API_KEYS.OPENAI, enabled: true });
      expect(provider.getModels()).toEqual(DEFAULT_OPENAI_MODELS);
    });

    it('should reinitialise OpenAI client when API key changes', () => {
      provider.configure({ apiKey: TEST_API_KEYS.OPENAI, enabled: true });
      expect(provider.isAvailable()).toBe(true);
      // Clear key → client should be nulled
      provider.configure({ apiKey: '' });
      expect(provider.isAvailable()).toBe(false);
    });
  });

  describe('getModels', () => {
    it('should return default models when not configured', () => {
      const models = provider.getModels();
      expect(models).toEqual(DEFAULT_OPENAI_MODELS);
    });

    it('should include gpt-image-1 in default models', () => {
      const ids = provider.getModels().map((m) => m.id);
      expect(ids).toContain('gpt-image-1');
    });

    it('should include gpt-image-1-mini in default models', () => {
      const ids = provider.getModels().map((m) => m.id);
      expect(ids).toContain('gpt-image-1-mini');
    });

    it('should include gpt-image-1.5 in default models', () => {
      const ids = provider.getModels().map((m) => m.id);
      expect(ids).toContain('gpt-image-1.5');
    });
  });

  describe('setModels', () => {
    it('should update models list', () => {
      const newModels = [{ id: 'new/model', name: 'New Model' }];
      provider.setModels(newModels);
      expect(provider.getModels().length).toBe(1);
      expect(provider.getModels()[0].id).toBe('new/model');
    });

    it('should set provider field to openai', () => {
      provider.setModels([{ id: 'test', name: 'Test' }]);
      expect(provider.getModels()[0].provider).toBe('openai');
    });

    it('should keep existing models when setting empty array', () => {
      const originalCount = provider.getModels().length;
      provider.setModels([]);
      expect(provider.getModels().length).toBe(originalCount);
    });
  });

  describe('generate', () => {
    it('should throw error when not configured', async () => {
      await expect(
        provider.generate({
          prompt: 'test',
          profileId: 'p1',
          provider: 'openai',
          model: 'gpt-image-1',
        })
      ).rejects.toThrow('not available');
    });
  });

  describe('generateStream', () => {
    it('should yield error event when not configured', async () => {
      const events: unknown[] = [];
      for await (const event of provider.generateStream({
        prompt: 'test',
        profileId: 'p1',
        provider: 'openai',
        model: 'gpt-image-1',
      })) {
        events.push(event);
      }
      expect(events.length).toBe(1);
      expect((events[0] as { type: string }).type).toBe('error');
    });
  });

  describe('getStatus', () => {
    it('should return unavailable status when not configured', () => {
      const status = provider.getStatus();
      expect(status.type).toBe('openai');
      expect(status.name).toBe('OpenAI');
      expect(status.available).toBe(false);
      expect(status.enabled).toBe(false);
    });

    it('should return available status when configured', () => {
      provider.configure({ apiKey: TEST_API_KEYS.OPENAI, enabled: true });
      const status = provider.getStatus();
      expect(status.available).toBe(true);
      expect(status.enabled).toBe(true);
      expect(status.models).toEqual(DEFAULT_OPENAI_MODELS);
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

  describe('default model properties', () => {
    it('should have models with expected properties', () => {
      for (const model of provider.getModels()) {
        expect(model).toHaveProperty('id');
        expect(model).toHaveProperty('name');
        expect(model).toHaveProperty('provider');
        expect(model.provider).toBe('openai');
        expect(model).toHaveProperty('supportedSizes');
        expect(model.supportedSizes.length).toBeGreaterThan(0);
      }
    });

    it('all default models should support auto size', () => {
      for (const model of DEFAULT_OPENAI_MODELS) {
        expect(model.supportedSizes).toContain('auto');
      }
    });

    it('all default models should support quality', () => {
      for (const model of DEFAULT_OPENAI_MODELS) {
        expect(model.supportsQuality).toBe(true);
      }
    });

    it('no default models should support style', () => {
      for (const model of DEFAULT_OPENAI_MODELS) {
        expect(model.supportsStyle).toBe(false);
      }
    });
  });
});
