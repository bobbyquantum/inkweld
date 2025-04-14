import { Test, TestingModule } from '@nestjs/testing';
import { ProjectElementService } from './project-element.service.js';
import { LevelDBManagerService } from '../../common/persistence/leveldb-manager.service.js';
import * as Y from 'yjs';
import { beforeEach, describe, expect, it, jest, spyOn } from 'bun:test';

describe('ProjectElementService', () => {
  let service: ProjectElementService;
  let levelDBManager: LevelDBManagerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectElementService,
        {
          provide: LevelDBManagerService,
          useValue: {
            getProjectDatabase: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ProjectElementService>(ProjectElementService);
    levelDBManager = module.get<LevelDBManagerService>(LevelDBManagerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getProjectElements', () => {
    it('should return elements array from Y.Doc', async () => {
      const ydoc = new Y.Doc();
      const elementsArray = ydoc.getArray('elements');
      elementsArray.push([{ id: '1', type: 'test' }, { id: '2', type: 'test2' }]);

      // Mock getProjectDatabase to return a mock LeveldbPersistence with getYDoc method
      const mockLeveldbPersistence = {
        getYDoc: jest.fn().mockResolvedValue(ydoc),
      };
      (levelDBManager.getProjectDatabase as jest.Mock).mockResolvedValue(mockLeveldbPersistence);

      // Spy on private loadDoc method to call actual implementation
      const loadDocSpy = spyOn<any, any>(service, 'loadDoc');

      const elements = await service.getProjectElements('user1', 'slug1');
      expect(loadDocSpy).toHaveBeenCalledWith('user1', 'slug1');
      expect(elements).toEqual([{ id: '1', type: 'test' }, { id: '2', type: 'test2' }]);
    });

    it('should throw error if no LevelDB persistence found', async () => {
      (levelDBManager.getProjectDatabase as jest.Mock).mockResolvedValue(null);

      await expect(service.getProjectElements('user1', 'slug1')).rejects.toThrow(
        'No LevelDB persistence found for Yjs project elements',
      );
    });
  });
});