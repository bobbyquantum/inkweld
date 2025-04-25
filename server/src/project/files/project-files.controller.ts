import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UploadedFile,
  UseInterceptors,
  Res,
  HttpStatus,
  UseGuards,
  Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FileStorageService } from './file-storage.service.js';
import {
  FileMetadataDto,
  FileUploadResponseDto,
  FileDeleteResponseDto,
} from './file.dto.js';
import { SessionAuthGuard } from '../../auth/session-auth.guard.js';
import {
  ApiTags,
  ApiConsumes,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiHeader,
} from '@nestjs/swagger';

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
@Controller('api/v1/projects/:username/:projectSlug/files')
@UseGuards(SessionAuthGuard)
export class ProjectFilesController {
  constructor(private readonly fileStorageService: FileStorageService) {}

  @Post()
  @ApiOperation({ summary: 'Upload a file to project' })
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
  @ApiResponse({
    status: 201,
    description: 'File uploaded successfully',
    type: FileUploadResponseDto,
  })
  @ApiHeader({
    name: 'X-CSRF-TOKEN',
    description: 'CSRF token',
    required: true,
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @Param('username') username: string,
    @Param('projectSlug') projectSlug: string,
    @UploadedFile() file: MulterFile,
    @Request() req,
  ): Promise<FileUploadResponseDto> {
    // Verify user has access to this project
    const currentUser = req.user;
    if (currentUser.username !== username) {
      throw new Error('Unauthorized to upload files to this project');
    }

    const fileMetadata = await this.fileStorageService.saveFile(
      username,
      projectSlug,
      file.buffer,
      file.originalname,
    );

    // Create full response with URL
    const response: FileUploadResponseDto = {
      ...fileMetadata,
      fileUrl: `/api/v1/projects/${username}/${projectSlug}/files/${fileMetadata.storedName}`,
    };

    return response;
  }

  @Get()
  @ApiOperation({ summary: 'List all files in a project' })
  @ApiResponse({
    status: 200,
    description: 'List of files in the project',
    type: [FileMetadataDto],
  })
  async listFiles(
    @Param('username') username: string,
    @Param('projectSlug') projectSlug: string,
    @Request() req,
  ): Promise<FileMetadataDto[]> {
    // Verify user has access to this project
    const currentUser = req.user;
    if (currentUser.username !== username) {
      throw new Error('Unauthorized to list files for this project');
    }

    return await this.fileStorageService.listFiles(username, projectSlug);
  }

  @Get(':storedName')
  @ApiOperation({ summary: 'Download a file from project' })
  @ApiResponse({
    status: 200,
    description: 'File stream',
  })
  async getFile(
    @Param('username') username: string,
    @Param('projectSlug') projectSlug: string,
    @Param('storedName') storedName: string,
    @Res() res,
    @Request() req,
  ) {
    // Verify user has access to this project
    const currentUser = req.user;
    if (currentUser.username !== username) {
      throw new Error('Unauthorized to download files from this project');
    }

    try {
      const fileStream = await this.fileStorageService.readFile(
        username,
        projectSlug,
        storedName,
      );

      // Determine content type based on file extension
      const ext = storedName.split('.').pop().toLowerCase();
      let contentType = 'application/octet-stream'; // Default

      // Set common MIME types
      const mimeTypes = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        svg: 'image/svg+xml',
        pdf: 'application/pdf',
        json: 'application/json',
        txt: 'text/plain',
        html: 'text/html',
        css: 'text/css',
        js: 'application/javascript',
      };

      if (ext in mimeTypes) {
        contentType = mimeTypes[ext];
      }

      res.set({
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${storedName}"`,
      });

      fileStream.pipe(res);
    } catch (error: any) {
      res.status(HttpStatus.NOT_FOUND).json({
        message: error.message,
      });
    }
  }

  @Delete(':storedName')
  @ApiOperation({ summary: 'Delete a file from project' })
  @ApiResponse({
    status: 200,
    description: 'File deleted successfully',
    type: FileDeleteResponseDto,
  })
  @ApiHeader({
    name: 'X-CSRF-TOKEN',
    description: 'CSRF token',
    required: true,
  })
  async deleteFile(
    @Param('username') username: string,
    @Param('projectSlug') projectSlug: string,
    @Param('storedName') storedName: string,
    @Request() req,
  ): Promise<FileDeleteResponseDto> {
    // Verify user has access to this project
    const currentUser = req.user;
    if (currentUser.username !== username) {
      throw new Error('Unauthorized to delete files from this project');
    }

    await this.fileStorageService.deleteFile(username, projectSlug, storedName);

    return { message: 'File deleted successfully' };
  }
}
