import {
  Controller,
  Get,
  Put,
  Param,
  Body,
  Headers,
  UseGuards,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiNotFoundResponse,
  ApiHeader,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiBody,
} from '@nestjs/swagger';
import { SessionAuthGuard } from '../../auth/session-auth.guard.js';
import { ProjectElementDto } from './project-element.dto.js';
import { ProjectElementService } from './project-element.service.js';

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
    name: 'X-CSRF-TOKEN',
    description: 'CSRF token',
    required: true,
  })
  async replaceProjectElements(
    @Param('username') username: string,
    @Param('slug') slug: string,
    @Headers('X-CSRF-TOKEN') csrfToken: string,
    @Body() elements: ProjectElementDto[],
  ): Promise<ProjectElementDto[]> {
    this.logger.log(
      `Replacing entire element list in Yjs doc for project ${username}/${slug}, CSRF=${csrfToken}`,
    );
    return this.yjsService.replaceProjectElements(username, slug, elements);
  }
}
