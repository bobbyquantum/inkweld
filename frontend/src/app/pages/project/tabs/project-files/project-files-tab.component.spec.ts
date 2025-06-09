import { signal } from '@angular/core';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { DialogGatewayService } from '@services/dialog-gateway.service';
import {
  ProjectFile,
  ProjectFileService,
} from '@services/project-file.service';
import { ProjectStateService } from '@services/project-state.service';
import { of, throwError } from 'rxjs';

import { ProjectFilesTabComponent } from './project-files-tab.component';

// Mock FileListComponent
@Component({
  selector: 'app-file-list',
  template: '<div>Mock File List</div>',
  standalone: true,
})
class MockFileListComponent {
  @Input() files: ProjectFile[] = [];
  @Output() deleteFile = new EventEmitter<ProjectFile>();
}

describe('ProjectFilesTabComponent', () => {
  let component: ProjectFilesTabComponent;
  let fixture: ComponentFixture<ProjectFilesTabComponent>;
  let projectStateService: Partial<ProjectStateService>;
  let fileService: Partial<ProjectFileService>;
  let dialogGateway: Partial<DialogGatewayService>;

  const mockProject = {
    username: 'testuser',
    slug: 'test-project',
    title: 'Test Project',
    id: '123',
    createdDate: new Date().toISOString(),
    updatedDate: new Date().toISOString(),
    description: 'Test description',
    // Add any other required fields
  };

  const mockFiles = [
    {
      originalName: 'test.jpg',
      storedName: 'abc123.jpg',
      contentType: 'image/jpeg',
      size: 12345,
      uploadDate: new Date(),
      fileUrl: 'http://localhost:3000/files/abc123.jpg',
    },
  ];

  beforeEach(async () => {
    // Setup mock services
    projectStateService = {
      project: signal(mockProject),
    };

    fileService = {
      getProjectFiles: vi.fn().mockReturnValue(of(mockFiles)),
      uploadFile: vi.fn().mockReturnValue(of(mockFiles[0])),
      deleteFile: vi.fn().mockReturnValue(of({ message: 'File deleted' })),
      getFileUrl: vi.fn(),
      formatFileSize: vi.fn(),
    };

    dialogGateway = {
      openFileUploadDialog: vi
        .fn()
        .mockResolvedValue(new File([], 'test.jpg')),
      openConfirmationDialog: vi.fn().mockResolvedValue(true),
    };

    await TestBed.configureTestingModule({
      imports: [
        MatButtonModule,
        MatIconModule,
        MatProgressSpinnerModule,
        NoopAnimationsModule,
        ProjectFilesTabComponent,
        MockFileListComponent,
      ],
      providers: [
        { provide: ProjectStateService, useValue: projectStateService },
        { provide: ProjectFileService, useValue: fileService },
        { provide: DialogGatewayService, useValue: dialogGateway },
      ],
    })
      .overrideComponent(ProjectFilesTabComponent, {
        set: {
          imports: [
            MatButtonModule,
            MatIconModule,
            MatProgressSpinnerModule,
            MockFileListComponent,
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ProjectFilesTabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load files on init', () => {
    expect(fileService.getProjectFiles).toHaveBeenCalledWith(
      mockProject.username,
      mockProject.slug
    );
    expect(component.files()).toEqual(mockFiles);
    expect(component.loading()).toBeFalsy();
  });

  it('should handle error when loading files', async () => {
    (fileService.getProjectFiles as vi.Mock).mockReturnValueOnce(
      throwError(() => new Error('Network error'))
    );

    await component.loadFiles();

    expect(component.error()).toBeTruthy();
    expect(component.loading()).toBeFalsy();
  });

  it('should retry loading on error', () => {
    const loadFilesSpy = vi
      .spyOn(component, 'loadFiles')
      .mockImplementation(() => Promise.resolve());
    component.error.set('Error loading files');

    component.retryLoading();

    expect(loadFilesSpy).toHaveBeenCalled();
  });

  it('should open the file upload dialog', async () => {
    await component.openUploadDialog();

    expect(dialogGateway.openFileUploadDialog).toHaveBeenCalled();
    expect(fileService.uploadFile).toHaveBeenCalled();
  });

  it('should handle file upload error', async () => {
    (fileService.uploadFile as vi.Mock).mockReturnValueOnce(
      throwError(() => new Error('Upload failed'))
    );

    await component.openUploadDialog();

    expect(component.snackbarMessage()).toContain('Failed');
    expect(component.snackbarType()).toEqual('error');
  });

  it('should confirm before deleting file', async () => {
    await component.confirmDeleteFile(mockFiles[0]);

    expect(dialogGateway.openConfirmationDialog).toHaveBeenCalled();
    expect(fileService.deleteFile).toHaveBeenCalledWith(
      mockProject.username,
      mockProject.slug,
      mockFiles[0].storedName
    );
  });
});
