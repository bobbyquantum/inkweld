import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsDate, IsOptional } from 'class-validator';

export class FileMetadataDto {
  @ApiProperty({ description: 'Original filename provided by the user' })
  @IsString()
  originalName: string;

  @ApiProperty({ description: 'System-generated unique name for storage' })
  @IsString()
  storedName: string;

  @ApiProperty({ description: 'Content type/extension of the file' })
  @IsString()
  contentType: string;

  @ApiProperty({ description: 'Size of the file in bytes' })
  @IsNumber()
  size: number;

  @ApiProperty({ description: 'Date when the file was uploaded' })
  @IsDate()
  uploadDate: Date;
}

export class FileUploadResponseDto extends FileMetadataDto {
  @ApiProperty({ description: 'URL to access the file' })
  @IsString()
  @IsOptional()
  fileUrl?: string;
}

export class FileDeleteResponseDto {
  @ApiProperty({ description: 'Status message for the deletion operation' })
  @IsString()
  message: string;
}
