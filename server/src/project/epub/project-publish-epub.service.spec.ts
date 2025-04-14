import { Test, TestingModule } from '@nestjs/testing';
import { ProjectPublishEpubService } from './project-publish-epub.service.js';
import { ProjectElementService } from '../element/project-element.service.js';
import { FileStorageService } from '../files/file-storage.service.js';
import { ProjectService } from '../project.service.js';
import { DocumentRendererService } from '../document/document-renderer.service.js';
import { LevelDBManagerService } from '../../common/persistence/leveldb-manager.service.js';
import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest, spyOn } from 'bun:test';
import * as fs from 'fs';
import { Epub } from '@smoores/epub';

describe('ProjectPublishEpubService', () => {
  let service: ProjectPublishEpubService;
  let projectElementService: ProjectElementService;
  let fileStorageService: FileStorageService;
  let projectService: ProjectService;
  let _levelDBManager: LevelDBManagerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectPublishEpubService,
        {
          provide: ProjectElementService,
          useValue: {
            getProjectElements: jest.fn(),
          },
        },
        {
          provide: FileStorageService,
          useValue: {
            saveFile: jest.fn(),
          },
        },
        {
          provide: ProjectService,
          useValue: {
            findByUsernameAndSlug: jest.fn(),
            getProjectPath: jest.fn(),
          },
        },
        {
          provide: DocumentRendererService,
          useValue: {},
        },
        {
          provide: LevelDBManagerService,
          useValue: {
            getProjectDatabase: jest.fn().mockResolvedValue({
              getYDoc: jest.fn(),
              storeUpdate: jest.fn(),
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ProjectPublishEpubService>(ProjectPublishEpubService);
    projectElementService = module.get<ProjectElementService>(ProjectElementService);
    fileStorageService = module.get<FileStorageService>(FileStorageService);
    projectService = module.get<ProjectService>(ProjectService);
    _levelDBManager = module.get<LevelDBManagerService>(LevelDBManagerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('publishProjectAsEpub', () => {
    it('should throw NotFoundException if project not found', async () => {
      (projectService.findByUsernameAndSlug as jest.Mock).mockResolvedValue(null);

      await expect(service.publishProjectAsEpub('user1', 'slug1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should publish EPUB successfully', async () => {
      const mockProject = { title: 'Test Project' };
      const mockElements = [{ id: '1' }, { id: '2' }];
      const mockFileMetadata = {
        originalName: 'test.epub',
        storedName: 'test-stored.epub',
        contentType: 'application/epub+zip',
        size: 12345,
        uploadDate: new Date(),
      };

      (projectService.findByUsernameAndSlug as jest.Mock).mockResolvedValue(mockProject);
      (projectElementService.getProjectElements as jest.Mock).mockResolvedValue(mockElements);
      (fileStorageService.saveFile as jest.Mock).mockResolvedValue(mockFileMetadata);
      (projectService.getProjectPath as jest.Mock).mockReturnValue('/fake/path');

      spyOn(fs, 'existsSync').mockReturnValue(false);

      const mockEpub = {
        setCoverImage: jest.fn(),
        writeToArray: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      } as unknown as Epub;
      spyOn(Epub, 'create').mockResolvedValue(mockEpub);

      const result = await service.publishProjectAsEpub('user1', 'slug1');

      expect(projectService.findByUsernameAndSlug).toHaveBeenCalledWith('user1', 'slug1');
      expect(projectElementService.getProjectElements).toHaveBeenCalledWith('user1', 'slug1');
      expect(fileStorageService.saveFile).toHaveBeenCalled();
      expect(result).toEqual(mockFileMetadata);
    });
  });
});