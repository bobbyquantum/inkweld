import { EntityManager, QueryRunner, Repository } from 'typeorm';
import { UserSessionEntity } from './session.entity.js';
import { TypeOrmSessionStore } from './session.store.js';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
describe('TypeOrmSessionStore', () => {
  let store: TypeOrmSessionStore;
  let repository: jest.Mocked<Repository<UserSessionEntity>>;

  const mockSession = {
    id: 'test-session-id',
    data: { userId: '123', someData: 'test' },
    expiredAt: Date.now() + 24 * 60 * 60 * 1000, // 1 day from now
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    repository = {
      target: UserSessionEntity,
      manager: {} as EntityManager,
      queryRunner: undefined as QueryRunner | undefined,
      metadata: {
        name: 'UserSessionEntity',
        tableName: 'user_sessions',
      },
      findOne: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
      createQueryBuilder: jest.fn(),
      hasId: jest.fn(),
      getId: jest.fn(),
      create: jest.fn(),
      merge: jest.fn(),
      preload: jest.fn(),
      remove: jest.fn(),
      softRemove: jest.fn(),
      recover: jest.fn(),
      count: jest.fn(),
      find: jest.fn(),
      findAndCount: jest.fn(),
      findBy: jest.fn(),
      findOneBy: jest.fn(),
      findOneById: jest.fn(),
      insert: jest.fn(),
      upsert: jest.fn(),
      clear: jest.fn(),
      extend: jest.fn(),
    } as unknown as jest.Mocked<Repository<UserSessionEntity>>;

    store = new TypeOrmSessionStore(repository, {});
  });

  describe('constructor', () => {
    it('should use default expiration time if not provided', () => {
      expect((store as any).defaultExpiration).toBe(30 * 24 * 60 * 60 * 1000);
    });

    it('should use custom expiration time if provided', () => {
      const customExpiration = 7 * 24 * 60 * 60 * 1000; // 7 days
      const storeWithCustomExpiration = new TypeOrmSessionStore(repository, {
        expiration: customExpiration,
      });
      expect((storeWithCustomExpiration as any).defaultExpiration).toBe(
        customExpiration,
      );
    });
  });

  describe('get', () => {
    it('should return session data if valid session exists', async () => {
      repository.findOne.mockResolvedValue(mockSession);

      await new Promise<void>((resolve) => {
        store.get(mockSession.id, (err, session) => {
          expect(err).toBeNull();
          expect(session).toEqual(mockSession.data);
          resolve();
        });
      });

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: mockSession.id },
        select: ['data', 'expiredAt'],
      });
    });

    it('should return null if session does not exist', async () => {
      repository.findOne.mockResolvedValue(null);

      await new Promise<void>((resolve) => {
        store.get('non-existent-id', (err, session) => {
          expect(err).toBeNull();
          expect(session).toBeNull();
          resolve();
        });
      });
    });

    it('should return null and destroy expired session', async () => {
      const expiredSession = {
        ...mockSession,
        expiredAt: Date.now() - 1000, // Expired 1 second ago
      };
      repository.findOne.mockResolvedValue(expiredSession);
      repository.delete.mockResolvedValue({ affected: 1, raw: [] });

      await new Promise<void>((resolve) => {
        store.get(expiredSession.id, (err, session) => {
          expect(err).toBeNull();
          expect(session).toBeNull();
          expect(repository.delete).toHaveBeenCalledWith({
            id: expiredSession.id,
          });
          resolve();
        });
      });
    });

    it('should handle database errors', async () => {
      const error = new Error('Database error');
      repository.findOne.mockRejectedValue(error);

      await new Promise<void>((resolve) => {
        store.get('test-id', (err, session) => {
          expect(err).toBe(error);
          expect(session).toBeUndefined();
          resolve();
        });
      });
    });
  });

  describe('set', () => {
    it('should save session with cookie expiration', async () => {
      const sessionWithCookie = {
        ...mockSession.data,
        cookie: {
          expires: new Date(Date.now() + 3600000), // 1 hour from now
        },
      };

      await new Promise<void>((resolve) => {
        store.set(mockSession.id, sessionWithCookie, (err) => {
          expect(err).toBeNull();
          expect(repository.save).toHaveBeenCalledWith({
            id: mockSession.id,
            data: sessionWithCookie,
            expiredAt: sessionWithCookie.cookie.expires.getTime(),
          });
          resolve();
        });
      });
    });

    it('should save session with default expiration when no cookie expires', async () => {
      const sessionWithoutExpires = { ...mockSession.data };
      const now = Date.now();
      jest.spyOn(Date, 'now').mockImplementation(() => now);

      await new Promise<void>((resolve) => {
        store.set(mockSession.id, sessionWithoutExpires, (err) => {
          expect(err).toBeNull();
          expect(repository.save).toHaveBeenCalledWith({
            id: mockSession.id,
            data: sessionWithoutExpires,
            expiredAt: now + (store as any).defaultExpiration,
          });
          resolve();
        });
      });
    });

    it('should handle database errors', async () => {
      const error = new Error('Database error');
      repository.save.mockRejectedValue(error);

      await new Promise<void>((resolve) => {
        store.set(mockSession.id, mockSession.data, (err) => {
          expect(err).toBe(error);
          resolve();
        });
      });
    });
  });

  describe('destroy', () => {
    it('should delete session', async () => {
      repository.delete.mockResolvedValue({ affected: 1, raw: [] });

      await new Promise<void>((resolve) => {
        store.destroy(mockSession.id, (err) => {
          expect(err).toBeNull();
          expect(repository.delete).toHaveBeenCalledWith({
            id: mockSession.id,
          });
          resolve();
        });
      });
    });

    it('should handle database errors', async () => {
      const error = new Error('Database error');
      repository.delete.mockRejectedValue(error);

      await new Promise<void>((resolve) => {
        store.destroy(mockSession.id, (err) => {
          expect(err).toBe(error);
          resolve();
        });
      });
    });
  });

  describe('touch', () => {
    it('should update session expiration with cookie expires', async () => {
      const sessionWithCookie = {
        cookie: {
          expires: new Date(Date.now() + 3600000), // 1 hour from now
        },
      };

      await new Promise<void>((resolve) => {
        store.touch(mockSession.id, sessionWithCookie, (err) => {
          expect(err).toBeNull();
          expect(repository.update).toHaveBeenCalledWith(
            { id: mockSession.id },
            { expiredAt: sessionWithCookie.cookie.expires.getTime() },
          );
          resolve();
        });
      });
    });

    it('should update session expiration with default expiration when no cookie expires', async () => {
      const sessionWithoutExpires = {};
      const now = Date.now();
      jest.spyOn(Date, 'now').mockImplementation(() => now);

      await new Promise<void>((resolve) => {
        store.touch(mockSession.id, sessionWithoutExpires, (err) => {
          expect(err).toBeNull();
          expect(repository.update).toHaveBeenCalledWith(
            { id: mockSession.id },
            { expiredAt: now + (store as any).defaultExpiration },
          );
          resolve();
        });
      });
    });

    it('should handle database errors', async () => {
      const error = new Error('Database error');
      repository.update.mockRejectedValue(error);

      await new Promise<void>((resolve) => {
        store.touch(mockSession.id, {}, (err) => {
          expect(err).toBe(error);
          resolve();
        });
      });
    });
  });

  describe('clearExpiredSessions', () => {
    it('should delete expired sessions', async () => {
      const mockQueryBuilder = {
        delete: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn<() => any>().mockResolvedValue({ affected: 1 }),
      };
      repository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      await store.clearExpiredSessions();

      expect(repository.createQueryBuilder).toHaveBeenCalled();
      expect(mockQueryBuilder.delete).toHaveBeenCalled();
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'expired_at < :now',
        expect.any(Object),
      );
      expect(mockQueryBuilder.execute).toHaveBeenCalled();
    });
  });
});
