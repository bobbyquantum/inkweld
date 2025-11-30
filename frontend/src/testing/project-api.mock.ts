import { vi } from 'vitest';

import { Project } from "@inkweld/index";
import { Observable } from "rxjs";

export const projectServiceMock = {
  getProjectByUsernameAndSlug: vi.fn<(username: string, slug: string) => Observable<Project>>(),
  projectControllerUpdateProject: vi.fn<(username: string, slug: string, projectId: string, dto: Project) => Observable<Project>>()
}





