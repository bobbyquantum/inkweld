import { Controller, Param, Post, UseGuards, Logger } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiParam,
} from '@nestjs/swagger';
import { SessionAuthGuard } from '../../auth/session-auth.guard.js';
import { SchemaService } from './schema.service.js';

@ApiTags('Schemas API')
@Controller('api/v1/projects/:username/:slug/schemas')
@UseGuards(SessionAuthGuard)
export class SchemasController {
  private readonly logger = new Logger(SchemasController.name);

  constructor(private readonly schemaService: SchemaService) {}

  @Post('initialize-defaults')
  @ApiOperation({
    summary: 'Initialize or reset project schemas to defaults',
    description:
      'Loads the default worldbuilding templates into the project schema library. ' +
      'This can be used to restore default templates or add them to existing projects.',
  })
  @ApiParam({ name: 'username', description: 'Project owner username' })
  @ApiParam({ name: 'slug', description: 'Project slug' })
  @ApiOkResponse({
    description: 'Default schemas successfully initialized',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        schemaCount: { type: 'number' },
      },
    },
  })
  async initializeDefaultSchemas(
    @Param('username') username: string,
    @Param('slug') slug: string,
  ): Promise<{ message: string; schemaCount: number }> {
    this.logger.log(
      `Initializing default schemas for project ${username}/${slug}`,
    );

    try {
      await this.schemaService.initializeProjectSchemasInDB(username, slug);

      const library = await this.schemaService.loadProjectSchemas(
        username,
        slug,
      );
      const schemaCount = library ? Object.keys(library.schemas).length : 0;

      this.logger.log(
        `Successfully initialized ${schemaCount} default schemas for ${username}/${slug}`,
      );

      return {
        message: 'Default templates loaded successfully',
        schemaCount,
      };
    } catch (error) {
      this.logger.error(
        `Failed to initialize schemas for ${username}/${slug}:`,
        error,
      );
      throw error;
    }
  }
}
