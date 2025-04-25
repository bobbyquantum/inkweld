import { IsString, IsNotEmpty, MaxLength, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Input DTO for the linting service
 */
export class LintRequestDto {
  @ApiProperty({
    description: 'The paragraph text to be checked for errors',
    maxLength: 4096,
    example: 'The cheap perfume couldn\'t cover the stink of fear...',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  paragraph: string;

  @ApiProperty({
    description: 'The writing style to check against',
    example: '1940s pulp fiction',
  })
  @IsString()
  style: string;

  @ApiProperty({
    description: 'The level of linting strictness',
    enum: ['low', 'medium', 'high'],
    default: 'medium',
  })
  @IsString()
  @IsIn(['low', 'medium', 'high'])
  level: string;
}
