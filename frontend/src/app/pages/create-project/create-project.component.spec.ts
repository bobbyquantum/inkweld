import { provideLocationMocks } from '@angular/common/testing';
import {
  CUSTOM_ELEMENTS_SCHEMA,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
  Router,
} from '@angular/router';
import { type Project } from '@inkweld/index';
import { ProjectActivationService } from '@services/local/project-activation.service';
import { UnifiedProjectService } from '@services/local/unified-project.service';
import { ProjectTemplateService } from '@services/project/project-template.service';
import { UnifiedUserService } from '@services/user/unified-user.service';
import { of } from 'rxjs';
import { type MockedObject, vi } from 'vitest';

import { CreateProjectComponent } from './create-project.component';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';

describe('CreateProjectComponent', () => {
  let component: CreateProjectComponent;
  let fixture: ComponentFixture<CreateProjectComponent>;
  let userService: Partial<UnifiedUserService>;
  let projectService: MockedObject<UnifiedProjectService>;
  let templateService: MockedObject<ProjectTemplateService>;
  let snackBar: MockedObject<MatSnackBar>;
  let router: MockedObject<Router>;

  const mockUser = {
    username: 'testuser',
    name: 'Test User',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    id: 'test-id',
    enabled: true,
  };

  const mockTemplates = [
    {
      id: 'empty',
      name: 'Empty Project',
      description: 'A blank slate',
      icon: 'description',
      folder: 'empty',
    },
    {
      id: 'worldbuilding-empty',
      name: 'Worldbuilding (Empty)',
      description: 'Ready for worldbuilding',
      icon: 'public',
      folder: 'worldbuilding-empty',
    },
  ];

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
      getMode: vi.fn().mockReturnValue('local'),
    };

    projectService = {
      createProject: vi.fn().mockResolvedValue(mockProject),
    } as unknown as MockedObject<UnifiedProjectService>;

    templateService = {
      getTemplates: vi.fn().mockResolvedValue(mockTemplates),
    } as unknown as MockedObject<ProjectTemplateService>;

    snackBar = {
      open: vi.fn(),
    } as unknown as MockedObject<MatSnackBar>;

    router = {
      navigate: vi.fn().mockResolvedValue(true),
    } as unknown as MockedObject<Router>;

    await TestBed.configureTestingModule({
      imports: [
        translocoTestProvider(),
        CreateProjectComponent,
        MatButtonModule,
        MatIconModule,
        MatFormFieldModule,
        MatInputModule,
        MatCardModule,
        MatProgressBarModule,
      ],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          { path: 'create-project', component: CreateProjectComponent },
        ]),
        provideLocationMocks(),
        { provide: UnifiedUserService, useValue: userService },
        { provide: UnifiedProjectService, useValue: projectService },
        { provide: ProjectTemplateService, useValue: templateService },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({})) },
        },
        {
          provide: ProjectActivationService,
          useValue: { activate: vi.fn().mockResolvedValue(undefined) },
        },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(CreateProjectComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }, 10000);

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize form with default values', () => {
    expect(component.model().title).toBe('');
    expect(component.model().slug).toBe('');
    expect(component.model().description).toBe('');
  });

  it('should generate slug from title', () => {
    const title = 'My Test Project!';
    const expectedSlug = 'my-test-project';
    const result = component.generateSlug(title);
    expect(result).toBe(expectedSlug);
  });

  it('should update slug when title changes', () => {
    const title = 'My Test Project';

    component.projectForm.title().value.set(title);
    fixture.detectChanges();

    expect(component.projectForm.slug().value()).toBe('my-test-project');
  });

  it('should update project URL when slug changes', () => {
    const baseUrl = window.location.origin;
    const username = 'testuser';
    const slug = 'test-project';

    component.username = username; // Set the username directly
    component.projectForm.slug().value.set(slug);
    component.updateProjectUrl();
    fixture.detectChanges();

    expect(component.projectUrl()).toBe(`${baseUrl}/${username}/${slug}`);
  });

  it('should validate required fields', () => {
    expect(component.projectForm().valid()).toBeFalsy();

    component.model.set({
      title: 'Test Project',
      slug: 'test-project',
      description: '',
    });

    expect(component.projectForm().valid()).toBeTruthy();
  });

  it('should validate slug format', () => {
    component.projectForm.slug().value.set('invalid slug');
    expect(component.projectForm.slug().valid()).toBeFalsy();

    component.projectForm.slug().value.set('valid-slug');
    expect(component.projectForm.slug().valid()).toBeTruthy();

    component.projectForm.slug().value.set('123-valid-slug');
    expect(component.projectForm.slug().valid()).toBeTruthy();
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
    component.model.set({
      title: 'Test Project',
      slug: 'test-project',
      description: 'Test Description',
    });

    // Create a resolved promise for the API call
    projectService.createProject.mockResolvedValue(mockProject);

    await component.onSubmit();

    expect(snackBar.open).toHaveBeenCalledWith(
      'Project imported successfully!',
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
    component.model.set({
      title: 'Test Project',
      slug: 'test-project',
      description: 'Test Description',
    });

    const error = new Error('API Error');
    projectService.createProject.mockRejectedValue(error);

    await component.onSubmit();

    expect(snackBar.open).toHaveBeenCalledWith(
      'Something went wrong. Please try again.',
      'Close',
      { duration: 3000 }
    );
    expect(component.isSaving()).toBeFalsy();
  });

  it('should redirect to home if project response is incomplete', async () => {
    component.model.set({
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
