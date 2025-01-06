import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Request,
  Headers,
  HttpCode,
  HttpStatus,
  UseGuards,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiBadRequestResponse,
  ApiBody,
  ApiHeader,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { SessionAuthGuard } from '../auth/session-auth.guard.js'; // or your own guard
import { ProjectService } from './project.service.js';
import { ProjectDto } from './project.dto.js';
import { ProjectEntity } from './project.entity.js';

@ApiTags('Project API')
@ApiCookieAuth()
@Controller('api/v1/projects')
export class ProjectController {
  private readonly logger = new Logger(ProjectController.name);

  constructor(private readonly projectService: ProjectService) {}

  @Get()
  @UseGuards(SessionAuthGuard)
  @ApiOperation({
    summary: 'Get all projects for the current user',
    description:
      'Retrieves a list of all projects belonging to the authenticated user.',
  })
  @ApiOkResponse({
    description: 'Successfully retrieved the list of projects',
    type: [ProjectDto],
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing authentication',
  })
  async getAllProjects(@Request() req): Promise<ProjectDto[]> {
    // req.user.id is presumably set by SessionAuthGuard
    const projects = await this.projectService.findAllForCurrentUser(
      req.user.id,
    );
    return projects.map((proj) => new ProjectDto(proj));
  }

  @Get(':username/:slug')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({
    summary: 'Get project by username and slug',
    description:
      'Retrieves a specific project by its username and slug. Only accessible by the owner.',
  })
  @ApiOkResponse({
    description: 'Successfully retrieved the project',
    type: ProjectDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing authentication' })
  @ApiForbiddenResponse({
    description: 'User does not have permission to access this project',
  })
  @ApiNotFoundResponse({ description: 'Project not found' })
  async getProjectByUsernameAndSlug(
    @Param('username') username: string,
    @Param('slug') slug: string,
  ): Promise<ProjectDto> {
    const project = await this.projectService.findByUsernameAndSlug(
      username,
      slug,
    );
    return new ProjectDto(project);
  }

  @Post()
  @UseGuards(SessionAuthGuard)
  @ApiOperation({
    summary: 'Create a new project',
    description:
      'Creates a new project for the authenticated user. Requires a valid CSRF token.',
  })
  @ApiCreatedResponse({
    description: 'Project successfully created',
    type: ProjectDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid project data provided',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing authentication' })
  @ApiForbiddenResponse({ description: 'Invalid CSRF token' })
  @ApiBody({ type: ProjectDto })
  @ApiHeader({
    name: 'X-XSRF-TOKEN',
    description: 'CSRF token',
    required: true,
  })
  async createProject(
    @Request() req,
    @Body() projectData: ProjectDto,
    @Headers('X-XSRF-TOKEN') csrfToken: string,
  ): Promise<ProjectDto> {
    // In a real app, you'd validate the CSRF token with a guard or middleware
    if (!csrfToken) {
      throw new ForbiddenException('Missing CSRF token');
    }
    this.logger.log(`CSRF Token received: ${csrfToken}`);

    // Convert plain object to ProjectDto instance
    const projectDto = new ProjectDto();
    projectDto.title = projectData.title;
    projectDto.slug = projectData.slug;
    projectDto.description = projectData.description;

    const projectEntity: ProjectEntity = projectDto.toEntity();
    const created = await this.projectService.create(
      req.user.id,
      projectEntity,
    );
    return new ProjectDto(created);
  }

  @Put(':username/:slug')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({
    summary: 'Update an existing project',
    description:
      'Updates details of an existing project for the authenticated user. Requires CSRF.',
  })
  @ApiOkResponse({
    description: 'Project successfully updated',
    type: ProjectDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid project data provided' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing authentication' })
  @ApiForbiddenResponse({
    description:
      'Invalid CSRF token or user does not have permission to update this project',
  })
  @ApiNotFoundResponse({ description: 'Project not found' })
  @ApiBody({ type: ProjectDto })
  @ApiHeader({
    name: 'X-XSRF-TOKEN',
    description: 'CSRF token',
    required: true,
  })
  async updateProject(
    @Param('username') username: string,
    @Param('slug') slug: string,
    @Body() projectDto: ProjectDto,
    @Headers('X-XSRF-TOKEN') csrfToken: string,
  ): Promise<ProjectDto> {
    if (!csrfToken) {
      throw new ForbiddenException('Missing CSRF token');
    }
    this.logger.log(`CSRF Token received: ${csrfToken}`);
    const updated = await this.projectService.update(
      username,
      slug,
      projectDto.toEntity(),
    );
    return new ProjectDto(updated);
  }

  @Delete(':username/:slug')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a project',
    description:
      'Removes a project by username and slug for the authenticated user. Requires CSRF.',
  })
  @ApiNoContentResponse({ description: 'Project successfully deleted' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing authentication' })
  @ApiForbiddenResponse({
    description:
      'Invalid CSRF token or user does not have permission to delete this project',
  })
  @ApiNotFoundResponse({ description: 'Project not found' })
  @ApiHeader({
    name: 'X-XSRF-TOKEN',
    description: 'CSRF token',
    required: true,
  })
  async deleteProject(
    @Param('username') username: string,
    @Param('slug') slug: string,
    @Headers('X-XSRF-TOKEN') csrfToken: string,
  ): Promise<void> {
    if (!csrfToken) {
      throw new ForbiddenException('Missing CSRF token');
    }
    this.logger.log(`CSRF Token received: ${csrfToken}`);
    await this.projectService.delete(username, slug);
  }
}
