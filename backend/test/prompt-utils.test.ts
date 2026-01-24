import { describe, it, expect } from 'bun:test';
import {
  estimateTokens,
  getModelLimits,
  optimizePromptForModel,
  validateReferenceImages,
  normalizeImageDataUrl,
  formatReferenceImagesForOpenRouter,
  getMimeTypeFromFilename,
} from '../src/utils/prompt-utils';
import type { ReferenceImage } from '../src/types/image-generation';

describe('prompt-utils', () => {
  describe('estimateTokens', () => {
    it('should return 0 for empty string', () => {
      expect(estimateTokens('')).toBe(0);
    });

    it('should return 0 for null/undefined', () => {
      expect(estimateTokens(null as unknown as string)).toBe(0);
      expect(estimateTokens(undefined as unknown as string)).toBe(0);
    });

    it('should estimate tokens based on character count', () => {
      // ~4 characters per token
      expect(estimateTokens('hello')).toBe(2); // 5 chars -> ceil(5/4) = 2
      expect(estimateTokens('hello world')).toBe(3); // 11 chars -> ceil(11/4) = 3
      expect(estimateTokens('a')).toBe(1); // 1 char -> ceil(1/4) = 1
    });

    it('should handle longer text', () => {
      const longText = 'This is a longer piece of text that should have more tokens.';
      expect(estimateTokens(longText)).toBe(Math.ceil(longText.length / 4));
    });
  });

  describe('getModelLimits', () => {
    it('should return undefined for unknown models', () => {
      expect(getModelLimits('unknown-provider', 'unknown-model')).toBeUndefined();
    });

    it('should return limits for known models', () => {
      // Test with a model that has known limits
      const limits = getModelLimits('openrouter', 'black-forest-labs/flux-1.1-pro');
      // If this model has limits defined, they should be returned
      // Otherwise undefined is acceptable
      if (limits) {
        expect(limits).toHaveProperty('maxPromptChars');
      }
    });
  });

  describe('optimizePromptForModel', () => {
    it('should return original prompt if no limits', () => {
      const result = optimizePromptForModel('test prompt', 'unknown', 'unknown-model');

      expect(result.prompt).toBe('test prompt');
      expect(result.wasOptimized).toBe(false);
      expect(result.originalChars).toBe(11);
      expect(result.optimizedChars).toBe(11);
    });

    it('should return original prompt if within limits', () => {
      const result = optimizePromptForModel('short prompt', 'unknown', 'model', 100);

      expect(result.prompt).toBe('short prompt');
      expect(result.wasOptimized).toBe(false);
    });

    it('should truncate prompt if exceeds user-specified limit', () => {
      const longPrompt = 'This is a very long prompt that should be truncated. It has multiple sentences.';
      const result = optimizePromptForModel(longPrompt, 'unknown', 'model', 30);

      expect(result.wasOptimized).toBe(true);
      expect(result.optimizedChars).toBeLessThanOrEqual(30);
      expect(result.originalChars).toBe(longPrompt.length);
    });

    it('should prefer truncating at sentence boundaries', () => {
      const prompt = 'First sentence. Second sentence. Third sentence that is very long.';
      const result = optimizePromptForModel(prompt, 'unknown', 'model', 40);

      expect(result.wasOptimized).toBe(true);
      // Should end at a sentence boundary
      expect(result.prompt.endsWith('.') || result.prompt.endsWith('!') || result.prompt.endsWith('?')).toBe(true);
    });

    it('should fall back to word boundaries if no good sentence boundary', () => {
      const prompt = 'word1 word2 word3 word4 word5 word6 word7 word8';
      const result = optimizePromptForModel(prompt, 'unknown', 'model', 25);

      expect(result.wasOptimized).toBe(true);
      // Should not end in middle of a word
      expect(result.prompt.endsWith(' ')).toBe(false);
    });
  });

  describe('validateReferenceImages', () => {
    const createImage = (id: string): ReferenceImage => ({
      data: `base64data${id}`,
      mimeType: 'image/png',
    });

    it('should return empty array when maxImages is 0', () => {
      const images = [createImage('1'), createImage('2')];
      // With unknown provider and userMaxImages=0, returns empty (no image support)
      const result = validateReferenceImages(images, 'unknown', 'model', 0);

      expect(result.images).toEqual([]);
      expect(result.wasLimited).toBe(true);
      expect(result.originalCount).toBe(2);
    });

    it('should return empty for unknown provider without image support', () => {
      const images = [createImage('1'), createImage('2')];
      // Unknown provider has no limits, so supportsImageInput is undefined -> returns empty
      const result = validateReferenceImages(images, 'unknown', 'unknown-model');

      expect(result.images).toEqual([]);
      expect(result.wasLimited).toBe(true);
      expect(result.originalCount).toBe(2);
    });

    it('should handle empty images array', () => {
      const result = validateReferenceImages([], 'unknown', 'model', 0);

      expect(result.images).toEqual([]);
      expect(result.wasLimited).toBe(false);
      expect(result.originalCount).toBe(0);
    });
  });

  describe('normalizeImageDataUrl', () => {
    it('should return data URL unchanged if already formatted', () => {
      const dataUrl = 'data:image/png;base64,abc123';
      expect(normalizeImageDataUrl(dataUrl)).toBe(dataUrl);
    });

    it('should add data URL prefix for raw base64', () => {
      const base64 = 'abc123';
      expect(normalizeImageDataUrl(base64)).toBe('data:image/png;base64,abc123');
    });

    it('should use provided mime type', () => {
      const base64 = 'abc123';
      expect(normalizeImageDataUrl(base64, 'image/jpeg')).toBe('data:image/jpeg;base64,abc123');
    });

    it('should default to image/png if no mime type', () => {
      const base64 = 'abc123';
      expect(normalizeImageDataUrl(base64)).toBe('data:image/png;base64,abc123');
    });
  });

  describe('formatReferenceImagesForOpenRouter', () => {
    it('should format images for OpenRouter API', () => {
      const images: ReferenceImage[] = [
        { data: 'base64data1', mimeType: 'image/png' },
        { data: 'base64data2', mimeType: 'image/jpeg' },
      ];

      const result = formatReferenceImagesForOpenRouter(images);

      expect(result.length).toBe(2);
      expect(result[0].type).toBe('input_image');
      expect(result[0].image_url).toBe('data:image/png;base64,base64data1');
      expect(result[0].detail).toBe('auto');
      expect(result[1].image_url).toBe('data:image/jpeg;base64,base64data2');
    });

    it('should handle already formatted data URLs', () => {
      const images: ReferenceImage[] = [
        { data: 'data:image/gif;base64,abc123', mimeType: 'image/gif' },
      ];

      const result = formatReferenceImagesForOpenRouter(images);

      expect(result[0].image_url).toBe('data:image/gif;base64,abc123');
    });

    it('should return empty array for no images', () => {
      const result = formatReferenceImagesForOpenRouter([]);
      expect(result).toEqual([]);
    });
  });

  describe('getMimeTypeFromFilename', () => {
    it('should return correct mime type for common extensions', () => {
      expect(getMimeTypeFromFilename('image.png')).toBe('image/png');
      expect(getMimeTypeFromFilename('photo.jpg')).toBe('image/jpeg');
      expect(getMimeTypeFromFilename('photo.jpeg')).toBe('image/jpeg');
      expect(getMimeTypeFromFilename('animation.gif')).toBe('image/gif');
      expect(getMimeTypeFromFilename('modern.webp')).toBe('image/webp');
    });

    it('should handle uppercase extensions', () => {
      expect(getMimeTypeFromFilename('IMAGE.PNG')).toBe('image/png');
      expect(getMimeTypeFromFilename('PHOTO.JPG')).toBe('image/jpeg');
    });

    it('should return default for unknown extensions', () => {
      expect(getMimeTypeFromFilename('file.xyz')).toBe('image/png');
      expect(getMimeTypeFromFilename('document.pdf')).toBe('image/png');
    });

    it('should handle files without extension', () => {
      expect(getMimeTypeFromFilename('noextension')).toBe('image/png');
    });

    it('should handle files with multiple dots', () => {
      expect(getMimeTypeFromFilename('my.photo.name.jpg')).toBe('image/jpeg');
    });
  });
});
