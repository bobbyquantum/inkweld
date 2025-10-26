import { Module } from '@nestjs/common';
import { SchemaService } from './schema.service.js';
import { LevelDBManagerService } from '../../common/persistence/leveldb-manager.service.js';
import { UserModule } from '../../user/user.module.js';

@Module({
  imports: [UserModule],
  providers: [SchemaService, LevelDBManagerService],
  exports: [SchemaService],
})
export class SchemaModule {}
