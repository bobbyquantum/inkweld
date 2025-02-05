import 'fake-indexeddb/auto';

import { TestBed } from '@angular/core/testing';

import { StorageService } from './storage.service';

// Polyfill structuredClone for test environment
function createStructuredClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

if (!globalThis.structuredClone) {
  globalThis.structuredClone = createStructuredClone;
}

describe('StorageService', () => {
  let service: StorageService;
  const TEST_DB = 'testDb';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [StorageService],
    });
    service = TestBed.inject(StorageService);
  });

  afterEach(() => {
    service.closeAll();
    indexedDB = new IDBFactory();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
    expect(service.isAvailable()).toBe(true);
  });

  it('should initialize database with stores', async () => {
    const db = await service.initializeDatabase({
      dbName: TEST_DB,
      version: 1,
      stores: {
        testStore: null,
      },
    });

    expect(db).toBeTruthy();
    expect(db.objectStoreNames.contains('testStore')).toBe(true);
  });

  it('should reuse existing database connection', async () => {
    const config = {
      dbName: TEST_DB,
      version: 1,
      stores: { testStore: null },
    };

    const db1 = await service.initializeDatabase(config);
    const db2 = await service.initializeDatabase(config);

    expect(db1).toBe(db2);
  });

  describe('CRUD operations', () => {
    let db: IDBDatabase;
    const STORE_NAME = 'testStore';
    const TEST_KEY = 'testKey';
    const TEST_VALUE = { data: 'test' };

    beforeEach(async () => {
      db = await service.initializeDatabase({
        dbName: TEST_DB,
        version: 1,
        stores: {
          [STORE_NAME]: null,
        },
      });
    });

    it('should put and get data', async () => {
      await service.put(db, STORE_NAME, TEST_VALUE, TEST_KEY);
      const result = await service.get(db, STORE_NAME, TEST_KEY);
      expect(result).toEqual(TEST_VALUE);
    });

    it('should delete data', async () => {
      await service.put(db, STORE_NAME, TEST_VALUE, TEST_KEY);
      await service.delete(db, STORE_NAME, TEST_KEY);
      const result = await service.get(db, STORE_NAME, TEST_KEY);
      expect(result).toBeUndefined();
    });

    it('should clear store', async () => {
      await service.put(db, STORE_NAME, TEST_VALUE, TEST_KEY);
      await service.put(db, STORE_NAME, TEST_VALUE, 'otherKey');
      await service.clear(db, STORE_NAME);
      const result = await service.get(db, STORE_NAME, TEST_KEY);
      expect(result).toBeUndefined();
    });

    it('should handle non-existent keys', async () => {
      const result = await service.get(db, STORE_NAME, 'nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should handle database initialization failure', async () => {
      // Mock indexedDB.open to simulate failure
      const mockOpen = jest.spyOn(indexedDB, 'open').mockImplementation(() => {
        const request = {
          error: new Error('Simulated failure'),
        } as IDBOpenDBRequest;
        setTimeout(() => request.onerror?.(new Event('error')));
        return request;
      });

      await expect(
        service.initializeDatabase({
          dbName: TEST_DB,
          version: 1,
          stores: { testStore: null },
        })
      ).rejects.toThrow();

      mockOpen.mockRestore();
    });

    it('should handle unavailable IndexedDB', () => {
      // Mock isAvailable signal
      service.isAvailable.set(false);

      return expect(
        service.initializeDatabase({
          dbName: TEST_DB,
          version: 1,
          stores: { testStore: null },
        })
      ).rejects.toThrow('IndexedDB is not available in this environment');
    });
  });
});
