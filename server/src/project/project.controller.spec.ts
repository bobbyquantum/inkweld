import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProjectController } from './project.controller.js';
import { ProjectService } from './project.service.js';
import { ProjectDto } from './project.dto.js';
import { ProjectEntity } from './project.entity.js';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { UserEntity } from '../user/user.entity.js';
import { UserService } from '../user/user.service.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
  mock,
  afterEach,
} from 'bun:test';
import { Mocked } from '../common/test/bun-test-utils.js';

import * as fs from 'fs';
import { Repository } from 'typeorm';
import { CoverController } from './cover/cover.controller.js';
import { FileStorageService } from './files/file-storage.service.js';
import { ProjectPublishEpubService } from './epub/project-publish-epub.service.js';
import { SchemaService } from './schemas/schema.service.js';
import { LevelDBManagerService } from '../common/persistence/leveldb-manager.service.js';

const mockFsPromises = {
  mkdir: jest.fn(),
  writeFile: jest.fn(),
  unlink: jest.fn(),
};
mock.module('fs', () => ({
  existsSync: jest.fn(),
  createReadStream: jest.fn(() => ({ pipe: jest.fn() })), // Mock stream with pipe
  promises: mockFsPromises,
  default: {
    // Handle default export if needed by consumers
    existsSync: jest.fn(),
    createReadStream: jest.fn(() => ({ pipe: jest.fn() })),
    promises: mockFsPromises,
  },
}));

mock.module('path', () => ({
  join: jest.fn().mockImplementation((...args) => args.join('/')),
  resolve: jest.fn().mockImplementation((...args) => args.join('/')),
  default: {
    // Handle default export
    join: jest.fn().mockImplementation((...args) => args.join('/')),
    resolve: jest.fn().mockImplementation((...args) => args.join('/')),
  },
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
    approved: true,
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

  const mockCoverController = {
    generateDefaultCover: jest.fn().mockResolvedValue(undefined), // Mock the method called
  };
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

    const mockFileStorageService = {
      saveFile: jest.fn(),
    };

    const mockProjectPublishEpubService = {
      publish: jest.fn(),
    };

    const mockSchemaService = {
      initializeProjectSchemas: jest.fn(),
      initializeProjectSchemasInDB: jest.fn().mockResolvedValue(undefined),
      getProjectSchemaLibrary: jest.fn(),
      getSchemaFromLibrary: jest.fn(),
      saveSchemaToLibrary: jest.fn(),
      deleteSchemaFromLibrary: jest.fn(),
    };

    const mockLevelDBManager = {
      getConnection: jest.fn(),
      closeConnection: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectController],
      providers: [
        {
          provide: getRepositoryToken(ProjectEntity),
          useValue: mockProjectRepository,
        },
        {
          provide: getRepositoryToken(UserEntity),
          useValue: mockUserRepository,
        },
        {
          provide: ProjectService,
          useValue: mockProjectService, // Keep using the mocked service
        },
        {
          provide: CoverController,
          useValue: mockCoverController,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: FileStorageService,
          useValue: mockFileStorageService,
        },
        {
          provide: ProjectPublishEpubService,
          useValue: mockProjectPublishEpubService,
        },
        {
          provide: SchemaService,
          useValue: mockSchemaService,
        },
        {
          provide: LevelDBManagerService,
          useValue: mockLevelDBManager,
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

    // Reset all file system mocks before each test
    jest.clearAllMocks();

    // Configure mock default behavior
    (fs.existsSync as jest.Mock).mockImplementation((_path) => true); // Default: everything exists
    (fs.createReadStream as jest.Mock).mockReturnValue({
      pipe: mockResponse.pipe,
    });
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
        updateProjectDto,
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
        controller.updateProject('testuser', 'nonexistent', updateProjectDto),
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
});
