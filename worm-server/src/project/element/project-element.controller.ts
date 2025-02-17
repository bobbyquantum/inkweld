import { Controller, Get, Put, Param, Body, Headers, UseGuards, Logger, Post, StreamableFile, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiNotFoundResponse, ApiHeader, ApiBadRequestResponse, ApiForbiddenResponse, ApiOkResponse, ApiBody, ApiProduces, ApiConsumes } from '@nestjs/swagger';
import { SessionAuthGuard } from '../../auth/session-auth.guard.js';
import { ProjectElementDto } from './project-element.dto.js';
import { ProjectElementService } from './project-element.service.js';
// e.g. a service that deals with doc reading/writing

@ApiTags('Project API')
@Controller('api/v1/projects/:username/:slug/elements')
@UseGuards(SessionAuthGuard)
export class ProjectElementController {
  private readonly logger = new Logger(ProjectElementController.name);

  constructor(private readonly yjsService: ProjectElementService) {}

  @Get()
  @ApiOperation({
    summary: 'Get all elements for a project (from Yjs doc)',
  })
  @ApiOkResponse({
    description: 'Successfully retrieved elements',
    type: ProjectElementDto,
    isArray: true,
  })
  @ApiNotFoundResponse({ description: 'Doc not found (unlikely with Yjs)' })
  async getProjectElements(
    @Param('username') username: string,
    @Param('slug') slug: string,
  ): Promise<ProjectElementDto[]> {
    return this.yjsService.getProjectElements(username, slug);
  }

  @Put()
  @ApiOperation({
    summary: 'Replace the entire elements array in the Yjs doc',
  })
  @ApiBody({ type: ProjectElementDto, isArray: true })
  @ApiOkResponse({
    description: 'Elements replaced in the Y.Doc',
    type: ProjectElementDto,
    isArray: true,
  })
  @ApiNotFoundResponse({ description: 'Doc not found' })
  @ApiBadRequestResponse({ description: 'Validation errors' })
  @ApiForbiddenResponse({ description: 'User not permitted' })
  @ApiHeader({
    name: 'X-XSRF-TOKEN',
    description: 'CSRF token',
    required: true,
  })
  async replaceProjectElements(
    @Param('username') username: string,
    @Param('slug') slug: string,
    @Headers('X-XSRF-TOKEN') csrfToken: string,
    @Body() elements: ProjectElementDto[],
  ): Promise<ProjectElementDto[]> {
    this.logger.log(
      `Replacing entire element list in Yjs doc for project ${username}/${slug}, CSRF=${csrfToken}`,
    );
    return this.yjsService.replaceProjectElements(username, slug, elements);
  }

  @Post(':elementId/image')
  @ApiOperation({ summary: 'Upload image for project element' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async uploadImage(
    @Param('username') username: string,
    @Param('slug') slug: string,
    @Param('elementId') elementId: string,
    @Body() file: Buffer, // Assuming raw file data in body for now
  ): Promise<void> {
    await this.yjsService.uploadImage(username, slug, elementId, file, 'default-filename.jpg');
  }

  @Get(':elementId/image')
  @ApiOperation({ summary: 'Download image for project element' })
  @ApiProduces('image/*')
  async downloadImage(
    @Param('username') username: string,
    @Param('slug') slug: string,
    @Param('elementId') elementId: string,
  ): Promise<StreamableFile> { // Return StreamableFile
    const imageStream = await this.yjsService.downloadImage(username, slug, elementId);
    return new StreamableFile(imageStream as any); // Wrap stream in StreamableFile
  }

  @Delete(':elementId/image')
  @ApiOperation({ summary: 'Delete image for project element' })
  async deleteImage(
    @Param('username') username: string,
    @Param('slug') slug: string,
    @Param('elementId') elementId: string,
  ): Promise<void> {
    await this.yjsService.deleteImage(username, slug, elementId);
  }
}
