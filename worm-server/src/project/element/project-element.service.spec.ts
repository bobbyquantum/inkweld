import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProjectElementService } from './project-element.service.js';
import { ProjectElementEntity } from './project-element.entity.js';
import { ProjectService } from '../project.service.js';
import { ProjectEntity } from '../project.entity.js';
import { ElementType } from './element-type.enum.js';
import { ProjectElementDto } from './project-element.dto.js';
import { NotFoundException, BadRequestException, Logger } from '@nestjs/common';

describe('ProjectElementService', () => {
  let service: ProjectElementService;
  let elementRepository: Repository<ProjectElementEntity>;
  let projectService: ProjectService;

  const mockProject: ProjectEntity = {
    id: '123',
    version: 1,
    slug: 'test-project',
    title: 'Test Project',
    description: 'A test project',
    user: null,
    createdDate: new Date(),
    updatedDate: new Date(),
  };

  const mockElement: ProjectElementEntity = {
    id: '456',
    version: 1,
    name: 'Test Element',
    type: ElementType.FOLDER,
    position: 0,
    level: 0,
    project: mockProject,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    content: null,
    value: null,
  };

  const mockElementDto = new ProjectElementDto(mockElement);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectElementService,
        {
          provide: getRepositoryToken(ProjectElementEntity),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: ProjectService,
          useValue: {
            findByUsernameAndSlug: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ProjectElementService>(ProjectElementService);
    elementRepository = module.get<Repository<ProjectElementEntity>>(
      getRepositoryToken(ProjectElementEntity),
    );
    projectService = module.get<ProjectService>(ProjectService);

    // Suppress logger output during tests
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
  });

  describe('getProjectElements', () => {
    it('should return all elements for a project', async () => {
      jest
        .spyOn(projectService, 'findByUsernameAndSlug')
        .mockResolvedValue(mockProject);
      jest.spyOn(elementRepository, 'find').mockResolvedValue([mockElement]);

      const result = await service.getProjectElements(
        'testuser',
        'test-project',
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(ProjectElementDto);
      expect(result[0].id).toBe(mockElement.id);
      expect(elementRepository.find).toHaveBeenCalledWith({
        where: { project: { id: mockProject.id } },
        order: { position: 'ASC' },
      });
    });

    it('should throw NotFoundException if project not found', async () => {
      jest
        .spyOn(projectService, 'findByUsernameAndSlug')
        .mockRejectedValue(new NotFoundException());

      await expect(
        service.getProjectElements('testuser', 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('bulkDinsertElements', () => {
    it('should create new elements', async () => {
      const newElement = Object.assign(new ProjectElementEntity(), {
        name: 'New Element',
        type: ElementType.ITEM,
        position: 1,
        level: 1,
      });
      const newDto = new ProjectElementDto(newElement);

      jest
        .spyOn(projectService, 'findByUsernameAndSlug')
        .mockResolvedValue(mockProject);
      jest.spyOn(elementRepository, 'find').mockResolvedValue([]);
      jest.spyOn(elementRepository, 'save').mockImplementation(async (entity) =>
        Object.assign(new ProjectElementEntity(), {
          ...entity,
          id: '789',
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      const result = await service.bulkDinsertElements(
        'testuser',
        'test-project',
        [newDto],
      );

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('789');
      expect(elementRepository.save).toHaveBeenCalled();
    });

    it('should update existing elements', async () => {
      const updatedElement = Object.assign(new ProjectElementEntity(), {
        id: '456',
        version: 1,
        name: 'Updated Element',
        type: ElementType.FOLDER,
        position: 0,
        level: 0,
      });
      const updatedDto = new ProjectElementDto(updatedElement);

      jest
        .spyOn(projectService, 'findByUsernameAndSlug')
        .mockResolvedValue(mockProject);
      jest.spyOn(elementRepository, 'find').mockResolvedValue([mockElement]);
      jest.spyOn(elementRepository, 'findOne').mockResolvedValue(mockElement);
      jest.spyOn(elementRepository, 'save').mockImplementation(async (entity) =>
        Object.assign(new ProjectElementEntity(), {
          ...entity,
          updatedAt: new Date(),
        }),
      );

      const result = await service.bulkDinsertElements(
        'testuser',
        'test-project',
        [updatedDto],
      );

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Updated Element');
      expect(elementRepository.save).toHaveBeenCalled();
    });

    it('should delete elements not in the new list', async () => {
      jest
        .spyOn(projectService, 'findByUsernameAndSlug')
        .mockResolvedValue(mockProject);
      jest.spyOn(elementRepository, 'find').mockResolvedValue([mockElement]);
      jest.spyOn(elementRepository, 'remove').mockResolvedValue(mockElement);

      const result = await service.bulkDinsertElements(
        'testuser',
        'test-project',
        [],
      );

      expect(result).toHaveLength(0);
      expect(elementRepository.remove).toHaveBeenCalledWith([mockElement]);
    });

    it('should throw NotFoundException for non-existent element update', async () => {
      const nonExistentElement = Object.assign(new ProjectElementEntity(), {
        id: 'non-existent',
        name: 'Non-existent',
        type: ElementType.ITEM,
        position: 0,
        level: 0,
      });
      const nonExistentDto = new ProjectElementDto(nonExistentElement);

      jest
        .spyOn(projectService, 'findByUsernameAndSlug')
        .mockResolvedValue(mockProject);
      jest.spyOn(elementRepository, 'find').mockResolvedValue([]);
      jest.spyOn(elementRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.bulkDinsertElements('testuser', 'test-project', [
          nonExistentDto,
        ]),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for invalid element', async () => {
      const invalidElement = Object.assign(new ProjectElementEntity(), {
        name: '', // Invalid: empty name
        type: ElementType.ITEM,
        position: 0,
        level: 0,
      });
      const invalidDto = new ProjectElementDto(invalidElement);

      jest
        .spyOn(projectService, 'findByUsernameAndSlug')
        .mockResolvedValue(mockProject);

      await expect(
        service.bulkDinsertElements('testuser', 'test-project', [invalidDto]),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if element belongs to different project', async () => {
      const differentProject = { ...mockProject, id: 'different-id' };
      const elementFromDifferentProject = {
        ...mockElement,
        project: differentProject,
      };

      jest
        .spyOn(projectService, 'findByUsernameAndSlug')
        .mockResolvedValue(mockProject);
      jest.spyOn(elementRepository, 'find').mockResolvedValue([mockElement]);
      jest
        .spyOn(elementRepository, 'findOne')
        .mockResolvedValue(elementFromDifferentProject);

      await expect(
        service.bulkDinsertElements('testuser', 'test-project', [
          mockElementDto,
        ]),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('validation', () => {
    it('should throw BadRequestException for missing name', async () => {
      const invalidElement = Object.assign(new ProjectElementEntity(), {
        type: ElementType.ITEM,
        position: 0,
        level: 0,
      });
      const invalidDto = new ProjectElementDto(invalidElement);

      jest
        .spyOn(projectService, 'findByUsernameAndSlug')
        .mockResolvedValue(mockProject);

      await expect(
        service.bulkDinsertElements('testuser', 'test-project', [invalidDto]),
      ).rejects.toThrow('Name is required');
    });

    it('should throw BadRequestException for missing type', async () => {
      const invalidElement = Object.assign(new ProjectElementEntity(), {
        name: 'Test',
        position: 0,
        level: 0,
      });
      const invalidDto = new ProjectElementDto(invalidElement);

      jest
        .spyOn(projectService, 'findByUsernameAndSlug')
        .mockResolvedValue(mockProject);

      await expect(
        service.bulkDinsertElements('testuser', 'test-project', [invalidDto]),
      ).rejects.toThrow('Type is required');
    });

    it('should throw BadRequestException for missing position', async () => {
      const invalidElement = Object.assign(new ProjectElementEntity(), {
        name: 'Test',
        type: ElementType.ITEM,
        level: 0,
      });
      const invalidDto = new ProjectElementDto(invalidElement);

      jest
        .spyOn(projectService, 'findByUsernameAndSlug')
        .mockResolvedValue(mockProject);

      await expect(
        service.bulkDinsertElements('testuser', 'test-project', [invalidDto]),
      ).rejects.toThrow('Position is required');
    });

    it('should throw BadRequestException for missing level', async () => {
      const invalidElement = Object.assign(new ProjectElementEntity(), {
        name: 'Test',
        type: ElementType.ITEM,
        position: 0,
      });
      const invalidDto = new ProjectElementDto(invalidElement);

      jest
        .spyOn(projectService, 'findByUsernameAndSlug')
        .mockResolvedValue(mockProject);

      await expect(
        service.bulkDinsertElements('testuser', 'test-project', [invalidDto]),
      ).rejects.toThrow('Level is required');
    });
  });
});
