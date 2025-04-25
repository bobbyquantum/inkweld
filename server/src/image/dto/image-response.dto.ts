import { ApiProperty } from '@nestjs/swagger';
import { ImageDataDto } from './image-data.dto.js';
import { ImageUsageDto } from './image-usage.dto.js';

export class ImageResponseDto {
  @ApiProperty({ description: 'Timestamp of creation (Unix seconds)' })
  created: number;

  @ApiProperty({ type: [ImageDataDto], description: 'List of generated image data objects' })
  data: ImageDataDto[];

  @ApiProperty({ type: ImageUsageDto, description: 'Token usage information (gpt-image-1 only)', required: false })
  usage?: ImageUsageDto;

  @ApiProperty({ description: 'Source of the image generation (e.g., "openai")'})
  source: string;
}
