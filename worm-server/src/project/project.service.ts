import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProjectEntity } from './project.entity';
import { UserEntity } from '../user/user.entity';

@Injectable()
export class ProjectService {
  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  async findAllForCurrentUser(userId: string): Promise<ProjectEntity[]> {
    // Eagerly load if needed or just do a standard query
    return this.projectRepo.find({
      where: {
        user: { id: userId },
      },
      order: { createdDate: 'DESC' },
    });
  }

  async findByUsernameAndSlug(
    username: string,
    slug: string,
  ): Promise<ProjectEntity> {
    // Typically you'd join with the user table to match the username
    const project = await this.projectRepo.findOne({
      where: {
        slug,
        user: { username },
      },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }

  async create(userId: string, project: ProjectEntity): Promise<ProjectEntity> {
    // Look up the current user
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new ForbiddenException('User not found');
    }

    const existing = await this.projectRepo.findOne({
      where: { user: user, slug: project.slug },
    });
    if (existing) {
      throw new ForbiddenException('Project already exists');
    }
    // Assign the user relationship
    project.user = user;
    return this.projectRepo.save(project);
  }

  async update(
    username: string,
    slug: string,
    projectData: ProjectEntity,
  ): Promise<ProjectEntity> {
    // Find existing project
    const existing = await this.findByUsernameAndSlug(username, slug);
    // Optionally check if the user is the same (or do it in the controller)
    // Overwrite fields
    existing.title = projectData.title;
    existing.description = projectData.description;
    // Save changes
    return this.projectRepo.save(existing);
  }

  async delete(username: string, slug: string): Promise<void> {
    const existing = await this.findByUsernameAndSlug(username, slug);
    await this.projectRepo.remove(existing);
  }
}
