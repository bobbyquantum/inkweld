import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fsPromises from 'fs/promises';
import * as fsSync from 'fs';
import * as crypto from 'crypto';

export interface FileMetadata {
  originalName: string;
  storedName: string;
  contentType: string;
  size: number;
  uploadDate: Date;
}

@Injectable()
export class FileStorageService {
  private readonly logger = new Logger(FileStorageService.name);
  private readonly dataDir = path.resolve(process.env.DATA_PATH || './data');

  async saveFile(
    userId: string,
    projectSlug: string,
    file: Buffer,
    filename: string,
  ): Promise<FileMetadata> {
    this.logger.log(
      `Starting saveFile for user ${userId}, project ${projectSlug}, file size: ${file.byteLength} bytes`,
    );

    const projectDir = path.join(this.dataDir, userId, projectSlug, 'files');
    this.logger.log(`Creating directory: ${projectDir}`);
    await fsPromises.mkdir(projectDir, { recursive: true });

    // Generate a unique filename based on hash and timestamp
    const hash = crypto
      .createHash('md5')
      .update(file)
      .digest('hex')
      .substring(0, 8);
    const storedName = `${hash}-${Date.now()}${path.extname(filename)}`;
    const filePath = path.join(projectDir, storedName);

    this.logger.log(`Writing file to: ${filePath}`);

    try {
      await fsPromises.writeFile(filePath, file);
      this.logger.log(`Successfully saved file to ${filePath}`);

      const metadata: FileMetadata = {
        originalName: filename,
        storedName: storedName,
        contentType: path.extname(filename).slice(1),
        size: file.byteLength,
        uploadDate: new Date(),
      };

      return metadata;
    } catch (error: any) {
      this.logger.error(`Error saving file: ${error.message}`, error.stack);
      throw new Error(`Failed to save file: ${error.message}`);
    }
  }

  async readFile(
    userId: string,
    projectSlug: string,
    storedName: string,
  ): Promise<NodeJS.ReadableStream> {
    this.logger.log(
      `Reading file: ${storedName} for user ${userId}, project ${projectSlug}`,
    );
    const projectDir = path.join(this.dataDir, userId, projectSlug, 'files');
    const filePath = path.join(projectDir, storedName);
    this.logger.log(`Creating read stream for: ${filePath}`);

    // Check if file exists first to avoid hanging
    if (!fsSync.existsSync(filePath)) {
      this.logger.error(`File not found: ${filePath}`);
      throw new Error(`File not found: ${storedName}`);
    }

    return fsSync.createReadStream(filePath);
  }

  async deleteFile(
    userId: string,
    projectSlug: string,
    storedName: string,
  ): Promise<void> {
    this.logger.log(
      `Deleting file: ${storedName} for user ${userId}, project ${projectSlug}`,
    );
    const projectDir = path.join(this.dataDir, userId, projectSlug, 'files');
    const filePath = path.join(projectDir, storedName);

    if (!fsSync.existsSync(filePath)) {
      this.logger.error(`File not found during deletion: ${filePath}`);
      throw new Error(`File not found: ${storedName}`);
    }

    await fsPromises.unlink(filePath);
    this.logger.log(`Successfully deleted file: ${storedName}`);
  }

  async listFiles(
    userId: string,
    projectSlug: string,
  ): Promise<FileMetadata[]> {
    this.logger.log(`Listing files for user ${userId}, project ${projectSlug}`);
    const projectDir = path.join(this.dataDir, userId, projectSlug, 'files');

    try {
      // Create directory if it doesn't exist
      await fsPromises.mkdir(projectDir, { recursive: true });

      // Get all files in the directory
      const files = await fsPromises.readdir(projectDir);
      const fileStats = await Promise.all(
        files.map(async (file) => {
          const filePath = path.join(projectDir, file);
          const stats = await fsPromises.stat(filePath);

          return {
            originalName: file.substring(file.indexOf('-') + 1), // Attempt to extract original name
            storedName: file,
            contentType: path.extname(file).slice(1),
            size: stats.size,
            uploadDate: stats.mtime,
          };
        }),
      );

      return fileStats;
    } catch (error: any) {
      this.logger.error(`Error listing files: ${error.message}`, error.stack);
      throw new Error(`Failed to list files: ${error.message}`);
    }
  }

  getProjectFileDir(userId: string, projectSlug: string): string {
    const projectDir = path.join(this.dataDir, userId, projectSlug, 'files');
    this.logger.debug(`Project file directory: ${projectDir}`);
    return projectDir;
  }
}
