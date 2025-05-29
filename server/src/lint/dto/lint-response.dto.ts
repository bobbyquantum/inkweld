import { ApiProperty } from '@nestjs/swagger';

/**
 * Represents a single text correction with position information
 */
export class CorrectionDto {
  @ApiProperty({
    description: 'The error text as it appears in the original paragraph',
    example: 'scenrt',
  })
  error: string;

  @ApiProperty({
    description: 'The suggested correction for the error',
    example: 'scent',
  })
  suggestion: string;

  @ApiProperty({
    description: 'The starting position of the error (UTF-16 code unit offset)',
    example: 74,
  })
  from: number;

  @ApiProperty({
    description: 'The ending position of the error (UTF-16 code unit offset)',
    example: 80,
  })
  to: number;
}

/**
 * Represents style recommendations for the paragraph
 */
export class StyleRecommendationDto {
  @ApiProperty({
    description: 'The style recommendation for the paragraph',
    example: 'Use shorter, punchier sentences',
  })
  suggestion: string;

  @ApiProperty({
    description: 'The reason for the style recommendation',
    example:
      'Pulp fiction typically uses shorter sentences for dramatic effect',
  })
  reason: string;
}

/**
 * Response DTO for the linting service
 */
export class LintResponseDto {
  @ApiProperty({
    description: 'The original paragraph that was checked',
  })
  original_paragraph: string;

  @ApiProperty({
    description: 'List of text corrections with position information',
    type: [CorrectionDto],
  })
  corrections: CorrectionDto[];

  @ApiProperty({
    description: 'List of style recommendations for the paragraph',
    type: [StyleRecommendationDto],
  })
  style_recommendations: StyleRecommendationDto[];

  @ApiProperty({
    description: 'The source of the linting service (openai or languagetool)',
    enum: ['openai', 'languagetool'],
    default: 'openai',
  })
  source?: string;
}
