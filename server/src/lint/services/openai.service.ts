import { Injectable, Logger, InternalServerErrorException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { LintResponseDto } from '../dto/lint-response.dto.js';
import { createHash } from 'crypto';

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  expiry: number;
}

@Injectable()
export class OpenAiService {
  private readonly openai: OpenAI | null;
  private readonly logger = new Logger(OpenAiService.name);
  private readonly cache = new Map<string, CacheEntry<LintResponseDto>>(); // Manual simple cache
  private readonly CACHE_TTL = 300000; // 5 minutes cache (300,000ms)
  private readonly OPENAI_MODEL = 'gpt-4.1-nano-2025-04-14';
  private readonly isAiEnabled: boolean;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY is not defined in environment variables. AI linting features will be disabled.');
      this.openai = null;
      this.isAiEnabled = false;
    } else {
      this.openai = new OpenAI({ apiKey });
      this.isAiEnabled = true;
      this.logger.log('OpenAI service initialized successfully');
    }
  }

  /**
   * Check if AI features are enabled
   */
  public isEnabled(): boolean {
    return this.isAiEnabled;
  }

  /**
   * Generate a cache key from input parameters
   */
  private generateCacheKey(paragraph: string, style: string, level: string): string {
    return createHash('sha256')
      .update(`${paragraph}|${style}|${level}`)
      .digest('hex');
  }

  /**
   * Cache an item
   */
  private cacheSet(key: string, value: LintResponseDto): void {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      expiry: this.CACHE_TTL
    });
    
    // Clean up expired entries occasionally
    if (Math.random() < 0.1) { // 10% chance to trigger cleanup
      this.cleanCache();
    }
  }

  /**
   * Get an item from cache if it exists and is not expired
   */
  private cacheGet(key: string): LintResponseDto | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return undefined;
    }
    
    // Check if entry has expired
    if (Date.now() - entry.timestamp > entry.expiry) {
      this.cache.delete(key);
      return undefined;
    }
    
    return entry.value;
  }

  /**
   * Clean expired entries from cache
   */
  private cleanCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.expiry) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Creates the system message for the OpenAI prompt
   */
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
    { "error": "text with error", "suggestion": "corrected text" }
  ],
  "style_recommendations": [
    { "suggestion": "recommendation text", "reason": "reason for recommendation" }
  ]
}`;
  }

  /**
   * Process a paragraph with OpenAI for linting
   */
  async processText(paragraph: string, style: string, level: string): Promise<LintResponseDto> {
    if (!this.isAiEnabled || !this.openai) {
      this.logger.warn('AI linting requested but OpenAI API key is not configured');
      throw new ServiceUnavailableException(
        'AI linting features are not available. Please configure OPENAI_API_KEY environment variable.',
        {
          description: 'OpenAI API key is not configured'
        }
      );
    }

    const cacheKey = this.generateCacheKey(paragraph, style, level);
    const cached = this.cacheGet(cacheKey);
    
    if (cached) {
      this.logger.debug('Returning cached lint results');
      return cached;
    }

    const systemMsg = this.createSystemMessage(style, level);
    const userMsg = paragraph;

    try {
      // Create an abort controller with a 15-second timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const res = await this.openai.chat.completions.create({
        model: this.OPENAI_MODEL,
        messages: [
          { role: 'system', content: systemMsg },
          { role: 'user', content: userMsg }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 512,
        stream: false,
      }, {
        signal: controller.signal as AbortSignal
      });

      // Clear the timeout since we got a response
      clearTimeout(timeoutId);

      if (res.choices && res.choices.length > 0) {
        try {
          const content = res.choices[0].message.content;
          if (!content) {
            throw new Error('Empty response from OpenAI');
          }
          this.logger.debug(`OpenAI response: ${content}`);
          
          const parsedResponse = JSON.parse(content) as LintResponseDto;
          parsedResponse.source = 'openai';
          
          // Cache the result
          this.cacheSet(cacheKey, parsedResponse);
          
          return parsedResponse;
        } catch (error) {
          const err = error as Error;
          this.logger.error(`Error parsing OpenAI response: ${err.message}`);
          throw new InternalServerErrorException('Failed to parse linting results');
        }
      } else {
        throw new Error('No choices returned from OpenAI');
      }
    } catch (error) {
      const err = error as Error;
      if (err.name === 'AbortError') {
        this.logger.warn('OpenAI request timed out after 15 seconds');
        throw new InternalServerErrorException('Linting service timed out', {
          cause: err,
          description: 'The linting service took too long to respond',
        });
      }
      
      this.logger.error(`Error calling OpenAI: ${err.message}`);
      throw new InternalServerErrorException('Failed to process text with OpenAI', {
        cause: err,
      });
    }
  }
}
