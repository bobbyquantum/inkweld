import { Module } from '@nestjs/common';
import { ConfigController } from './config.controller.js';
import { SystemConfigService } from './config.service.js';

@Module({
  controllers: [ConfigController],
  providers: [SystemConfigService],
  exports: [SystemConfigService],
})
export class SystemConfigModule {} 