export * from './project-api.service';
import { ProjectAPIService } from './project-api.service';
export * from './user-api.service';
import { UserAPIService } from './user-api.service';
export const APIS = [ProjectAPIService, UserAPIService];
