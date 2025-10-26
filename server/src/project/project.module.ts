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
import { DocumentGateway } from './document/document.gateway.js';
import { DocumentController } from './document/document.controller.js';
import { TypeOrmSessionStore } from '../auth/session.store.js';
import { ConfigService } from '@nestjs/config';
import { ConfigModule } from '@nestjs/config';
import { UserSessionEntity } from '../auth/session.entity.js';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentRendererService } from './document/document-renderer.service.js';
import { ProjectPublishEpubService } from './epub/project-publish-epub.service.js';
import { ProjectPublishEpubController } from './epub/project-publish-epub.controller.js';
import { CoverController } from './cover/cover.controller.js';
import { StorageModule } from '../common/storage/storage.module.js';
import { SchemaModule } from './schemas/schema.module.js';
import { DocumentSnapshotEntity } from './snapshot/document-snapshot.entity.js';
import { DocumentSnapshotService } from './snapshot/document-snapshot.service.js';
import { DocumentSnapshotController } from './snapshot/document-snapshot.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProjectEntity,
      UserEntity,
      UserSessionEntity,
      DocumentSnapshotEntity,
    ]),
    UserModule,
    ConfigModule,
    StorageModule.register(),
    SchemaModule,
  ],
  controllers: [
    ProjectController,
    ProjectElementController,
    ProjectFilesController,
    DocumentController,
    ProjectPublishEpubController,
    CoverController,
    DocumentSnapshotController,
  ],
  providers: [
    ProjectService,
    ProjectElementService,
    FileStorageService,
    LevelDBManagerService,
    DocumentGateway,
    DocumentRendererService,
    ProjectPublishEpubService,
    CoverController,
    DocumentSnapshotService,
    {
      provide: TypeOrmSessionStore,
      useFactory: (sessionRepository: Repository<UserSessionEntity>) => {
        return new TypeOrmSessionStore(sessionRepository, {
          expiration: 30 * 24 * 60 * 60 * 1000,
        });
      },
      inject: [getRepositoryToken(UserSessionEntity)],
    },
    ConfigService,
  ],
  exports: [
    ProjectService,
    ProjectElementService,
    FileStorageService,
    DocumentGateway,
    ProjectPublishEpubService,
    CoverController,
  ],
})
export class ProjectModule {}
