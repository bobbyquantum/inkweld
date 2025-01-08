import { Test, TestingModule } from '@nestjs/testing';
import { McpService } from './mcp.service.js';
import { ProjectService } from '../project/project.service.js';
import { YjsGateway } from '../ws/yjs-gateway.js';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
describe('McpService', () => {
  let service: McpService;
  let mockProjectService: jest.Mocked<ProjectService>;
  let mockYjsGateway: jest.Mocked<YjsGateway>;

  beforeEach(async () => {
    mockProjectService = {
      findAllForCurrentUser: jest.fn(),
      findAll: jest.fn(),
    } as unknown as jest.Mocked<ProjectService>;

    mockYjsGateway = {
      updateDocument: jest.fn(),
    } as unknown as jest.Mocked<YjsGateway>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        McpService,
        { provide: ProjectService, useValue: mockProjectService },
        { provide: YjsGateway, useValue: mockYjsGateway },
      ],
    }).compile();

    service = module.get<McpService>(McpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should initialize successfully', async () => {
      await service.onModuleInit();
    });
  });

  describe('handleListProjects', () => {
    it('should return projects', async () => {
      const mockProjects = [
        {
          id: '1',
          name: 'Test Project',
          version: 1,
          slug: 'test-project',
          title: 'Test Project',
          description: 'Test project description',
          createdAt: new Date(),
          updatedAt: new Date(),
          createdDate: new Date(),
          updatedDate: new Date(),
          user: {
            id: 'user-1',
            username: 'testuser',
            email: 'test@example.com',
            name: 'Test User',
            password: 'hashedpassword',
            githubId: '12345',
            enabled: true,
            avatarImageUrl: 'https://example.com/avatar.png',
          },
          elements: [],
        },
      ];
      mockProjectService.findAll.mockResolvedValue(mockProjects);

      const result = await service['handleListProjects']();
      expect(result.content[0].text).toEqual(
        JSON.stringify(mockProjects, null, 2),
      );
      expect(mockProjectService.findAll).toHaveBeenCalled();
    });
  });

  describe('handleUpdateDocument', () => {
    it('should update document successfully', async () => {
      const documentId = 'test-doc';
      const content = 'new content';
      mockYjsGateway.updateDocument.mockResolvedValue();

      const result = await service['handleUpdateDocument']({
        documentId,
        content,
      });
      expect(result.content[0].text).toEqual(
        JSON.stringify({ success: true }, null, 2),
      );
      expect(mockYjsGateway.updateDocument).toHaveBeenCalledWith(
        documentId,
        content,
      );
    });

    it('should handle update errors', async () => {
      const documentId = 'test-doc';
      const content = 'new content';
      const error = new Error('Update failed');
      mockYjsGateway.updateDocument.mockRejectedValue(error);

      await expect(
        service['handleUpdateDocument']({ documentId, content }),
      ).rejects.toThrow(error);
    });
  });
});
