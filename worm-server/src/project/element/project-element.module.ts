import { Module } from '@nestjs/common';
import { ProjectElementController } from './project-element.controller.js';
import { ProjectElementService } from './project-element.service.js';
import { ImageStorageService } from './image-storage.service.js';
import { LevelDBManagerService } from '../../common/persistence/leveldb-manager.service.js';
import { AuthModule } from 'auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [ProjectElementController],
  providers: [
    ProjectElementService,
    ImageStorageService,
    LevelDBManagerService,
  ],
  exports: [ProjectElementService, ImageStorageService],
})
export class ProjectElementModule {}
