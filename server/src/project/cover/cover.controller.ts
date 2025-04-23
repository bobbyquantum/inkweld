import {
  Controller,
  Get,
  Post,
  Param,
  Request,
  Logger,
  ForbiddenException,
  BadRequestException,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  Res,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
} from '@nestjs/swagger';
import { SessionAuthGuard } from '../../auth/session-auth.guard.js';
import { ProjectService } from '../project.service.js'; // Assuming ProjectService might be needed for validation
import { FileInterceptor } from '@nestjs/platform-express';
import sharp from 'sharp';
import { STORAGE_SERVICE } from '../../common/storage/storage.interface.js';
import type { StorageService } from '../../common/storage/storage.interface.js';
import { Inject } from '@nestjs/common';

// Define MulterFile interface (copied from project.controller)
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

@ApiTags('Project Cover API')
@Controller('api/v1/projects/:username/:slug/cover') // Base path for cover operations
export class CoverController {
  private readonly logger = new Logger(CoverController.name);

  // Inject ProjectService if needed for checks like project existence or ownership
  constructor(
    private readonly projectService: ProjectService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  @Post()
  @UseGuards(SessionAuthGuard)
  @UseInterceptors(FileInterceptor('coverImage'))
  @ApiOperation({
    summary: 'Upload or replace project cover image',
    description:
      'Uploads a cover image for a specific project. Replaces existing cover. Image will be processed to fit 1:1.6 aspect ratio.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Cover image file (JPEG, PNG, WebP, GIF supported)',
    schema: {
      type: 'object',
      properties: {
        coverImage: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Cover image uploaded successfully',
  })
  @ApiBadRequestResponse({ description: 'Invalid file type or processing error' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing authentication' })
  @ApiForbiddenResponse({
    description: 'User does not have permission to modify this project',
  })
  async uploadCover(
    @Param('username') username: string,
    @Param('slug') slug: string,
    @UploadedFile() file: MulterFile,
    @Request() req,
  ) {
    // Verify user has access to this project
    if (req.user.username !== username) {
      throw new ForbiddenException('Unauthorized to add cover to this project');
    }

    // Basic file validation
    if (!file) {
      throw new BadRequestException('No file uploaded.');
    }

    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
    ];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed.',
      );
    }

    if (!file.buffer) {
        throw new BadRequestException('Uploaded file buffer is missing.');
    }

    // Verify project exists (optional but good practice)
    try {
        await this.projectService.findByUsernameAndSlug(username, slug);
    } catch (_error) {
        this.logger.warn(`Attempt to upload cover for non-existent project: ${username}/${slug}`);
        throw new NotFoundException('Project not found');
    }

    try {
      // Process the image using sharp
      let processedImage: Buffer;
      const targetAspectRatio = 1 / 1.6; // Width / Height

      const imageMetadata = await sharp(file.buffer).metadata();

      if (!imageMetadata.width || !imageMetadata.height) {
          throw new BadRequestException('Could not read image dimensions.');
      }

      const currentAspectRatio = imageMetadata.width / imageMetadata.height;

      // Check if resizing is needed to meet the aspect ratio
      if (Math.abs(currentAspectRatio - targetAspectRatio) > 0.01) {
        // Aspect ratio needs adjustment - crop to fit
        const targetWidth = imageMetadata.width;
        const targetHeight = Math.round(targetWidth / targetAspectRatio);

        // Determine if we need to crop vertically or horizontally based on excess
        // This example simply crops height; more sophisticated cropping might be desired
        // We aim for width: 1, height: 1.6
        // If current height is too tall (currentAspectRatio < target), crop height
        // If current height is too short (currentAspectRatio > target), conceptually would need to add padding or crop width.
        // Let's resize based on width and let sharp handle the height crop/fit.

        processedImage = await sharp(file.buffer)
          .resize(targetWidth, targetHeight, {
            fit: 'cover', // Crops to fill the dimensions
            position: 'center', // Crop from the center
          })
          .jpeg({ quality: 90 }) // Convert to JPEG
          .toBuffer();
      } else {
        // Aspect ratio is already close enough, just ensure it's JPEG
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
      this.logger.error(`Error uploading cover image for ${username}/${slug}`, error);
      if (error instanceof BadRequestException || error instanceof ForbiddenException) {
        throw error; // Rethrow specific HTTP exceptions
      }
      throw new BadRequestException('Failed to process or save cover image.');
    }
  }

  @Get()
  @ApiOperation({
    summary: 'Get project cover image',
    description: "Retrieves a project's cover image as a JPEG file.",
  })
  @ApiOkResponse({
    description: 'Project cover image',
    content: {
      'image/jpeg': {},
    },
  })
  @ApiNotFoundResponse({
    description: 'Cover image or project not found',
  })
  async getProjectCover(
    @Param('username') username: string,
    @Param('slug') slug: string,
    @Res() res,
  ) {
    try {
      const hasCover = await this.hasProjectCover(username, slug);
      if (!hasCover) {
        await this.projectService.findByUsernameAndSlug(username, slug);
        throw new NotFoundException('Cover image not found for this project.');
      }
      const buffer = await this.getCoverBuffer(username, slug);
      res.set({
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      });
      return res.send(buffer);
    } catch (error) {
      this.logger.error(`Error getting cover for ${username}/${slug}`, error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Internal server error retrieving cover.');
    }
  }

  @Post('delete') // Changed path to avoid conflict with POST '/' for upload
  @UseGuards(SessionAuthGuard)
  @ApiOperation({
    summary: 'Delete project cover image',
    description: 'Deletes the cover image for a project.',
  })
  @ApiOkResponse({
    description: 'Cover image successfully deleted',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing authentication' })
  @ApiForbiddenResponse({
    description: 'User does not have permission to delete this cover',
  })
  @ApiNotFoundResponse({ description: 'Project or cover not found' })
  async deleteCover(
    @Param('username') username: string,
    @Param('slug') slug: string,
    @Request() req,
  ) {
    // Verify user has access to this project
    if (req.user.username !== username) {
      throw new ForbiddenException(
        'Unauthorized to delete cover from this project',
      );
    }

    // Verify project exists before attempting delete
    try {
        await this.projectService.findByUsernameAndSlug(username, slug);
    } catch (_error) {
        this.logger.warn(`Attempt to delete cover for non-existent project: ${username}/${slug}`);
        throw new NotFoundException('Project not found');
    }

    try {
      // Check if cover exists before attempting delete
      const hasCover = await this.hasProjectCover(username, slug);
      if (!hasCover) {
          return { message: 'No cover image to delete.' }; // Or throw 404 if preferred
      }

      // Delete the cover
      await this.deleteProjectCoverInternal(username, slug);
      
      // Regenerate a default cover
      const project = await this.projectService.findByUsernameAndSlug(username, slug);
      await this.generateDefaultCover(username, slug, project.title);

      return {
        message: 'Cover image deleted successfully',
      };
    } catch (error) {
      this.logger.error(`Error deleting cover image for ${username}/${slug}`, error);
      throw new BadRequestException('Failed to delete cover image.');
    }
  }
  
  async generateDefaultCover(username: string, slug: string, title: string): Promise<void> {
    try {
      this.logger.log(`Generating default cover for ${username}/${slug}`);
      const width = 300;
      const height = 480; // 1:1.6 aspect ratio

      // Simple SVG with background color and centered text
      // Use a simple color generation based on username/slug hash for variety
      const hash = username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) +
                   slug.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const hue = hash % 360;
      const backgroundColor = `hsl(${hue}, 50%, 80%)`; // Light pastel colors
      const textColor = `hsl(${hue}, 50%, 30%)`; // Darker text color

      // Prepare title for SVG with text wrapping
      // Split the title into words and create wrapped lines
      const words = title.split(' ');
      const lines = [];
      let currentLine = '';
      const maxCharsPerLine = 15; // Adjust based on font size and width
      
      words.forEach(word => {
        // If adding this word would exceed the line length, start a new line
        if ((currentLine + ' ' + word).length > maxCharsPerLine && currentLine !== '') {
          lines.push(currentLine);
          currentLine = word;
        } else {
          // Add to current line with a space if not the first word on the line
          currentLine = currentLine === '' ? word : currentLine + ' ' + word;
        }
      });
      
      // Add the last line if it has content
      if (currentLine !== '') {
        lines.push(currentLine);
      }

      // Create SVG with wrapped text and margin
      const margin = 20; // Add margin around content
      let svgContent = `
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <rect width="100%" height="100%" fill="${backgroundColor}"/>
          <rect x="${margin}" y="${margin}" width="${width - 2 * margin}" height="${height - 2 * margin}" 
                fill="${backgroundColor}" stroke="${textColor}" stroke-width="2" stroke-opacity="0.3"/>
      `;
      
      // Add each line of the title
      const fontSize = 40;
      const lineHeight = fontSize * 1.2;
      const startY = 120; // Starting Y position for the first line
      
      lines.forEach((line, index) => {
        svgContent += `
          <text x="50%" y="${startY + index * lineHeight}" dominant-baseline="middle" text-anchor="middle"
                font-family="sans-serif" font-size="${fontSize}" fill="${textColor}">
            ${line}
          </text>
        `;
      });
      
      // Add the username at the bottom
      svgContent += `
          <text x="50%" y="${height - 20}" dominant-baseline="middle" text-anchor="middle"
                font-family="sans-serif" font-size="20" fill="${textColor}">
            by ${username}
          </text>
        </svg>
      `;
      
      const svg = svgContent;

      const pngBuffer = await sharp(Buffer.from(svg))
        .png() // Using PNG initially, then converting to JPEG for storage
        .toBuffer();

      const jpegBuffer = await sharp(pngBuffer)
        .jpeg({ quality: 85 })
        .toBuffer();

      await this.saveProjectCover(username, slug, jpegBuffer);
      this.logger.log(`Successfully generated and saved default cover for ${username}/${slug}`);
    } catch (error) {
      this.logger.error(`Failed to generate default cover for ${username}/${slug}`, error);
      // Decide if this failure should prevent project creation or just log an error
      // For now, just logging.
    }
  }

  private coverKey(username: string, slug: string): string {
    return `${username}/${slug}/cover.jpg`;
  }

  private async hasProjectCover(username: string, slug: string): Promise<boolean> {
    return this.storage.exists(this.coverKey(username, slug));
  }

  private async saveProjectCover(username: string, slug: string, imageBuffer: Buffer): Promise<void> {
    await this.storage.put(this.coverKey(username, slug), imageBuffer, { contentType: 'image/jpeg' });
  }

  private async deleteProjectCoverInternal(username: string, slug: string): Promise<void> {
    await this.storage.delete(this.coverKey(username, slug));
  }

  private async getCoverBuffer(username: string, slug: string): Promise<Buffer> {
    return this.storage.get(this.coverKey(username, slug));
  }
}
