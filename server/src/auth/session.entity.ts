import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Represents a user session stored in the database
 * Provides persistent storage for session data with expiration tracking
 */
@Entity('user_sessions')
export class UserSessionEntity {
  /** Unique session identifier */
  @PrimaryColumn('varchar')
  id: string;

  /** Serialized session data */
  @Column('json', { nullable: true })
  data: Record<string, any>;

  /** Timestamp when the session expires (in milliseconds since epoch) */
  @Column('bigint')
  expiredAt: number;

  /** Timestamp when the session was created */
  @CreateDateColumn()
  createdAt: Date;

  /** Timestamp when the session was last updated */
  @UpdateDateColumn()
  updatedAt: Date;
}
