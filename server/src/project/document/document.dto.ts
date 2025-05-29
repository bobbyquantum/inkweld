import { ApiProperty } from '@nestjs/swagger';

export class DocumentDto {
  @ApiProperty({
    description: 'Unique identifier for the document',
    example: 'doc1:testuser:project-name',
  })
  id: string;

  @ApiProperty({
    description: 'The name of the document',
    example: 'My Document',
  })
  name: string;

  @ApiProperty({
    description: 'The user ID of the document owner',
    example: 'testuser',
  })
  ownerId: string;

  @ApiProperty({
    description: 'The username part of the document ID',
    example: 'testuser',
  })
  username: string;

  @ApiProperty({
    description: 'The project slug part of the document ID',
    example: 'project-name',
  })
  projectSlug: string;

  @ApiProperty({
    description: 'Timestamp when the document was last modified',
    example: '2025-03-22T10:30:00.000Z',
  })
  lastModified: string;

  constructor(partial?: Partial<DocumentDto>) {
    if (partial) {
      Object.assign(this, partial);

      // If id is provided but not username/projectSlug, extract them
      if (partial.id && (!partial.username || !partial.projectSlug)) {
        const parts = partial.id.split(':');
        if (parts.length >= 3) {
          this.username = parts[1];
          this.projectSlug = parts[2];
        }
      }
    }
  }

  /**
   * Creates a document ID from its components
   */
  static createDocumentId(
    name: string,
    username: string,
    slug: string,
  ): string {
    return `${username}:${slug}:${name}`;
  }

  /**
   * Parses a document ID into its components
   */
  static parseDocumentId(documentId: string): {
    name: string;
    username: string;
    projectSlug: string;
  } {
    const parts = documentId.split(':');
    if (parts.length < 3) {
      throw new Error('Invalid document ID format');
    }

    return {
      name: parts[0],
      username: parts[1],
      projectSlug: parts[2],
    };
  }
}
