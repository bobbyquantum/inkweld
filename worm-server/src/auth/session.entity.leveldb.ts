import { BaseEntity } from '../common/persistence/leveldb-repository.js';

/**
 * User session entity for LevelDB storage
 * This is a plain TypeScript class without TypeORM decorators
 */
export class SessionLevelDBEntity implements BaseEntity {
  /** Unique session identifier */
  id: string;

  /** Serialized session data */
  data: Record<string, any>;

  /** Timestamp when the session expires (in milliseconds since epoch) */
  expiredAt: number;

  /** Timestamp when the session was created */
  createdAt: number;

  /** Timestamp when the session was last updated */
  updatedAt: number;

  constructor(partial: Partial<SessionLevelDBEntity> = {}) {
    Object.assign(this, partial);

    // Set default values
    this.createdAt = partial.createdAt ?? Date.now();
    this.updatedAt = partial.updatedAt ?? Date.now();
  }
}
