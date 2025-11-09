import { Injectable, signal } from '@angular/core';

export interface StorageConfig {
  dbName: string;
  version: number;
  stores: { [key: string]: string | null }; // null means no keyPath
}

export class StorageError extends Error {
  constructor(
    message: string,
    public readonly code: 'UNAVAILABLE' | 'TRANSACTION_ERROR' | 'REQUEST_ERROR'
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

@Injectable({
  providedIn: 'root',
})
export class StorageService {
  readonly isAvailable = signal(typeof indexedDB !== 'undefined');
  private dbConnections = new Map<string, Promise<IDBDatabase>>();

  async initializeDatabase(config: StorageConfig): Promise<IDBDatabase> {
    if (!this.isAvailable()) {
      throw new StorageError(
        'IndexedDB is not available in this environment',
        'UNAVAILABLE'
      );
    }

    if (this.dbConnections.has(config.dbName)) {
      return this.dbConnections.get(config.dbName)!;
    }

    const dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(config.dbName, config.version);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create or update stores
        for (const [storeName, keyPath] of Object.entries(config.stores)) {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, keyPath ? { keyPath } : undefined);
          }
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(
          new StorageError(
            `Failed to open database: ${request.error?.message}`,
            'REQUEST_ERROR'
          )
        );
    });

    this.dbConnections.set(config.dbName, dbPromise);
    return dbPromise;
  }

  async get<T>(
    db: IDBDatabase,
    storeName: string,
    key: IDBValidKey
  ): Promise<T | undefined> {
    return new Promise<T | undefined>((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () =>
        reject(
          new StorageError(
            `Failed to get value: ${request.error?.message}`,
            'REQUEST_ERROR'
          )
        );

      transaction.onerror = () =>
        reject(
          new StorageError(
            `Transaction failed: ${transaction.error?.message}`,
            'TRANSACTION_ERROR'
          )
        );
    });
  }

  async put<T>(
    db: IDBDatabase,
    storeName: string,
    value: T,
    key?: IDBValidKey
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = key ? store.put(value, key) : store.put(value);

      request.onsuccess = () => resolve();
      request.onerror = () =>
        reject(
          new StorageError(
            `Failed to put value: ${request.error?.message}`,
            'REQUEST_ERROR'
          )
        );

      transaction.onerror = () =>
        reject(
          new StorageError(
            `Transaction failed: ${transaction.error?.message}`,
            'TRANSACTION_ERROR'
          )
        );
    });
  }

  async delete(
    db: IDBDatabase,
    storeName: string,
    key: IDBValidKey
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () =>
        reject(
          new StorageError(
            `Failed to delete value: ${request.error?.message}`,
            'REQUEST_ERROR'
          )
        );

      transaction.onerror = () =>
        reject(
          new StorageError(
            `Transaction failed: ${transaction.error?.message}`,
            'TRANSACTION_ERROR'
          )
        );
    });
  }

  async clear(db: IDBDatabase, storeName: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () =>
        reject(
          new StorageError(
            `Failed to clear store: ${request.error?.message}`,
            'REQUEST_ERROR'
          )
        );

      transaction.onerror = () =>
        reject(
          new StorageError(
            `Transaction failed: ${transaction.error?.message}`,
            'TRANSACTION_ERROR'
          )
        );
    });
  }

  closeDatabase(dbName: string): void {
    const dbPromise = this.dbConnections.get(dbName);
    if (dbPromise) {
      void dbPromise.then(db => db.close());
      this.dbConnections.delete(dbName);
    }
  }

  closeAll(): void {
    for (const [dbName] of this.dbConnections) {
      this.closeDatabase(dbName);
    }
  }
}




