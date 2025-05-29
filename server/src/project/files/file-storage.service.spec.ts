import { Test, TestingModule } from '@nestjs/testing';
import { FileStorageService } from './file-storage.service.js';
import { beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as fsPromises from 'fs/promises';
import * as fsSync from 'fs';

describe('FileStorageService', () => {
  let service: FileStorageService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FileStorageService],
    }).compile();

    service = module.get<FileStorageService>(FileStorageService);
  });

  describe('saveFile', () => {
    it('should save file and return metadata', async () => {
      const userId = 'user1';
      const projectSlug = 'project1';
      const fileBuffer = Buffer.from('test content');
      const filename = 'test.txt';

      const mkdirSpy = spyOn(fsPromises, 'mkdir').mockResolvedValue(undefined);
      const writeFileSpy = spyOn(fsPromises, 'writeFile').mockResolvedValue(
        undefined,
      );

      const metadata = await service.saveFile(
        userId,
        projectSlug,
        fileBuffer,
        filename,
      );

      expect(mkdirSpy).toHaveBeenCalled();
      expect(writeFileSpy).toHaveBeenCalled();
      expect(metadata.originalName).toBe(filename);
      expect(metadata.contentType).toBe('txt');
      expect(metadata.size).toBe(fileBuffer.byteLength);
      expect(metadata.storedName).toMatch(
        new RegExp(`^[a-f0-9]{8}-\\d+\\.txt$`),
      );
      expect(metadata.uploadDate).toBeInstanceOf(Date);
    });

    it('should throw error if writeFile fails', async () => {
      const userId = 'user1';
      const projectSlug = 'project1';
      const fileBuffer = Buffer.from('test content');
      const filename = 'test.txt';

      spyOn(fsPromises, 'mkdir').mockResolvedValue(undefined);
      spyOn(fsPromises, 'writeFile').mockRejectedValue(new Error('Disk full'));

      await expect(
        service.saveFile(userId, projectSlug, fileBuffer, filename),
      ).rejects.toThrow('Failed to save file: Disk full');
    });
  });

  describe('readFile', () => {
    it('should return a readable stream if file exists', async () => {
      const userId = 'user1';
      const projectSlug = 'project1';
      const storedName = 'file.txt';

      spyOn(fsSync, 'existsSync').mockReturnValue(true);
      // Use a minimal ReadStream mock with required properties
      const mockStream = {
        close: () => {},
        on: () => {},
        pipe: () => {},
      } as unknown as fsSync.ReadStream;
      const createReadStreamSpy = spyOn(
        fsSync,
        'createReadStream',
      ).mockReturnValue(mockStream);

      const stream = await service.readFile(userId, projectSlug, storedName);

      expect(createReadStreamSpy).toHaveBeenCalled();
      expect(stream).toBe(mockStream);
    });

    it('should throw error if file does not exist', async () => {
      const userId = 'user1';
      const projectSlug = 'project1';
      const storedName = 'file.txt';

      spyOn(fsSync, 'existsSync').mockReturnValue(false);

      await expect(
        service.readFile(userId, projectSlug, storedName),
      ).rejects.toThrow(`File not found: ${storedName}`);
    });
  });

  describe('deleteFile', () => {
    it('should delete file if it exists', async () => {
      const userId = 'user1';
      const projectSlug = 'project1';
      const storedName = 'file.txt';

      spyOn(fsSync, 'existsSync').mockReturnValue(true);
      const unlinkSpy = spyOn(fsPromises, 'unlink').mockResolvedValue(
        undefined,
      );

      await service.deleteFile(userId, projectSlug, storedName);

      expect(unlinkSpy).toHaveBeenCalled();
    });

    it('should throw error if file does not exist', async () => {
      const userId = 'user1';
      const projectSlug = 'project1';
      const storedName = 'file.txt';

      spyOn(fsSync, 'existsSync').mockReturnValue(false);

      await expect(
        service.deleteFile(userId, projectSlug, storedName),
      ).rejects.toThrow(`File not found: ${storedName}`);
    });
  });
});
