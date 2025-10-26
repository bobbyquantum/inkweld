import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, jest } from 'bun:test';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import * as Y from 'yjs';
import { DocumentSnapshotService } from './document-snapshot.service.js';
import { DocumentSnapshotEntity } from './document-snapshot.entity.js';
import { ProjectEntity } from '../project.entity.js';
import { UserEntity } from '../../user/user.entity.js';
import { LevelDBManagerService } from '../../common/persistence/leveldb-manager.service.js';
import { DocumentRendererService } from '../document/document-renderer.service.js';
import type { Repository } from 'typeorm';

describe('DocumentSnapshotService', () => {
  let service: DocumentSnapshotService;
  let snapshotRepository: Repository<DocumentSnapshotEntity>;
  let projectRepository: Repository<ProjectEntity>;
  let userRepository: Repository<UserEntity>;
  let documentRenderer: DocumentRendererService;

  let mockDb: {
    getYDoc: ReturnType<typeof jest.fn>;
    storeUpdate: ReturnType<typeof jest.fn>;
    getMeta: ReturnType<typeof jest.fn>;
  };

  const mockUser: UserEntity = {
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    approved: true,
  } as UserEntity;

  const mockProject: ProjectEntity = {
    id: 'project-123',
    slug: 'test-project',
    title: 'Test Project',
    user: mockUser,
  } as ProjectEntity;

  const mockSnapshot: DocumentSnapshotEntity = {
    id: 'snapshot-123',
    documentId: 'testuser:test-project:chapter1',
    project: mockProject,
    user: mockUser,
    name: 'Test Snapshot',
    description: 'Test description',
    yDocState: Buffer.from([1, 2, 3]),
    stateVector: Buffer.from([4, 5, 6]),
    wordCount: 100,
    metadata: {},
    createdAt: new Date(),
  };

  beforeEach(async () => {
    // Create mock database
    mockDb = {
      getYDoc: jest.fn(),
      storeUpdate: jest.fn(),
      getMeta: jest.fn(),
    };

    // Create mock repositories
    const mockSnapshotRepository = {
      create: jest.fn((data) => ({ ...data, id: 'new-snapshot', createdAt: new Date() })),
      save: jest.fn((entity) => Promise.resolve({ ...entity, createdAt: entity.createdAt || new Date() })),
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      remove: jest.fn(),
    };

    const mockProjectRepository = {
      findOne: jest.fn(),
    };

    const mockUserRepository = {
      findOne: jest.fn(),
    };

    const mockLevelDBManager = {
      getProjectDatabase: jest.fn().mockResolvedValue(mockDb),
    };

    const mockDocumentRenderer = {
      renderDocumentAsHtml: jest.fn().mockReturnValue('<html>Test</html>'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentSnapshotService,
        {
          provide: 'DocumentSnapshotEntityRepository',
          useValue: mockSnapshotRepository,
        },
        {
          provide: 'ProjectEntityRepository',
          useValue: mockProjectRepository,
        },
        {
          provide: 'UserEntityRepository',
          useValue: mockUserRepository,
        },
        {
          provide: LevelDBManagerService,
          useValue: mockLevelDBManager,
        },
        {
          provide: DocumentRendererService,
          useValue: mockDocumentRenderer,
        },
      ],
    }).compile();

    service = module.get<DocumentSnapshotService>(DocumentSnapshotService);
    snapshotRepository = module.get('DocumentSnapshotEntityRepository');
    projectRepository = module.get('ProjectEntityRepository');
    userRepository = module.get('UserEntityRepository');
    documentRenderer = module.get<DocumentRendererService>(
      DocumentRendererService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createSnapshot', () => {
    it('should create a snapshot with Yjs state and state vector', async () => {
      const username = 'testuser';
      const projectSlug = 'test-project';
      const docId = 'testuser:test-project:chapter1'; // Full document ID as received from URL
      const userId = 'user-123';
      const data = {
        name: 'Chapter 1 Draft',
        description: 'First draft',
      };

      // Setup mocks
      (projectRepository.findOne as ReturnType<typeof jest.fn>).mockResolvedValue(
        mockProject,
      );
      (userRepository.findOne as ReturnType<typeof jest.fn>).mockResolvedValue(
        mockUser,
      );

      // Create a real Y.Doc with some content
      const mockYDoc = new Y.Doc();
      const fragment = mockYDoc.getXmlFragment('prosemirror');
      const paragraph = new Y.XmlElement('paragraph');
      const textNode = new Y.XmlText();
      textNode.insert(0, 'Hello world this is a test');
      paragraph.insert(0, [textNode]);
      fragment.insert(0, [paragraph]);

      mockDb.getYDoc.mockResolvedValue(mockYDoc);

      const result = await service.createSnapshot(
        username,
        projectSlug,
        docId,
        userId,
        data,
      );

      // Verify repository calls
      expect(snapshotRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          documentId: 'testuser:test-project:chapter1',
          project: mockProject,
          user: mockUser,
          name: data.name,
          description: data.description,
          wordCount: expect.any(Number),
        }),
      );

      expect(snapshotRepository.save).toHaveBeenCalled();

      // Verify returned DTO
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('name', data.name);
      expect(result).toHaveProperty('documentId', 'testuser:test-project:chapter1');
      expect(result.wordCount).toBeGreaterThan(0);
    });

    it('should throw NotFoundException if project not found', async () => {
      (projectRepository.findOne as ReturnType<typeof jest.fn>).mockResolvedValue(
        null,
      );

      await expect(
        service.createSnapshot('user', 'nonexistent', 'doc', 'user-123', {
          name: 'Test',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if user not found', async () => {
      (projectRepository.findOne as ReturnType<typeof jest.fn>).mockResolvedValue(
        mockProject,
      );
      (userRepository.findOne as ReturnType<typeof jest.fn>).mockResolvedValue(
        null,
      );

      await expect(
        service.createSnapshot('user', 'project', 'doc', 'nonexistent', {
          name: 'Test',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user does not own project', async () => {
      const otherUser = { ...mockUser, id: 'other-user' };

      (projectRepository.findOne as ReturnType<typeof jest.fn>).mockResolvedValue(
        mockProject,
      );
      (userRepository.findOne as ReturnType<typeof jest.fn>).mockResolvedValue(
        otherUser,
      );

      await expect(
        service.createSnapshot('user', 'project', 'doc', 'other-user', {
          name: 'Test',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('listSnapshots', () => {
    it('should return paginated list of snapshots', async () => {
      const snapshots = [mockSnapshot];
      (snapshotRepository.findAndCount as ReturnType<typeof jest.fn>).mockResolvedValue(
        [snapshots, 1],
      );

      const result = await service.listSnapshots(
        'testuser',
        'test-project',
        'chapter1',
        { limit: 50, offset: 0, orderBy: 'createdAt', order: 'DESC' },
      );

      expect(result.snapshots).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    it('should enforce maximum limit of 100', async () => {
      (snapshotRepository.findAndCount as ReturnType<typeof jest.fn>).mockResolvedValue(
        [[], 0],
      );

      await service.listSnapshots('user', 'project', 'doc', {
        limit: 200,
        offset: 0,
      });

      expect(snapshotRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100, // Should be capped at 100
        }),
      );
    });
  });

  describe('getSnapshot', () => {
    it('should return snapshot DTO', async () => {
      (snapshotRepository.findOne as ReturnType<typeof jest.fn>).mockResolvedValue(
        mockSnapshot,
      );

      const result = await service.getSnapshot('snapshot-123');

      expect(result).toHaveProperty('id', 'snapshot-123');
      expect(result).toHaveProperty('name', 'Test Snapshot');
    });

    it('should throw NotFoundException if snapshot not found', async () => {
      (snapshotRepository.findOne as ReturnType<typeof jest.fn>).mockResolvedValue(
        null,
      );

      await expect(service.getSnapshot('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('restoreSnapshot', () => {
    it('should restore document from snapshot', async () => {
      (snapshotRepository.findOne as ReturnType<typeof jest.fn>).mockResolvedValue(
        mockSnapshot,
      );

      // Create a Y.Doc for testing
      const currentDoc = new Y.Doc();
      const fragment = currentDoc.getXmlFragment('prosemirror');
      const paragraph = new Y.XmlElement('paragraph');
      const textNode = new Y.XmlText();
      textNode.insert(0, 'Current content');
      paragraph.insert(0, [textNode]);
      fragment.insert(0, [paragraph]);

      // Create snapshot state
      const snapshotDoc = new Y.Doc();
      const snapFragment = snapshotDoc.getXmlFragment('prosemirror');
      const snapParagraph = new Y.XmlElement('paragraph');
      const snapText = new Y.XmlText();
      snapText.insert(0, 'Snapshot content');
      snapParagraph.insert(0, [snapText]);
      snapFragment.insert(0, [snapParagraph]);

      const snapshotState = Y.encodeStateAsUpdate(snapshotDoc);
      const snapshotWithState = {
        ...mockSnapshot,
        yDocState: Buffer.from(snapshotState),
      };

      (snapshotRepository.findOne as ReturnType<typeof jest.fn>).mockResolvedValue(
        snapshotWithState,
      );
      mockDb.getYDoc.mockResolvedValue(currentDoc);

      const result = await service.restoreSnapshot(
        'testuser',
        'test-project',
        'testuser:test-project:chapter1', // Full document ID (as received from URL)
        'snapshot-123',
        'user-123',
      );

      expect(result.success).toBe(true);
      expect(result.documentId).toBe('testuser:test-project:chapter1');
      expect(result.restoredFrom).toBe('snapshot-123');
      expect(mockDb.storeUpdate).toHaveBeenCalled();
    });

    it('should throw error if snapshot does not match document', async () => {
      const wrongSnapshot = {
        ...mockSnapshot,
        documentId: 'different:project:doc',
      };

      (snapshotRepository.findOne as ReturnType<typeof jest.fn>).mockResolvedValue(
        wrongSnapshot,
      );

      await expect(
        service.restoreSnapshot(
          'testuser',
          'test-project',
          'testuser:test-project:chapter1', // Full document ID (as received from URL)
          'snapshot-123',
          'user-123',
        ),
      ).rejects.toThrow('Snapshot does not belong to this document');
    });

    it('should throw ForbiddenException if user does not have permission', async () => {
      (snapshotRepository.findOne as ReturnType<typeof jest.fn>).mockResolvedValue(
        mockSnapshot,
      );

      await expect(
        service.restoreSnapshot(
          'testuser',
          'test-project',
          'testuser:test-project:chapter1', // Full document ID (as received from URL)
          'snapshot-123',
          'other-user',
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('deleteSnapshot', () => {
    it('should delete snapshot if user is creator', async () => {
      (snapshotRepository.findOne as ReturnType<typeof jest.fn>).mockResolvedValue(
        mockSnapshot,
      );
      (snapshotRepository.remove as ReturnType<typeof jest.fn>).mockResolvedValue(
        mockSnapshot,
      );

      const result = await service.deleteSnapshot('snapshot-123', 'user-123');

      expect(result.success).toBe(true);
      expect(result.deletedId).toBe('snapshot-123');
      expect(snapshotRepository.remove).toHaveBeenCalledWith(mockSnapshot);
    });

    it('should delete snapshot if user is project owner', async () => {
      const snapshotByOtherUser = {
        ...mockSnapshot,
        user: { ...mockUser, id: 'other-user' },
      };

      (snapshotRepository.findOne as ReturnType<typeof jest.fn>).mockResolvedValue(
        snapshotByOtherUser,
      );
      (snapshotRepository.remove as ReturnType<typeof jest.fn>).mockResolvedValue(
        snapshotByOtherUser,
      );

      const result = await service.deleteSnapshot('snapshot-123', 'user-123');

      expect(result.success).toBe(true);
      expect(snapshotRepository.remove).toHaveBeenCalled();
    });

    it('should throw ForbiddenException if user is neither creator nor owner', async () => {
      const snapshotByOtherUser = {
        ...mockSnapshot,
        user: { ...mockUser, id: 'other-user' },
        project: { ...mockProject, user: { ...mockUser, id: 'another-user' } },
      };

      (snapshotRepository.findOne as ReturnType<typeof jest.fn>).mockResolvedValue(
        snapshotByOtherUser,
      );

      await expect(
        service.deleteSnapshot('snapshot-123', 'user-123'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('renderSnapshotHtml', () => {
    it('should render snapshot as HTML', async () => {
      const snapshotDoc = new Y.Doc();
      const fragment = snapshotDoc.getXmlFragment('prosemirror');
      const paragraph = new Y.XmlElement('paragraph');
      const textNode = new Y.XmlText();
      textNode.insert(0, 'Test content');
      paragraph.insert(0, [textNode]);
      fragment.insert(0, [paragraph]);

      const snapshotState = Y.encodeStateAsUpdate(snapshotDoc);
      const snapshotWithState = {
        ...mockSnapshot,
        yDocState: Buffer.from(snapshotState),
      };

      (snapshotRepository.findOne as ReturnType<typeof jest.fn>).mockResolvedValue(
        snapshotWithState,
      );

      const result = await service.renderSnapshotHtml('snapshot-123');

      expect(result).toBe('<html>Test</html>');
      expect(documentRenderer.renderDocumentAsHtml).toHaveBeenCalled();
    });
  });

  describe('calculateWordCount', () => {
    it('should calculate word count from Yjs document', async () => {
      // This is indirectly tested via createSnapshot
      // We can verify it works by checking the wordCount in created snapshots
      const mockYDoc = new Y.Doc();
      const fragment = mockYDoc.getXmlFragment('prosemirror');
      const paragraph = new Y.XmlElement('paragraph');
      const textNode = new Y.XmlText();
      textNode.insert(0, 'One two three four five'); // 5 words
      paragraph.insert(0, [textNode]);
      fragment.insert(0, [paragraph]);

      (projectRepository.findOne as ReturnType<typeof jest.fn>).mockResolvedValue(
        mockProject,
      );
      (userRepository.findOne as ReturnType<typeof jest.fn>).mockResolvedValue(
        mockUser,
      );
      mockDb.getYDoc.mockResolvedValue(mockYDoc);

      const result = await service.createSnapshot(
        'user',
        'project',
        'doc',
        'user-123',
        { name: 'Test' },
      );

      expect(result.wordCount).toBe(5);
    });
  });
});
