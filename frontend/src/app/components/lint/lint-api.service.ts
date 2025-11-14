import { HttpContext, HttpContextToken } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { LintingService } from '../../../api-client/api/linting.service';
import {
  PostApiV1AiLintRequest,
  PostApiV1AiLintRequestLevel,
} from '../../../api-client/model/post-api-v1-ai-lint-request';
import {
  PostApiV1AiLint200Response,
  PostApiV1AiLint200ResponseSource,
} from '../../../api-client/model/post-api-v1-ai-lint200-response';

/**
 * Token to pass AbortSignal to the OpenAPI client
 */
export const ABORT_SIGNAL = new HttpContextToken<AbortSignal>(
  () => null as unknown as AbortSignal
);

/**
 * Service to handle API calls to the lint endpoint
 */
@Injectable({
  providedIn: 'root',
})
export class LintApiService {
  private readonly timeout = 10000; // 10 seconds

  private readonly lintService = inject(LintingService);

  /**
   * Run a lint request and handle response
   * @param text Paragraph text to lint
   * @param style Style guide to follow (default: 'default')
   * @param level Lint level (default: 'high')
   * @returns PostApiV1AiLint200Response with corrections
   */
  async run(
    text: string,
    style = 'default',
    level: PostApiV1AiLintRequestLevel = PostApiV1AiLintRequestLevel.High
  ): Promise<PostApiV1AiLint200Response> {
    const signal = AbortSignal.timeout(this.timeout);
    const request: PostApiV1AiLintRequest = {
      paragraph: text,
      style,
      level,
    };
    try {
      const context = new HttpContext().set(ABORT_SIGNAL, signal);
      return await firstValueFrom(
        this.lintService.postApiV1AiLint(request, 'body', false, {
          context,
        })
      );
    } catch (error) {
      console.error('Error calling lint service:', error);
      return {
        originalParagraph: text,
        corrections: [],
        styleRecommendations: [],
        source: PostApiV1AiLint200ResponseSource.Openai,
      };
    }
  }
}
