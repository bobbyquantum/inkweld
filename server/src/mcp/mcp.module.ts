import { Module } from '@nestjs/common';
import { McpService } from './mcp.service.js';
import { McpController } from './mcp.controller.js';
import { ProjectModule } from '../project/project.module.js';

@Module({
  imports: [ProjectModule],
  providers: [McpService],
  controllers: [McpController],
  exports: [],
})
export class McpModule {}
