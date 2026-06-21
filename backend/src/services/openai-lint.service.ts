import { createHash } from 'crypto';
import { configService } from './config.service';
import { logger } from './logger.service';
import type { DatabaseInstance } from '../types/context';
import type { ConfigKey } from '../db/schema/config';

const lintLog = logger.child('OpenAI-Lint');

interface CacheEntry<T> {
  value: T;
  expiry: number;
}

interface CorrectionDto {
  start_pos: number;
  end_pos: number;
  original_text: string;
  corrected_text: string;
  error_type: string;
  recommendation: string;
}

interface StyleRecommendationDto {
  suggestion: string;
  reason: string;
}

interface LintResponseDto {
  original_paragraph: string;
  corrections: CorrectionDto[];
  style_recommendations: StyleRecommendationDto[];
  source: 'openai' | 'languagetool';
}

interface LintConfig {
  apiKey: string;
  endpoint: string;
  model: string;
  customPrompt: string;
}

const DEFAULT_MODEL = 'gpt-4o-mini';
const CACHE_TTL = 300000; // 5 minutes

export class OpenAILintService {
  private readonly cache = new Map<string, CacheEntry<LintResponseDto>>();

  /**
   * Read the lint configuration (API key, endpoint, model, custom prompt)
   * from the database, falling back to env vars for legacy setups.
   */
  private async getConfig(db: DatabaseInstance): Promise<LintConfig> {
    const [keyCfg, endpointCfg, modelCfg, promptCfg] = await Promise.all([
      configService.get(db, 'AI_OPENAI_API_KEY' as ConfigKey),
      configService.get(db, 'AI_OPENAI_ENDPOINT' as ConfigKey),
      configService.get(db, 'AI_TEXT_LINT_MODEL' as ConfigKey),
      configService.get(db, 'AI_TEXT_LINT_PROMPT' as ConfigKey),
    ]);

    return {
      apiKey: keyCfg.value || process.env.OPENAI_API_KEY || '',
      endpoint: endpointCfg.value || process.env.OPENAI_API_BASE || '',
      model: modelCfg.value || process.env.AI_TEXT_LINT_MODEL || DEFAULT_MODEL,
      customPrompt: promptCfg.value || '',
    };
  }

  /**
   * Whether linting is available (an OpenAI-compatible API key is configured).
   */
  public async isAiEnabled(db: DatabaseInstance): Promise<boolean> {
    const cfg = await this.getConfig(db);
    return cfg.apiKey.trim().length > 0;
  }

  private generateCacheKey(paragraph: string, style: string, level: string): string {
    return createHash('sha256').update(`${paragraph}|${style}|${level}`).digest('hex');
  }

  private cacheSet(key: string, value: LintResponseDto): void {
    this.cache.set(key, {
      value,
      expiry: Date.now() + CACHE_TTL,
    });
    this.cleanCache();
  }

  private cacheGet(key: string): LintResponseDto | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  private cleanCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        this.cache.delete(key);
      }
    }
  }

  private createSystemMessage(style: string, level: string, customPrompt: string): string {
    if (customPrompt) {
      return `${customPrompt}\n\nApply a ${level} level of scrutiny. Return ONLY JSON with this format:\n{\n  "original_paragraph": "the original text",\n  "corrections": [\n    {\n      "start_pos": 0,\n      "end_pos": 4,\n      "original_text": "text with error",\n      "corrected_text": "corrected text",\n      "error_type": "grammar",\n      "recommendation": "explanation of the correction"\n    }\n  ],\n  "style_recommendations": [\n    { "suggestion": "recommendation text", "reason": "reason for recommendation" }\n  ]\n}`;
    }

    return `You are a professional writing assistant specializing in ${style} style.
Your task is to analyze the provided paragraph and identify:
1. Grammar, spelling, and punctuation errors
2. Style inconsistencies with ${style} writing
3. Potential improvements to enhance the ${style} style

Apply a ${level} level of scrutiny (low: only critical errors, medium: typical errors, high: comprehensive analysis).
Return ONLY JSON with no additional text.

The JSON must follow this format:
{
  "original_paragraph": "the original text",
  "corrections": [
    {
      "start_pos": 0,
      "end_pos": 4,
      "original_text": "text with error",
      "corrected_text": "corrected text",
      "error_type": "grammar",
      "recommendation": "explanation of the correction"
    }
  ],
  "style_recommendations": [
    { "suggestion": "recommendation text", "reason": "reason for recommendation" }
  ]
}`;
  }

  /**
   * Lint a paragraph by calling the configured OpenAI-compatible endpoint.
   */
  public async processText(
    db: DatabaseInstance,
    paragraph: string,
    style: string,
    level: string
  ): Promise<LintResponseDto> {
    const cfg = await this.getConfig(db);

    if (!cfg.apiKey.trim()) {
      throw new Error(
        'AI linting features are not available. Please configure an OpenAI-compatible API key.'
      );
    }

    const cacheKey = this.generateCacheKey(paragraph, style, level);
    const cached = this.cacheGet(cacheKey);
    if (cached) {
      lintLog.debug('Returning cached lint results');
      return cached;
    }

    const systemMsg = this.createSystemMessage(style, level, cfg.customPrompt);
    const endpoint = cfg.endpoint
      ? `${cfg.endpoint.replace(/\/+$/, '')}/chat/completions`
      : 'https://api.openai.com/v1/chat/completions';

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: cfg.model,
          messages: [
            { role: 'system', content: systemMsg },
            { role: 'user', content: paragraph },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3,
          max_tokens: 512,
          stream: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`OpenAI-compatible API error (${res.status}): ${errorText}`);
      }

      const data = (await res.json()) as {
        choices: Array<{ message: { content: string } }>;
      };

      if (!data.choices || data.choices.length === 0) {
        throw new Error('No choices returned from lint API');
      }

      const content = data.choices[0].message.content;
      if (!content) {
        throw new Error('Empty response from lint API');
      }

      const parsedResponse = JSON.parse(content) as LintResponseDto;
      parsedResponse.source = 'openai';

      this.cacheSet(cacheKey, parsedResponse);
      return parsedResponse;
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Linting service timed out after 15 seconds', {
          cause: error,
        });
      }
      const errMessage = error instanceof Error ? error.message : 'Unknown error';
      lintLog.error(`Error calling lint API: ${errMessage}`);
      throw new Error('Failed to process text with lint API', { cause: error });
    }
  }
}

// Singleton instance (stateless — reads config from db per request)
export const openAILintService = new OpenAILintService();
