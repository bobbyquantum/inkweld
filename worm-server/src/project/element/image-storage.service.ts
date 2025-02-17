import { Injectable } from '@nestjs/common';
import * as path from 'path';
import * as fsPromises from 'fs/promises';
import * as fsSync from 'fs';

@Injectable()
export class ImageStorageService {
  private readonly dataDir = path.resolve(process.env.Y_DATA_PATH || './data');

  async saveImage(userId: string, projectSlug: string, elementId: string, file: Buffer, filename: string): Promise<void> {
    const projectDir = path.join(this.dataDir, 'projects', userId, projectSlug, 'images');
    await fsPromises.mkdir(projectDir, { recursive: true });
    const filePath = path.join(projectDir, `${elementId}${path.extname(filename)}`);
    await fsPromises.writeFile(filePath, file);
  }

  async readImage(userId: string, projectSlug: string, elementId: string): Promise<NodeJS.ReadableStream> {
    const projectDir = path.join(this.dataDir, 'projects', userId, projectSlug, 'images');
    // TODO: Determine file extension and construct file path
    const filePath = path.join(projectDir, `${elementId}.<extension>`);
    return fsSync.createReadStream(filePath);
  }

  async deleteImage(userId: string, projectSlug: string, elementId: string): Promise<void> {
    const projectDir = path.join(this.dataDir, 'projects', userId, projectSlug, 'images');
    // TODO: Determine file extension and construct file path
    const filePath = path.join(projectDir, `${elementId}.<extension>`);
    await fsPromises.unlink(filePath);
  }
}
