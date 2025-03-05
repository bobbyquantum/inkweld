import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import {
  ComponentFixture,
  fakeAsync,
  TestBed,
  tick,
} from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Configuration, ProjectAPIService, UserDto } from '@inkweld/index';
import { XsrfService } from '@services/xsrf.service';
import { of, throwError } from 'rxjs';

import { UserService } from '../../services/user.service';
import { NewProjectDialogComponent } from './new-project-dialog.component';

describe('NewProjectDialogComponent', () => {
  let component: NewProjectDialogComponent;
  let fixture: ComponentFixture<NewProjectDialogComponent>;
  let mockDialogRef: MatDialogRef<NewProjectDialogComponent>;
  let mockProjectAPIService: ProjectAPIService;
  let mockUserService: UserService;
  let mockXsrfService: XsrfService;
  let snackBar: jest.Mocked<MatSnackBar>;
  const mockUser: UserDto = {
    username: 'testuser',
    name: 'Test User',
    avatarImageUrl: '',
  };

  beforeEach(async () => {
    mockDialogRef = {
      close: jest.fn(),
    } as unknown as MatDialogRef<NewProjectDialogComponent>;
    mockProjectAPIService = {
      projectControllerCreateProject: jest.fn(),
    } as unknown as ProjectAPIService;
    mockUserService = {
      currentUser: jest.fn(),
      loadCurrentUser: jest.fn(),
    } as unknown as UserService;
    mockXsrfService = { getXsrfToken: jest.fn() } as unknown as XsrfService;

    (mockUserService.currentUser as unknown as jest.Mock).mockReturnValue(
      mockUser
    );
    (mockXsrfService.getXsrfToken as unknown as jest.Mock).mockReturnValue(
      'test-xsrf-token'
    );
    snackBar = {
      open: jest.fn(),
    } as unknown as jest.Mocked<MatSnackBar>;

    await TestBed.configureTestingModule({
      imports: [
        MatDialogModule,
        MatSnackBarModule,
        NewProjectDialogComponent,
        ReactiveFormsModule,
      ],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ProjectAPIService, useValue: mockProjectAPIService },
        { provide: XsrfService, useValue: mockXsrfService },
        { provide: Configuration, useValue: {} },
        { provide: UserService, useValue: mockUserService },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: MAT_DIALOG_DATA, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NewProjectDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize the form', () => {
    expect(component.projectForm).toBeDefined();
    expect(component.projectForm.get('title')).toBeDefined();
    expect(component.projectForm.get('slug')).toBeDefined();
    expect(component.projectForm.get('description')).toBeDefined();
  });

  it('should generate slug correctly', () => {
    expect(component.generateSlug('Test Project')).toBe('test-project');
    expect(component.generateSlug('Another Test Project')).toBe(
      'another-test-project'
    );
    expect(component.generateSlug('  Trim Spaces  ')).toBe('trim-spaces');
    expect(component.generateSlug('Special Chars !@#$%^')).toBe(
      'special-chars'
    );
  });

  it('should update project URL on username and slug changes', () => {
    component.username = 'testuser';
    component.projectForm.get('slug')?.setValue('test-project');
    fixture.detectChanges();
    expect(component.projectUrl).toBe(
      `${window.location.origin}/testuser/test-project`
    );

    component.projectForm.get('slug')?.setValue('');
    fixture.detectChanges();
    expect(component.projectUrl).toBe('');
  });

  it('should update slug on title change', fakeAsync(() => {
    component.projectForm.get('title')?.setValue('Test Project');
    tick();
    expect(component.projectForm.get('slug')?.value).toBe('test-project');
  }));

  it('should submit the form successfully', async () => {
    const mockApiResponse = {
      id: '123',
      title: 'Test Project',
      slug: 'test-project',
      description: 'Test Description',
    };

    (
      mockProjectAPIService.projectControllerCreateProject as jest.Mock
    ).mockReturnValue(of(mockApiResponse));

    component.projectForm.setValue({
      title: 'Test Project',
      slug: 'test-project',
      description: 'Test Description',
    });

    await component.onSubmit();
    fixture.detectChanges();

    expect(
      mockProjectAPIService.projectControllerCreateProject
    ).toHaveBeenCalledWith('test-xsrf-token', {
      title: 'Test Project',
      slug: 'test-project',
      description: 'Test Description',
    });
    expect(mockDialogRef.close).toHaveBeenCalledWith(mockApiResponse);
  });

  it('should handle form submission failure', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    const error = new Error('API Error');

    (
      mockProjectAPIService.projectControllerCreateProject as jest.Mock
    ).mockReturnValue(throwError(() => error));

    component.projectForm.setValue({
      title: 'Test Project',
      slug: 'test-project',
      description: 'Test Description',
    });

    await component.onSubmit();
    fixture.detectChanges();

    expect(
      mockProjectAPIService.projectControllerCreateProject
    ).toHaveBeenCalledWith('test-xsrf-token', {
      title: 'Test Project',
      slug: 'test-project',
      description: 'Test Description',
    });
    expect(mockDialogRef.close).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to create project:',
      error
    );
    expect(component.isSaving).toBe(false);
    consoleErrorSpy.mockRestore();
  });

  it('should not submit if form is invalid', async () => {
    component.projectForm.setValue({
      title: '',
      slug: '',
      description: '',
    });

    await component.onSubmit();
    fixture.detectChanges();

    expect(
      mockProjectAPIService.projectControllerCreateProject
    ).not.toHaveBeenCalled();
    expect(snackBar.open).not.toHaveBeenCalled();
    expect(mockDialogRef.close).not.toHaveBeenCalled();
  });

  it('should call onCancel and close the dialog', () => {
    component.onCancel();
    expect(mockDialogRef.close).toHaveBeenCalled();
  });

  it('should have correct initial baseUrl', () => {
    expect(component.baseUrl).toEqual(window.location.origin);
  });
});
