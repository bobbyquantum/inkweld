import { Module } from '@nestjs/common';
import { McpService } from './mcp.service.js';
import { McpController } from './mcp.controller.js';
import { ProjectModule } from '../project/project.module.js';
import { DocumentModule } from '../document/document.module.js';


@Module({
  imports: [ProjectModule, DocumentModule],
  providers: [McpService],
  controllers: [McpController],
  exports: [],
})
export class McpModule {}
