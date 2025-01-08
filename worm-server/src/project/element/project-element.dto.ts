// project-element.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsEnum, IsNumber } from 'class-validator';
import { ElementType, isExpandable } from './element-type.enum.js';

export class ProjectElementDto {
  @ApiProperty({
    description: 'Unique identifier of the element',
    example: 'd42200be-2a40-4c3e-9c35-47c8f641c8ea',
    required: false,
  })
  id?: string;

  @ApiProperty({
    description: 'Version for optimistic locking',
    required: false,
  })
  version?: number;

  @ApiProperty({ description: 'Name of the element', example: 'Chapter 1' })
  @IsNotEmpty({ message: 'Name is required' })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Type of the element (FOLDER/ITEM)',
    enum: ElementType,
    example: ElementType.FOLDER,
  })
  @IsEnum(ElementType, {
    message: 'Type is required and must be FOLDER or ITEM',
  })
  type: ElementType;

  @ApiProperty({
    description: 'Position for ordering elements',
    example: 1,
  })
  @IsNotEmpty({ message: 'Position is required' })
  @IsNumber()
  position: number;

  @ApiProperty({
    description: 'Level in the tree hierarchy',
    example: 0,
  })
  @IsNotEmpty({ message: 'Level is required' })
  @IsNumber()
  level: number;

  @ApiProperty({
    description: 'Whether the element can be expanded (computed from type)',
    required: false,
  })
  expandable?: boolean;

  constructor(entity?: ProjectElementDto) {
    if (entity) {
      this.id = entity.id;
      this.version = entity.version;
      this.name = entity.name;
      this.type = entity.type;
      this.position = entity.position;
      this.level = entity.level;
      this.expandable = isExpandable(entity.type);
    }
  }
}
