/**
 * Prompt utilities for image generation.
 * Includes token estimation and prompt optimization for model limits.
 */

import type { ModelLimits, ReferenceImage } from '../types/image-generation';
import { findModelLimits } from '../types/image-generation';

/**
 * Estimate the number of tokens in a text string.
 * Uses a simple heuristic: ~4 characters per token on average.
 * This is a rough estimate - actual tokenization varies by model.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // Average of ~4 characters per token (GPT-style tokenization)
  // This is conservative - actual may be fewer tokens
  return Math.ceil(text.length / 4);
}

/**
 * Get known limits for a specific model.
 * @param provider Provider type (e.g., 'openrouter')
 * @param modelId Model ID (e.g., 'black-forest-labs/flux.2-klein-4b')
 */
export function getModelLimits(provider: string, modelId: string): ModelLimits | undefined {
  return findModelLimits(modelId, provider);
}

/**
 * Validate and potentially truncate a prompt to fit model limits.
 * Returns the original prompt if within limits, or a truncated version.
 */
export function optimizePromptForModel(
  prompt: string,
  provider: string,
  modelId: string,
  userMaxChars?: number
): { prompt: string; wasOptimized: boolean; originalChars: number; optimizedChars: number } {
  const limits = getModelLimits(provider, modelId);
  const maxChars = userMaxChars ?? limits?.maxPromptChars;

  const originalChars = prompt.length;

  if (!maxChars || originalChars <= maxChars) {
    return {
      prompt,
      wasOptimized: false,
      originalChars,
      optimizedChars: originalChars,
    };
  }

  // Need to truncate - hard limit at maxChars
  let truncated = prompt.substring(0, maxChars);

  // Try to truncate intelligently at a sentence or word boundary
  // Find last sentence boundary
  const lastSentence = Math.max(
    truncated.lastIndexOf('. '),
    truncated.lastIndexOf('! '),
    truncated.lastIndexOf('? ')
  );

  if (lastSentence > maxChars * 0.7) {
    // Found a good sentence boundary
    truncated = truncated.substring(0, lastSentence + 1);
  } else {
    // Fall back to word boundary
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxChars * 0.8) {
      truncated = truncated.substring(0, lastSpace);
    }
  }

  return {
    prompt: truncated.trim(),
    wasOptimized: true,
    originalChars,
    optimizedChars: truncated.trim().length,
  };
}

/**
 * Validate reference images against model limits.
 * Returns filtered images that fit within the model's constraints.
 */
export function validateReferenceImages(
  images: ReferenceImage[],
  provider: string,
  modelId: string,
  userMaxImages?: number
): { images: ReferenceImage[]; wasLimited: boolean; originalCount: number } {
  const limits = getModelLimits(provider, modelId);
  const maxImages = userMaxImages ?? limits?.maxInputImages ?? 0;

  if (!limits?.supportsImageInput || maxImages === 0) {
    return {
      images: [],
      wasLimited: images.length > 0,
      originalCount: images.length,
    };
  }

  if (images.length <= maxImages) {
    return {
      images,
      wasLimited: false,
      originalCount: images.length,
    };
  }

  return {
    images: images.slice(0, maxImages),
    wasLimited: true,
    originalCount: images.length,
  };
}

/**
 * Convert a base64 image (with or without data URL prefix) to proper data URL format.
 */
export function normalizeImageDataUrl(data: string, mimeType?: string): string {
  if (data.startsWith('data:')) {
    return data;
  }
  const mime = mimeType || 'image/png';
  return `data:${mime};base64,${data}`;
}

/**
 * Format reference images for OpenRouter's input format.
 * Returns content array items for the message.
 */
export function formatReferenceImagesForOpenRouter(
  images: ReferenceImage[]
): Array<{ type: 'input_image'; image_url: string; detail?: string }> {
  return images.map((img) => ({
    type: 'input_image' as const,
    image_url: normalizeImageDataUrl(img.data, img.mimeType),
    detail: 'auto' as const,
  }));
}

/**
 * Extract MIME type from filename extension
 */
export function getMimeTypeFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const mimeTypes: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
  };
  return mimeTypes[ext] || 'image/png';
}
