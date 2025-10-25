import { Module } from '@nestjs/common';
import { SchemaService } from './schema.service.js';
import { SchemasController } from './schemas.controller.js';
import { LevelDBManagerService } from '../../common/persistence/leveldb-manager.service.js';
import { UserModule } from '../../user/user.module.js';

@Module({
  imports: [UserModule],
  controllers: [SchemasController],
  providers: [SchemaService, LevelDBManagerService],
  exports: [SchemaService],
})
export class SchemaModule {}
