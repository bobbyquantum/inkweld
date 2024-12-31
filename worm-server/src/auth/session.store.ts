import { Injectable, Logger } from '@nestjs/common';
import { Store } from 'express-session';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSessionEntity } from './session.entity';

interface SessionStoreOptions {
  /**
   * Session expiration time in milliseconds
   * Default is 30 days
   */
  expiration?: number;
}

@Injectable()
export class TypeOrmSessionStore extends Store {
  private logger = new Logger(TypeOrmSessionStore.name);
  private readonly defaultExpiration: number;

  constructor(
    @InjectRepository(UserSessionEntity)
    private readonly sessionRepository: Repository<UserSessionEntity>,
    options: SessionStoreOptions = {},
  ) {
    super();
    this.defaultExpiration = options.expiration || 30 * 24 * 60 * 60 * 1000; // 30 days
  }

  async get(sid: string, callback: (err: any, session?: any) => void) {
    try {
      const session = await this.sessionRepository.findOne({
        where: { id: sid },
        select: ['data', 'expiredAt'],
      });
      if (!session) {
        return callback(null, null);
      }

      // Check if session has expired
      if (Date.now() > session.expiredAt) {
        // Automatically destroy expired session
        await this.destroy(sid, () => {});
        return callback(null, null);
      }

      // this.logger.log('retrieved session', session.data);
      callback(null, session.data);
    } catch (err) {
      callback(err);
    }
  }

  async set(sid: string, session: any, callback?: (err?: any) => void) {
    try {
      // Use session's cookie expiration if available, otherwise use default
      const expiredAt = session.cookie?.expires
        ? new Date(session.cookie.expires).getTime()
        : Date.now() + this.defaultExpiration;

      await this.sessionRepository.save({
        id: sid,
        data: session,
        expiredAt: expiredAt,
      });

      callback && callback(null);
    } catch (err) {
      callback && callback(err);
    }
  }

  async destroy(sid: string, callback?: (err?: any) => void) {
    try {
      await this.sessionRepository.delete({ id: sid });
      callback && callback(null);
    } catch (err) {
      callback && callback(err);
    }
  }

  async touch(sid: string, session: any, callback?: (err?: any) => void) {
    try {
      // Extend session expiration
      const expiredAt = session.cookie?.expires
        ? new Date(session.cookie.expires).getTime()
        : Date.now() + this.defaultExpiration;

      await this.sessionRepository.update(
        { id: sid },
        { expiredAt: expiredAt },
      );

      callback && callback(null);
    } catch (err) {
      callback && callback(err);
    }
  }

  // Optional method to clean up expired sessions
  async clearExpiredSessions(): Promise<void> {
    await this.sessionRepository
      .createQueryBuilder()
      .delete()
      .where('expired_at < :now', { now: Date.now() })
      .execute();
  }
}
