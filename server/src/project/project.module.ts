import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectEntity } from './project.entity.js';
import { ProjectService } from './project.service.js';
import { ProjectController } from './project.controller.js';
import { UserEntity } from '../user/user.entity.js';
import { UserModule } from '../user/user.module.js';
import { ProjectElementController } from './element/project-element.controller.js';
import { ProjectElementService } from './element/project-element.service.js';
import { FileStorageService } from './files/file-storage.service.js';
import { ProjectFilesController } from './files/project-files.controller.js';
import { LevelDBManagerService } from '../common/persistence/leveldb-manager.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProjectEntity, UserEntity]),
    UserModule,
  ],
  controllers: [ProjectController, ProjectElementController, ProjectFilesController],
  providers: [
    ProjectService,
    ProjectElementService,
    FileStorageService,
    LevelDBManagerService,
  ],
  exports: [
    ProjectService,
    ProjectElementService,
    FileStorageService,
  ],
})
export class ProjectModule {}
