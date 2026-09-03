import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { extension, lookup } from 'mime-types';
import { config } from '../config/env';
import { BadRequestError } from '../errors';
import { logger } from './logger.service';

export class FileStorageService {
  private readonly basePath: string;

  constructor() {
    this.basePath = config.dataPath;
  }

  /**
   * Validate that a path component does not contain traversal sequences.
   * Throws if the component would escape the intended directory.
   */
  private validatePathComponent(component: string, label: string): void {
    if (
      !component ||
      component.includes('..') ||
      component.includes('/') ||
      component.includes('\\') ||
      component.includes('\0')
    ) {
      throw new BadRequestError(`Invalid ${label}: path traversal detected`);
    }
  }

  /**
   * Validate that a resolved path is within the expected base directory.
   */
  private ensureWithinBase(resolvedPath: string, basePath: string): void {
    const normalizedResolved = path.resolve(resolvedPath);
    const normalizedBase = path.resolve(basePath);
    if (
      !normalizedResolved.startsWith(normalizedBase + path.sep) &&
      normalizedResolved !== normalizedBase
    ) {
      throw new Error('Path traversal detected: resolved path escapes base directory');
    }
  }

  /**
   * Get the path for a user's project directory
   */
  getProjectPath(username: string, projectSlug: string): string {
    this.validatePathComponent(username, 'username');
    this.validatePathComponent(projectSlug, 'project slug');
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
    const projectPath = this.getProjectPath(username, projectSlug);
    const filePath = path.join(projectPath, filename);
    this.ensureWithinBase(filePath, projectPath);
    await fs.writeFile(filePath, data);
    return filePath;
  }

  /**
   * Read a file from a project directory
   */
  async readProjectFile(username: string, projectSlug: string, filename: string): Promise<Buffer> {
    const projectPath = this.getProjectPath(username, projectSlug);
    const filePath = path.join(projectPath, filename);
    this.ensureWithinBase(filePath, projectPath);
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
    const projectPath = this.getProjectPath(username, projectSlug);
    const filePath = path.join(projectPath, filename);
    this.ensureWithinBase(filePath, projectPath);
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
    const projectPath = this.getProjectPath(username, projectSlug);
    const filePath = path.join(projectPath, filename);
    this.ensureWithinBase(filePath, projectPath);
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
   * Compute the total on-disk size (in bytes) of a project directory,
   * including nested subdirectories such as the `.yjs` LevelDB store.
   *
   * Used to report the approximate size of a project's document/data storage
   * on the Bun/Node filesystem runtime. Returns 0 when the directory does not
   * exist yet.
   */
  async getProjectDirectorySize(username: string, projectSlug: string): Promise<number> {
    const projectPath = this.getProjectPath(username, projectSlug);
    let total = 0;

    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return; // Directory (or parent) doesn't exist yet
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.isFile()) {
          try {
            const stats = await fs.stat(full);
            total += stats.size;
          } catch {
            // Best-effort — skip unreadable files
          }
        }
      }
    };

    await walk(projectPath);
    return total;
  }

  /**
   * Rename a project directory (when project slug changes)
   */
  async renameProjectDirectory(username: string, oldSlug: string, newSlug: string): Promise<void> {
    const oldPath = this.getProjectPath(username, oldSlug);
    const newPath = this.getProjectPath(username, newSlug);

    // Check if old path exists
    try {
      await fs.access(oldPath);
    } catch {
      // Old directory doesn't exist, nothing to rename
      logger.info('FileStorage', `No directory to rename: ${oldPath}`);
      return;
    }

    // Check if new path already exists
    try {
      await fs.access(newPath);
      throw new Error(`Target directory already exists: ${newPath}`);
    } catch (error) {
      // Expected - new path shouldn't exist
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    // Rename the directory
    await fs.rename(oldPath, newPath);
    logger.info('FileStorage', `Renamed project directory: ${oldSlug} -> ${newSlug}`);
  }

  /**
   * Get user avatar path
   */
  getUserAvatarPath(username: string): string {
    this.validatePathComponent(username, 'username');
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

  // ───────────────────────────────────────────────────────────────────────────
  // Single-slot images (branding backgrounds, per-user backgrounds)
  //
  // Each of these is one replaceable file per key rather than a library, which
  // is why they get a flat directory instead of the project namespace. Unlike
  // avatars the format is not fixed to PNG: when sharp is unavailable (Workers,
  // or a failed native build) the upload is stored as-is, so the extension has
  // to record what was actually written and reads have to probe for it.
  // ───────────────────────────────────────────────────────────────────────────

  /** Image extensions a single-slot file may have been stored under. */
  private static readonly SLOT_EXTENSIONS = ['webp', 'jpg', 'jpeg', 'png', 'gif', 'avif'] as const;

  /**
   * Map a content type to the extension we store it under. Anything outside the
   * probe list is refused: a file stored under an extension reads never look for
   * would be orphaned, invisible to `getSlotImage` and `deleteSlotImage` alike.
   */
  private extensionForContentType(contentType: string): string {
    const ext = extension(contentType);
    if (
      typeof ext === 'string' &&
      (FileStorageService.SLOT_EXTENSIONS as readonly string[]).includes(ext)
    ) {
      return ext;
    }
    throw new BadRequestError(`Unsupported image content type: ${contentType}`);
  }

  private slotDir(namespace: 'branding' | 'backgrounds'): string {
    return path.join(this.basePath, namespace);
  }

  private slotPath(namespace: 'branding' | 'backgrounds', key: string, ext: string): string {
    this.validatePathComponent(key, 'slot key');
    const slotPath = path.join(this.slotDir(namespace), `${key}.${ext}`);
    this.ensureWithinBase(slotPath, this.slotDir(namespace));
    return slotPath;
  }

  /**
   * Write a single-slot image, removing any previously stored variant so a
   * format change (png → webp) does not leave two files fighting to be found.
   */
  async saveSlotImage(
    namespace: 'branding' | 'backgrounds',
    key: string,
    data: Buffer,
    contentType: string
  ): Promise<void> {
    const ext = this.extensionForContentType(contentType);
    await fs.mkdir(this.slotDir(namespace), { recursive: true });
    await this.deleteSlotImage(namespace, key);
    await fs.writeFile(this.slotPath(namespace, key, ext), data);
  }

  /**
   * Read a single-slot image, probing the known extensions. Returns null when
   * nothing is stored for the key.
   */
  async getSlotImage(
    namespace: 'branding' | 'backgrounds',
    key: string
  ): Promise<{ data: Buffer; contentType: string } | null> {
    for (const ext of FileStorageService.SLOT_EXTENSIONS) {
      const slotPath = this.slotPath(namespace, key, ext);
      try {
        const data = await fs.readFile(slotPath);
        const mimeType = lookup(slotPath);
        return {
          data,
          contentType: typeof mimeType === 'string' ? mimeType : 'application/octet-stream',
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
    }
    return null;
  }

  async hasSlotImage(namespace: 'branding' | 'backgrounds', key: string): Promise<boolean> {
    for (const ext of FileStorageService.SLOT_EXTENSIONS) {
      try {
        await fs.access(this.slotPath(namespace, key, ext));
        return true;
      } catch {
        // Try the next extension.
      }
    }
    return false;
  }

  /** Delete every stored variant for a slot. Missing files are not an error. */
  async deleteSlotImage(namespace: 'branding' | 'backgrounds', key: string): Promise<void> {
    for (const ext of FileStorageService.SLOT_EXTENSIONS) {
      try {
        await fs.unlink(this.slotPath(namespace, key, ext));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
    }
  }
}

// Create singleton instance
export const fileStorageService = new FileStorageService();
