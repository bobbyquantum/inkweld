import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fsPromises from 'fs/promises';
import * as fsSync from 'fs';

@Injectable()
export class ImageStorageService {
  private readonly logger = new Logger(ImageStorageService.name);
  private readonly dataDir = path.resolve(process.env.DATA_PATH || './data');

  async saveImage(userId: string, projectSlug: string, elementId: string, file: Buffer, filename: string): Promise<string> {
    this.logger.log(`Starting saveImage for user ${userId}, project ${projectSlug}, element ${elementId}, file size: ${file.byteLength} bytes`);
    const projectDir = path.join(this.dataDir, userId, projectSlug, 'images');
    this.logger.log(`Creating directory: ${projectDir}`);
    await fsPromises.mkdir(projectDir, { recursive: true });

    const finalFilename = `${elementId}-${Date.now()}${path.extname(filename)}`;
    const filePath = path.join(projectDir, finalFilename);
    this.logger.log(`Writing file to: ${filePath}`);

    try {
      await fsPromises.writeFile(filePath, file);
      this.logger.log(`Successfully saved image to ${filePath}`);
      return finalFilename;
    } catch (error) {
      this.logger.error(`Error saving image: ${error.message}`, error.stack);
      throw new Error(`Failed to save image: ${error.message}`);
    }
  }

  async readImage(userId: string, projectSlug: string, filename: string): Promise<NodeJS.ReadableStream> {
    this.logger.log(`Reading image: ${filename} for user ${userId}, project ${projectSlug}`);
    const projectDir = path.join(this.dataDir, userId, projectSlug, 'images');
    const filePath = path.join(projectDir, filename);
    this.logger.log(`Creating read stream for: ${filePath}`);

    // Check if file exists first to avoid hanging
    if (!fsSync.existsSync(filePath)) {
      this.logger.error(`File not found: ${filePath}`);
      throw new Error(`Image file not found: ${filename}`);
    }

    return fsSync.createReadStream(filePath);
  }

  async deleteImage(userId: string, projectSlug: string, filename: string): Promise<void> {
    this.logger.log(`Deleting image: ${filename} for user ${userId}, project ${projectSlug}`);
    const projectDir = path.join(this.dataDir, 'projects', userId, projectSlug, 'images');
    await fsPromises.unlink(path.join(projectDir, filename));
  }

  getProjectImageDir(userId: string, projectSlug: string): string {
    const projectDir = path.join(this.dataDir, 'projects', userId, projectSlug, 'images');
    this.logger.debug(`Project image directory: ${projectDir}`);
    return projectDir;
  }
}
