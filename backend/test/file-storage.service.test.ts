import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { config } from '../src/config/env';
import { FileStorageService } from '../src/services/file-storage.service';

/**
 * Tests for FileStorageService.
 *
 * Uses the config.dataPath that is already set up by the test environment
 * (defaults to ./data for dev). We create a unique subdirectory under that
 * to avoid polluting real data, and clean up after each test.
 *
 * The FileStorageService reads config.dataPath at construction, so we
 * can't override it per-test. Instead, tests operate within real paths.
 */

// Build a test-specific base directory under the configured data path
const TEST_DATA_DIR = path.resolve(config.dataPath);

describe('FileStorageService', () => {
  let service: FileStorageService;
  // Track usernames used in each test for cleanup
  const testUser = `__test_fs_${process.pid}`;
  const testSlug = 'test-project';

  beforeEach(async () => {
    service = new FileStorageService();
    // Ensure our test user directory is clean
    const userDir = path.join(TEST_DATA_DIR, testUser);
    await fs.rm(userDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    // Clean up test user directory
    const userDir = path.join(TEST_DATA_DIR, testUser);
    await fs.rm(userDir, { recursive: true, force: true });
    // Clean up avatars dir if created
    const avatarPath = path.join(TEST_DATA_DIR, 'avatars', `${testUser}.png`);
    try {
      await fs.unlink(avatarPath);
    } catch {
      // Ignore if not created
    }
  });

  // ──────────────────────────────── Path validation ────────────────────────────────

  describe('getProjectPath', () => {
    it('should return correct project path', () => {
      const result = service.getProjectPath(testUser, 'my-novel');
      expect(result).toBe(path.join(config.dataPath, testUser, 'my-novel'));
    });

    it('should reject path traversal in username', () => {
      expect(() => service.getProjectPath('../etc', 'slug')).toThrow('path traversal');
    });

    it('should reject path traversal in slug', () => {
      expect(() => service.getProjectPath(testUser, '../secret')).toThrow('path traversal');
    });

    it('should reject forward slash in component', () => {
      expect(() => service.getProjectPath('alice/bob', 'slug')).toThrow('path traversal');
    });

    it('should reject backslash in component', () => {
      expect(() => service.getProjectPath('alice\\bob', 'slug')).toThrow('path traversal');
    });

    it('should reject empty username', () => {
      expect(() => service.getProjectPath('', 'slug')).toThrow('path traversal');
    });

    it('should reject null byte in component', () => {
      expect(() => service.getProjectPath('alice\0', 'slug')).toThrow('path traversal');
    });
  });

  // ──────────────────────────────── Project directories ────────────────────────────

  describe('ensureProjectDirectory', () => {
    it('should create nested directory structure', async () => {
      await service.ensureProjectDirectory(testUser, testSlug);
      const stat = await fs.stat(path.join(TEST_DATA_DIR, testUser, testSlug));
      expect(stat.isDirectory()).toBe(true);
    });

    it('should be idempotent', async () => {
      await service.ensureProjectDirectory(testUser, testSlug);
      await service.ensureProjectDirectory(testUser, testSlug);
      const stat = await fs.stat(path.join(TEST_DATA_DIR, testUser, testSlug));
      expect(stat.isDirectory()).toBe(true);
    });
  });

  // ──────────────────────────────── File CRUD ──────────────────────────────────────

  describe('saveProjectFile / readProjectFile', () => {
    it('should save and read a text file', async () => {
      await service.saveProjectFile(testUser, testSlug, 'chapter1.txt', 'Hello World');
      const content = await service.readProjectFile(testUser, testSlug, 'chapter1.txt');
      expect(content.toString()).toBe('Hello World');
    });

    it('should save and read a buffer', async () => {
      const data = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header bytes
      await service.saveProjectFile(testUser, testSlug, 'cover.png', data);
      const content = await service.readProjectFile(testUser, testSlug, 'cover.png');
      expect(Buffer.compare(content, data)).toBe(0);
    });

    it('should overwrite existing file', async () => {
      await service.saveProjectFile(testUser, testSlug, 'draft.txt', 'v1');
      await service.saveProjectFile(testUser, testSlug, 'draft.txt', 'v2');
      const content = await service.readProjectFile(testUser, testSlug, 'draft.txt');
      expect(content.toString()).toBe('v2');
    });

    it('should reject path traversal in filename on save', async () => {
      await expect(
        service.saveProjectFile(testUser, testSlug, '../../../etc/passwd', 'malicious')
      ).rejects.toThrow();
    });

    it('should reject path traversal in filename on read', async () => {
      await expect(
        service.readProjectFile(testUser, testSlug, '../../../etc/passwd')
      ).rejects.toThrow();
    });
  });

  describe('projectFileExists', () => {
    it('should return true for existing file', async () => {
      await service.saveProjectFile(testUser, testSlug, 'notes.txt', 'some notes');
      expect(await service.projectFileExists(testUser, testSlug, 'notes.txt')).toBe(true);
    });

    it('should return false for non-existing file', async () => {
      await service.ensureProjectDirectory(testUser, testSlug);
      expect(await service.projectFileExists(testUser, testSlug, 'missing.txt')).toBe(false);
    });

    it('should reject path traversal', async () => {
      await expect(service.projectFileExists(testUser, testSlug, '../../secret')).rejects.toThrow();
    });
  });

  describe('deleteProjectFile', () => {
    it('should delete an existing file', async () => {
      await service.saveProjectFile(testUser, testSlug, 'temp.txt', 'temporary');
      await service.deleteProjectFile(testUser, testSlug, 'temp.txt');
      expect(await service.projectFileExists(testUser, testSlug, 'temp.txt')).toBe(false);
    });

    it('should throw when deleting non-existing file', async () => {
      await service.ensureProjectDirectory(testUser, testSlug);
      await expect(service.deleteProjectFile(testUser, testSlug, 'ghost.txt')).rejects.toThrow();
    });
  });

  describe('deleteProjectDirectory', () => {
    it('should delete entire project directory', async () => {
      await service.saveProjectFile(testUser, testSlug, 'ch1.txt', 'content');
      await service.deleteProjectDirectory(testUser, testSlug);
      const dirPath = path.join(TEST_DATA_DIR, testUser, testSlug);
      await expect(fs.access(dirPath)).rejects.toThrow();
    });

    it('should not throw for non-existing directory', async () => {
      // Should handle gracefully (logs error but doesn't throw)
      await service.deleteProjectDirectory(testUser, 'nonexistent');
    });
  });

  // ──────────────────────────────── Rename ─────────────────────────────────────────

  describe('renameProjectDirectory', () => {
    it('should rename a project directory', async () => {
      await service.saveProjectFile(testUser, 'old-slug', 'data.txt', 'content');
      await service.renameProjectDirectory(testUser, 'old-slug', 'new-slug');

      // New path should exist
      const content = await service.readProjectFile(testUser, 'new-slug', 'data.txt');
      expect(content.toString()).toBe('content');

      // Old path should not exist
      const oldPath = path.join(TEST_DATA_DIR, testUser, 'old-slug');
      await expect(fs.access(oldPath)).rejects.toThrow();
    });

    it('should not throw when source directory does not exist', async () => {
      // Should handle gracefully
      await service.renameProjectDirectory(testUser, 'nonexistent', 'new-slug');
    });

    it('should throw when target directory already exists', async () => {
      await service.ensureProjectDirectory(testUser, 'project-a');
      await service.ensureProjectDirectory(testUser, 'project-b');
      await expect(
        service.renameProjectDirectory(testUser, 'project-a', 'project-b')
      ).rejects.toThrow('already exists');
    });
  });

  // ──────────────────────────────── Avatar ─────────────────────────────────────────

  describe('user avatar operations', () => {
    it('should save and read avatar', async () => {
      const avatarData = Buffer.from('fake-png-data');
      await service.saveUserAvatar(testUser, avatarData);
      const result = await service.getUserAvatar(testUser);
      expect(Buffer.compare(result, avatarData)).toBe(0);
    });

    it('getUserAvatarPath should return correct path', () => {
      const avatarPath = service.getUserAvatarPath(testUser);
      expect(avatarPath).toBe(path.join(config.dataPath, 'avatars', `${testUser}.png`));
    });

    it('hasUserAvatar should return false when no avatar', async () => {
      expect(await service.hasUserAvatar(testUser)).toBe(false);
    });

    it('hasUserAvatar should return true after saving', async () => {
      await service.saveUserAvatar(testUser, Buffer.from('data'));
      expect(await service.hasUserAvatar(testUser)).toBe(true);
    });

    it('deleteUserAvatar should remove avatar file', async () => {
      await service.saveUserAvatar(testUser, Buffer.from('data'));
      await service.deleteUserAvatar(testUser);
      expect(await service.hasUserAvatar(testUser)).toBe(false);
    });

    it('should reject path traversal in username for avatar', () => {
      expect(() => service.getUserAvatarPath('../etc')).toThrow('path traversal');
    });
  });

  // ──────────────────────────────── List files ─────────────────────────────────────

  describe('listProjectFiles', () => {
    it('should list files in a project directory', async () => {
      await service.saveProjectFile(testUser, testSlug, 'ch1.txt', 'chapter 1');
      await service.saveProjectFile(testUser, testSlug, 'ch2.txt', 'chapter 2');
      const files = await service.listProjectFiles(testUser, testSlug);
      const filenames = files.map((f) => f.filename);
      expect(filenames).toContain('ch1.txt');
      expect(filenames).toContain('ch2.txt');
    });

    it('should filter by prefix', async () => {
      await service.saveProjectFile(testUser, testSlug, 'media-cover.png', 'img1');
      await service.saveProjectFile(testUser, testSlug, 'notes.txt', 'notes');
      const files = await service.listProjectFiles(testUser, testSlug, 'media');
      expect(files.length).toBe(1);
      expect(files[0].filename).toBe('media-cover.png');
    });

    it('should skip dotfiles', async () => {
      await service.saveProjectFile(testUser, testSlug, '.hidden', 'secret');
      await service.saveProjectFile(testUser, testSlug, 'visible.txt', 'visible');
      const files = await service.listProjectFiles(testUser, testSlug);
      const filenames = files.map((f) => f.filename);
      expect(filenames).not.toContain('.hidden');
      expect(filenames).toContain('visible.txt');
    });

    it('should return empty array for non-existing directory', async () => {
      const files = await service.listProjectFiles(testUser, 'nonexistent');
      expect(files).toEqual([]);
    });

    it('should include size and mimeType', async () => {
      await service.saveProjectFile(testUser, testSlug, 'cover.png', 'fake-png-content');
      const files = await service.listProjectFiles(testUser, testSlug);
      const cover = files.find((f) => f.filename === 'cover.png');
      expect(cover).toBeDefined();
      expect(cover?.size).toBeGreaterThan(0);
      expect(cover?.mimeType).toBe('image/png');
    });
  });
});
