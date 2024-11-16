import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick,
  flush,
} from '@angular/core/testing';
import { NewProjectComponent } from './new-project.component';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import {
  Configuration,
  ProjectAPIService,
  UserAPIService,
  User,
  Project,
} from 'worm-api-client';
import { Observable, of, throwError } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { XsrfService } from '@services/xsrf.service';

jest.mock('worm-api-client');
jest.mock('@angular/material/snack-bar');
jest.mock('@services/xsrf.service');

describe('NewProjectComponent', () => {
  let component: NewProjectComponent;
  let fixture: ComponentFixture<NewProjectComponent>;
  let projectService: jest.Mocked<ProjectAPIService>;
  let userService: jest.Mocked<UserAPIService>;
  let snackBar: jest.Mocked<MatSnackBar>;
  let xsrfService: jest.Mocked<XsrfService>;

  beforeEach(async () => {
    projectService = {
      createProject: jest
        .fn()
        .mockImplementation((token: string, project: Project) => {
          return of(project as Project);
        }),
    } as unknown as jest.Mocked<ProjectAPIService>;

    userService = {
      getCurrentUser: jest.fn(),
    } as unknown as jest.Mocked<UserAPIService>;

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
        { provide: UserAPIService, useValue: userService },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: XsrfService, useValue: xsrfService },
        { provide: Configuration, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NewProjectComponent);
    component = fixture.componentInstance;
  });

  it('should create', fakeAsync(() => {
    const getCurrentUserMock =
      userService.getCurrentUser as unknown as jest.MockedFunction<
        (observe: 'body') => Observable<User>
      >;
    getCurrentUserMock.mockReturnValue(of({ username: 'testuser' } as User));
    fixture.detectChanges();
    tick();
    expect(component).toBeTruthy();
    flush();
  }));

  it('should generate slug from title', fakeAsync(() => {
    const getCurrentUserMock =
      userService.getCurrentUser as unknown as jest.MockedFunction<
        (observe: 'body') => Observable<User>
      >;
    getCurrentUserMock.mockReturnValue(of({ username: 'testuser' } as User));
    fixture.detectChanges();
    tick();
    const title = 'My Awesome Project';
    const expectedSlug = 'my-awesome-project';
    component.projectForm.patchValue({ title });
    tick();
    expect(component.projectForm.get('slug')?.value).toBe(expectedSlug);
    flush();
  }));

  it('should update project URL when slug changes', fakeAsync(() => {
    const getCurrentUserMock =
      userService.getCurrentUser as unknown as jest.MockedFunction<
        (observe: 'body') => Observable<User>
      >;
    getCurrentUserMock.mockReturnValue(of({ username: 'testuser' } as User));
    fixture.detectChanges();
    tick();
    const slug = 'test-project';
    component.projectForm.patchValue({ slug });
    tick();
    expect(component.projectUrl).toBe(
      `${window.location.origin}/testuser/${slug}`
    );
    flush();
  }));

  it('should create project when form is valid', fakeAsync(() => {
    const getCurrentUserMock =
      userService.getCurrentUser as unknown as jest.MockedFunction<
        (observe: 'body') => Observable<User>
      >;
    getCurrentUserMock.mockReturnValue(of({ username: 'testuser' } as User));
    fixture.detectChanges();
    tick();
    const projectData = {
      title: 'Test Project',
      slug: 'test-project',
      description: 'A test project',
    };
    component.projectForm.patchValue(projectData);
    tick();
    xsrfService.getXsrfToken.mockReturnValue('test-token');

    (
      projectService.createProject as unknown as jest.MockedFunction<
        (
          token: string,
          project: Project,
          observe: 'body'
        ) => Observable<Project>
      >
    ).mockReturnValue(of(projectData as Project));

    component.onSubmit();
    tick();

    expect(projectService.createProject).toHaveBeenCalledWith(
      'test-token',
      projectData
    );
    flush();
  }));

  it('should handle error when project creation fails', fakeAsync(() => {
    const getCurrentUserMock =
      userService.getCurrentUser as unknown as jest.MockedFunction<
        (observe: 'body') => Observable<User>
      >;
    getCurrentUserMock.mockReturnValue(of({ username: 'testuser' } as User));
    fixture.detectChanges();
    tick();
    const projectData = {
      title: 'Test Project',
      slug: 'test-project',
      description: 'A test project',
    };
    component.projectForm.patchValue(projectData);
    tick();
    xsrfService.getXsrfToken.mockReturnValue('test-token');
    projectService.createProject.mockReturnValue(
      throwError(() => new Error('Creation failed'))
    );

    component.onSubmit();
    tick();
    expect(projectService.createProject).toHaveBeenCalledWith(
      'test-token',
      projectData
    );
    flush();
  }));

  it('should handle error when fetching user fails', fakeAsync(() => {
    const getCurrentUserMock =
      userService.getCurrentUser as unknown as jest.MockedFunction<
        (observe: 'body') => Observable<User>
      >;
    getCurrentUserMock.mockReturnValue(
      throwError(() => new Error('Failed to fetch user'))
    );
    fixture.detectChanges();
    tick();
    flush();
  }));
});
