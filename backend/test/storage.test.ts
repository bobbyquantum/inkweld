import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { FileStorageService } from '../src/services/file-storage.service';
import { config } from '../src/config/env';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('FileStorageService', () => {
  let service: FileStorageService;
  // Use the actual config data path since env var doesn't work after config is loaded
  const actualDataPath = config.dataPath;

  beforeEach(async () => {
    // Clean up test user data from the actual data path
    await fs.rm(path.join(actualDataPath, 'testuser'), { recursive: true, force: true });
    await fs.rm(path.join(actualDataPath, 'avatars'), { recursive: true, force: true });

    service = new FileStorageService();
  });

  afterEach(async () => {
    // Clean up after tests
    await fs.rm(path.join(actualDataPath, 'testuser'), { recursive: true, force: true });
    await fs.rm(path.join(actualDataPath, 'avatars'), { recursive: true, force: true });
  });

  describe('Project files', () => {
    it('should save and read a project file', async () => {
      const username = 'testuser';
      const projectSlug = 'test-project';
      const filename = 'test.txt';
      const content = 'Hello, World!';

      await service.saveProjectFile(username, projectSlug, filename, content);
      const result = await service.readProjectFile(username, projectSlug, filename);

      expect(result.toString()).toBe(content);
    });

    it('should check if a project file exists', async () => {
      const username = 'testuser';
      const projectSlug = 'test-project';
      const filename = 'test.txt';

      let exists = await service.projectFileExists(username, projectSlug, filename);
      expect(exists).toBe(false);

      await service.saveProjectFile(username, projectSlug, filename, 'content');
      exists = await service.projectFileExists(username, projectSlug, filename);
      expect(exists).toBe(true);
    });

    it('should delete a project file', async () => {
      const username = 'testuser';
      const projectSlug = 'test-project';
      const filename = 'test.txt';

      await service.saveProjectFile(username, projectSlug, filename, 'content');
      await service.deleteProjectFile(username, projectSlug, filename);

      const exists = await service.projectFileExists(username, projectSlug, filename);
      expect(exists).toBe(false);
    });

    it('should handle binary data (images)', async () => {
      const username = 'testuser';
      const projectSlug = 'test-project';
      const filename = 'cover.jpg';
      const imageData = Buffer.from([0xff, 0xd8, 0xff, 0xe0]); // JPEG header

      await service.saveProjectFile(username, projectSlug, filename, imageData);
      const result = await service.readProjectFile(username, projectSlug, filename);

      expect(Buffer.compare(result, imageData)).toBe(0);
    });
  });

  describe('User avatars', () => {
    it('should save and get user avatar', async () => {
      const username = 'testuser';
      const avatarData = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header

      await service.saveUserAvatar(username, avatarData);
      const result = await service.getUserAvatar(username);

      expect(Buffer.compare(result, avatarData)).toBe(0);
    });

    it('should check if user has avatar', async () => {
      const username = 'testuser';

      let hasAvatar = await service.hasUserAvatar(username);
      expect(hasAvatar).toBe(false);

      await service.saveUserAvatar(username, Buffer.from('avatar'));
      hasAvatar = await service.hasUserAvatar(username);
      expect(hasAvatar).toBe(true);
    });

    it('should delete user avatar', async () => {
      const username = 'testuser';

      await service.saveUserAvatar(username, Buffer.from('avatar'));
      await service.deleteUserAvatar(username);

      const hasAvatar = await service.hasUserAvatar(username);
      expect(hasAvatar).toBe(false);
    });
  });

  describe('Project directory operations', () => {
    it('should delete entire project directory', async () => {
      const username = 'testuser';
      const projectSlug = 'test-project';

      await service.saveProjectFile(username, projectSlug, 'file1.txt', 'content1');
      await service.saveProjectFile(username, projectSlug, 'file2.txt', 'content2');

      await service.deleteProjectDirectory(username, projectSlug);

      // Verify files no longer exist
      const file1Exists = await service.projectFileExists(username, projectSlug, 'file1.txt');
      const file2Exists = await service.projectFileExists(username, projectSlug, 'file2.txt');
      expect(file1Exists).toBe(false);
      expect(file2Exists).toBe(false);
    });
  });

  describe('listProjectFiles', () => {
    it('should list all files in a project directory', async () => {
      const username = 'testuser';
      const projectSlug = 'test-project';

      await service.saveProjectFile(username, projectSlug, 'doc1.txt', 'content1');
      await service.saveProjectFile(username, projectSlug, 'doc2.txt', 'content2');
      await service.saveProjectFile(
        username,
        projectSlug,
        'image.png',
        Buffer.from([0x89, 0x50, 0x4e, 0x47])
      );

      const files = await service.listProjectFiles(username, projectSlug);

      expect(files.length).toBe(3);
      const filenames = files.map((f) => f.filename).sort();
      expect(filenames).toEqual(['doc1.txt', 'doc2.txt', 'image.png']);
    });

    it('should include file metadata', async () => {
      const username = 'testuser';
      const projectSlug = 'test-project';
      const content = 'Hello, World!';

      await service.saveProjectFile(username, projectSlug, 'test.txt', content);

      const files = await service.listProjectFiles(username, projectSlug);

      expect(files.length).toBe(1);
      expect(files[0].filename).toBe('test.txt');
      expect(files[0].size).toBe(content.length);
      expect(files[0].mimeType).toBe('text/plain');
      expect(files[0].uploadedAt).toBeInstanceOf(Date);
    });

    it('should filter files by prefix', async () => {
      const username = 'testuser';
      const projectSlug = 'test-project';

      await service.saveProjectFile(username, projectSlug, 'media-image.png', Buffer.from([0x89]));
      await service.saveProjectFile(username, projectSlug, 'media-video.mp4', Buffer.from([0x00]));
      await service.saveProjectFile(username, projectSlug, 'document.txt', 'content');

      const files = await service.listProjectFiles(username, projectSlug, 'media');

      expect(files.length).toBe(2);
      expect(files.every((f) => f.filename.startsWith('media'))).toBe(true);
    });

    it('should return empty array for non-existent directory', async () => {
      const username = 'testuser';
      const projectSlug = 'nonexistent-project';

      const files = await service.listProjectFiles(username, projectSlug);

      expect(files).toEqual([]);
    });

    it('should skip hidden files (starting with dot)', async () => {
      const username = 'testuser';
      const projectSlug = 'test-project';

      await service.saveProjectFile(username, projectSlug, '.hidden', 'hidden content');
      await service.saveProjectFile(username, projectSlug, 'visible.txt', 'visible content');

      const files = await service.listProjectFiles(username, projectSlug);

      expect(files.length).toBe(1);
      expect(files[0].filename).toBe('visible.txt');
    });

    it('should skip .level files', async () => {
      const username = 'testuser';
      const projectSlug = 'test-project';

      await service.saveProjectFile(username, projectSlug, 'data.level', 'level data');
      await service.saveProjectFile(username, projectSlug, 'document.txt', 'document content');

      const files = await service.listProjectFiles(username, projectSlug);

      expect(files.length).toBe(1);
      expect(files[0].filename).toBe('document.txt');
    });

    it('should detect mime types correctly', async () => {
      const username = 'testuser';
      const projectSlug = 'test-project';

      await service.saveProjectFile(username, projectSlug, 'image.jpg', Buffer.from([0xff, 0xd8]));
      await service.saveProjectFile(username, projectSlug, 'script.js', 'console.log("hi")');
      await service.saveProjectFile(username, projectSlug, 'styles.css', 'body { }');

      const files = await service.listProjectFiles(username, projectSlug);
      const fileMap = new Map(files.map((f) => [f.filename, f.mimeType]));

      expect(fileMap.get('image.jpg')).toBe('image/jpeg');
      expect(fileMap.get('script.js')).toBe('text/javascript');
      expect(fileMap.get('styles.css')).toBe('text/css');
    });
  });
});
