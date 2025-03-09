import {
  Controller,
  Get,
  Put,
  Param,
  Body,
  Headers,
  UseGuards,
  Logger,
  Post,
  StreamableFile,
  Delete,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadedFile, UseInterceptors } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiNotFoundResponse,
  ApiHeader,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiBody,
  ApiProduces,
  ApiConsumes,
} from '@nestjs/swagger';
import { SessionAuthGuard } from '../../auth/session-auth.guard.js';
import { ProjectElementDto } from './project-element.dto.js';
import { ProjectElementService } from './project-element.service.js';
// e.g. a service that deals with doc reading/writing
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination?: string;
  filename?: string;
  path?: string;
  buffer?: Buffer;
}
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
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOkResponse({ description: 'Image successfully uploaded' })
  @ApiNotFoundResponse({ description: 'Element not found' })
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
    @UploadedFile() file: MulterFile,
  ): Promise<void> {
    this.logger.log(
      `Uploading image ${file.originalname} for element ${elementId}`,
      { username, slug, elementId, size: file.size },
    );
    await this.yjsService.uploadImage(
      username,
      slug,
      elementId,
      file.buffer,
      file.originalname,
    );
  }

  @Get(':elementId/image')
  @ApiOperation({ summary: 'Download image for project element' })
  @ApiProduces('image/*')
  @ApiOkResponse({
    description: 'Image file stream',
    type: StreamableFile,
  })
  @ApiNotFoundResponse({ description: 'Image not found' })
  async downloadImage(
    @Param('username') username: string,
    @Param('slug') slug: string,
    @Param('elementId') elementId: string,
  ): Promise<StreamableFile> {
    // Return StreamableFile
    this.logger.log(
      `Downloading image for project element ${username}/${slug}/${elementId}`,
      { username, slug, elementId },
    );
    const imageStream = await this.yjsService.downloadImage(
      username,
      slug,
      elementId,
    );
    return new StreamableFile(imageStream as any); // Wrap stream in StreamableFile
  }

  @Delete(':elementId/image')
  @ApiOperation({ summary: 'Delete image for project element' })
  @ApiOkResponse({ description: 'Image successfully deleted' })
  @ApiNotFoundResponse({ description: 'Image not found' })
  async deleteImage(
    @Param('username') username: string,
    @Param('slug') slug: string,
    @Param('elementId') elementId: string,
  ): Promise<void> {
    this.logger.log(
      `Deleting image for project element ${username}/${slug}/${elementId}`,
      { username, slug, elementId },
    );
    await this.yjsService.deleteImage(username, slug, elementId);
  }
}
