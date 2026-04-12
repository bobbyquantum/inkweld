import { describe, it, expect, beforeEach } from 'bun:test';
import { WorkersAIImageProvider } from '../src/services/image-providers/workersai-provider';
import { TEST_API_KEYS } from './test-credentials';

describe('WorkersAIImageProvider', () => {
  let provider: WorkersAIImageProvider;

  beforeEach(() => {
    provider = new WorkersAIImageProvider();
  });

  describe('constructor and type', () => {
    it('should have correct type', () => {
      expect(provider.type).toBe('workersai');
    });

    it('should have correct name', () => {
      expect(provider.name).toBe('Cloudflare Workers AI');
    });
  });

  describe('isAvailable', () => {
    it('should return false when not configured', () => {
      expect(provider.isAvailable()).toBe(false);
    });

    it('should return true with REST API credentials (apiKey + accountId + enabled)', () => {
      provider.configure({
        apiKey: TEST_API_KEYS.GENERIC,
        accountId: 'test-account-id',
        enabled: true,
      });
      expect(provider.isAvailable()).toBe(true);
    });

    it('should return false when missing accountId', () => {
      provider.configure({ apiKey: TEST_API_KEYS.GENERIC, enabled: true });
      expect(provider.isAvailable()).toBe(false);
    });

    it('should return false when missing apiKey', () => {
      provider.configure({ accountId: 'test-account-id', enabled: true });
      expect(provider.isAvailable()).toBe(false);
    });

    it('should return false when not enabled', () => {
      provider.configure({
        apiKey: TEST_API_KEYS.GENERIC,
        accountId: 'test-account-id',
        enabled: false,
      });
      expect(provider.isAvailable()).toBe(false);
    });

    it('should return true with AI binding even without REST credentials', () => {
      const mockBinding = { run: async () => ({}) };
      provider.setAiBinding(mockBinding);
      expect(provider.isAvailable()).toBe(true);
    });

    it('should also accept AI binding via configure', () => {
      const mockBinding = { run: async () => ({}) };
      provider.configure({ aiBinding: mockBinding });
      expect(provider.isAvailable()).toBe(true);
    });
  });

  describe('configure', () => {
    it('should configure with REST API credentials', () => {
      provider.configure({
        apiKey: TEST_API_KEYS.GENERIC,
        accountId: 'acct-123',
        enabled: true,
      });
      expect(provider.isAvailable()).toBe(true);
    });

    it('should configure with custom models', () => {
      const customModels = [{ id: '@cf/flux-schnell', name: 'FLUX Schnell' }];
      provider.configure({
        apiKey: TEST_API_KEYS.GENERIC,
        accountId: 'acct-123',
        enabled: true,
        models: customModels,
      });
      const models = provider.getModels();
      expect(models.length).toBe(1);
      expect(models[0].id).toBe('@cf/flux-schnell');
    });

    it('should keep empty models when configuring without models', () => {
      provider.configure({
        apiKey: TEST_API_KEYS.GENERIC,
        accountId: 'acct-123',
        enabled: true,
      });
      // Workers AI starts with no default models
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
        { id: '@cf/model-a', name: 'Model A' },
        { id: '@cf/model-b', name: 'Model B' },
      ];
      provider.setModels(newModels);
      expect(provider.getModels().length).toBe(2);
    });

    it('should set provider field to workersai', () => {
      provider.setModels([{ id: 'test', name: 'Test' }]);
      expect(provider.getModels()[0].provider).toBe('workersai');
    });

    it('should keep existing models when setting empty array', () => {
      provider.setModels([{ id: 'x', name: 'X' }]);
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
          provider: 'workersai',
          model: '@cf/test-model',
        })
      ).rejects.toThrow('not available');
    });
  });

  describe('getStatus', () => {
    it('should return unavailable status when not configured', () => {
      const status = provider.getStatus();
      expect(status.type).toBe('workersai');
      expect(status.name).toBe('Cloudflare Workers AI');
      expect(status.available).toBe(false);
      expect(status.enabled).toBe(false);
    });

    it('should return available status with REST API credentials', () => {
      provider.configure({
        apiKey: TEST_API_KEYS.GENERIC,
        accountId: 'acct-123',
        enabled: true,
      });
      const status = provider.getStatus();
      expect(status.available).toBe(true);
      expect(status.enabled).toBe(true);
      expect(status.error).toBeUndefined();
    });

    it('should return available status with AI binding', () => {
      provider.setAiBinding({ run: async () => ({}) });
      const status = provider.getStatus();
      expect(status.available).toBe(true);
    });

    it('should include error when enabled but credentials missing', () => {
      provider.configure({ enabled: true });
      const status = provider.getStatus();
      expect(status.available).toBe(false);
      expect(status.enabled).toBe(true);
      expect(status.error).toBeDefined();
      expect(status.error).toContain('API token');
    });
  });

  describe('constructor with config', () => {
    it('should accept accountId in constructor', () => {
      provider = new WorkersAIImageProvider({
        apiKey: TEST_API_KEYS.GENERIC,
        accountId: 'acct-from-ctor',
        enabled: true,
      });
      expect(provider.isAvailable()).toBe(true);
    });
  });
});
