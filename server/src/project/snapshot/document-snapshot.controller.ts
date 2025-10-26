import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  Header,
  Res,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiBadRequestResponse,
  ApiParam,
  ApiCookieAuth,
  ApiProduces,
} from '@nestjs/swagger';
import { DocumentSnapshotService } from './document-snapshot.service.js';
import { SessionAuthGuard } from '../../auth/session-auth.guard.js';
import {
  CreateSnapshotDto,
  SnapshotDto,
  ListSnapshotsQuery,
  PaginatedSnapshotsDto,
  RestoreSnapshotDto,
} from './document-snapshot.dto.js';
import type { Response } from 'express';

@ApiTags('Document Snapshots API')
@ApiCookieAuth()
@Controller('api/v1/projects/:username/:slug/docs/:docId/snapshots')
@UseGuards(SessionAuthGuard)
export class DocumentSnapshotController {
  private readonly logger = new Logger(DocumentSnapshotController.name);

  constructor(private snapshotService: DocumentSnapshotService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a snapshot of the current document state',
    description:
      'Captures the complete state of a document including content and metadata. ' +
      'Snapshots can be used to restore the document to a previous version.',
  })
  @ApiParam({
    name: 'username',
    description: 'Project owner username',
    example: 'testuser',
  })
  @ApiParam({
    name: 'slug',
    description: 'Project slug',
    example: 'my-project',
  })
  @ApiParam({
    name: 'docId',
    description: 'Document identifier',
    example: 'chapter1',
  })
  @ApiCreatedResponse({
    description: 'Snapshot created successfully',
    type: SnapshotDto,
  })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiForbiddenResponse({ description: 'No access to this project' })
  @ApiNotFoundResponse({ description: 'Project or document not found' })
  async createSnapshot(
    @Param('username') username: string,
    @Param('slug') slug: string,
    @Param('docId') docId: string,
    @Request() req,
    @Body() data: CreateSnapshotDto,
  ): Promise<SnapshotDto> {
    return this.snapshotService.createSnapshot(
      username,
      slug,
      docId,
      req.user.id,
      data,
    );
  }

  @Get()
  @ApiOperation({
    summary: 'List all snapshots for a document',
    description: 'Retrieves a paginated list of snapshots for the specified document.',
  })
  @ApiParam({
    name: 'username',
    description: 'Project owner username',
    example: 'testuser',
  })
  @ApiParam({
    name: 'slug',
    description: 'Project slug',
    example: 'my-project',
  })
  @ApiParam({
    name: 'docId',
    description: 'Document identifier',
    example: 'chapter1',
  })
  @ApiOkResponse({
    description: 'Snapshots retrieved successfully',
    type: PaginatedSnapshotsDto,
  })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  async listSnapshots(
    @Param('username') username: string,
    @Param('slug') slug: string,
    @Param('docId') docId: string,
    @Query() query: ListSnapshotsQuery,
  ): Promise<PaginatedSnapshotsDto> {
    return this.snapshotService.listSnapshots(username, slug, docId, query);
  }

  @Get(':snapshotId')
  @ApiOperation({
    summary: 'Get a specific snapshot',
    description: 'Retrieves detailed information about a single snapshot.',
  })
  @ApiParam({
    name: 'username',
    description: 'Project owner username',
    example: 'testuser',
  })
  @ApiParam({
    name: 'slug',
    description: 'Project slug',
    example: 'my-project',
  })
  @ApiParam({
    name: 'docId',
    description: 'Document identifier',
    example: 'chapter1',
  })
  @ApiParam({
    name: 'snapshotId',
    description: 'Snapshot UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiOkResponse({
    description: 'Snapshot retrieved successfully',
    type: SnapshotDto,
  })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiNotFoundResponse({ description: 'Snapshot not found' })
  async getSnapshot(
    @Param('snapshotId') snapshotId: string,
  ): Promise<SnapshotDto> {
    return this.snapshotService.getSnapshot(snapshotId);
  }

  @Post(':snapshotId/restore')
  @ApiOperation({
    summary: 'Restore document to a previous snapshot',
    description:
      'Replaces the current document content with the content from the snapshot. ' +
      'This operation will be broadcast to all connected users via WebSocket. ' +
      'Warning: This cannot be undone (except by restoring another snapshot).',
  })
  @ApiParam({
    name: 'username',
    description: 'Project owner username',
    example: 'testuser',
  })
  @ApiParam({
    name: 'slug',
    description: 'Project slug',
    example: 'my-project',
  })
  @ApiParam({
    name: 'docId',
    description: 'Document identifier',
    example: 'chapter1',
  })
  @ApiParam({
    name: 'snapshotId',
    description: 'Snapshot UUID to restore',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiOkResponse({
    description: 'Document restored successfully',
    type: RestoreSnapshotDto,
  })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiForbiddenResponse({ description: 'No permission to modify this document' })
  @ApiNotFoundResponse({ description: 'Snapshot not found' })
  @ApiBadRequestResponse({ description: 'Snapshot does not match document' })
  async restoreSnapshot(
    @Param('username') username: string,
    @Param('slug') slug: string,
    @Param('docId') docId: string,
    @Param('snapshotId') snapshotId: string,
    @Request() req,
  ): Promise<RestoreSnapshotDto> {
    return this.snapshotService.restoreSnapshot(
      username,
      slug,
      docId,
      snapshotId,
      req.user.id,
    );
  }

  @Delete(':snapshotId')
  @ApiOperation({
    summary: 'Delete a snapshot',
    description:
      'Permanently deletes a snapshot. Only the snapshot creator or project owner can delete snapshots.',
  })
  @ApiParam({
    name: 'username',
    description: 'Project owner username',
    example: 'testuser',
  })
  @ApiParam({
    name: 'slug',
    description: 'Project slug',
    example: 'my-project',
  })
  @ApiParam({
    name: 'docId',
    description: 'Document identifier',
    example: 'chapter1',
  })
  @ApiParam({
    name: 'snapshotId',
    description: 'Snapshot UUID to delete',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiOkResponse({
    description: 'Snapshot deleted successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        deletedId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiForbiddenResponse({ description: 'No permission to delete this snapshot' })
  @ApiNotFoundResponse({ description: 'Snapshot not found' })
  async deleteSnapshot(
    @Param('snapshotId') snapshotId: string,
    @Request() req,
  ): Promise<{ success: boolean; deletedId: string }> {
    return this.snapshotService.deleteSnapshot(snapshotId, req.user.id);
  }

  @Get(':snapshotId/preview')
  @ApiOperation({
    summary: 'Preview a snapshot as HTML',
    description: 'Renders the snapshot content as static HTML for preview purposes.',
  })
  @ApiParam({
    name: 'username',
    description: 'Project owner username',
    example: 'testuser',
  })
  @ApiParam({
    name: 'slug',
    description: 'Project slug',
    example: 'my-project',
  })
  @ApiParam({
    name: 'docId',
    description: 'Document identifier',
    example: 'chapter1',
  })
  @ApiParam({
    name: 'snapshotId',
    description: 'Snapshot UUID to preview',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiProduces('text/html')
  @ApiOkResponse({
    description: 'HTML preview rendered successfully',
    type: String,
  })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiNotFoundResponse({ description: 'Snapshot not found' })
  @Header('Content-Type', 'text/html')
  async previewSnapshot(
    @Param('snapshotId') snapshotId: string,
    @Res() response: Response,
  ): Promise<void> {
    const html = await this.snapshotService.renderSnapshotHtml(snapshotId);
    response.send(html);
  }
}
