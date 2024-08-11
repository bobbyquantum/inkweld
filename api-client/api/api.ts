export * from './projectController.service';
import { ProjectControllerService } from './projectController.service';
export * from './user.service';
import { UserService } from './user.service';
export const APIS = [ProjectControllerService, UserService];
