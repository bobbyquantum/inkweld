import type { R2Bucket } from '@cloudflare/workers-types';

/**
 * R2 Storage Service
 * Handles file storage operations using Cloudflare R2
 * Replaces filesystem-based file storage for cloud compatibility
 */
export class R2StorageService {
  constructor(private bucket: R2Bucket) {}

  /**
   * Generate a storage key for a project file
   * Format: {username}/{projectSlug}/{filename}
   */
  private getProjectFileKey(username: string, projectSlug: string, filename: string): string {
    return `${username}/${projectSlug}/${filename}`;
  }

  /**
   * Generate a storage key for user avatars
   * Format: avatars/{username}.png
   */
  private getUserAvatarKey(username: string): string {
    return `avatars/${username}.png`;
  }

  /**
   * Save a file to R2 storage
   */
  async saveProjectFile(
    username: string,
    projectSlug: string,
    filename: string,
    data: Buffer | ArrayBuffer | Uint8Array,
    contentType?: string
  ): Promise<void> {
    const key = this.getProjectFileKey(username, projectSlug, filename);

    const options: R2PutOptions = {};
    if (contentType) {
      options.httpMetadata = {
        contentType,
      };
    }

    await this.bucket.put(key, data, options);
  }

  /**
   * Read a file from R2 storage
   */
  async readProjectFile(
    username: string,
    projectSlug: string,
    filename: string
  ): Promise<ArrayBuffer | null> {
    const key = this.getProjectFileKey(username, projectSlug, filename);
    const object = await this.bucket.get(key);

    if (!object) {
      return null;
    }

    return await object.arrayBuffer();
  }

  /**
   * Check if a file exists in R2 storage
   */
  async projectFileExists(
    username: string,
    projectSlug: string,
    filename: string
  ): Promise<boolean> {
    const key = this.getProjectFileKey(username, projectSlug, filename);
    const object = await this.bucket.head(key);
    return object !== null;
  }

  /**
   * Delete a file from R2 storage
   */
  async deleteProjectFile(username: string, projectSlug: string, filename: string): Promise<void> {
    const key = this.getProjectFileKey(username, projectSlug, filename);
    await this.bucket.delete(key);
  }

  /**
   * Delete all files in a project directory
   */
  async deleteProjectDirectory(username: string, projectSlug: string): Promise<void> {
    const prefix = `${username}/${projectSlug}/`;
    const listed = await this.bucket.list({ prefix });

    // Delete all objects with this prefix
    const deletePromises = listed.objects.map((obj) => this.bucket.delete(obj.key));
    await Promise.all(deletePromises);
  }

  /**
   * Save user avatar to R2
   */
  async saveUserAvatar(username: string, data: Buffer | ArrayBuffer | Uint8Array): Promise<void> {
    const key = this.getUserAvatarKey(username);
    await this.bucket.put(key, data, {
      httpMetadata: {
        contentType: 'image/png',
      },
    });
  }

  /**
   * Get user avatar from R2
   */
  async getUserAvatar(username: string): Promise<ArrayBuffer | null> {
    const key = this.getUserAvatarKey(username);
    const object = await this.bucket.get(key);

    if (!object) {
      return null;
    }

    return await object.arrayBuffer();
  }

  /**
   * Check if user has an avatar
   */
  async hasUserAvatar(username: string): Promise<boolean> {
    const key = this.getUserAvatarKey(username);
    const object = await this.bucket.head(key);
    return object !== null;
  }

  /**
   * Delete user avatar from R2
   */
  async deleteUserAvatar(username: string): Promise<void> {
    const key = this.getUserAvatarKey(username);
    await this.bucket.delete(key);
  }

  /**
   * Get file metadata from R2
   */
  async getFileMetadata(
    username: string,
    projectSlug: string,
    filename: string
  ): Promise<R2Object | null> {
    const key = this.getProjectFileKey(username, projectSlug, filename);
    return await this.bucket.head(key);
  }
}

// Type for R2 put options
interface R2PutOptions {
  httpMetadata?: {
    contentType?: string;
    contentLanguage?: string;
    contentDisposition?: string;
    contentEncoding?: string;
    cacheControl?: string;
  };
  customMetadata?: Record<string, string>;
}

// Type for R2 object
interface R2Object {
  key: string;
  version: string;
  size: number;
  etag: string;
  httpEtag: string;
  uploaded: Date;
  httpMetadata?: {
    contentType?: string;
    contentLanguage?: string;
    contentDisposition?: string;
    contentEncoding?: string;
    cacheControl?: string;
  };
  customMetadata?: Record<string, string>;
}
