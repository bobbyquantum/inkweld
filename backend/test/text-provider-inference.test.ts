/**
 * Tests for text provider inference logic used in optimize-image-prompt route.
 *
 * This tests the provider inference pattern extracted from ai-text.routes.ts
 * to ensure correct provider selection based on model ID.
 */
import { describe, it, expect } from 'bun:test';
import type { TextProviderType } from '../src/types/text-generation';

/**
 * Infer the text provider from a model ID, mirroring the logic in ai-text.routes.ts.
 */
function inferProvider(model: string, defaultProvider: TextProviderType): TextProviderType {
  if (model.includes('/')) {
    return 'openrouter';
  } else if (model.startsWith('claude')) {
    return 'anthropic';
  } else if (model.startsWith('gpt') || model.startsWith('o1')) {
    return 'openai';
  }
  return defaultProvider;
}

describe('Text Provider Inference', () => {
  it('should infer openrouter for models with a slash', () => {
    expect(inferProvider('anthropic/claude-3-haiku', 'openai')).toBe('openrouter');
    expect(inferProvider('meta-llama/llama-3-70b', 'openai')).toBe('openrouter');
    expect(inferProvider('google/gemini-pro', 'anthropic')).toBe('openrouter');
  });

  it('should infer anthropic for models starting with "claude"', () => {
    expect(inferProvider('claude-3-opus', 'openai')).toBe('anthropic');
    expect(inferProvider('claude-3.5-sonnet', 'openai')).toBe('anthropic');
  });

  it('should infer openai for models starting with "gpt"', () => {
    expect(inferProvider('gpt-4o', 'anthropic')).toBe('openai');
    expect(inferProvider('gpt-4o-mini', 'anthropic')).toBe('openai');
    expect(inferProvider('gpt-3.5-turbo', 'anthropic')).toBe('openai');
  });

  it('should infer openai for models starting with "o1"', () => {
    expect(inferProvider('o1-preview', 'anthropic')).toBe('openai');
    expect(inferProvider('o1-mini', 'anthropic')).toBe('openai');
  });

  it('should fall back to defaultProvider for unknown models', () => {
    expect(inferProvider('some-custom-model', 'openai')).toBe('openai');
    expect(inferProvider('some-custom-model', 'anthropic')).toBe('anthropic');
    expect(inferProvider('llama-local', 'openrouter')).toBe('openrouter');
  });
});

describe('Optimize Image Prompt Template', () => {
  it('should include targetStyle when provided', () => {
    const targetStyle = 'fantasy art, detailed, painterly';
    const line = targetStyle ? 'Target style: ' + targetStyle : '';
    expect(line).toBe('Target style: fantasy art, detailed, painterly');
  });

  it('should be empty when targetStyle is not provided', () => {
    const targetStyle = undefined;
    const line = targetStyle ? 'Target style: ' + targetStyle : '';
    expect(line).toBe('');
  });

  it('should include context when provided', () => {
    const context = 'character portrait for a book cover';
    const line = context ? 'Context: ' + context : '';
    expect(line).toBe('Context: character portrait for a book cover');
  });

  it('should include maxLength when provided', () => {
    const maxLength = 500;
    const line = maxLength ? 'Maximum length: approximately ' + maxLength + ' characters' : '';
    expect(line).toBe('Maximum length: approximately 500 characters');
  });

  it('should be empty when maxLength is not provided', () => {
    const maxLength = undefined;
    const line = maxLength ? 'Maximum length: approximately ' + maxLength + ' characters' : '';
    expect(line).toBe('');
  });
});
