export interface PutOptions {
  contentType?: string;
}

export interface StorageService {
  put(key: string, data: Buffer | Uint8Array, opts?: PutOptions): Promise<void>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  getSignedUrl?(key: string, expiresIn?: number): Promise<string>;
}

export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');
