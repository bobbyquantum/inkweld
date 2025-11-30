import OpenAI from 'openai';
import { createHash } from 'crypto';
import { config } from '../config/env';

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

export class OpenAILintService {
  private openai: OpenAI | null = null;
  private isEnabled: boolean = false;
  private cache = new Map<string, CacheEntry<LintResponseDto>>();
  private readonly CACHE_TTL = 300000; // 5 minutes
  private readonly MODEL = 'gpt-4-turbo-preview';

  constructor() {
    const apiKey = config.openai.apiKey;
    if (!apiKey) {
      console.warn('OPENAI_API_KEY not configured. AI linting disabled.');
      this.isEnabled = false;
    } else {
      this.openai = new OpenAI({ apiKey });
      this.isEnabled = true;
      console.log('OpenAI lint service initialized');
    }
  }

  public isAiEnabled(): boolean {
    return this.isEnabled;
  }

  private generateCacheKey(paragraph: string, style: string, level: string): string {
    return createHash('sha256').update(`${paragraph}|${style}|${level}`).digest('hex');
  }

  private cacheSet(key: string, value: LintResponseDto): void {
    this.cache.set(key, {
      value,
      expiry: Date.now() + this.CACHE_TTL,
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

  private createSystemMessage(style: string, level: string): string {
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

  public async processText(
    paragraph: string,
    style: string,
    level: string
  ): Promise<LintResponseDto> {
    if (!this.isEnabled || !this.openai) {
      throw new Error('AI linting features are not available. Please configure OPENAI_API_KEY.');
    }

    const cacheKey = this.generateCacheKey(paragraph, style, level);
    const cached = this.cacheGet(cacheKey);
    if (cached) {
      console.log('Returning cached lint results');
      return cached;
    }

    const systemMsg = this.createSystemMessage(style, level);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const res = await this.openai.chat.completions.create(
        {
          model: this.MODEL,
          messages: [
            { role: 'system', content: systemMsg },
            { role: 'user', content: paragraph },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3,
          max_tokens: 512,
          stream: false,
        },
        {
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (res.choices && res.choices.length > 0) {
        const content = res.choices[0].message.content;
        if (!content) {
          throw new Error('Empty response from OpenAI');
        }

        const parsedResponse = JSON.parse(content) as LintResponseDto;
        parsedResponse.source = 'openai';

        this.cacheSet(cacheKey, parsedResponse);
        return parsedResponse;
      } else {
        throw new Error('No choices returned from OpenAI');
      }
    } catch (error: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OpenAI error structure is complex
      const err = error as any;
      if (err.name === 'AbortError') {
        throw new Error('Linting service timed out after 15 seconds');
      }
      console.error(`Error calling OpenAI: ${err.message || 'Unknown error'}`);
      throw new Error('Failed to process text with OpenAI');
    }
  }
}

// Singleton instance
export const openAILintService = new OpenAILintService();
