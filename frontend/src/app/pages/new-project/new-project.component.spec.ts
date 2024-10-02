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
} from 'worm-api-client';
import { Observable, of, throwError } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { XsrfService } from '@services/xsrf.service';

describe('NewProjectComponent', () => {
  let component: NewProjectComponent;
  let fixture: ComponentFixture<NewProjectComponent>;
  let projectServiceSpy: jasmine.SpyObj<ProjectAPIService>;
  let userServiceMock: jasmine.SpyObj<UserAPIService>;
  let snackBarSpy: jasmine.SpyObj<MatSnackBar>;
  let xsrfServiceSpy: jasmine.SpyObj<XsrfService>;

  beforeEach(async () => {
    projectServiceSpy = jasmine.createSpyObj('ProjectAPIService', [
      'createProject',
    ]);
    userServiceMock = jasmine.createSpyObj('UserAPIService', [
      'getCurrentUser',
    ]);
    snackBarSpy = jasmine.createSpyObj('MatSnackBar', ['open']);
    xsrfServiceSpy = jasmine.createSpyObj('XsrfService', ['getXsrfToken']);

    await TestBed.configureTestingModule({
      imports: [NewProjectComponent],
      providers: [
        provideNoopAnimations(),
        provideHttpClientTesting(),
        provideRouter([{ path: '', component: NewProjectComponent }]),
        { provide: ActivatedRoute, useValue: {} },
        { provide: ProjectAPIService, useValue: projectServiceSpy },
        { provide: UserAPIService, useValue: userServiceMock },
        { provide: MatSnackBar, useValue: snackBarSpy },
        { provide: XsrfService, useValue: xsrfServiceSpy },
        { provide: Configuration, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NewProjectComponent);
    component = fixture.componentInstance;
  });

  it('should create', fakeAsync(() => {
    const getCurrentUserSpy = userServiceMock.getCurrentUser as jasmine.Spy<
      (observe: 'body') => Observable<User>
    >;
    getCurrentUserSpy.and.returnValue(of({ username: 'testuser' } as User));
    fixture.detectChanges();
    tick();
    expect(component).toBeTruthy();
    flush();
  }));

  it('should generate slug from title', fakeAsync(() => {
    const getCurrentUserSpy = userServiceMock.getCurrentUser as jasmine.Spy<
      (observe: 'body') => Observable<User>
    >;
    getCurrentUserSpy.and.returnValue(of({ username: 'testuser' } as User));
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
    const getCurrentUserSpy = userServiceMock.getCurrentUser as jasmine.Spy<
      (observe: 'body') => Observable<User>
    >;
    getCurrentUserSpy.and.returnValue(of({ username: 'testuser' } as User));
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
    const getCurrentUserSpy = userServiceMock.getCurrentUser as jasmine.Spy<
      (observe: 'body') => Observable<User>
    >;
    getCurrentUserSpy.and.returnValue(of({ username: 'testuser' } as User));
    fixture.detectChanges();
    tick();
    const projectData = {
      title: 'Test Project',
      slug: 'test-project',
      description: 'A test project',
    };
    component.projectForm.patchValue(projectData);
    tick();
    xsrfServiceSpy.getXsrfToken.and.returnValue('test-token');
    (projectServiceSpy.createProject as jasmine.Spy).and.returnValue(
      of(projectData)
    );

    component.onSubmit();
    tick();

    expect(projectServiceSpy.createProject).toHaveBeenCalledWith(
      'test-token',
      projectData
    );
    flush();
  }));

  it('should handle error when project creation fails', fakeAsync(() => {
    const getCurrentUserSpy = userServiceMock.getCurrentUser as jasmine.Spy<
      (observe: 'body') => Observable<User>
    >;
    getCurrentUserSpy.and.returnValue(of({ username: 'testuser' } as User));
    fixture.detectChanges();
    tick();
    const projectData = {
      title: 'Test Project',
      slug: 'test-project',
      description: 'A test project',
    };
    component.projectForm.patchValue(projectData);
    tick();
    xsrfServiceSpy.getXsrfToken.and.returnValue('test-token');
    projectServiceSpy.createProject.and.returnValue(
      throwError(() => new Error('Creation failed'))
    );

    component.onSubmit();
    tick();
    expect(projectServiceSpy.createProject).toHaveBeenCalledWith(
      'test-token',
      projectData
    );
    flush();
  }));

  it('should handle error when fetching user fails', fakeAsync(() => {
    const getCurrentUserSpy = userServiceMock.getCurrentUser as jasmine.Spy<
      (observe: 'body') => Observable<User>
    >;
    getCurrentUserSpy.and.returnValue(
      throwError(() => new Error('Failed to fetch user'))
    );
    fixture.detectChanges();
    tick();
    flush();
  }));
});
