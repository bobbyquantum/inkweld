export * from './mcp.service';
import { McpService } from './mcp.service';
export * from './project-api.service';
import { ProjectAPIService } from './project-api.service';
export * from './templates.service';
import { TemplatesService } from './templates.service';
export * from './user-api.service';
import { UserAPIService } from './user-api.service';
export const APIS = [McpService, ProjectAPIService, TemplatesService, UserAPIService];
