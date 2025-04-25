import { HttpContext, HttpContextToken } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { LintService } from '../../../api-client/api/lint.service';
import { LintRequestDto } from '../../../api-client/model/lint-request-dto';
import { LintResponseDto } from '../../../api-client/model/lint-response-dto';

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

  private readonly lintService = inject(LintService);

  /**
   * Run a lint request and handle response
   * @param text Paragraph text to lint
   * @param style Style guide to follow (default: 'default')
   * @param level Lint level (default: 'high')
   * @returns LintResponseDto with corrections
   */
  async run(
    text: string,
    style = 'default',
    level: LintRequestDto.LevelEnum = 'high'
  ): Promise<LintResponseDto> {
    const signal = AbortSignal.timeout(this.timeout);
    const request: LintRequestDto = {
      paragraph: text,
      style,
      level,
    };
    try {
      const context = new HttpContext().set(ABORT_SIGNAL, signal);
      return await firstValueFrom(
        this.lintService.lintControllerLintParagraph(request, 'body', false, {
          context,
        })
      );
    } catch (error) {
      console.error('Error calling lint service:', error);
      return {
        original_paragraph: text,
        corrections: [],
        style_recommendations: [],
        source: 'openai',
      };
    }
  }
}
