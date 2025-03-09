import { Module } from '@nestjs/common';
import { UserModule } from '../../user/user.module.js';
import { ProjectElementController } from './project-element.controller.js';
import { ProjectElementService } from './project-element.service.js';
import { ImageStorageService } from './image-storage.service.js';
import { LevelDBManagerService } from '../../common/persistence/leveldb-manager.service.js';

@Module({
  imports: [UserModule],
  controllers: [ProjectElementController],
  providers: [
    ProjectElementService,
    ImageStorageService,
    LevelDBManagerService,
  ],
  exports: [ProjectElementService, ImageStorageService],
})
export class ProjectElementModule {}
