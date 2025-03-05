import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectEntity } from './project.entity.js';
import { ProjectService } from './project.service.js';
import { ProjectController } from './project.controller.js';
import { UserEntity } from '../user/user.entity.js';
import { UserModule } from '../user/user.module.js';
import { ProjectElementModule } from './element/project-element.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([ProjectEntity, UserEntity]), UserModule, ProjectElementModule],
  controllers: [ProjectController],
  providers: [ProjectService],
  exports: [ProjectService],
})
export class ProjectModule {}
