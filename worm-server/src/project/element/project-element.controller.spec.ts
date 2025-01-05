import { Test, TestingModule } from '@nestjs/testing';
import { ProjectElementController } from './project-element.controller';
import { ProjectElementService } from './project-element.service';
import { ProjectElementDto } from './project-element.dto';
import { ElementType } from './element-type.enum';
import { ProjectElementEntity } from './project-element.entity';
import { NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { SessionAuthGuard } from '../../auth/session-auth.guard';

describe('ProjectElementController', () => {
  const mockGuard = { canActivate: () => true };
  let controller: ProjectElementController;
  let service: ProjectElementService;

  const mockElement = Object.assign(new ProjectElementEntity(), {
    id: '456',
    version: 1,
    name: 'Test Element',
    type: ElementType.FOLDER,
    position: 0,
    level: 0,
  });

  const mockElementDto = new ProjectElementDto(mockElement);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectElementController],
      providers: [
        {
          provide: ProjectElementService,
          useValue: {
            getProjectElements: jest.fn(),
            bulkDinsertElements: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue(mockGuard)
      .compile();

    controller = module.get<ProjectElementController>(ProjectElementController);
    service = module.get<ProjectElementService>(ProjectElementService);

    // Suppress logger output during tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getProjectElements', () => {
    it('should return all elements for a project', async () => {
      jest
        .spyOn(service, 'getProjectElements')
        .mockResolvedValue([mockElementDto]);

      const result = await controller.getProjectElements(
        'testuser',
        'test-project',
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockElementDto);
      expect(service.getProjectElements).toHaveBeenCalledWith(
        'testuser',
        'test-project',
      );
    });

    it('should throw NotFoundException if project not found', async () => {
      jest
        .spyOn(service, 'getProjectElements')
        .mockRejectedValue(new NotFoundException());

      await expect(
        controller.getProjectElements('testuser', 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('dinsertElements', () => {
    const csrfToken = 'test-csrf-token';

    it('should update elements successfully', async () => {
      const updatedElement = Object.assign(new ProjectElementEntity(), {
        ...mockElement,
        name: 'Updated Element',
      });
      const updatedDto = new ProjectElementDto(updatedElement);

      jest
        .spyOn(service, 'bulkDinsertElements')
        .mockResolvedValue([updatedDto]);

      const result = await controller.dinsertElements(
        'testuser',
        'test-project',
        csrfToken,
        [updatedDto],
      );

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Updated Element');
      expect(service.bulkDinsertElements).toHaveBeenCalledWith(
        'testuser',
        'test-project',
        [updatedDto],
      );
    });

    it('should handle empty elements list', async () => {
      jest.spyOn(service, 'bulkDinsertElements').mockResolvedValue([]);

      const result = await controller.dinsertElements(
        'testuser',
        'test-project',
        csrfToken,
        [],
      );

      expect(result).toHaveLength(0);
      expect(service.bulkDinsertElements).toHaveBeenCalledWith(
        'testuser',
        'test-project',
        [],
      );
    });

    it('should throw NotFoundException if project not found', async () => {
      jest
        .spyOn(service, 'bulkDinsertElements')
        .mockRejectedValue(new NotFoundException());

      await expect(
        controller.dinsertElements('testuser', 'non-existent', csrfToken, [
          mockElementDto,
        ]),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for invalid elements', async () => {
      const invalidElement = Object.assign(new ProjectElementEntity(), {
        name: '', // Invalid: empty name
        type: ElementType.ITEM,
        position: 0,
        level: 0,
      });
      const invalidDto = new ProjectElementDto(invalidElement);

      jest
        .spyOn(service, 'bulkDinsertElements')
        .mockRejectedValue(new BadRequestException());

      await expect(
        controller.dinsertElements('testuser', 'test-project', csrfToken, [
          invalidDto,
        ]),
      ).rejects.toThrow(BadRequestException);
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
        .spyOn(service, 'bulkDinsertElements')
        .mockRejectedValue(new NotFoundException());

      await expect(
        controller.dinsertElements('testuser', 'test-project', csrfToken, [
          nonExistentDto,
        ]),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
