import { Injectable } from '@nestjs/common';
import { StorageService } from './storage.interface.js';

@Injectable()
export class InMemoryStorageService implements StorageService {
  private store = new Map<string, Buffer>();

  async put(key: string, data: Buffer | Uint8Array): Promise<void> {
    this.store.set(key, Buffer.from(data));
  }

  async get(key: string): Promise<Buffer> {
    const buf = this.store.get(key);
    if (!buf) throw new Error('404');
    return buf;
  }

  async exists(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}
