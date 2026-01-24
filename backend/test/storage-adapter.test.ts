import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  createStorageService,
  getStorageService,
  type StorageService,
} from '../src/services/storage.service';
import { config } from '../src/config/env';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Storage Service', () => {
  const actualDataPath = config.dataPath;
  let service: StorageService;

  beforeEach(async () => {
    // Clean up test data
    await fs.rm(path.join(actualDataPath, 'storagetest'), { recursive: true, force: true });
    await fs.rm(path.join(actualDataPath, 'avatars'), { recursive: true, force: true });

    // Create filesystem-based storage service (no R2 bucket)
    service = createStorageService();
  });

  afterEach(async () => {
    // Clean up after tests
    await fs.rm(path.join(actualDataPath, 'storagetest'), { recursive: true, force: true });
    await fs.rm(path.join(actualDataPath, 'avatars'), { recursive: true, force: true });
  });

  describe('createStorageService', () => {
    it('should create a filesystem-based storage service when no R2 bucket is provided', () => {
      const storage = createStorageService();
      expect(storage).toBeDefined();
      expect(typeof storage.saveProjectFile).toBe('function');
      expect(typeof storage.readProjectFile).toBe('function');
      expect(typeof storage.deleteProjectFile).toBe('function');
    });

    it('should create storage with getStorageService helper', () => {
      const storage = getStorageService();
      expect(storage).toBeDefined();
      expect(typeof storage.saveProjectFile).toBe('function');
    });
  });

  describe('FileStorageAdapter - Project files', () => {
    const username = 'storagetest';
    const projectSlug = 'adapter-test';

    it('should save and read project file with Buffer', async () => {
      const filename = 'test.txt';
      const content = Buffer.from('Hello from adapter');

      await service.saveProjectFile(username, projectSlug, filename, content);
      const result = await service.readProjectFile(username, projectSlug, filename);

      expect(result).not.toBeNull();
      expect(Buffer.from(result as Buffer).toString()).toBe('Hello from adapter');
    });

    it('should save project file with ArrayBuffer', async () => {
      const filename = 'arraybuffer.txt';
      const text = 'ArrayBuffer content';
      const encoder = new TextEncoder();
      const arrayBuffer = encoder.encode(text).buffer;

      await service.saveProjectFile(username, projectSlug, filename, new Uint8Array(arrayBuffer));
      const result = await service.readProjectFile(username, projectSlug, filename);

      expect(result).not.toBeNull();
      expect(Buffer.from(result as Buffer).toString()).toBe('ArrayBuffer content');
    });

    it('should save project file with Uint8Array', async () => {
      const filename = 'uint8.txt';
      const content = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"

      await service.saveProjectFile(username, projectSlug, filename, content);
      const result = await service.readProjectFile(username, projectSlug, filename);

      expect(result).not.toBeNull();
      expect(Buffer.from(result as Buffer).toString()).toBe('Hello');
    });

    it('should return null when reading non-existent file', async () => {
      const result = await service.readProjectFile(username, projectSlug, 'nonexistent.txt');
      expect(result).toBeNull();
    });

    it('should check if file exists', async () => {
      const filename = 'exists.txt';

      let exists = await service.projectFileExists(username, projectSlug, filename);
      expect(exists).toBe(false);

      await service.saveProjectFile(username, projectSlug, filename, Buffer.from('content'));
      exists = await service.projectFileExists(username, projectSlug, filename);
      expect(exists).toBe(true);
    });

    it('should delete project file', async () => {
      const filename = 'deleteme.txt';

      await service.saveProjectFile(username, projectSlug, filename, Buffer.from('delete this'));
      await service.deleteProjectFile(username, projectSlug, filename);

      const exists = await service.projectFileExists(username, projectSlug, filename);
      expect(exists).toBe(false);
    });

    it('should delete entire project directory', async () => {
      await service.saveProjectFile(username, projectSlug, 'file1.txt', Buffer.from('content1'));
      await service.saveProjectFile(username, projectSlug, 'file2.txt', Buffer.from('content2'));

      await service.deleteProjectDirectory(username, projectSlug);

      const file1Exists = await service.projectFileExists(username, projectSlug, 'file1.txt');
      const file2Exists = await service.projectFileExists(username, projectSlug, 'file2.txt');
      expect(file1Exists).toBe(false);
      expect(file2Exists).toBe(false);
    });

    it('should list project files', async () => {
      await service.saveProjectFile(username, projectSlug, 'doc1.txt', Buffer.from('content1'));
      await service.saveProjectFile(username, projectSlug, 'doc2.txt', Buffer.from('content2'));

      const files = await service.listProjectFiles(username, projectSlug);

      expect(files.length).toBe(2);
      expect(files.map((f) => f.filename).sort()).toEqual(['doc1.txt', 'doc2.txt']);
    });

    it('should list project files with prefix filter', async () => {
      await service.saveProjectFile(username, projectSlug, 'media-image.png', Buffer.from('img'));
      await service.saveProjectFile(username, projectSlug, 'document.txt', Buffer.from('doc'));

      const files = await service.listProjectFiles(username, projectSlug, 'media');

      expect(files.length).toBe(1);
      expect(files[0].filename).toBe('media-image.png');
    });
  });

  describe('FileStorageAdapter - User avatars', () => {
    const username = 'storagetest';

    it('should save and get user avatar with Buffer', async () => {
      const avatarData = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header

      await service.saveUserAvatar(username, avatarData);
      const result = await service.getUserAvatar(username);

      expect(result).not.toBeNull();
      expect(Buffer.compare(Buffer.from(result as Buffer), avatarData)).toBe(0);
    });

    it('should save user avatar with ArrayBuffer', async () => {
      const avatarData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer;

      await service.saveUserAvatar(username, new Uint8Array(avatarData));
      const result = await service.getUserAvatar(username);

      expect(result).not.toBeNull();
    });

    it('should save user avatar with Uint8Array', async () => {
      const avatarData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

      await service.saveUserAvatar(username, avatarData);
      const result = await service.getUserAvatar(username);

      expect(result).not.toBeNull();
    });

    it('should return null for non-existent avatar', async () => {
      const result = await service.getUserAvatar('nonexistent');
      expect(result).toBeNull();
    });

    it('should check if user has avatar', async () => {
      let hasAvatar = await service.hasUserAvatar(username);
      expect(hasAvatar).toBe(false);

      await service.saveUserAvatar(username, Buffer.from('avatar'));
      hasAvatar = await service.hasUserAvatar(username);
      expect(hasAvatar).toBe(true);
    });

    it('should delete user avatar', async () => {
      await service.saveUserAvatar(username, Buffer.from('avatar'));
      await service.deleteUserAvatar(username);

      const hasAvatar = await service.hasUserAvatar(username);
      expect(hasAvatar).toBe(false);
    });
  });
});
