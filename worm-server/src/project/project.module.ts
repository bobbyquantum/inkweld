import { Module } from '@nestjs/common';
import { ProjectController } from './project.controller.js';
import { ProjectElementModule } from './element/project-element.module.js';
import { ProjectService } from './project.service.js';
import { ProjectRepository } from './project.repository.js';
import { PersistenceModule } from 'common/persistence/persistence.module.js';
import { AuthModule } from 'auth/auth.module.js';

@Module({
  imports: [AuthModule, ProjectElementModule, PersistenceModule],
  controllers: [ProjectController],
  providers: [ProjectService, ProjectRepository],
  exports: [ProjectService],
})
export class ProjectModule {}
