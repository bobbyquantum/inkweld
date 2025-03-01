import { Module } from '@nestjs/common';
import { LevelDBManagerService } from './leveldb-manager.service.js';

@Module({
  providers: [LevelDBManagerService],
  exports: [LevelDBManagerService],
})
export class PersistenceModule {}
