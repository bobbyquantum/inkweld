import { Injectable } from '@nestjs/common';
import { LevelDBRepository } from '../common/persistence/leveldb-repository.js';
import { UserEntity } from './user.entity.js';
import { LevelDBManagerService } from '../common/persistence/leveldb-manager.service.js';

/**
 * Repository for User entities stored in LevelDB
 */
@Injectable()
export class UserRepository extends LevelDBRepository<UserEntity> {
  constructor(levelDBManager: LevelDBManagerService) {
    // Create a repository with indexes for username and githubId
    super(levelDBManager, 'users', ['username', 'githubId'], true);
  }

  /**
   * Find a user by username
   * @param username The username to search for
   * @returns The user or null if not found
   */
  async findByUsername(username: string): Promise<UserEntity | null> {
    if (!username) return null;
    return this.findByField('username', username);
  }

  /**
   * Find a user by GitHub ID
   * @param githubId The GitHub ID to search for
   * @returns The user or null if not found
   */
  async findByGithubId(githubId: string): Promise<UserEntity | null> {
    if (!githubId) return null;
    return this.findByField('githubId', githubId);
  }

  /**
   * Check if a username is available
   * @param username The username to check
   * @returns True if the username is available, false otherwise
   */
  async isUsernameAvailable(username: string): Promise<boolean> {
    const user = await this.findByUsername(username);
    return user === null;
  }

  /**
   * Create a new user
   * @param userData The user data
   * @returns The created user
   */
  async createUser(userData: Partial<UserEntity>): Promise<UserEntity> {
    // Set timestamps
    userData.createdAt = Date.now();
    userData.updatedAt = Date.now();

    return this.create(userData);
  }

  /**
   * Update a user
   * @param id The user ID
   * @param userData The user data to update
   * @returns The updated user
   */
  async updateUser(
    id: string,
    userData: Partial<UserEntity>,
  ): Promise<UserEntity> {
    // Update timestamp
    userData.updatedAt = Date.now();

    return this.update(id, userData);
  }
}
