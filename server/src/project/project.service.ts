import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProjectEntity } from './project.entity.js';
import { UserEntity } from '../user/user.entity.js';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class ProjectService {
  private readonly logger = new Logger(ProjectService.name);
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
  async findAll(): Promise<ProjectEntity[]> {
    return await this.projectRepo.find();
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
    this.logger.log('Updating project', { username, slug, projectData });
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

  /**
   * Gets the absolute path to a project directory
   * @param username The owner of the project
   * @param slug The project slug
   * @returns The path to the project directory
   */
  getProjectPath(username: string, slug: string): string {
    return path.join(process.env.DATA_PATH || './data', username, slug);
  }

  // Admin functionality
  async getAllProjectsWithUsers(): Promise<ProjectEntity[]> {
    return this.projectRepo.find({
      relations: ['user'],
      order: { createdDate: 'DESC' },
    });
  }

  async getProjectCount(): Promise<number> {
    return this.projectRepo.count();
  }

  async getUserProjectCount(userId: string): Promise<number> {
    return this.projectRepo.count({
      where: { user: { id: userId } },
    });
  }

  async calculateDiskUsage(): Promise<{
    totalSize: number;
    projectSizes: Array<{
      username: string;
      slug: string;
      size: number;
      title: string;
    }>;
  }> {
    const projects = await this.getAllProjectsWithUsers();
    const projectSizes: Array<{
      username: string;
      slug: string;
      size: number;
      title: string;
    }> = [];
    let totalSize = 0;

    for (const project of projects) {
      const projectPath = this.getProjectPath(project.user.username, project.slug);
      const size = await this.getDirectorySize(projectPath);
      
      projectSizes.push({
        username: project.user.username,
        slug: project.slug,
        title: project.title,
        size,
      });
      
      totalSize += size;
    }

    return {
      totalSize,
      projectSizes: projectSizes.sort((a, b) => b.size - a.size),
    };
  }

  private async getDirectorySize(dirPath: string): Promise<number> {
    if (!fs.existsSync(dirPath)) {
      return 0;
    }

    let size = 0;
    
    try {
      const stat = await fs.promises.stat(dirPath);
      
      if (stat.isFile()) {
        return stat.size;
      }
      
      if (stat.isDirectory()) {
        const items = await fs.promises.readdir(dirPath);
        
        for (const item of items) {
          const itemPath = path.join(dirPath, item);
          size += await this.getDirectorySize(itemPath);
        }
      }
    } catch (error) {
      this.logger.warn(`Error calculating size for ${dirPath}:`, error);
    }
    
    return size;
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
