import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProjectController } from './project.controller.js';
import { ProjectService } from './project.service.js';
import { ProjectDto } from './project.dto.js';
import { ProjectEntity } from './project.entity.js';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { UserEntity } from '../user/user.entity.js';
import { UserService } from '../user/user.service.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { beforeEach, describe, expect, it, jest, mock, afterEach, spyOn } from 'bun:test';
import { Mocked } from '../common/test/bun-test-utils.js';

import * as fs from 'fs';
import sharp from 'sharp';
import { Repository } from 'typeorm';

const mockFsPromises = {
  mkdir: jest.fn(),
  writeFile: jest.fn(),
  unlink: jest.fn(),
};
mock.module('fs', () => ({
  existsSync: jest.fn(),
  createReadStream: jest.fn(() => ({ pipe: jest.fn() })), // Mock stream with pipe
  promises: mockFsPromises,
  default: { // Handle default export if needed by consumers
    existsSync: jest.fn(),
    createReadStream: jest.fn(() => ({ pipe: jest.fn() })),
    promises: mockFsPromises,
  }
}));

mock.module('path', () => ({
  join: jest.fn().mockImplementation((...args) => args.join('/')),
  resolve: jest.fn().mockImplementation((...args) => args.join('/')),
  default: { // Handle default export
    join: jest.fn().mockImplementation((...args) => args.join('/')),
    resolve: jest.fn().mockImplementation((...args) => args.join('/')),
  }
}));

const mockSharpInstance = {
  metadata: jest.fn(),
  resize: jest.fn().mockReturnThis(),
  jpeg: jest.fn().mockReturnThis(),
  toBuffer: jest.fn(),
};
mock.module('sharp', () => ({
  __esModule: true, // Indicate ES Module
  default: jest.fn(() => mockSharpInstance),
}));

describe('ProjectController', () => {
  const mockUserService = {
    getCurrentUser: jest.fn<() => Promise<UserEntity>>(),
  };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let userRepository: Repository<UserEntity>;
  let controller: ProjectController;
  let projectService: Mocked<ProjectService>;

  const mockUser: UserEntity = {
    id: 'user-1',
    username: 'testuser',
    name: 'Test User',
    email: '',
    password: '',
    githubId: '',
    enabled: false,
  };
  const mockProject: ProjectEntity = {
    id: 'project-1',
    version: 1,
    slug: 'test-project',
    title: 'Test Project',
    description: 'A test project',
    user: mockUser as UserEntity,
    createdDate: new Date(),
    updatedDate: new Date(),
  };

  // Mock objects for cover image tests
  const mockUserReq = { user: { username: 'testuser' } };
  const mockFile = {
    fieldname: 'cover',
    originalname: 'test-image.jpg',
    encoding: '7bit',
    mimetype: 'image/jpeg',
    size: 12345,
    buffer: Buffer.from('test-image-data'),
  };
  const mockImageMetadataDefault = { width: 1600, height: 1000 }; // Correct 1.6 ratio
  const mockProcessedBuffer = Buffer.from('processed-image-data');

  // Mock response object for getProjectCover
  const mockResponse = {
    status: jest.fn().mockReturnThis(),
    send: jest.fn(),
    set: jest.fn(),
    pipe: jest.fn(), // Add pipe for stream handling
  };

  beforeEach(async () => {
    const mockProjectService = {
      findAllForCurrentUser: jest.fn(),
      findByUsernameAndSlug: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    // // Mock TypeORM repository methods if needed, though often just importing is enough for metadata
    const mockProjectRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
      // Add other methods used by ProjectService if necessary
    };
    const mockUserRepository = {
      findOne: jest.fn(),
      // Add other methods used by ProjectService if necessary
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectController],
      providers: [
        { provide: getRepositoryToken(ProjectEntity), useValue: mockProjectRepository },
        { provide: getRepositoryToken(UserEntity), useValue: mockUserRepository },
        {
          provide: ProjectService,
          useValue: mockProjectService, // Keep using the mocked service
        },
        {
          provide: UserService,
          useValue: mockUserService, // Keep using the mocked service
        },
        SessionAuthGuard,
      ],
    }).compile();

    // Setup user service mock for auth guard
    mockUserService.getCurrentUser.mockResolvedValue(mockUser);
    userRepository = module.get<Repository<UserEntity>>(
      getRepositoryToken(UserEntity),
    );
    controller = module.get<ProjectController>(ProjectController);
    projectService = module.get(ProjectService);

    // Reset mocks before each test
    jest.clearAllMocks();

    // Setup environment variable
    process.env.DATA_PATH = './data';

    // Configure mock return values using the mock instances
    mockSharpInstance.metadata.mockResolvedValue(mockImageMetadataDefault);
    mockSharpInstance.resize.mockReturnThis(); // Keep chaining
    mockSharpInstance.jpeg.mockReturnThis(); // Keep chaining
    mockSharpInstance.toBuffer.mockResolvedValue(mockProcessedBuffer);

    // Reset all file system mocks before each test
    jest.clearAllMocks();

    // Configure mock default behavior
    (fs.existsSync as jest.Mock).mockImplementation(_path => true); // Default: everything exists
    (fs.createReadStream as jest.Mock).mockReturnValue({ pipe: mockResponse.pipe });
    mockFsPromises.mkdir.mockResolvedValue(undefined);
    mockFsPromises.writeFile.mockResolvedValue(undefined);
    mockFsPromises.unlink.mockResolvedValue(undefined);
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.DATA_PATH;
  });

  describe('getAllProjects', () => {
    it('should return an array of projects', async () => {
      const mockProjects = [mockProject];
      projectService.findAllForCurrentUser.mockResolvedValue(mockProjects);

      const result = await controller.getAllProjects({
        user: mockUser,
        session: { userId: mockUser.id },
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(ProjectDto);
      expect(result[0].slug).toBe(mockProject.slug);
      expect(projectService.findAllForCurrentUser).toHaveBeenCalledWith(
        mockUser.id,
      );
    });

    it('should handle empty project list', async () => {
      projectService.findAllForCurrentUser.mockResolvedValue([]);

      const result = await controller.getAllProjects({
        user: mockUser,
        session: { userId: mockUser.id },
      });

      expect(result).toHaveLength(0);
      expect(projectService.findAllForCurrentUser).toHaveBeenCalledWith(
        mockUser.id,
      );
    });
  });

  describe('getProjectByUsernameAndSlug', () => {
    it('should return a project when found', async () => {
      projectService.findByUsernameAndSlug.mockResolvedValue(mockProject);

      const result = await controller.getProjectByUsernameAndSlug(
        'testuser',
        'test-project',
      );

      expect(result).toBeInstanceOf(ProjectDto);
      expect(result.slug).toBe(mockProject.slug);
      expect(projectService.findByUsernameAndSlug).toHaveBeenCalledWith(
        'testuser',
        'test-project',
      );
    });

    it('should throw NotFoundException when project not found', async () => {
      projectService.findByUsernameAndSlug.mockRejectedValue(
        new NotFoundException(),
      );

      await expect(
        controller.getProjectByUsernameAndSlug('testuser', 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createProject', () => {
    const mockCsrfToken = 'valid-csrf-token';
    const createProjectDto = new ProjectDto();
    createProjectDto.title = 'New Project';
    createProjectDto.slug = 'new-project';
    createProjectDto.description = 'A new test project';

    it('should create a new project', async () => {
      const createdProject: ProjectEntity = {
        ...mockProject,
        ...createProjectDto.toEntity(),
        id: 'new-project-1',
        version: 1,
        createdDate: new Date(),
        updatedDate: new Date(),
        user: mockUser as UserEntity,
      };
      projectService.create.mockResolvedValue(createdProject);

      const result = await controller.createProject(
        { user: mockUser, session: { userId: mockUser.id } },
        createProjectDto,
        mockCsrfToken,
      );

      expect(result).toBeInstanceOf(ProjectDto);
      expect(result.title).toBe(createProjectDto.title);
      expect(result.slug).toBe(createProjectDto.slug);
      expect(projectService.create).toHaveBeenCalledWith(
        mockUser.id,
        expect.any(ProjectEntity),
      );
    });

    it('should validate CSRF token presence', async () => {
      await expect(
        controller.createProject(
          { user: mockUser, session: { userId: mockUser.id } },
          createProjectDto,
          undefined,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateProject', () => {
    const updateProjectDto = new ProjectDto();
    updateProjectDto.title = 'Updated Project';
    updateProjectDto.description = 'An updated test project';

    it('should update an existing project', async () => {
      const updatedProject: ProjectEntity = {
        ...mockProject,
        ...updateProjectDto.toEntity(),
        version: mockProject.version + 1,
        updatedDate: new Date(),
      };
      projectService.update.mockResolvedValue(updatedProject);

      const result = await controller.updateProject(
        'testuser',
        'test-project',
        updateProjectDto
      );

      expect(result).toBeInstanceOf(ProjectDto);
      expect(result.title).toBe(updateProjectDto.title);
      expect(projectService.update).toHaveBeenCalledWith(
        'testuser',
        'test-project',
        expect.any(Object),
      );
    });

    it('should throw NotFoundException when project not found', async () => {
      projectService.update.mockRejectedValue(new NotFoundException());

      await expect(
        controller.updateProject(
          'testuser',
          'nonexistent',
          updateProjectDto
        ),
      ).rejects.toThrow(NotFoundException);
    });

    // it('should validate CSRF token presence', async () => {
    //   await expect(
    //     controller.updateProject(
    //       'testuser',
    //       'test-project',
    //       updateProjectDto,
    //       undefined,
    //     ),
    //   ).rejects.toThrow(ForbiddenException);
    // });
  });

  describe('deleteProject', () => {
    const mockCsrfToken = 'valid-csrf-token';

    it('should delete an existing project', async () => {
      projectService.delete.mockResolvedValue(undefined);

      await expect(
        controller.deleteProject('testuser', 'test-project', mockCsrfToken),
      ).resolves.toBeUndefined();

      expect(projectService.delete).toHaveBeenCalledWith(
        'testuser',
        'test-project',
      );
    });

    it('should throw NotFoundException when project not found', async () => {
      projectService.delete.mockRejectedValue(new NotFoundException());

      await expect(
        controller.deleteProject('testuser', 'nonexistent', mockCsrfToken),
      ).rejects.toThrow(NotFoundException);
    });

    it('should validate CSRF token presence', async () => {
      await expect(
        controller.deleteProject('testuser', 'test-project', undefined),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // --- Tests for Cover Image Functionality ---
  describe('uploadCover', () => {
    it('should upload a cover image successfully (correct aspect ratio)', async () => {
      // Spy on the saveProjectCover method
      const saveSpy = spyOn(controller as any, 'saveProjectCover')
        .mockResolvedValueOnce(undefined);

      const result = await controller.uploadCover(
        'testuser',
        'test-project',
        mockFile,
        mockUserReq
      );

      expect(result).toEqual({ message: 'Cover image uploaded successfully' });

      // Verify saveProjectCover was called with correct params
      expect(saveSpy).toHaveBeenCalledWith(
        'testuser',
        'test-project',
        expect.any(Buffer)
      );

      // Sharp was called correctly
      expect(sharp).toHaveBeenCalledWith(mockFile.buffer);
      expect(mockSharpInstance.jpeg).toHaveBeenCalled();
      expect(mockSharpInstance.toBuffer).toHaveBeenCalled();
      // Ensure sharp was called
      expect(sharp).toHaveBeenCalledWith(mockFile.buffer); // Check if sharp constructor was called
      expect(mockSharpInstance.resize).not.toHaveBeenCalled(); // Should not resize if ratio is correct
      expect(mockSharpInstance.jpeg).toHaveBeenCalled();
      expect(mockSharpInstance.toBuffer).toHaveBeenCalled();
    });

    it('should throw BadRequestException if no file is uploaded', async () => {
      await expect(
        controller.uploadCover(
          'testuser',
          'test-project',
          null,
          mockUserReq
        )
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException if user is not the project owner', async () => {
      await expect(
        controller.uploadCover(
          'testuser',
          'test-project',
          mockFile,
          { user: { username: 'differentuser' } }
        )
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if image is smaller than minimum width', async () => {
      // Override the metadata mock for this test
      mockSharpInstance.metadata.mockResolvedValueOnce({ width: 800, height: 500 });

      await expect(
        controller.uploadCover(
          'testuser',
          'test-project',
          mockFile,
          mockUserReq
        )
      ).rejects.toThrow(/Image width must be at least 1000px/);
    });

    it('should crop the image if aspect ratio is not 1.6:1', async () => {
      // Spy on the saveProjectCover method
      const saveSpy = spyOn(controller as any, 'saveProjectCover')
        .mockResolvedValueOnce(undefined);

      // Override the metadata mock for this test with a 4:3 ratio image
      mockSharpInstance.metadata.mockResolvedValueOnce({ width: 1600, height: 1200 });

      await controller.uploadCover(
        'testuser',
        'test-project',
        mockFile,
        mockUserReq
      );

      // Should resize to maintain 1.6:1 ratio (1600/1.6 = 1000)
      expect(mockSharpInstance.resize).toHaveBeenCalledWith(
        1600,
        1000,
        expect.objectContaining({ fit: 'cover', position: 'center' })
      );
      expect(mockSharpInstance.jpeg).toHaveBeenCalled();

      // Verify saveProjectCover was called
      expect(saveSpy).toHaveBeenCalledWith(
        'testuser',
        'test-project',
        expect.any(Buffer)
      );
    });
  });

  describe('getProjectCover', () => {
    it('should return the cover image stream when it exists', async () => {
      await controller.getProjectCover('testuser', 'test-project', mockResponse);

      expect(fs.existsSync).toHaveBeenCalledWith('./data/testuser/test-project/cover.jpg');
      expect(fs.createReadStream).toHaveBeenCalledWith('./data/testuser/test-project/cover.jpg');
      expect(mockResponse.set).toHaveBeenCalledWith({
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      });
      expect(mockResponse.pipe).toHaveBeenCalled(); // Check if stream was piped
    });

    it('should return 404 when cover image does not exist', async () => {
      // Override existsSync for this test
      (fs.existsSync as jest.Mock).mockReturnValueOnce(false);

      await controller.getProjectCover('testuser', 'test-project', mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.send).toHaveBeenCalledWith('Cover image not found');
    });
  });

  describe('deleteCover', () => {
    it('should delete the cover image successfully', async () => {
      // Spy on the deleteProjectCover method
      const deleteSpy = spyOn(controller as any, 'deleteProjectCover')
        .mockResolvedValueOnce(undefined);

      const result = await controller.deleteCover(
        'testuser',
        'test-project',
        mockUserReq
      );

      expect(result).toEqual({ message: 'Cover image deleted successfully' });

      // Verify deleteProjectCover was called with correct params
      expect(deleteSpy).toHaveBeenCalledWith('testuser', 'test-project');
    });

    it('should throw ForbiddenException if user is not the project owner', async () => {
      await expect(
        controller.deleteCover(
          'testuser',
          'test-project',
          { user: { username: 'differentuser' } }
        )
      ).rejects.toThrow(ForbiddenException);
    });

    it('should not throw error and not call unlink if file does not exist during deletion', async () => {
      // Mock existsSync to return false (file doesn't exist)
      (fs.existsSync as jest.Mock).mockReturnValueOnce(false);

      const result = await controller.deleteCover(
        'testuser',
        'test-project',
        mockUserReq
      );

      expect(result).toEqual({ message: 'Cover image deleted successfully' });
      expect(mockFsPromises.unlink).not.toHaveBeenCalled(); // Ensure unlink was not called
    });
  });
});
