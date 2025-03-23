import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ProjectDto, UserDto } from '@inkweld/index';
import { of } from 'rxjs';

import { ProjectAPIService } from '../../../api-client/api/project-api.service';
import { ProjectImportExportService } from '../../services/project-import-export.service';
import { EditProjectDialogComponent } from './edit-project-dialog.component';

describe('EditProjectDialogComponent', () => {
  let component: EditProjectDialogComponent;
  let fixture: ComponentFixture<EditProjectDialogComponent>;
  let dialogRef: jest.Mocked<MatDialogRef<EditProjectDialogComponent>>;
  let importExportService: jest.Mocked<ProjectImportExportService>;
  let snackBar: jest.Mocked<MatSnackBar>;
  let projectAPIService: jest.Mocked<ProjectAPIService>;

  const mockUser: UserDto = {
    username: 'testuser',
    name: 'Test User',
  };

  const mockProject: ProjectDto = {
    id: '123',
    title: 'Test Project',
    description: 'Test Description',
    slug: 'test-project',
    createdDate: '2025-02-12T15:30:00.000Z',
    updatedDate: '2025-02-12T15:30:00.000Z',
    username: mockUser.username,
  };

  beforeEach(async () => {
    dialogRef = {
      close: jest.fn(),
    } as any;

    importExportService = {
      exportProject: jest.fn(),
      exportProjectZip: jest.fn(),
      importProject: jest.fn(),
      isProcessing: jest.fn().mockReturnValue(signal(false)()),
      progress: jest.fn().mockReturnValue(signal(0)()),
      error: jest.fn().mockReturnValue(signal(undefined)()),
    } as any;

    snackBar = {
      open: jest.fn(),
    } as any;

    projectAPIService = {
      projectControllerUpdateProject: jest
        .fn()
        .mockReturnValue(of(mockProject)),
    } as any;

    // Mock XSRF token cookie
    document.cookie = 'XSRF-TOKEN=test-token';

    await TestBed.configureTestingModule({
      imports: [
        EditProjectDialogComponent,
        ReactiveFormsModule,
        NoopAnimationsModule,
      ],
      providers: [
        FormBuilder,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: mockProject },
        { provide: ProjectImportExportService, useValue: importExportService },
        { provide: ProjectAPIService, useValue: projectAPIService },
        { provide: MatSnackBar, useValue: snackBar },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EditProjectDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    component.project = mockProject;
  });

  afterEach(() => {
    // Clean up XSRF token cookie
    document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize form with project data', () => {
    expect(component.form.get('title')?.value).toBe(mockProject.title);
    expect(component.form.get('description')?.value).toBe(
      mockProject.description
    );
  });

  describe('save functionality', () => {
    it('should not save if form is invalid', async () => {
      component.form.get('title')?.setValue('');

      await component.onSave();

      expect(dialogRef.close).not.toHaveBeenCalled();
    });

    it('should show error if project slug is missing', async () => {
      const projectWithoutSlug = {
        ...mockProject,
        slug: '',
      };
      component.project = projectWithoutSlug;

      await component.onSave();

      expect(snackBar.open).toHaveBeenCalledWith(
        'Failed to update project: Project slug is required',
        'Close',
        expect.any(Object)
      );
      expect(dialogRef.close).not.toHaveBeenCalled();
    });

    it('should save project successfully', async () => {
      const updatedTitle = 'Updated Title';
      const updatedDescription = 'Updated Description';
      component.form.patchValue({
        title: updatedTitle,
        description: updatedDescription,
      });

      await component.onSave();

      expect(
        projectAPIService.projectControllerUpdateProject
      ).toHaveBeenCalledWith(
        mockUser.username,
        mockProject.slug,
        'test-token',
        expect.objectContaining({
          title: updatedTitle,
          description: updatedDescription,
        })
      );
      expect(dialogRef.close).toHaveBeenCalled();
    });
  });
});
