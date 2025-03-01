import { Module } from '@nestjs/common';
import { ProjectController } from './project.controller.js';
import { UserModule } from '../user/user.module.js';
import { ProjectElementModule } from './element/project-element.module.js';
import { ProjectService } from './project.service.js';
import { ProjectRepository } from './project.repository.js';

@Module({
  imports: [UserModule, ProjectElementModule],
  controllers: [ProjectController],
  providers: [
    ProjectService,
    ProjectRepository
  ],
  exports: [ProjectService],
})
export class ProjectModule {}
