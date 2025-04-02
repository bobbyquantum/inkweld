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
  BadRequestException,
  UploadedFile,
  UseInterceptors,
  Res,
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
  ApiConsumes,
} from '@nestjs/swagger';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { ProjectService } from './project.service.js';
import { ProjectDto } from './project.dto.js';
import { ProjectEntity } from './project.entity.js';
import { FileInterceptor } from '@nestjs/platform-express';
import * as fs from 'fs';
import * as path from 'path';
import * as fsPromises from 'fs/promises';
import sharp from 'sharp';

// Define MulterFile interface for Bun environment
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
    name: 'X-CSRF-TOKEN',
    description: 'CSRF token',
    required: true,
  })
  async createProject(
    @Request() req,
    @Body() projectData: ProjectDto,
    @Headers('X-CSRF-TOKEN') csrfToken: string,
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
    name: 'X-CSRF-TOKEN',
    description: 'CSRF token',
    required: true,
  })
  async updateProject(
    @Param('username') username: string,
    @Param('slug') slug: string,
    @Body() projectDto: ProjectDto,
  ): Promise<ProjectDto> {
    this.logger.log('Updating project', { username, slug, projectDto });
    const updated = await this.projectService.update(
      username,
      slug,
      projectDto as unknown as ProjectEntity,
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
    name: 'X-CSRF-TOKEN',
    description: 'CSRF token',
    required: true,
  })
  async deleteProject(
    @Param('username') username: string,
    @Param('slug') slug: string,
    @Headers('X-CSRF-TOKEN') csrfToken: string,
  ): Promise<void> {
    if (!csrfToken) {
      throw new ForbiddenException('Missing CSRF token');
    }
    this.logger.log(`CSRF Token received: ${csrfToken}`);
    await this.projectService.delete(username, slug);
  }

  @Post(':username/:slug/cover')
  @UseGuards(SessionAuthGuard)
  @UseInterceptors(FileInterceptor('cover'))
  @ApiOperation({
    summary: 'Upload project cover image',
    description: 'Uploads a cover image for a project. Must have a 1:1.6 aspect ratio and minimum width of 1000px.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        cover: {
          type: 'string',
          format: 'binary',
          description: 'Cover image file (will be converted to JPEG)',
        },
      },
    },
  })
  @ApiCreatedResponse({
    description: 'Cover image successfully uploaded',
  })
  @ApiBadRequestResponse({ description: 'Invalid file format, size, or dimensions' })
  async uploadCover(
    @Param('username') username: string,
    @Param('slug') slug: string,
    @UploadedFile() file: MulterFile,
    @Request() req,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Verify user has access to this project
    if (req.user.username !== username) {
      throw new ForbiddenException('Unauthorized to upload cover to this project');
    }

    try {
      // Process the image
      const imageMetadata = await sharp(file.buffer).metadata();

      // Check if image meets the minimum width requirement
      if (imageMetadata.width < 1000) {
        throw new BadRequestException('Image width must be at least 1000px');
      }

      // Calculate target dimensions for 1:1.6 aspect ratio (height is 1.6 times the width)
      const targetHeight = Math.round(imageMetadata.width * 1.6);

      // Determine crop settings if necessary
      let processedImage;

      if (Math.abs(imageMetadata.height / imageMetadata.width - 1.6) > 0.01) {
        // Aspect ratio is different from 1:1.6, crop it
        this.logger.log(`Cropping image from ${imageMetadata.width}x${imageMetadata.height} to ${imageMetadata.width}x${targetHeight}`);

        processedImage = await sharp(file.buffer)
          .resize(imageMetadata.width, targetHeight, {
            fit: 'cover',
            position: 'center',
          })
          .jpeg({ quality: 90 })
          .toBuffer();
      } else {
        // Aspect ratio is already close to 1:1.6, just convert to JPEG
        processedImage = await sharp(file.buffer)
          .jpeg({ quality: 90 })
          .toBuffer();
      }

      // Save the image
      await this.saveProjectCover(username, slug, processedImage);

      return {
        message: 'Cover image uploaded successfully',
      };
    } catch (error) {
      this.logger.error('Error uploading cover image', error);
      if (error instanceof Error) {
        throw new BadRequestException(error.message);
      } else {
        throw new BadRequestException('Failed to process cover image');
      }
    }
  }

  @Get(':username/:slug/cover')
  @ApiOperation({
    summary: 'Get project cover image',
    description: 'Retrieves a project\'s cover image as a JPEG file.',
  })
  @ApiOkResponse({
    description: 'Project cover image',
    content: {
      'image/jpeg': {},
    },
  })
  async getProjectCover(
    @Param('username') username: string,
    @Param('slug') slug: string,
    @Res() res,
  ) {
    try {
      const hasProjectCover = await this.hasProjectCover(username, slug);

      if (!hasProjectCover) {
        return res.status(404).send('Cover image not found');
      }

      const coverPath = this.getProjectCoverPath(username, slug);
      const coverStream = fs.createReadStream(coverPath);

      res.set({
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
      });

      return coverStream.pipe(res);
    } catch (error) {
      this.logger.error(`Error getting cover for ${username}/${slug}`, error);
      return res.status(404).send('Cover image not found');
    }
  }

  @Post(':username/:slug/cover/delete')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({
    summary: 'Delete project cover image',
    description: 'Deletes the cover image for a project.',
  })
  @ApiOkResponse({
    description: 'Cover image successfully deleted',
  })
  async deleteCover(
    @Param('username') username: string,
    @Param('slug') slug: string,
    @Request() req
  ) {
    // Verify user has access to this project
    if (req.user.username !== username) {
      throw new ForbiddenException('Unauthorized to delete cover from this project');
    }

    try {
      // Delete the cover
      await this.deleteProjectCover(username, slug);

      return {
        message: 'Cover image deleted successfully',
      };
    } catch (error) {
      this.logger.error('Error deleting cover image', error);
      throw new BadRequestException('Failed to delete cover image');
    }
  }

  // Helper methods for cover image handling

  private getProjectCoverPath(username: string, slug: string): string {
    const projectDir = path.join(process.env.DATA_PATH || './data', username, slug);
    return path.join(projectDir, 'cover.jpg');
  }

  private async hasProjectCover(username: string, slug: string): Promise<boolean> {
    const coverPath = this.getProjectCoverPath(username, slug);
    return fs.existsSync(coverPath);
  }

  private async saveProjectCover(username: string, slug: string, imageBuffer: Buffer): Promise<void> {
    // Create project directory if it doesn't exist
    const projectDir = path.join(process.env.DATA_PATH || './data', username, slug);
    if (!fs.existsSync(projectDir)) {
      await fsPromises.mkdir(projectDir, { recursive: true });
    }

    const coverPath = this.getProjectCoverPath(username, slug);

    // Write the file
    await fsPromises.writeFile(coverPath, imageBuffer);
  }

  private async deleteProjectCover(username: string, slug: string): Promise<void> {
    const coverPath = this.getProjectCoverPath(username, slug);

    if (fs.existsSync(coverPath)) {
      await fsPromises.unlink(coverPath);
    }
  }
}
