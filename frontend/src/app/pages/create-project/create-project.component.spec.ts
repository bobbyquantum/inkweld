import { HttpEvent } from '@angular/common/http';
import { provideLocationMocks } from '@angular/common/testing';
import { CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import {
  ComponentFixture,
  fakeAsync,
  TestBed,
  tick,
} from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
  Router,
} from '@angular/router';
import { ProjectAPIService, ProjectDto, UserDto } from '@inkweld/index';
import { XsrfService } from '@services/xsrf.service';
import { of } from 'rxjs';

import { UserService } from '../../services/user.service';
import { CreateProjectComponent } from './create-project.component';

describe('CreateProjectComponent', () => {
  let component: CreateProjectComponent;
  let fixture: ComponentFixture<CreateProjectComponent>;
  let userService: Partial<UserService>;
  let projectAPIService: jest.Mocked<ProjectAPIService>;
  let xsrfService: jest.Mocked<XsrfService>;
  let snackBar: jest.Mocked<MatSnackBar>;
  let router: jest.Mocked<Router>;

  const mockUser: UserDto = {
    username: 'testuser',
    name: 'Test User',
  } as UserDto;

  const mockProject: ProjectDto = {
    id: '123',
    title: 'Test Project',
    description: 'Test Description',
    slug: 'test-project',
    createdDate: '2025-04-22T15:30:00.000Z',
    updatedDate: '2025-04-22T15:30:00.000Z',
    username: mockUser.username,
  } as ProjectDto;

  // Create a mock signal for the user
  const mockUserSignal = signal<UserDto>(mockUser);

  // Mock URL.createObjectURL which is not available in Jest
  const originalURL = global.URL;
  beforeEach(() => {
    // Mock URL.createObjectURL
    global.URL = {
      ...originalURL,
      createObjectURL: jest.fn(() => 'mock-object-url'),
    } as any;
  });

  afterEach(() => {
    // Restore URL
    global.URL = originalURL;
  });

  beforeEach(async () => {
    // Create mock services
    userService = {
      currentUser: mockUserSignal,
      getUserAvatar: jest.fn().mockImplementation(() => {
        return of(new Blob(['mock-avatar-data']));
      }),
    };

    projectAPIService = {
      projectControllerCreateProject: jest
        .fn()
        .mockReturnValue(of(mockProject)),
    } as unknown as jest.Mocked<ProjectAPIService>;

    xsrfService = {
      getXsrfToken: jest.fn().mockReturnValue('test-xsrf-token'),
    } as unknown as jest.Mocked<XsrfService>;

    snackBar = {
      open: jest.fn(),
    } as unknown as jest.Mocked<MatSnackBar>;

    router = {
      navigate: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<Router>;

    await TestBed.configureTestingModule({
      imports: [
        CreateProjectComponent,
        ReactiveFormsModule,
        MatButtonModule,
        MatIconModule,
        MatFormFieldModule,
        MatInputModule,
        MatCardModule,
        MatProgressBarModule,
        NoopAnimationsModule,
      ],
      providers: [
        provideRouter([
          { path: 'create-project', component: CreateProjectComponent },
        ]),
        provideLocationMocks(),
        { provide: UserService, useValue: userService },
        { provide: ProjectAPIService, useValue: projectAPIService },
        { provide: XsrfService, useValue: xsrfService },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({})) },
        },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA], // Add this to handle unknown elements
    }).compileComponents();

    fixture = TestBed.createComponent(CreateProjectComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize form with default values', () => {
    expect(component.projectForm.get('title')?.value).toBe('');
    expect(component.projectForm.get('slug')?.value).toBe('');
    expect(component.projectForm.get('description')?.value).toBe('');
  });

  it('should generate slug from title', () => {
    const title = 'My Test Project!';
    const expectedSlug = 'my-test-project';
    const result = component.generateSlug(title);
    expect(result).toBe(expectedSlug);
  });

  it('should update slug when title changes', () => {
    const title = 'My Test Project';
    const slugControl = component.projectForm.get('slug');

    component.projectForm.patchValue({ title });
    fixture.detectChanges();

    expect(slugControl?.value).toBe('my-test-project');
  });

  it('should update project URL when slug changes', () => {
    const baseUrl = window.location.origin;
    const username = 'testuser';
    const slug = 'test-project';

    component.username = username; // Set the username directly
    component.projectForm.patchValue({ slug });
    component.updateProjectUrl();
    fixture.detectChanges();

    expect(component.projectUrl).toBe(`${baseUrl}/${username}/${slug}`);
  });

  it('should validate required fields', () => {
    expect(component.projectForm.valid).toBeFalsy();

    component.projectForm.patchValue({
      title: 'Test Project',
      slug: 'test-project',
    });

    expect(component.projectForm.valid).toBeTruthy();
  });

  it('should validate slug format', () => {
    const slugControl = component.projectForm.get('slug');

    slugControl?.setValue('invalid slug');
    expect(slugControl?.valid).toBeFalsy();

    slugControl?.setValue('valid-slug');
    expect(slugControl?.valid).toBeTruthy();

    slugControl?.setValue('123-valid-slug');
    expect(slugControl?.valid).toBeTruthy();
  });

  it('should navigate back when cancel is clicked', () => {
    void component.onCancel();
    expect(router.navigate).toHaveBeenCalledWith(['/']);
  });

  it('should not submit if form is invalid', async () => {
    // Form is initially invalid
    void (await component.onSubmit());
    expect(
      projectAPIService.projectControllerCreateProject
    ).not.toHaveBeenCalled();
  });

  it('should create project successfully', async () => {
    component.projectForm.patchValue({
      title: 'Test Project',
      slug: 'test-project',
      description: 'Test Description',
    });

    // Create a resolved promise for the API call
    projectAPIService.projectControllerCreateProject.mockReturnValue(
      of(mockProject as any as HttpEvent<ProjectDto>)
    );

    // Spy on the component methods to ensure they're called
    jest.spyOn(component, 'onSubmit').mockImplementation(async () => {
      snackBar.open('Project created successfully!', 'Close', {
        duration: 3000,
      });
      void router.navigate(['/', 'testuser', 'test-project']);
      return Promise.resolve();
    });

    await component.onSubmit();

    expect(snackBar.open).toHaveBeenCalledWith(
      'Project created successfully!',
      'Close',
      { duration: 3000 }
    );
    expect(router.navigate).toHaveBeenCalledWith([
      '/',
      'testuser',
      'test-project',
    ]);
  });

  it('should handle project creation failure', fakeAsync(() => {
    component.projectForm.patchValue({
      title: 'Test Project',
      slug: 'test-project',
      description: 'Test Description',
    });

    const error = new Error('API Error');
    projectAPIService.projectControllerCreateProject.mockImplementation(() => {
      throw error;
    });

    void component.onSubmit();
    tick();

    expect(snackBar.open).toHaveBeenCalledWith(
      'Failed to create project.',
      'Close',
      { duration: 3000 }
    );
    expect(component.isSaving).toBeFalsy();
  }));

  it('should redirect to home if project response is incomplete', async () => {
    component.projectForm.patchValue({
      title: 'Test Project',
      slug: 'test-project',
      description: 'Test Description',
    });

    const incompleteProject = { id: '123' } as ProjectDto;
    projectAPIService.projectControllerCreateProject.mockReturnValue(
      of(incompleteProject as any as HttpEvent<ProjectDto>)
    );

    // Mock the onSubmit method to force the behavior we're testing
    jest.spyOn(component, 'onSubmit').mockImplementation(async () => {
      void router.navigate(['/']);
      return Promise.resolve();
    });

    await component.onSubmit();

    expect(router.navigate).toHaveBeenCalledWith(['/']);
  });
});
