import { ApiProperty } from '@nestjs/swagger';

class InputTokensDetailsDto {
  @ApiProperty({ description: 'Number of text tokens in the input' })
  text_tokens: number;

  @ApiProperty({ description: 'Number of image tokens in the input' })
  image_tokens: number;
}

export class ImageUsageDto {
  @ApiProperty({ description: 'Total tokens used for the request' })
  total_tokens: number;

  @ApiProperty({ description: 'Tokens used for the input prompt' })
  input_tokens: number;

  @ApiProperty({ description: 'Tokens used for the generated output' })
  output_tokens: number;

  @ApiProperty({ type: InputTokensDetailsDto, description: 'Detailed breakdown of input tokens', required: false })
  input_tokens_details?: InputTokensDetailsDto;
}
