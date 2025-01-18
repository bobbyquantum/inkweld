import { provideHttpClientTesting } from '@angular/common/http/testing';
import {
  ComponentFixture,
  fakeAsync,
  flush,
  TestBed,
  tick,
} from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { XsrfService } from '@services/xsrf.service';
import {
  Configuration,
  ProjectAPIService,
  ProjectDto,
  UserAPIService,
  UserDto,
} from '@worm/index';
import { Observable, of, throwError } from 'rxjs';

import { userServiceMock as mockUserAPIService } from '../../../testing/user-api.mock';
import { NewProjectComponent } from './new-project.component';
jest.mock('@angular/material/snack-bar');
jest.mock('@services/xsrf.service');

describe('NewProjectComponent', () => {
  let component: NewProjectComponent;
  let fixture: ComponentFixture<NewProjectComponent>;
  let projectService: jest.Mocked<ProjectAPIService>;
  let snackBar: jest.Mocked<MatSnackBar>;
  let xsrfService: jest.Mocked<XsrfService>;

  beforeEach(async () => {
    projectService = {
      projectControllerCreateProject: jest
        .fn()
        .mockImplementation((token: string, project: ProjectDto) => {
          return of(project);
        }),
    } as unknown as jest.Mocked<ProjectAPIService>;

    snackBar = {
      open: jest.fn(),
    } as unknown as jest.Mocked<MatSnackBar>;

    xsrfService = {
      getXsrfToken: jest.fn(),
    } as unknown as jest.Mocked<XsrfService>;

    await TestBed.configureTestingModule({
      imports: [NewProjectComponent],
      providers: [
        provideNoopAnimations(),
        provideHttpClientTesting(),
        provideRouter([{ path: '', component: NewProjectComponent }]),
        { provide: ActivatedRoute, useValue: {} },
        { provide: ProjectAPIService, useValue: projectService },
        { provide: UserAPIService, useValue: mockUserAPIService },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: XsrfService, useValue: xsrfService },
        { provide: Configuration, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NewProjectComponent);
    component = fixture.componentInstance;
  });

  it('should create', fakeAsync(() => {
    mockUserAPIService.userControllerGetMe.mockReturnValue(
      of({ username: 'testuser' } as UserDto)
    );
    expect(component).toBeTruthy();
    flush();
  }));

  it('should generate slug from title', fakeAsync(() => {
    mockUserAPIService.userControllerGetMe.mockReturnValue(
      of({ username: 'testuser' } as UserDto)
    );
    const title = 'My Awesome Project';
    const expectedSlug = 'my-awesome-project';
    component.projectForm.patchValue({ title });
    tick();
    expect(component.projectForm.get('slug')?.value).toBe(expectedSlug);
    flush();
  }));

  it('should create project when form is valid', fakeAsync(() => {
    mockUserAPIService.userControllerGetMe.mockReturnValue(
      of({ username: 'testuser' } as UserDto)
    );
    const projectData = {
      title: 'Test Project',
      slug: 'test-project',
      description: 'A test project',
    };
    component.projectForm.patchValue(projectData);
    tick();
    xsrfService.getXsrfToken.mockReturnValue('test-token');

    (
      projectService.projectControllerCreateProject as unknown as jest.MockedFunction<
        (
          token: string,
          project: ProjectDto,
          observe: 'body'
        ) => Observable<ProjectDto>
      >
    ).mockReturnValue(of(projectData as ProjectDto));

    component.onSubmit();
    tick();

    expect(projectService.projectControllerCreateProject).toHaveBeenCalledWith(
      'test-token',
      projectData
    );
    flush();
  }));

  it('should handle error when project creation fails', fakeAsync(() => {
    mockUserAPIService.userControllerGetMe.mockReturnValue(
      of({ username: 'testuser' } as UserDto)
    );
    const projectData = {
      title: 'Test Project',
      slug: 'test-project',
      description: 'A test project',
    };
    component.projectForm.patchValue(projectData);
    tick();
    xsrfService.getXsrfToken.mockReturnValue('test-token');
    projectService.projectControllerCreateProject.mockReturnValue(
      throwError(() => new Error('Creation failed'))
    );

    component.onSubmit();
    tick();
    expect(projectService.projectControllerCreateProject).toHaveBeenCalledWith(
      'test-token',
      projectData
    );
    flush();
  }));
});
