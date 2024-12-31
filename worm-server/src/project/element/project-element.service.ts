// project-element.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProjectElementEntity } from './project-element.entity';
import { ProjectElementDto } from './project-element.dto';
import { ProjectService } from '../project.service';
import { ProjectEntity } from '../project.entity';

@Injectable()
export class ProjectElementService {
  private readonly logger = new Logger(ProjectElementService.name);

  constructor(
    @InjectRepository(ProjectElementEntity)
    private readonly elementRepo: Repository<ProjectElementEntity>,
    private readonly projectService: ProjectService,
  ) {}

  async getProjectElements(
    username: string,
    slug: string,
  ): Promise<ProjectElementDto[]> {
    this.logger.debug(`Fetching elements for project: ${username}/${slug}`);
    const project: ProjectEntity =
      await this.projectService.findByUsernameAndSlug(username, slug);

    const elements = await this.elementRepo.find({
      where: { project: { id: project.id } },
      order: { position: 'ASC' }, // or whatever ordering you want
    });
    return elements.map((e) => new ProjectElementDto(e));
  }

  /**
   * The "dinsert" approach:
   * - Elements not in the new list: delete
   * - Elements with IDs: update
   * - Elements without IDs: create
   * - Return the new full list
   */
  async bulkDinsertElements(
    username: string,
    slug: string,
    dtos: ProjectElementDto[],
  ): Promise<ProjectElementDto[]> {
    this.logger.debug(
      `Differential inserting ${dtos.length} elements in project ${username}/${slug}`,
    );

    const project: ProjectEntity =
      await this.projectService.findByUsernameAndSlug(username, slug);

    // Validate all DTOs before proceeding
    dtos.forEach((dto) => this.validateElementDto(dto));

    // Fetch existing
    const existing = await this.elementRepo.find({
      where: { project: { id: project.id } },
      order: { position: 'ASC' },
    });

    // Gather all incoming IDs (non-null)
    const dtoIds = new Set(dtos.filter((d) => d.id).map((d) => d.id));

    // Delete any existing not in incoming
    const toDelete = existing.filter((el) => !dtoIds.has(el.id));
    if (toDelete.length) {
      await this.elementRepo.remove(toDelete);
    }

    // Upsert each DTO
    const results: ProjectElementDto[] = [];
    for (const dto of dtos) {
      let entity: ProjectElementEntity;
      if (dto.id) {
        // Update
        entity = await this.elementRepo.findOne({ where: { id: dto.id } });
        if (!entity) {
          throw new NotFoundException(`Element not found with ID: ${dto.id}`);
        }
        if (entity.project.id !== project.id) {
          throw new NotFoundException(
            `Element ${dto.id} not found in this project`,
          );
        }
        // Overwrite relevant fields
        entity.name = dto.name;
        entity.type = dto.type;
        entity.position = dto.position;
        entity.level = dto.level;
      } else {
        // Create new
        entity = dto.toEntity();
        entity.project = project; // link to project
      }
      const saved = await this.elementRepo.save(entity);
      results.push(new ProjectElementDto(saved));
    }

    return results;
  }

  private validateElementDto(dto: ProjectElementDto) {
    if (!dto.name?.trim()) {
      throw new BadRequestException('Name is required');
    }
    if (!dto.type) {
      throw new BadRequestException('Type is required');
    }
    if (dto.position === null || dto.position === undefined) {
      throw new BadRequestException('Position is required');
    }
    if (dto.level === null || dto.level === undefined) {
      throw new BadRequestException('Level is required');
    }
  }
}
