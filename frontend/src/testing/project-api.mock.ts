import { ProjectAPIService, ProjectDto } from "@worm/index";
import { Observable } from "rxjs";

export const projectServiceMock = {
  projectControllerGetProjectByUsernameAndSlug: jest.fn<[Observable<ProjectDto>], [string, string]>(),
  projectControllerUpdateProject: jest.fn<[Observable<ProjectDto>], [string, string, string, ProjectDto]>()
} as unknown as jest.Mocked<ProjectAPIService>;
