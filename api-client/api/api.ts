export * from './fileAPI.service';
import { FileAPIService } from './fileAPI.service';
export * from './projectAPI.service';
import { ProjectAPIService } from './projectAPI.service';
export * from './userAPI.service';
import { UserAPIService } from './userAPI.service';
export const APIS = [FileAPIService, ProjectAPIService, UserAPIService];
