import { Injectable } from '@nestjs/common';
import * as path from 'path';
import * as fsPromises from 'fs/promises';
import * as fsSync from 'fs';

@Injectable()
export class ImageStorageService {
  private readonly dataDir = path.resolve(process.env.Y_DATA_PATH || './data');

  async saveImage(userId: string, projectSlug: string, elementId: string, file: Buffer, filename: string): Promise<string> {
    const projectDir = path.join(this.dataDir, 'projects', userId, projectSlug, 'images');
    await fsPromises.mkdir(projectDir, { recursive: true });
    const finalFilename = `${elementId}-${Date.now()}${path.extname(filename)}`;
    const filePath = path.join(projectDir, finalFilename);

    try {
      await fsPromises.writeFile(filePath, file);
      return finalFilename;
    } catch (error) {
      throw new Error(`Failed to save image: ${error.message}`);
    }
  }

  async readImage(userId: string, projectSlug: string, filename: string): Promise<NodeJS.ReadableStream> {
    const projectDir = path.join(this.dataDir, 'projects', userId, projectSlug, 'images');
    return fsSync.createReadStream(path.join(projectDir, filename));
  }

  async deleteImage(userId: string, projectSlug: string, filename: string): Promise<void> {
    const projectDir = path.join(this.dataDir, 'projects', userId, projectSlug, 'images');
    await fsPromises.unlink(path.join(projectDir, filename));
  }

  getProjectImageDir(userId: string, projectSlug: string): string {
    return path.join(this.dataDir, 'projects', userId, projectSlug, 'images');
  }
}
