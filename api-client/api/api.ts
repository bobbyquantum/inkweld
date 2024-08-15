export * from './projectAPI.service';
import { ProjectAPIService } from './projectAPI.service';
export * from './userAPI.service';
import { UserAPIService } from './userAPI.service';
export const APIS = [ProjectAPIService, UserAPIService];
