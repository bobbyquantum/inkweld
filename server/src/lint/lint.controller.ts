import { Controller, Post, Body, Logger, HttpCode, InternalServerErrorException, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { LintRequestDto } from './dto/lint-request.dto.js';
import { LintResponseDto } from './dto/lint-response.dto.js';
import { OpenAiService } from './services/openai.service.js';
import { DiffService } from './services/diff.service.js';

@ApiTags('Lint')
@Controller('lint')
export class LintController {
  private readonly logger = new Logger(LintController.name);

  constructor(
    private readonly openAiService: OpenAiService,
    private readonly diffService: DiffService,
  ) {}

  /**
   * Check if AI linting features are available
   */
  @Get('status')
  @ApiOperation({ summary: 'Check if AI linting features are available' })
  @ApiResponse({ status: 200, description: 'AI service status', schema: { 
    type: 'object', 
    properties: { 
      enabled: { type: 'boolean' },
      service: { type: 'string' }
    }
  }})
  getStatus() {
    return {
      enabled: this.openAiService.isEnabled(),
      service: 'openai'
    };
  }

  /**
   * Check a paragraph for grammar, spelling, and style issues
   */
  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Lint a paragraph for grammar, spelling, and style issues' })
  @ApiBody({ type: LintRequestDto })
  @ApiResponse({
    status: 200,
    description: 'The paragraph has been successfully analyzed',
    type: LintResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request - invalid input' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiResponse({ status: 503, description: 'Service unavailable - AI features disabled' })
  async lintParagraph(@Body() lintRequest: LintRequestDto): Promise<LintResponseDto> {
    try {
      this.logger.debug(`Processing paragraph with style: ${lintRequest.style}, level: ${lintRequest.level}`);
      
      // Get the raw response from OpenAI
      const openAiResponse = await this.openAiService.processText(
        lintRequest.paragraph,
        lintRequest.style,
        lintRequest.level,
      );
      
      // Process the corrections to add accurate position information
      const processedCorrections = this.diffService.processCorrections(
        lintRequest.paragraph,
        openAiResponse.corrections,
      );
      
      // Return the final response with accurate positions
      return {
        original_paragraph: lintRequest.paragraph,
        corrections: processedCorrections,
        style_recommendations: openAiResponse.style_recommendations,
        source: openAiResponse.source,
      };
    } catch (error) {
      const err = error as Error;
      
      // Handle ServiceUnavailableException specifically to preserve the 503 status
      if (error instanceof ServiceUnavailableException) {
        this.logger.warn('AI linting service is not available');
        throw error;
      }
      
      this.logger.error(`Error in lint service: ${err.message}`, err.stack);
      throw new InternalServerErrorException(
        'Failed to process linting request',
        { cause: err },
      );
    }
  }
}
