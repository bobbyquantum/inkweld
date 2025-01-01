// project-element.controller.ts
import {
  Controller,
  Get,
  Put,
  Param,
  Body,
  Request,
  Headers,
  UseGuards,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiNotFoundResponse,
  ApiHeader,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { ProjectElementService } from './project-element.service';
import { ProjectElementDto } from './project-element.dto';
import { SessionAuthGuard } from '../../auth/session-auth.guard'; // or your own guard

@ApiTags('Project API')
@Controller('api/v1/projects/:username/:slug/elements')
@UseGuards(SessionAuthGuard) // ensuring only logged-in users
export class ProjectElementController {
  private readonly logger = new Logger(ProjectElementController.name);

  constructor(private readonly elementService: ProjectElementService) {}

  @Get()
  @ApiOperation({
    summary: 'Get all elements for a project',
    description:
      'Retrieves all elements belonging to the specified project in their hierarchical order',
  })
  @ApiOkResponse({
    description: 'Successfully retrieved elements',
    type: ProjectElementDto,
    isArray: true,
  })
  @ApiNotFoundResponse({
    description: 'Project not found',
  })
  async getProjectElements(
    @Param('username') username: string,
    @Param('slug') slug: string,
  ): Promise<ProjectElementDto[]> {
    return this.elementService.getProjectElements(username, slug);
  }

  @Put()
  @ApiOperation({
    summary: 'Differential insert elements',
    description:
      'Updates the project’s elements to match exactly the provided list. ' +
      'Elements not included in the list will be deleted. ' +
      'Elements with IDs will be updated, elements without IDs will be created. ' +
      'All changes happen in a single transaction.',
  })
  @ApiOkResponse({
    description: 'Elements successfully synchronized with provided list',
    type: ProjectElementDto,
    isArray: true,
  })
  @ApiNotFoundResponse({
    description: 'Project not found or element not found during update',
  })
  @ApiBadRequestResponse({
    description: 'Validation errors (missing fields, etc.)',
  })
  @ApiForbiddenResponse({
    description:
      'Invalid CSRF token or user not permitted (if enforced by guard)',
  })
  @ApiHeader({
    name: 'X-XSRF-TOKEN',
    description: 'CSRF token',
    required: true,
  })
  async dinsertElements(
    @Param('username') username: string,
    @Param('slug') slug: string,
    @Headers('X-XSRF-TOKEN') csrfToken: string,
    @Body() elements: ProjectElementDto[],
  ): Promise<ProjectElementDto[]> {
    this.logger.log(
      `dinsertElements -> username=${username} slug=${slug}, got CSRF=${csrfToken}`,
    );
    return this.elementService.bulkDinsertElements(username, slug, elements);
  }
}
