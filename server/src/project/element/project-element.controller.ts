import {
  Controller,
  Get,
  Param,
  UseGuards,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiNotFoundResponse,
  ApiOkResponse,
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

}
