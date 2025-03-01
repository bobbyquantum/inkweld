import { Injectable } from '@nestjs/common';
import { LevelDBRepository } from '../common/persistence/leveldb-repository.js';
import { ProjectEntity } from './project.entity.js';
import { LevelDBManagerService } from '../common/persistence/leveldb-manager.service.js';
import { UserRepository } from '../user/user.repository.js';

/**
 * Repository for Project entities stored in LevelDB
 */
@Injectable()
export class ProjectRepository extends LevelDBRepository<ProjectEntity> {
  constructor(
    levelDBManager: LevelDBManagerService,
    private readonly userRepository: UserRepository,
  ) {
    // Create a repository with composite index for userId+slug
    super(levelDBManager, 'Project', ['userId:slug']);
  }

  /**
   * Find all projects for a user
   * @param userId The user ID
   * @returns Array of projects
   */
  async findAllForUser(userId: string): Promise<ProjectEntity[]> {
    return this.find({ userId });
  }

  /**
   * Find a project by username and slug
   * @param username The username
   * @param slug The project slug
   * @returns The project or null if not found
   */
  async findByUsernameAndSlug(
    username: string,
    slug: string,
  ): Promise<ProjectEntity | null> {
    // First find the user by username
    const user = await this.userRepository.findByUsername(username);
    if (!user) return null;

    // Then find the project by userId and slug
    return this.findOne({ userId: user.id, slug });
  }

  /**
   * Check if a project slug is available for a user
   * @param userId The user ID
   * @param slug The project slug
   * @returns True if the slug is available, false otherwise
   */
  async isSlugAvailable(userId: string, slug: string): Promise<boolean> {
    const project = await this.findOne({ userId, slug });
    return project === null;
  }

  /**
   * Create a new project
   * @param projectData The project data
   * @returns The created project
   */
  async createProject(
    projectData: Partial<ProjectEntity>,
  ): Promise<ProjectEntity> {
    // Set timestamps
    projectData.createdAt = Date.now();
    projectData.updatedAt = Date.now();

    // Create composite index value
    if (projectData.userId && projectData.slug) {
      projectData['userId:slug'] = `${projectData.userId}:${projectData.slug}`;
    }

    return this.create(projectData);
  }

  /**
   * Update a project
   * @param id The project ID
   * @param projectData The project data to update
   * @returns The updated project
   */
  async updateProject(
    id: string,
    projectData: Partial<ProjectEntity>,
  ): Promise<ProjectEntity> {
    // Get the current project
    const currentProject = await this.findById(id);
    if (!currentProject) {
      throw new Error(`Project with ID ${id} not found`);
    }

    // Update timestamp
    projectData.updatedAt = Date.now();

    // Increment version
    projectData.version = (currentProject.version || 0) + 1;

    // Update composite index if slug changes
    if (projectData.slug && projectData.slug !== currentProject.slug) {
      projectData['userId:slug'] =
        `${currentProject.userId}:${projectData.slug}`;
    }

    return this.update(id, projectData);
  }
}
