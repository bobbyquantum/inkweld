// project-element.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectElementEntity } from './project-element.entity';
import { ProjectElementService } from './project-element.service';
import { ProjectElementController } from './project-element.controller';
import { ProjectModule } from '../project.module';
import { UserModule } from 'src/user/user.module';

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
