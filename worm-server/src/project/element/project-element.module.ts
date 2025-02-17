import { Module } from '@nestjs/common';
import { ProjectModule } from '../project.module.js';
import { UserModule } from '../../user/user.module.js';
import { ProjectElementController } from './project-element.controller.js';
import { ProjectElementService } from './project-element.service.js';
import { ImageStorageService } from './image-storage.service.js';

@Module({
  imports: [ProjectModule, UserModule],
  controllers: [ProjectElementController],
  providers: [ProjectElementService, ImageStorageService],
  exports: [ProjectElementService, ImageStorageService],
})
export class ProjectElementModule {}
