import { vi } from 'vitest';

import { ProjectDto } from "@inkweld/index";
import { Observable } from "rxjs";

export const projectServiceMock = {
  projectControllerGetProjectByUsernameAndSlug: vi.fn<(username: string, slug: string) => Observable<ProjectDto>>(),
  projectControllerUpdateProject: vi.fn<(username: string, slug: string, projectId: string, dto: ProjectDto) => Observable<ProjectDto>>()
}





