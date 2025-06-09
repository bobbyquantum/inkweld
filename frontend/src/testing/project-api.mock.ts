import { ProjectDto } from "@inkweld/index";
import { Observable } from "rxjs";

export const projectServiceMock = {
  projectControllerGetProjectByUsernameAndSlug: vi.fn<Observable<ProjectDto>, [string, string]>(),
  projectControllerUpdateProject: vi.fn<Observable<ProjectDto>, [string, string, string, ProjectDto]>()
}
