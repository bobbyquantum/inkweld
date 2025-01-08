import { Test, TestingModule } from '@nestjs/testing';
import { ProjectController } from './project.controller.js';
import { ProjectService } from './project.service.js';
import { ProjectDto } from './project.dto.js';
import { ProjectEntity } from './project.entity.js';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { UserEntity } from '../user/user.entity.js';
import { UserService } from '../user/user.service.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
describe('ProjectController', () => {
  const mockUserService = {
    getCurrentUser: jest.fn<() => Promise<UserEntity>>(),
  };
  let controller: ProjectController;
  let projectService: jest.Mocked<ProjectService>;

  const mockUser: UserEntity = {
    id: 'user-1',
    username: 'testuser',
    name: 'Test User',
    email: '',
    password: '',
    githubId: '',
    enabled: false,
    avatarImageUrl: '',
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

  beforeEach(async () => {
    const mockProjectService = {
      findAllForCurrentUser: jest.fn(),
      findByUsernameAndSlug: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectController],
      providers: [
        {
          provide: ProjectService,
          useValue: mockProjectService,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
        SessionAuthGuard,
      ],
    }).compile();

    // Setup user service mock for auth guard
    mockUserService.getCurrentUser.mockResolvedValue(mockUser);

    controller = module.get<ProjectController>(ProjectController);
    projectService = module.get(ProjectService);
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
    const mockCsrfToken = 'valid-csrf-token';
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
        mockCsrfToken,
      );

      expect(result).toBeInstanceOf(ProjectDto);
      expect(result.title).toBe(updateProjectDto.title);
      expect(projectService.update).toHaveBeenCalledWith(
        'testuser',
        'test-project',
        expect.any(ProjectEntity),
      );
    });

    it('should throw NotFoundException when project not found', async () => {
      projectService.update.mockRejectedValue(new NotFoundException());

      await expect(
        controller.updateProject(
          'testuser',
          'nonexistent',
          updateProjectDto,
          mockCsrfToken,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should validate CSRF token presence', async () => {
      await expect(
        controller.updateProject(
          'testuser',
          'test-project',
          updateProjectDto,
          undefined,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
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
