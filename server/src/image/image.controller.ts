import { Controller, Post, Body, Logger, HttpCode, InternalServerErrorException, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { ImageGenerateRequestDto } from './dto/image-generate-request.dto.js';
import { ImageResponseDto } from './dto/image-response.dto.js';
import { OpenAiImageService } from './services/openai.service.js';

@ApiTags('Image')
@Controller('image')
export class ImageController {
  private readonly logger = new Logger(ImageController.name);

  constructor(private readonly openAiImageService: OpenAiImageService) {}

  /**
   * Generate an image based on a text prompt
   */
  @Post('generate')
  @HttpCode(200)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @ApiOperation({ summary: 'Generate an image based on a text prompt' })
  @ApiBody({ type: ImageGenerateRequestDto })
  @ApiResponse({ status: 200, description: 'Image(s) successfully generated', type: ImageResponseDto })
  @ApiResponse({ status: 400, description: 'Bad request - invalid input' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async generateImage(@Body() request: ImageGenerateRequestDto): Promise<ImageResponseDto> {
    try {
      this.logger.debug(`Received image generation request for prompt: "${request.prompt}"`);
      const result = await this.openAiImageService.generate(request);
      return result;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Error in image generation controller: ${err.message}`, err.stack);
      // Rethrow if it's already an HTTP exception, otherwise wrap it
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to process image generation request', {
        cause: err,
      });
    }
  }

  // TODO: Add endpoints for edit and variation features when needed
}
