import {
  Controller,
  Post,
  Param,
  UseGuards,
  Logger,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
  ApiParam,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { SessionAuthGuard } from '../../auth/session-auth.guard.js';
import { ProjectPublishEpubService } from './project-publish-epub.service.js';
import { PublishEpubResponseDto } from './publish-epub-response.dto.js';

@ApiTags('Project API')
@Controller('api/v1/projects/:username/:slug/epub')
@UseGuards(SessionAuthGuard)
@ApiCookieAuth()
export class ProjectPublishEpubController {
  private readonly logger = new Logger(ProjectPublishEpubController.name);

  constructor(private readonly epubService: ProjectPublishEpubService) {}

  @Post()
  @ApiOperation({
    summary: 'Publish project as EPUB',
    description: 'Converts project elements to an EPUB file and returns file metadata',
  })
  @ApiParam({
    name: 'username',
    required: true,
    description: 'Username of the project owner',
    example: 'testuser',
  })
  @ApiParam({
    name: 'slug',
    required: true,
    description: 'Project slug identifier',
    example: 'my-novel',
  })
  @ApiOkResponse({
    description: 'Successfully published project as EPUB',
    type: PublishEpubResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Project not found' })
  @ApiUnauthorizedResponse({ description: 'User not authorized' })
  async publishEpub(
    @Param('username') username: string,
    @Param('slug') slug: string,
  ): Promise<PublishEpubResponseDto> {
    try {
      this.logger.log(`Request to publish project ${username}/${slug} as EPUB`);

      const fileMetadata = await this.epubService.publishProjectAsEpub(
        username,
        slug,
      );

      return new PublishEpubResponseDto({
        originalName: fileMetadata.originalName,
        storedName: fileMetadata.storedName,
        contentType: 'application/epub+zip', // EPUB MIME type
        size: fileMetadata.size,
        uploadDate: fileMetadata.uploadDate,
      });
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Error publishing EPUB: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        'Failed to publish project as EPUB',
      );
    }
  }
}
