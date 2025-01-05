import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProjectService } from './project.service';
import { ProjectEntity } from './project.entity';
import { UserEntity } from '../user/user.entity';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('ProjectService', () => {
  let service: ProjectService;
  let projectRepository: Repository<ProjectEntity>;
  let userRepository: Repository<UserEntity>;

  const mockUser: UserEntity = {
    id: '123',
    username: 'testuser',
    password: 'password',
    githubId: null,
    name: 'Test User',
    email: 'test@example.com',
    enabled: true,
    avatarImageUrl: null,
  };

  const mockProject: ProjectEntity = {
    id: '456',
    title: 'Test Project',
    description: 'A test project',
    slug: 'test-project',
    createdDate: new Date(),
    updatedDate: new Date(),
    version: 1,
    user: mockUser,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectService,
        {
          provide: getRepositoryToken(ProjectEntity),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(UserEntity),
          useValue: {
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ProjectService>(ProjectService);
    projectRepository = module.get<Repository<ProjectEntity>>(
      getRepositoryToken(ProjectEntity),
    );
    userRepository = module.get<Repository<UserEntity>>(
      getRepositoryToken(UserEntity),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAllForCurrentUser', () => {
    it('should return all projects for a user', async () => {
      const projects = [mockProject];
      jest.spyOn(projectRepository, 'find').mockResolvedValue(projects);

      const result = await service.findAllForCurrentUser(mockUser.id);
      expect(result).toEqual(projects);
      expect(projectRepository.find).toHaveBeenCalledWith({
        where: { user: { id: mockUser.id } },
        order: { createdDate: 'DESC' },
      });
    });
  });

  describe('findByUsernameAndSlug', () => {
    it('should return a project when found', async () => {
      jest.spyOn(projectRepository, 'findOne').mockResolvedValue(mockProject);

      const result = await service.findByUsernameAndSlug(
        'testuser',
        'test-project',
      );
      expect(result).toEqual(mockProject);
      expect(projectRepository.findOne).toHaveBeenCalledWith({
        where: { slug: 'test-project', user: { username: 'testuser' } },
      });
    });

    it('should throw NotFoundException when project not found', async () => {
      jest.spyOn(projectRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.findByUsernameAndSlug('testuser', 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a new project', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser);
      jest.spyOn(projectRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(projectRepository, 'save').mockResolvedValue(mockProject);

      const result = await service.create(mockUser.id, mockProject);
      expect(result).toEqual(mockProject);
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockUser.id },
      });
      expect(projectRepository.save).toHaveBeenCalled();
    });

    it('should throw ForbiddenException when user not found', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

      await expect(service.create(mockUser.id, mockProject)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException when project already exists', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser);
      jest.spyOn(projectRepository, 'findOne').mockResolvedValue(mockProject);

      await expect(service.create(mockUser.id, mockProject)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('update', () => {
    const updatedProject = {
      ...mockProject,
      title: 'Updated Title',
      description: 'Updated description',
    };

    it('should update an existing project', async () => {
      jest.spyOn(projectRepository, 'findOne').mockResolvedValue(mockProject);
      jest.spyOn(projectRepository, 'save').mockResolvedValue(updatedProject);

      const result = await service.update(
        'testuser',
        'test-project',
        updatedProject,
      );
      expect(result).toEqual(updatedProject);
      expect(projectRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when project not found', async () => {
      jest.spyOn(projectRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.update('testuser', 'non-existent', updatedProject),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('should delete an existing project', async () => {
      jest.spyOn(projectRepository, 'findOne').mockResolvedValue(mockProject);
      jest.spyOn(projectRepository, 'remove').mockResolvedValue(mockProject);

      await service.delete('testuser', 'test-project');
      expect(projectRepository.remove).toHaveBeenCalledWith(mockProject);
    });

    it('should throw NotFoundException when project not found', async () => {
      jest.spyOn(projectRepository, 'findOne').mockResolvedValue(null);

      await expect(service.delete('testuser', 'non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
