import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectEntity } from './project.entity.js';
import { ProjectService } from './project.service.js';
import { ProjectController } from './project.controller.js';
import { UserEntity } from '../user/user.entity.js';
import { UserModule } from '../user/user.module.js';
import { ProjectElementController } from './element/project-element.controller.js';
import { ProjectElementService } from './element/project-element.service.js';
import { ImageStorageService } from './element/image-storage.service.js';
import { LevelDBManagerService } from '../common/persistence/leveldb-manager.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProjectEntity, UserEntity]),
    UserModule,
  ],
  controllers: [ProjectController, ProjectElementController],
  providers: [
    ProjectService,
    ProjectElementService,
    ImageStorageService,
    LevelDBManagerService,
  ],
  exports: [
    ProjectService,
    ProjectElementService,
    ImageStorageService,
  ],
})
export class ProjectModule {}
