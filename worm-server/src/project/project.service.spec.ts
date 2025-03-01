import { Test, TestingModule } from '@nestjs/testing';
import { ProjectRepository } from './project.repository.js';
import { UserRepository } from '../auth/user.repository.js';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { LevelDBManagerService } from '../common/persistence/leveldb-manager.service.js';
import { ConfigService } from '@nestjs/config';
import { ProjectService } from './project.service.js';

describe('ProjectLevelDBService', () => {
  let projectService: ProjectService;
  let _projectRepository: ProjectRepository;
  let _userRepository: UserRepository;

  // Create mock for ProjectLevelDBRepository
  const mockProjectRepository = {
    findAllForUser: jest.fn<() => any>(),
    findByUsernameAndSlug: jest.fn<() => any>(),
    findById: jest.fn<() => any>(),
    find: jest.fn<() => any>(),
    findOne: jest.fn<() => any>(),
    createProject: jest.fn<() => any>(),
    updateProject: jest.fn<() => any>(),
    delete: jest.fn<() => any>(),
    isSlugAvailable: jest.fn<() => any>(),
  };

  // Create mock for UserLevelDBRepository
  const mockUserRepository = {
    findByUsername: jest.fn<() => any>(),
    findById: jest.fn<() => any>(),
  };

  // Create mock for LevelDBManagerService
  const mockLevelDBManagerService = {
    getProjectDatabase: jest.fn<() => any>(),
    getSystemDatabase: jest.fn<() => any>(),
    getSystemSublevel: jest.fn<() => any>(),
    deleteProjectDatabase: jest.fn<() => any>(),
  };

  // Create mock for ConfigService
  const mockConfigService = {
    get: jest.fn<(key: string) => any>().mockImplementation((key) => {
      if (key === 'Y_DATA_PATH') return './test-data';
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectService,
        {
          provide: ProjectRepository,
          useValue: mockProjectRepository,
        },
        {
          provide: UserRepository,
          useValue: mockUserRepository,
        },
        {
          provide: LevelDBManagerService,
          useValue: mockLevelDBManagerService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    projectService = module.get<ProjectService>(ProjectService);

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    // Restore all mocks
    jest.restoreAllMocks();
  });

  describe('findAllForCurrentUser', () => {
    it('should return all projects for a user', async () => {
      const userId = 'user1';
      const mockProjects = [
        { id: 'project1', title: 'Project 1', userId },
        { id: 'project2', title: 'Project 2', userId },
      ];

      mockProjectRepository.findAllForUser.mockResolvedValue(mockProjects);

      const result = await projectService.findAllForCurrentUser(userId);

      expect(mockProjectRepository.findAllForUser).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockProjects);
    });
  });

  describe('findByUsernameAndSlug', () => {
    it('should find a project by username and slug', async () => {
      const username = 'testuser';
      const slug = 'test-project';
      const mockProject = {
        id: 'project1',
        title: 'Test Project',
        slug,
        userId: 'user1',
      };

      mockProjectRepository.findByUsernameAndSlug.mockResolvedValue(
        mockProject,
      );

      const result = await projectService.findByUsernameAndSlug(username, slug);

      expect(mockProjectRepository.findByUsernameAndSlug).toHaveBeenCalledWith(
        username,
        slug,
      );
      expect(result).toEqual(mockProject);
    });

    it('should throw NotFoundException if project not found', async () => {
      const username = 'testuser';
      const slug = 'nonexistent-project';

      mockProjectRepository.findByUsernameAndSlug.mockResolvedValue(null);

      await expect(
        projectService.findByUsernameAndSlug(username, slug),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a new project', async () => {
      const userId = 'user1';
      const mockUser = {
        id: userId,
        username: 'testuser',
        email: 'test@example.com',
      };
      const projectData = {
        title: 'New Project',
        slug: 'new-project',
        description: 'A new test project',
      };
      const mockCreatedProject = {
        id: 'project1',
        ...projectData,
        userId,
        user: mockUser,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockProjectRepository.isSlugAvailable.mockResolvedValue(true);
      mockProjectRepository.createProject.mockResolvedValue(mockCreatedProject);

      const result = await projectService.create(userId, projectData);

      expect(mockUserRepository.findById).toHaveBeenCalledWith(userId);
      expect(mockProjectRepository.isSlugAvailable).toHaveBeenCalledWith(
        userId,
        projectData.slug,
      );
      expect(mockProjectRepository.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          ...projectData,
          userId,
          user: mockUser,
        }),
      );
      expect(result).toEqual(mockCreatedProject);
    });

    it('should throw ForbiddenException if user not found', async () => {
      const userId = 'nonexistent-user';
      const projectData = {
        title: 'New Project',
        slug: 'new-project',
      };

      mockUserRepository.findById.mockResolvedValue(null);

      await expect(projectService.create(userId, projectData)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException if project slug already exists for user', async () => {
      const userId = 'user1';
      const projectData = {
        title: 'New Project',
        slug: 'existing-project',
      };
      const mockUser = {
        id: userId,
        username: 'testuser',
      };

      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockProjectRepository.isSlugAvailable.mockResolvedValue(false);

      await expect(projectService.create(userId, projectData)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('update', () => {
    it('should update a project', async () => {
      const username = 'testuser';
      const slug = 'test-project';
      const existingProject = {
        id: 'project1',
        title: 'Test Project',
        description: 'Original description',
        slug,
        userId: 'user1',
      };
      const updateData = {
        title: 'Updated Project Title',
        description: 'Updated description',
      };
      const updatedProject = {
        ...existingProject,
        ...updateData,
        updatedAt: Date.now(),
      };

      mockProjectRepository.findByUsernameAndSlug.mockResolvedValue(
        existingProject,
      );
      mockProjectRepository.updateProject.mockResolvedValue(updatedProject);

      const result = await projectService.update(username, slug, updateData);

      expect(mockProjectRepository.findByUsernameAndSlug).toHaveBeenCalledWith(
        username,
        slug,
      );
      expect(mockProjectRepository.updateProject).toHaveBeenCalledWith(
        existingProject.id,
        expect.objectContaining(updateData),
      );
      expect(result).toEqual(updatedProject);
    });
  });

  describe('delete', () => {
    it('should delete a project', async () => {
      const username = 'testuser';
      const slug = 'test-project';
      const existingProject = {
        id: 'project1',
        title: 'Test Project',
        slug,
        userId: 'user1',
      };

      mockProjectRepository.findByUsernameAndSlug.mockResolvedValue(
        existingProject,
      );
      mockProjectRepository.delete.mockResolvedValue(undefined);

      await projectService.delete(username, slug);

      expect(mockProjectRepository.findByUsernameAndSlug).toHaveBeenCalledWith(
        username,
        slug,
      );
      expect(mockProjectRepository.delete).toHaveBeenCalledWith(
        existingProject.id,
      );
    });
  });
});
