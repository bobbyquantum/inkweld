// project-element.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectElementEntity } from './project-element.entity.js';
import { ProjectElementService } from './project-element.service.js';
import { ProjectElementController } from './project-element.controller.js';
import { ProjectModule } from '../project.module.js';
import { UserModule } from '../../user/user.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProjectElementEntity]),
    ProjectModule,
    UserModule,
  ],
  controllers: [ProjectElementController],
  providers: [ProjectElementService],
  exports: [ProjectElementService],
})
export class ProjectElementModule {}
