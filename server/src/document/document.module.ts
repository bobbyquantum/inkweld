import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module.js';
import { LevelDBManagerService } from '../common/persistence/leveldb-manager.service.js';
import { UserModule } from '../user/user.module.js'; // Fixed relative import path
import { DocumentGateway } from './document.gateway.js';
import { DocumentController } from './document.controller.js';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    UserModule,
  ],
  providers: [DocumentGateway, LevelDBManagerService],
  controllers: [DocumentController],
  exports: [DocumentGateway],
})
export class DocumentModule {}
