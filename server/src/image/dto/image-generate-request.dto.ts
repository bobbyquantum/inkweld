import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsIn,
  MaxLength,
} from 'class-validator';

export class ImageGenerateRequestDto {
  @ApiProperty({
    description:
      'Text description of the desired image(s). Max 32000 chars (gpt-image-1), 1000 (dall-e-2), 4000 (dall-e-3).',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32000) // Use the highest limit for validation
  prompt: string;

  @ApiPropertyOptional({
    description: 'Model to use: dall-e-2, dall-e-3, or gpt-image-1.',
    default: 'dall-e-2',
    enum: ['dall-e-2', 'dall-e-3', 'gpt-image-1'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['dall-e-2', 'dall-e-3', 'gpt-image-1'])
  model?: 'dall-e-2' | 'dall-e-3' | 'gpt-image-1';

  @ApiPropertyOptional({
    description:
      'Number of images to generate (1-10). For dall-e-3, only n=1 is supported.',
    default: 1,
    minimum: 1,
    maximum: 10,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  n?: number;

  @ApiPropertyOptional({
    description:
      'Quality of the image (gpt-image-1: high, medium, low; dall-e-3: hd, standard; dall-e-2: standard).',
    default: 'auto',
    enum: ['auto', 'standard', 'hd', 'high', 'medium', 'low'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['auto', 'standard', 'hd', 'high', 'medium', 'low'])
  quality?: 'auto' | 'standard' | 'hd' | 'high' | 'medium' | 'low';

  @ApiPropertyOptional({
    description:
      'Response format (url or b64_json). Not supported for gpt-image-1 (always b64_json).',
    default: 'url',
    enum: ['url', 'b64_json'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['url', 'b64_json'])
  response_format?: 'url' | 'b64_json';

  @ApiPropertyOptional({
    description:
      'Image size (gpt-image-1: 1024x1024, 1536x1024, 1024x1536; dall-e-2: 256x256, 512x512, 1024x1024; dall-e-3: 1024x1024, 1792x1024, 1024x1792).',
    default: 'auto',
    enum: [
      'auto',
      '256x256',
      '512x512',
      '1024x1024',
      '1536x1024',
      '1024x1536',
      '1792x1024',
      '1024x1792',
    ],
  })
  @IsOptional()
  @IsString()
  @IsIn([
    'auto',
    '256x256',
    '512x512',
    '1024x1024',
    '1536x1024',
    '1024x1536',
    '1792x1024',
    '1024x1792',
  ])
  size?:
    | 'auto'
    | '256x256'
    | '512x512'
    | '1024x1024'
    | '1536x1024'
    | '1024x1536'
    | '1792x1024'
    | '1024x1792';

  @ApiPropertyOptional({
    description: 'Image style (dall-e-3 only): vivid or natural.',
    default: 'vivid',
    enum: ['vivid', 'natural'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['vivid', 'natural'])
  style?: 'vivid' | 'natural';

  @ApiPropertyOptional({
    description: 'Unique identifier for the end-user to help monitor abuse.',
  })
  @IsOptional()
  @IsString()
  user?: string;

  // gpt-image-1 specific properties
  @ApiPropertyOptional({
    description:
      'Background transparency (gpt-image-1 only): transparent, opaque or auto.',
    default: 'auto',
    enum: ['transparent', 'opaque', 'auto'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['transparent', 'opaque', 'auto'])
  background?: 'transparent' | 'opaque' | 'auto';

  @ApiPropertyOptional({
    description: 'Content moderation level (gpt-image-1 only): low or auto.',
    default: 'auto',
    enum: ['low', 'auto'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['low', 'auto'])
  moderation?: 'low' | 'auto';

  @ApiPropertyOptional({
    description:
      'Compression level (0-100) for webp/jpeg output (gpt-image-1 only).',
    default: 100,
    minimum: 0,
    maximum: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  output_compression?: number;

  @ApiPropertyOptional({
    description: 'Output format (gpt-image-1 only): png, jpeg, or webp.',
    default: 'png',
    enum: ['png', 'jpeg', 'webp'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['png', 'jpeg', 'webp'])
  output_format?: 'png' | 'jpeg' | 'webp';
}
