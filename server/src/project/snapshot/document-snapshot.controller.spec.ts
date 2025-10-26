import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, jest } from 'bun:test';
import { DocumentSnapshotController } from './document-snapshot.controller.js';
import { DocumentSnapshotService } from './document-snapshot.service.js';
import { SessionAuthGuard } from '../../auth/session-auth.guard.js';
import type { Request, Response } from 'express';
import type {
  CreateSnapshotDto,
  SnapshotDto,
  PaginatedSnapshotsDto,
  RestoreSnapshotDto,
  ListSnapshotsQuery,
} from './document-snapshot.dto.js';

describe('DocumentSnapshotController', () => {
  let controller: DocumentSnapshotController;
  let service: DocumentSnapshotService;

  const mockRequest = {
    user: {
      id: 'user-123',
      username: 'testuser',
    },
  } as unknown as Request;

  const mockSnapshot: SnapshotDto = {
    id: 'snapshot-123',
    documentId: 'testuser:test-project:chapter1',
    name: 'Test Snapshot',
    description: 'Test description',
    wordCount: 100,
    createdAt: '2024-01-01T00:00:00.000Z',
    createdBy: {
      id: 'user-123',
      username: 'testuser',
    },
  };

  beforeEach(async () => {
    const mockService = {
      createSnapshot: jest.fn(),
      listSnapshots: jest.fn(),
      getSnapshot: jest.fn(),
      restoreSnapshot: jest.fn(),
      deleteSnapshot: jest.fn(),
      renderSnapshotHtml: jest.fn(),
    };

    const mockGuard = {
      canActivate: jest.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DocumentSnapshotController],
      providers: [
        {
          provide: DocumentSnapshotService,
          useValue: mockService,
        },
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue(mockGuard)
      .compile();

    controller = module.get<DocumentSnapshotController>(
      DocumentSnapshotController,
    );
    service = module.get<DocumentSnapshotService>(DocumentSnapshotService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createSnapshot', () => {
    it('should create a snapshot', async () => {
      const username = 'testuser';
      const slug = 'test-project';
      const docId = 'chapter1';
      const createDto: CreateSnapshotDto = {
        name: 'Chapter 1 Draft',
        description: 'First draft',
      };

      (service.createSnapshot as ReturnType<typeof jest.fn>).mockResolvedValue(
        mockSnapshot,
      );

      const result = await controller.createSnapshot(
        username,
        slug,
        docId,
        mockRequest,
        createDto,
      );

      expect(result).toEqual(mockSnapshot);
      expect(service.createSnapshot).toHaveBeenCalledWith(
        username,
        slug,
        docId,
        'user-123',
        createDto,
      );
    });
  });

  describe('listSnapshots', () => {
    it('should list snapshots with default pagination', async () => {
      const username = 'testuser';
      const slug = 'test-project';
      const docId = 'chapter1';
      const paginatedResponse: PaginatedSnapshotsDto = {
        snapshots: [mockSnapshot],
        total: 1,
        limit: 50,
        offset: 0,
      };

      (service.listSnapshots as ReturnType<typeof jest.fn>).mockResolvedValue(
        paginatedResponse,
      );

      const result = await controller.listSnapshots(
        username,
        slug,
        docId,
        {} as ListSnapshotsQuery,
      );

      expect(result).toEqual(paginatedResponse);
      expect(service.listSnapshots).toHaveBeenCalledWith(
        username,
        slug,
        docId,
        {},
      );
    });

    it('should list snapshots with custom pagination', async () => {
      const username = 'testuser';
      const slug = 'test-project';
      const docId = 'chapter1';
      const query: ListSnapshotsQuery = {
        limit: 25,
        offset: 10,
        orderBy: 'name',
        order: 'ASC',
      };
      const paginatedResponse: PaginatedSnapshotsDto = {
        snapshots: [mockSnapshot],
        total: 15,
        limit: 25,
        offset: 10,
      };

      (service.listSnapshots as ReturnType<typeof jest.fn>).mockResolvedValue(
        paginatedResponse,
      );

      const result = await controller.listSnapshots(
        username,
        slug,
        docId,
        query,
      );

      expect(result).toEqual(paginatedResponse);
      expect(service.listSnapshots).toHaveBeenCalledWith(
        username,
        slug,
        docId,
        query,
      );
    });
  });

  describe('getSnapshot', () => {
    it('should get a snapshot by ID', async () => {
      const snapshotId = 'snapshot-123';

      (service.getSnapshot as ReturnType<typeof jest.fn>).mockResolvedValue(
        mockSnapshot,
      );

      const result = await controller.getSnapshot(snapshotId);

      expect(result).toEqual(mockSnapshot);
      expect(service.getSnapshot).toHaveBeenCalledWith(snapshotId);
    });
  });

  describe('restoreSnapshot', () => {
    it('should restore a snapshot', async () => {
      const username = 'testuser';
      const slug = 'test-project';
      const docId = 'chapter1';
      const snapshotId = 'snapshot-123';
      const restoreResponse: RestoreSnapshotDto = {
        success: true,
        documentId: 'testuser:test-project:chapter1',
        restoredFrom: snapshotId,
        restoredAt: '2024-01-01T12:00:00.000Z',
      };

      (service.restoreSnapshot as ReturnType<typeof jest.fn>).mockResolvedValue(
        restoreResponse,
      );

      const result = await controller.restoreSnapshot(
        username,
        slug,
        docId,
        snapshotId,
        mockRequest,
      );

      expect(result).toEqual(restoreResponse);
      expect(service.restoreSnapshot).toHaveBeenCalledWith(
        username,
        slug,
        docId,
        snapshotId,
        'user-123',
      );
    });
  });

  describe('deleteSnapshot', () => {
    it('should delete a snapshot', async () => {
      const snapshotId = 'snapshot-123';
      const deleteResponse = {
        success: true,
        deletedId: snapshotId,
      };

      (service.deleteSnapshot as ReturnType<typeof jest.fn>).mockResolvedValue(
        deleteResponse,
      );

      const result = await controller.deleteSnapshot(
        snapshotId,
        mockRequest,
      );

      expect(result).toEqual(deleteResponse);
      expect(service.deleteSnapshot).toHaveBeenCalledWith(
        snapshotId,
        'user-123',
      );
    });
  });

  describe('previewSnapshot', () => {
    it('should render snapshot as HTML', async () => {
      const snapshotId = 'snapshot-123';
      const html = '<html><body><p>Test content</p></body></html>';
      const mockResponse = {
        send: jest.fn(),
      } as unknown as Response;

      (service.renderSnapshotHtml as ReturnType<typeof jest.fn>).mockResolvedValue(
        html,
      );

      await controller.previewSnapshot(snapshotId, mockResponse);

      expect(service.renderSnapshotHtml).toHaveBeenCalledWith(snapshotId);
      expect(mockResponse.send).toHaveBeenCalledWith(html);
    });
  });
});
