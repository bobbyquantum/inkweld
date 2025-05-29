import { ApiProperty } from '@nestjs/swagger';

export class PublishEpubResponseDto {
  @ApiProperty({
    description: 'Original filename of the EPUB file',
    example: 'my-project-2025-03-30.epub',
  })
  originalName: string;

  @ApiProperty({
    description: 'Stored filename of the EPUB file',
    example: 'a1b2c3d4-1717171717.epub',
  })
  storedName: string;

  @ApiProperty({
    description: 'MIME type of the file',
    example: 'application/epub+zip',
  })
  contentType: string;

  @ApiProperty({
    description: 'Size of the file in bytes',
    example: 12345,
  })
  size: number;

  @ApiProperty({
    description: 'Date when the file was created',
    example: '2025-03-30T12:34:56.789Z',
  })
  uploadDate: Date;

  constructor(data: Partial<PublishEpubResponseDto>) {
    Object.assign(this, data);
  }
}
