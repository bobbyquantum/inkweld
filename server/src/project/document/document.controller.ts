import {
  Controller,
  Get,
  Param,
  UseGuards,
  Logger,
  NotFoundException,
  InternalServerErrorException,
  Header,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiParam,
  ApiCookieAuth,
  ApiProduces,
} from '@nestjs/swagger';
import { LevelDBManagerService } from '../../common/persistence/leveldb-manager.service.js';
import { DocumentDto } from './document.dto.js';
import { SessionAuthGuard } from '../../auth/session-auth.guard.js';
import { Doc } from 'yjs';
import { DocumentRendererService } from './document-renderer.service.js';

@ApiTags('Document API')
@ApiCookieAuth()
@Controller('api/v1/projects')
export class DocumentController {
  private readonly logger = new Logger(DocumentController.name);

  constructor(
    private readonly levelDBManager: LevelDBManagerService,
    private readonly documentRenderer: DocumentRendererService,
  ) {}

  /**
   * List all documents in a specific project
   * @param username The owner of the project
   * @param projectSlug The project identifier
   * @returns Array of document metadata
   */
  @UseGuards(SessionAuthGuard)
  @Get(':username/:projectSlug/docs')
  @ApiOperation({
    summary: 'List all documents in a project',
    description: 'Retrieves a list of all documents in the specified project.',
  })
  @ApiParam({
    name: 'username',
    required: true,
    description: 'The username of the project owner',
    example: 'testuser',
  })
  @ApiParam({
    name: 'projectSlug',
    required: true,
    description: 'The slug identifier of the project',
    example: 'my-project',
  })
  @ApiOkResponse({
    description: 'Successfully retrieved the list of documents',
    type: [DocumentDto],
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing authentication',
  })
  @ApiForbiddenResponse({
    description: 'User does not have permission to access this project',
  })
  @ApiNotFoundResponse({
    description: 'Project not found',
  })
  async listDocuments(
    @Param('username') username: string,
    @Param('projectSlug') projectSlug: string,
  ): Promise<DocumentDto[]> {
    try {
      this.logger.log(
        `Listing documents for project ${username}/${projectSlug}`,
      );

      // Get documents directly from the LevelDB database using the manager
      const documentIds = await this.levelDBManager.listProjectDocuments(
        username,
        projectSlug,
      );

      if (documentIds.length === 0) {
        return []; // No documents found
      }

      // Get the database for this project to access metadata
      const db = await this.levelDBManager.getProjectDatabase(
        username,
        projectSlug,
      );
      const documents: DocumentDto[] = [];

      // For each document ID, fetch metadata and create DocumentDto objects
      for (const docId of documentIds) {
        try {
          // Try to get metadata for the document
          const ownerId = await db.getMeta(docId, 'ownerId');
          const lastModified =
            (await db.getMeta(docId, 'lastModified')) ||
            new Date().toISOString();

          // Parse the document ID to extract components
          const parts = docId.split(':');
          const name = parts.length === 3 ? parts[2] : 'Untitled';

          // skio "elements"
          if (name === 'elements') {
            this.logger.warn(
              `Skipping document ${docId} as it is an internal element document`,
            );
            continue;
          }

          // Create the document dto
          const docDto = new DocumentDto({
            id: docId,
            ownerId: ownerId || username, // Default to username if no owner is set
            name,
            lastModified,
            username,
            projectSlug,
          });

          documents.push(docDto);
        } catch (err: any) {
          this.logger.warn(
            `Error retrieving document ${docId}: ${err.message}`,
          );
          // Continue with other documents - don't fail the whole request
        }
      }

      return documents;
    } catch (error) {
      this.logger.error(
        `Failed to list documents for ${username}/${projectSlug}:`,
        error,
      );
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to list documents');
    }
  }

  /**
   * Get a document by ID within a project
   */
  @UseGuards(SessionAuthGuard)
  @Get(':username/:projectSlug/docs/:docId')
  @ApiOperation({
    summary: 'Get document information',
    description: 'Retrieves metadata for a specific document in a project.',
  })
  @ApiParam({
    name: 'username',
    required: true,
    description: 'The username of the project owner',
    example: 'testuser',
  })
  @ApiParam({
    name: 'projectSlug',
    required: true,
    description: 'The slug identifier of the project',
    example: 'my-project',
  })
  @ApiParam({
    name: 'docId',
    required: true,
    description: 'The document identifier',
    example: 'document1',
  })
  @ApiOkResponse({
    description: 'Successfully retrieved the document information',
    type: DocumentDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing authentication',
  })
  @ApiNotFoundResponse({
    description: 'Document not found',
  })
  async getDocumentInfo(
    @Param('username') username: string,
    @Param('projectSlug') projectSlug: string,
    @Param('docId') docId: string,
  ) {
    try {
      this.logger.log(
        `Getting document info for ${docId} in project ${username}/${projectSlug}`,
      );

      // Construct the full document ID
      const documentId = `${docId}:${username}:${projectSlug}`;

      // Get the database for this project
      const db = await this.levelDBManager.getProjectDatabase(
        username,
        projectSlug,
      );

      // Try to get document metadata
      try {
        const ownerId = await db.getMeta(documentId, 'ownerId');
        const lastModified =
          (await db.getMeta(documentId, 'lastModified')) ||
          new Date().toISOString();

        // If we can get metadata, the document exists
        return new DocumentDto({
          id: documentId,
          ownerId: ownerId || username,
          name: docId || 'Untitled',
          lastModified,
          username,
          projectSlug,
        });
      } catch (err: any) {
        this.logger.warn(
          `Document ${documentId} not found or error: ${err.message}`,
        );
        throw new NotFoundException(`Document ${documentId} not found`);
      }
    } catch (error) {
      this.logger.error(`Failed to get document ${docId}:`, error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to get document');
    }
  }

  /**
   * Render a document as static HTML
   * @param username The owner of the project
   * @param projectSlug The project identifier
   * @param docId The document identifier
   * @returns HTML representation of the document
   */
  @UseGuards(SessionAuthGuard)
  @Get(':username/:projectSlug/docs/:docId/html')
  @ApiOperation({
    summary: 'Render document as HTML',
    description: 'Renders a ProseMirror document as static HTML.',
  })
  @ApiParam({
    name: 'username',
    required: true,
    description: 'The username of the project owner',
    example: 'testuser',
  })
  @ApiParam({
    name: 'projectSlug',
    required: true,
    description: 'The slug identifier of the project',
    example: 'my-project',
  })
  @ApiParam({
    name: 'docId',
    required: true,
    description: 'The document identifier',
    example: 'document1',
  })
  @ApiProduces('text/html')
  @ApiOkResponse({
    description: 'Successfully rendered the document as HTML',
    type: String,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing authentication',
  })
  @ApiNotFoundResponse({
    description: 'Document not found',
  })
  @Header('Content-Type', 'text/html')
  async renderHtml(
    @Param('username') username: string,
    @Param('projectSlug') projectSlug: string,
    @Param('docId') docId: string,
    @Res() response,
  ): Promise<void> {
    try {
      this.logger.log(
        `Rendering HTML for document ${docId} in project ${username}/${projectSlug}`,
      );

      // Get the doc from database
      const documentId = `${username}:${projectSlug}:${docId}`;
      let ydoc: Doc;

      try {
        // Get access to project database
        const db = await this.levelDBManager.getProjectDatabase(
          username,
          projectSlug,
        );

        // Check if document exists
        try {
          // This will throw if the document doesn't exist
          await db.getMeta(documentId, 'ownerId');
        } catch (_err) {
          throw new NotFoundException(`Document ${documentId} not found`);
        }

        // Load the Y.Doc from database
        ydoc = await db.getYDoc(documentId);
      } catch (error) {
        if (error instanceof NotFoundException) {
          throw error;
        }
        this.logger.error(`Failed to retrieve document ${documentId}:`, error);
        throw new InternalServerErrorException('Failed to retrieve document');
      }

      // Use the document renderer service to render HTML
      const html = this.documentRenderer.renderDocumentAsHtml(ydoc, docId);

      // Send HTML response
      response.send(html);
    } catch (error) {
      this.logger.error(`Failed to render HTML for document ${docId}:`, error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to render document as HTML',
      );
    }
  }
}
