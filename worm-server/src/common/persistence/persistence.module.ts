import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LevelDBManagerService } from './leveldb-manager.service.js';

@Module({
  imports: [ConfigModule],
  providers: [LevelDBManagerService],
  exports: [LevelDBManagerService],
})
export class PersistenceModule {}
