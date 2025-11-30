import * as fs from 'fs/promises';
import * as path from 'path';
import { config } from '../config/env';

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
   * List files in a project directory
   */
  async listProjectFiles(username: string, projectSlug: string): Promise<string[]> {
    const projectPath = this.getProjectPath(username, projectSlug);
    try {
      return await fs.readdir(projectPath);
    } catch {
      return [];
    }
  }

  /**
   * Delete an entire project directory
   */
  async deleteProjectDirectory(username: string, projectSlug: string): Promise<void> {
    const projectPath = this.getProjectPath(username, projectSlug);
    try {
      await fs.rm(projectPath, { recursive: true, force: true });
    } catch (error) {
      console.error('Error deleting project directory:', error);
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
}

// Create singleton instance
export const fileStorageService = new FileStorageService();
