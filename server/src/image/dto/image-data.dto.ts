import { ApiProperty } from '@nestjs/swagger';

export class ImageDataDto {
  @ApiProperty({ description: 'Base64 encoded image data', required: false })
  b64_json?: string;

  @ApiProperty({
    description: 'URL of the generated image (valid for 60 minutes)',
    required: false,
  })
  url?: string;

  @ApiProperty({
    description: 'Revised prompt used by the model',
    required: false,
  })
  revised_prompt?: string;
}
