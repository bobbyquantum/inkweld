import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Template } from './template.entity.js';
import { TemplateService } from './template.service.js';
import { TemplateController } from './template.controller.js';
import { UserModule } from '../../user/user.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Template]),
    UserModule
  ],
  controllers: [TemplateController],
  providers: [TemplateService],
  exports: [TemplateService]
})
export class TemplateModule {}
