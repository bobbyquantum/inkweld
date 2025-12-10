import type { R2Bucket } from '@cloudflare/workers-types';
import { FileStorageService } from './file-storage.service';
import { R2StorageService } from './r2-storage.service';

/**
 * Unified storage interface
 * Abstracts file storage operations to work with either filesystem or R2
 */
export interface StorageService {
  saveProjectFile(
    username: string,
    projectSlug: string,
    filename: string,
    data: Buffer | ArrayBuffer | Uint8Array,
    contentType?: string
  ): Promise<void>;

  readProjectFile(
    username: string,
    projectSlug: string,
    filename: string
  ): Promise<Buffer | ArrayBuffer | null>;

  projectFileExists(username: string, projectSlug: string, filename: string): Promise<boolean>;

  deleteProjectFile(username: string, projectSlug: string, filename: string): Promise<void>;

  deleteProjectDirectory(username: string, projectSlug: string): Promise<void>;

  saveUserAvatar(username: string, data: Buffer | ArrayBuffer | Uint8Array): Promise<void>;

  getUserAvatar(username: string): Promise<Buffer | ArrayBuffer | null>;

  hasUserAvatar(username: string): Promise<boolean>;

  deleteUserAvatar(username: string): Promise<void>;
}

/**
 * Storage adapter that wraps FileStorageService to match the interface
 */
class FileStorageAdapter implements StorageService {
  constructor(private fileStorage: FileStorageService) {}

  async saveProjectFile(
    username: string,
    projectSlug: string,
    filename: string,
    data: Buffer | ArrayBuffer | Uint8Array,
    _contentType?: string
  ): Promise<void> {
    const buffer =
      data instanceof Buffer
        ? data
        : data instanceof ArrayBuffer
          ? Buffer.from(new Uint8Array(data))
          : Buffer.from(data);
    await this.fileStorage.saveProjectFile(username, projectSlug, filename, buffer);
  }

  async readProjectFile(
    username: string,
    projectSlug: string,
    filename: string
  ): Promise<Buffer | null> {
    try {
      return await this.fileStorage.readProjectFile(username, projectSlug, filename);
    } catch {
      return null;
    }
  }

  async projectFileExists(
    username: string,
    projectSlug: string,
    filename: string
  ): Promise<boolean> {
    return await this.fileStorage.projectFileExists(username, projectSlug, filename);
  }

  async deleteProjectFile(username: string, projectSlug: string, filename: string): Promise<void> {
    await this.fileStorage.deleteProjectFile(username, projectSlug, filename);
  }

  async deleteProjectDirectory(username: string, projectSlug: string): Promise<void> {
    await this.fileStorage.deleteProjectDirectory(username, projectSlug);
  }

  async saveUserAvatar(username: string, data: Buffer | ArrayBuffer | Uint8Array): Promise<void> {
    const buffer =
      data instanceof Buffer
        ? data
        : data instanceof ArrayBuffer
          ? Buffer.from(new Uint8Array(data))
          : Buffer.from(data);
    await this.fileStorage.saveUserAvatar(username, buffer);
  }

  async getUserAvatar(username: string): Promise<Buffer | null> {
    try {
      return await this.fileStorage.getUserAvatar(username);
    } catch {
      return null;
    }
  }

  async hasUserAvatar(username: string): Promise<boolean> {
    return await this.fileStorage.hasUserAvatar(username);
  }

  async deleteUserAvatar(username: string): Promise<void> {
    await this.fileStorage.deleteUserAvatar(username);
  }
}

/**
 * Storage adapter that wraps R2StorageService to match the interface
 */
class R2StorageAdapter implements StorageService {
  constructor(private r2Storage: R2StorageService) {}

  async saveProjectFile(
    username: string,
    projectSlug: string,
    filename: string,
    data: Buffer | ArrayBuffer | Uint8Array,
    contentType?: string
  ): Promise<void> {
    await this.r2Storage.saveProjectFile(username, projectSlug, filename, data, contentType);
  }

  async readProjectFile(
    username: string,
    projectSlug: string,
    filename: string
  ): Promise<ArrayBuffer | null> {
    return await this.r2Storage.readProjectFile(username, projectSlug, filename);
  }

  async projectFileExists(
    username: string,
    projectSlug: string,
    filename: string
  ): Promise<boolean> {
    return await this.r2Storage.projectFileExists(username, projectSlug, filename);
  }

  async deleteProjectFile(username: string, projectSlug: string, filename: string): Promise<void> {
    await this.r2Storage.deleteProjectFile(username, projectSlug, filename);
  }

  async deleteProjectDirectory(username: string, projectSlug: string): Promise<void> {
    await this.r2Storage.deleteProjectDirectory(username, projectSlug);
  }

  async saveUserAvatar(username: string, data: Buffer | ArrayBuffer | Uint8Array): Promise<void> {
    await this.r2Storage.saveUserAvatar(username, data);
  }

  async getUserAvatar(username: string): Promise<ArrayBuffer | null> {
    return await this.r2Storage.getUserAvatar(username);
  }

  async hasUserAvatar(username: string): Promise<boolean> {
    return await this.r2Storage.hasUserAvatar(username);
  }

  async deleteUserAvatar(username: string): Promise<void> {
    await this.r2Storage.deleteUserAvatar(username);
  }
}

/**
 * Factory function to create the appropriate storage service
 * Uses R2 if available (Cloudflare Workers), otherwise falls back to filesystem
 */
export function createStorageService(r2Bucket?: R2Bucket): StorageService {
  if (r2Bucket) {
    return new R2StorageAdapter(new R2StorageService(r2Bucket));
  }
  return new FileStorageAdapter(new FileStorageService());
}

/**
 * Get storage service from context or create a filesystem fallback
 */
export function getStorageService(storage?: R2Bucket): StorageService {
  return createStorageService(storage);
}
