import { Injectable, Inject } from '@nestjs/common';
import { StorageService } from './storage.interface.js';
import * as fsPromises from 'fs/promises';
import { join, dirname } from 'path';

@Injectable()
export class LocalStorageService implements StorageService {
  constructor(@Inject('DATA_PATH') private readonly root: string) {}

  private full(key: string): string {
    return join(this.root, key);
  }

  async put(key: string, data: Buffer | Uint8Array): Promise<void> {
    await fsPromises.mkdir(dirname(this.full(key)), { recursive: true });
    await fsPromises.writeFile(this.full(key), data);
  }

  async get(key: string): Promise<Buffer> {
    return fsPromises.readFile(this.full(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fsPromises.access(this.full(key));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    await fsPromises.rm(this.full(key), { force: true });
  }
}
