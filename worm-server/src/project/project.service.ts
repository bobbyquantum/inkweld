import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ProjectRepository } from './project.repository.js';
import { ProjectEntity } from './project.entity.js';
import { UserRepository } from '../user/user.repository.js';

@Injectable()
export class ProjectService {
  constructor(
    private readonly projectRepo: ProjectRepository,
    private readonly userRepo: UserRepository,
  ) {}

  async findAllForCurrentUser(userId: string): Promise<ProjectEntity[]> {
    return this.projectRepo.findAllForUser(userId);
  }

  async findAll(): Promise<ProjectEntity[]> {
    return this.projectRepo.find();
  }

  async findByUsernameAndSlug(
    username: string,
    slug: string,
  ): Promise<ProjectEntity> {
    const project = await this.projectRepo.findByUsernameAndSlug(
      username,
      slug,
    );
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }

  async create(
    userId: string,
    project: Partial<ProjectEntity>,
  ): Promise<ProjectEntity> {
    // Look up the current user
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new ForbiddenException('User not found');
    }

    // Check if project with this slug already exists for this user
    const isSlugAvailable = await this.projectRepo.isSlugAvailable(
      userId,
      project.slug,
    );
    if (!isSlugAvailable) {
      throw new ForbiddenException('Project already exists');
    }

    // Create the project
    const newProject: Partial<ProjectEntity> = {
      ...project,
      userId: user.id,
      // Store the user object for convenience (denormalized)
      user: user,
    };

    return this.projectRepo.createProject(newProject);
  }

  async update(
    username: string,
    slug: string,
    projectData: Partial<ProjectEntity>,
  ): Promise<ProjectEntity> {
    // Find existing project
    const existing = await this.findByUsernameAndSlug(username, slug);

    // Update fields
    const updates: Partial<ProjectEntity> = {};
    if (projectData.title !== undefined) updates.title = projectData.title;
    if (projectData.description !== undefined)
      updates.description = projectData.description;

    // Save changes
    return this.projectRepo.updateProject(existing.id, updates);
  }

  async delete(username: string, slug: string): Promise<void> {
    const existing = await this.findByUsernameAndSlug(username, slug);
    await this.projectRepo.delete(existing.id);
  }
}
