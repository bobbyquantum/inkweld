import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength, IsInt, Min } from 'class-validator';

/**
 * DTO for creating a new snapshot
 */
export class CreateSnapshotDto {
  @ApiProperty({
    description: 'Name of the snapshot',
    example: 'Chapter 1 - First Draft',
    maxLength: 255,
  })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({
    description: 'Optional description of the snapshot',
    example: 'First complete draft before editing',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;
}

/**
 * DTO for snapshot metadata returned to clients
 */
export class SnapshotDto {
  @ApiProperty({
    description: 'Unique identifier for the snapshot',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'The document ID this snapshot belongs to',
    example: 'testuser:my-project:chapter1',
  })
  documentId: string;

  @ApiProperty({
    description: 'Name of the snapshot',
    example: 'Chapter 1 - First Draft',
  })
  name: string;

  @ApiProperty({
    description: 'Optional description',
    example: 'First complete draft before editing',
    required: false,
  })
  description?: string;

  @ApiProperty({
    description: 'Word count at the time of snapshot',
    example: 1523,
    required: false,
  })
  wordCount?: number;

  @ApiProperty({
    description: 'When the snapshot was created',
    example: '2025-10-26T12:34:56.789Z',
  })
  createdAt: string;

  @ApiProperty({
    description: 'User who created the snapshot',
    type: 'object',
    properties: {
      id: { type: 'string' },
      username: { type: 'string' },
    },
  })
  createdBy: {
    id: string;
    username: string;
  };

  @ApiProperty({
    description: 'Additional metadata',
    required: false,
  })
  metadata?: Record<string, any>;
}

/**
 * Query parameters for listing snapshots
 */
export class ListSnapshotsQuery {
  @ApiProperty({
    description: 'Maximum number of snapshots to return',
    default: 50,
    minimum: 1,
    maximum: 100,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number = 50;

  @ApiProperty({
    description: 'Number of snapshots to skip',
    default: 0,
    minimum: 0,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @ApiProperty({
    description: 'Field to sort by',
    enum: ['createdAt', 'name'],
    default: 'createdAt',
    required: false,
  })
  @IsOptional()
  @IsString()
  orderBy?: 'createdAt' | 'name' = 'createdAt';

  @ApiProperty({
    description: 'Sort order',
    enum: ['ASC', 'DESC'],
    default: 'DESC',
    required: false,
  })
  @IsOptional()
  @IsString()
  order?: 'ASC' | 'DESC' = 'DESC';
}

/**
 * Response for paginated snapshot list
 */
export class PaginatedSnapshotsDto {
  @ApiProperty({
    description: 'Array of snapshots',
    type: [SnapshotDto],
  })
  snapshots: SnapshotDto[];

  @ApiProperty({
    description: 'Total number of snapshots for this document',
    example: 25,
  })
  total: number;

  @ApiProperty({
    description: 'Number of results per page',
    example: 50,
  })
  limit: number;

  @ApiProperty({
    description: 'Number of results skipped',
    example: 0,
  })
  offset: number;
}

/**
 * Response for snapshot restoration
 */
export class RestoreSnapshotDto {
  @ApiProperty({
    description: 'Whether the restoration was successful',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'The document ID that was restored',
    example: 'testuser:my-project:chapter1',
  })
  documentId: string;

  @ApiProperty({
    description: 'The snapshot ID that was restored from',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  restoredFrom: string;

  @ApiProperty({
    description: 'When the restoration occurred',
    example: '2025-10-26T12:34:56.789Z',
  })
  restoredAt: string;
}
