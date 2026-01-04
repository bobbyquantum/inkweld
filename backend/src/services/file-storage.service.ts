import * as fs from 'fs/promises';
import * as path from 'path';
import { lookup } from 'mime-types';
import { config } from '../config/env';
import { logger } from './logger.service';

export class FileStorageService {
  private basePath: string;

  constructor() {
    this.basePath = config.dataPath;
  }

  /**
   * Get the path for a user's project directory
   */
  getProjectPath(username: string, projectSlug: string): string {
    return path.join(this.basePath, username, projectSlug);
  }

  /**
   * Ensure a project directory exists
   */
  async ensureProjectDirectory(username: string, projectSlug: string): Promise<void> {
    const projectPath = this.getProjectPath(username, projectSlug);
    await fs.mkdir(projectPath, { recursive: true });
  }

  /**
   * Save a file to a project directory
   */
  async saveProjectFile(
    username: string,
    projectSlug: string,
    filename: string,
    data: Buffer | string
  ): Promise<string> {
    await this.ensureProjectDirectory(username, projectSlug);
    const filePath = path.join(this.getProjectPath(username, projectSlug), filename);
    await fs.writeFile(filePath, data);
    return filePath;
  }

  /**
   * Read a file from a project directory
   */
  async readProjectFile(username: string, projectSlug: string, filename: string): Promise<Buffer> {
    const filePath = path.join(this.getProjectPath(username, projectSlug), filename);
    return await fs.readFile(filePath);
  }

  /**
   * Check if a file exists in a project directory
   */
  async projectFileExists(
    username: string,
    projectSlug: string,
    filename: string
  ): Promise<boolean> {
    const filePath = path.join(this.getProjectPath(username, projectSlug), filename);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete a file from a project directory
   */
  async deleteProjectFile(username: string, projectSlug: string, filename: string): Promise<void> {
    const filePath = path.join(this.getProjectPath(username, projectSlug), filename);
    await fs.unlink(filePath);
  }

  /**
   * Delete an entire project directory
   */
  async deleteProjectDirectory(username: string, projectSlug: string): Promise<void> {
    const projectPath = this.getProjectPath(username, projectSlug);
    try {
      await fs.rm(projectPath, { recursive: true, force: true });
    } catch (error) {
      logger.error('FileStorage', 'Error deleting project directory', error);
    }
  }

  /**
   * Get user avatar path
   */
  getUserAvatarPath(username: string): string {
    return path.join(this.basePath, 'avatars', `${username}.png`);
  }

  /**
   * Save user avatar
   */
  async saveUserAvatar(username: string, data: Buffer): Promise<void> {
    const avatarDir = path.join(this.basePath, 'avatars');
    await fs.mkdir(avatarDir, { recursive: true });
    const avatarPath = this.getUserAvatarPath(username);
    await fs.writeFile(avatarPath, data);
  }

  /**
   * Get user avatar
   */
  async getUserAvatar(username: string): Promise<Buffer> {
    const avatarPath = this.getUserAvatarPath(username);
    return await fs.readFile(avatarPath);
  }

  /**
   * Check if user has avatar
   */
  async hasUserAvatar(username: string): Promise<boolean> {
    const avatarPath = this.getUserAvatarPath(username);
    try {
      await fs.access(avatarPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete user avatar
   */
  async deleteUserAvatar(username: string): Promise<void> {
    const avatarPath = this.getUserAvatarPath(username);
    await fs.unlink(avatarPath);
  }

  /**
   * List all files in a project directory
   * @param username - Project owner username
   * @param projectSlug - Project slug
   * @param prefix - Optional prefix to filter files (e.g., 'media/' for only media files)
   * @returns Array of file info objects
   */
  async listProjectFiles(
    username: string,
    projectSlug: string,
    prefix?: string
  ): Promise<Array<{ filename: string; size: number; mimeType?: string; uploadedAt?: Date }>> {
    const projectPath = this.getProjectPath(username, projectSlug);
    const results: Array<{ filename: string; size: number; mimeType?: string; uploadedAt?: Date }> =
      [];

    try {
      const entries = await fs.readdir(projectPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile()) {
          // Skip non-media files and internal files
          if (entry.name.startsWith('.') || entry.name.endsWith('.level')) {
            continue;
          }

          // Apply prefix filter if provided
          if (prefix && !entry.name.startsWith(prefix)) {
            continue;
          }

          const filePath = path.join(projectPath, entry.name);
          const stats = await fs.stat(filePath);

          // Determine mime type from extension
          const mimeType = lookup(entry.name) || undefined;

          results.push({
            filename: entry.name,
            size: stats.size,
            mimeType: typeof mimeType === 'string' ? mimeType : undefined,
            uploadedAt: stats.mtime,
          });
        }
      }
    } catch {
      // Directory might not exist yet, return empty array
      return [];
    }

    return results;
  }
}

// Create singleton instance
export const fileStorageService = new FileStorageService();
