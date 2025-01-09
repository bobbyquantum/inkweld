import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ProjectAPIService } from '@worm/index';
import { of, throwError } from 'rxjs';

import { ProjectDto } from '../../../api-client/model/project-dto';
import { projectServiceMock } from '../../../testing/project-api.mock';
import { EditProjectDialogComponent } from './edit-project-dialog.component';
describe('EditProjectDialogComponent', () => {
  let component: EditProjectDialogComponent;
  let fixture: ComponentFixture<EditProjectDialogComponent>;
  let mockDialogRef: { close: jest.Mock };

  const mockProject: ProjectDto = {
    id: '1',
    slug: 'test-project',
    title: 'Test Project',
    description: 'Test Description',
    createdDate: new Date().toISOString(),
    updatedDate: new Date().toISOString(),
    user: {
      username: 'testuser',
      name: 'Test User',
      avatarImageUrl: 'https://example.com/avatar.jpg',
    } as const,
  };

  beforeEach(async () => {
    mockDialogRef = {
      close: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [
        MatDialogModule,
        ReactiveFormsModule,
        MatFormFieldModule,
        MatInputModule,
        NoopAnimationsModule,
        EditProjectDialogComponent,
      ],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { project: mockProject } },
        { provide: ProjectAPIService, useValue: projectServiceMock },
        provideHttpClient(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EditProjectDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should close dialog with updated project on save', async () => {
    const updatedProject = {
      ...mockProject,
      title: 'Updated Title',
      description: 'Updated Description',
    };
    projectServiceMock.projectControllerUpdateProject = jest
      .fn()
      .mockReturnValue(
        of({
          ...mockProject,
          ...updatedProject,
        })
      );
    const updateSpy = jest.spyOn(
      component['projectApi'],
      'projectControllerUpdateProject'
    );
    component.form.patchValue({
      title: 'Updated Title',
      description: 'Updated Description',
    });

    await component.onSave();

    expect(updateSpy).toHaveBeenCalledWith(
      mockProject.user!.username,
      mockProject.slug,
      '',
      {
        title: 'Updated Title',
        description: 'Updated Description',
      }
    );
    expect(mockDialogRef.close).toHaveBeenCalledWith(updatedProject);
  });

  it('should close dialog without data on cancel', () => {
    component.onCancel();
    expect(mockDialogRef.close).toHaveBeenCalled();
  });

  it('should handle errors during save', async () => {
    const errorResponse = new HttpErrorResponse({
      error: 'Test error',
      status: 500,
    });
    projectServiceMock.projectControllerUpdateProject = jest
      .fn()
      .mockReturnValue(throwError(() => errorResponse));
    jest.spyOn(component['projectApi'], 'projectControllerUpdateProject');
    jest.spyOn(console, 'error');

    await expect(component.onSave()).rejects.toThrow(
      'Failed to update project: Unknown error'
    );
    expect(console.error).toHaveBeenCalledWith(
      'Failed to update project:',
      'Unknown error'
    );
    expect(mockDialogRef.close).toHaveBeenCalledTimes(0);
  });
});
