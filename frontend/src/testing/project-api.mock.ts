import { ProjectDto } from "@inkweld/index";
import { Observable } from "rxjs";

export const projectServiceMock = {
  projectControllerGetProjectByUsernameAndSlug: jest.fn<Observable<ProjectDto>, [string, string]>(),
  projectControllerUpdateProject: jest.fn<Observable<ProjectDto>, [string, string, string, ProjectDto]>()
}
