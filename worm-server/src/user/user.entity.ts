import { BaseEntity } from '../common/persistence/leveldb-repository.js';

/**
 * User entity for LevelDB storage
 * This is a plain TypeScript class without TypeORM decorators
 */
export class UserEntity implements BaseEntity {
  /** Unique identifier for the user */
  id: string;

  /** Username (unique) */
  username: string | null;

  /** User's full name */
  name: string | null;

  /** User's email address */
  email: string | null;

  /** Hashed password (null for OAuth users) */
  password: string | null;

  /** GitHub ID (unique, null for non-GitHub users) */
  githubId: string | null;

  /** Whether the user account is enabled */
  enabled: boolean;

  /** URL to the user's avatar image */
  avatarImageUrl: string | null;

  /** Timestamp when the user was created */
  createdAt: number;

  /** Timestamp when the user was last updated */
  updatedAt: number;

  constructor(partial: Partial<UserEntity> = {}) {
    Object.assign(this, partial);

    // Set default values
    this.enabled = partial.enabled ?? false;
    this.createdAt = partial.createdAt ?? Date.now();
    this.updatedAt = partial.updatedAt ?? Date.now();
  }
}
