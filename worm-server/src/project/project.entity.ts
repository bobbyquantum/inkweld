import { BaseEntity } from '../common/persistence/leveldb-repository.js';
import { UserEntity } from '../user/user.entity.js';

/**
 * Project entity for LevelDB storage
 * This is a plain TypeScript class without TypeORM decorators
 */
export class ProjectEntity implements BaseEntity {
  /** Unique identifier for the project */
  id: string;

  /** Version number for optimistic locking */
  version: number;

  /** Project slug (unique per user) */
  slug: string;

  /** Project title */
  title: string;

  /** Project description */
  description: string;

  /** User ID who owns the project */
  userId: string;

  /** User who owns the project (denormalized for convenience) */
  user?: UserEntity;

  /** Timestamp when the project was created */
  createdAt: number;

  /** Timestamp when the project was last updated */
  updatedAt: number;

  constructor(partial: Partial<ProjectEntity> = {}) {
    Object.assign(this, partial);

    // Set default values
    this.version = partial.version ?? 1;
    this.createdAt = partial.createdAt ?? Date.now();
    this.updatedAt = partial.updatedAt ?? Date.now();
  }
}
