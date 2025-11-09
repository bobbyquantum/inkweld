import { provideLocationMocks } from '@angular/common/testing';
import {
  CUSTOM_ELEMENTS_SCHEMA,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
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
import { Project } from '@inkweld/index';
import { UnifiedProjectService } from '@services/unified-project.service';
import { UnifiedUserService } from '@services/unified-user.service';
import { of } from 'rxjs';
import { MockedObject, vi } from 'vitest';

import { CreateProjectComponent } from './create-project.component';

describe('CreateProjectComponent', () => {
  let component: CreateProjectComponent;
  let fixture: ComponentFixture<CreateProjectComponent>;
  let userService: Partial<UnifiedUserService>;
  let projectService: MockedObject<UnifiedProjectService>;
  let snackBar: MockedObject<MatSnackBar>;
  let router: MockedObject<Router>;

  const mockUser = {
    username: 'testuser',
    name: 'Test User',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
  };

  const mockProject: Project = {
    id: '1',
    title: 'Test Project',
    slug: 'test-project',
    description: 'Test Description',
    username: 'testuser',
    createdDate: new Date().toISOString(),
    updatedDate: new Date().toISOString(),
  };

  beforeEach(async () => {
    userService = {
      currentUser: signal(mockUser),
      getMode: vi.fn().mockReturnValue('offline'),
    };

    projectService = {
      createProject: vi.fn().mockResolvedValue(mockProject),
    } as unknown as MockedObject<UnifiedProjectService>;

    snackBar = {
      open: vi.fn(),
    } as unknown as MockedObject<MatSnackBar>;

    router = {
      navigate: vi.fn().mockResolvedValue(true),
    } as unknown as MockedObject<Router>;

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
        provideZonelessChangeDetection(),
        provideRouter([
          { path: 'create-project', component: CreateProjectComponent },
        ]),
        provideLocationMocks(),
        { provide: UnifiedUserService, useValue: userService },
        { provide: UnifiedProjectService, useValue: projectService },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({})) },
        },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
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
    expect(projectService.createProject).not.toHaveBeenCalled();
  });

  it('should create project successfully', async () => {
    component.projectForm.patchValue({
      title: 'Test Project',
      slug: 'test-project',
      description: 'Test Description',
    });

    // Create a resolved promise for the API call
    projectService.createProject.mockResolvedValue(mockProject);

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

  it('should handle project creation failure', async () => {
    component.projectForm.patchValue({
      title: 'Test Project',
      slug: 'test-project',
      description: 'Test Description',
    });

    const error = new Error('API Error');
    projectService.createProject.mockRejectedValue(error);

    await component.onSubmit();

    expect(snackBar.open).toHaveBeenCalledWith(
      'Failed to create project.',
      'Close',
      { duration: 3000 }
    );
    expect(component.isSaving).toBeFalsy();
  });

  it('should redirect to home if project response is incomplete', async () => {
    component.projectForm.patchValue({
      title: 'Test Project',
      slug: 'test-project',
      description: 'Test Description',
    });

    const incompleteProject = { id: '123' } as Project;
    projectService.createProject.mockResolvedValue(incompleteProject);

    await component.onSubmit();

    expect(router.navigate).toHaveBeenCalledWith(['/']);
  });
});
