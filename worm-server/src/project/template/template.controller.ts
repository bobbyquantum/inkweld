import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  NotFoundException,
  ConflictException,
  BadRequestException
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SessionAuthGuard } from '../../auth/session-auth.guard.js';
import { UserEntity } from '../../user/user.entity.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { TemplateService } from './template.service.js';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  TemplateDto
} from './template.dto.js';

@ApiTags('templates')
@Controller('templates')
@UseGuards(SessionAuthGuard)
@ApiBearerAuth()
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new template' })
  @ApiResponse({ status: 201, description: 'Template created successfully', type: TemplateDto })
  @ApiResponse({ status: 400, description: 'Invalid template data' })
  @ApiResponse({ status: 409, description: 'Template with same name already exists' })
  async create(
    @CurrentUser() user: UserEntity,
    @Body() dto: CreateTemplateDto
  ): Promise<TemplateDto> {
    try {
      const template = await this.templateService.create(user.id, dto);
      return template;
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      throw new BadRequestException(error.message);
    }
  }

  @Get()
  @ApiOperation({ summary: 'List templates' })
  @ApiResponse({ status: 200, description: 'List of templates', type: [TemplateDto] })
  async findAll(
    @CurrentUser() user: UserEntity,
    @Query('isPublic') isPublic?: boolean,
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('tags') tags?: string[]
  ): Promise<TemplateDto[]> {
    return this.templateService.findAll({
      userId: user.id,
      isPublic,
      category,
      search,
      tags
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a template by ID' })
  @ApiResponse({ status: 200, description: 'Template found', type: TemplateDto })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async findOne(@Param('id') id: string): Promise<TemplateDto> {
    try {
      return await this.templateService.findById(id);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(error.message);
    }
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a template' })
  @ApiResponse({ status: 200, description: 'Template updated successfully', type: TemplateDto })
  @ApiResponse({ status: 400, description: 'Invalid template data' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  @ApiResponse({ status: 409, description: 'Template with same name already exists' })
  async update(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto
  ): Promise<TemplateDto> {
    try {
      return await this.templateService.update(id, user.id, dto);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ConflictException) {
        throw error;
      }
      throw new BadRequestException(error.message);
    }
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a template' })
  @ApiResponse({ status: 200, description: 'Template deleted successfully' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  @ApiResponse({ status: 409, description: 'Template cannot be deleted due to dependencies' })
  async delete(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string
  ): Promise<void> {
    try {
      await this.templateService.delete(id, user.id);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ConflictException) {
        throw error;
      }
      throw new BadRequestException(error.message);
    }
  }

  @Post(':id/version')
  @ApiOperation({ summary: 'Create a new version of a template' })
  @ApiResponse({ status: 201, description: 'New version created successfully', type: TemplateDto })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async createVersion(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string
  ): Promise<TemplateDto> {
    try {
      return await this.templateService.createVersion(id, user.id);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(error.message);
    }
  }

  @Get('public')
  @ApiOperation({ summary: 'List public templates' })
  @ApiResponse({ status: 200, description: 'List of public templates', type: [TemplateDto] })
  async findPublic(
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('tags') tags?: string[]
  ): Promise<TemplateDto[]> {
    return this.templateService.findAll({
      isPublic: true,
      category,
      search,
      tags
    });
  }
}
