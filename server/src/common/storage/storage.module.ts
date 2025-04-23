import { Module, DynamicModule } from '@nestjs/common';
import { STORAGE_SERVICE } from './storage.interface.js';
import { LocalStorageService } from './local-storage.service.js';

@Module({})
export class StorageModule {
  static register(): DynamicModule {
    const provider = {
      provide: STORAGE_SERVICE,
      useClass: LocalStorageService,
    };
    return {
      global: true,
      module: StorageModule,
      providers: [
        provider,
        LocalStorageService,
        { provide: 'DATA_PATH', useValue: process.env.DATA_PATH ?? './data' },
      ],
      exports: [STORAGE_SERVICE],
    };
  }
}
