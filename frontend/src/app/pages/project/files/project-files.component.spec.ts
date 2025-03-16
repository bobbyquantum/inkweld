import { HttpErrorResponse } from '@angular/common/http';
import {
  ComponentFixture,
  fakeAsync,
  TestBed,
  tick,
} from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router } from '@angular/router';
import { DialogGatewayService } from '@services/dialog-gateway.service';
import { ProjectFileService } from '@services/project-file.service';
import { of, throwError } from 'rxjs';

import { ProjectFilesComponent } from './project-files.component';

describe('ProjectFilesComponent', () => {
  let component: ProjectFilesComponent;
  let fixture: ComponentFixture<ProjectFilesComponent>;
  let fileServiceMock: Partial<ProjectFileService>;
  let routerMock: Partial<Router>;
  let dialogGatewayMock: Partial<DialogGatewayService>;

  // Simplified test data
  const uploadDate = new Date();
  const testFiles = [
    {
      id: '1',
      originalName: 'test-file.pdf',
      storedName: 'stored-test-file.pdf',
      size: 1024,
      contentType: 'application/pdf',
      fileUrl: 'http://example.com/test-file.pdf',
      uploadDate: uploadDate,
    },
  ];

  const mockActivatedRoute = {
    snapshot: {
      params: {
        username: 'testuser',
        slug: 'test-project',
      },
    },
  };

  // Reusable test setup
  function setupTest() {
    fileServiceMock = {
      getProjectFiles: jest.fn().mockReturnValue(of(testFiles)),
      uploadFile: jest.fn().mockReturnValue(of({})),
      deleteFile: jest
        .fn()
        .mockReturnValue(
          of({ success: true, message: 'File deleted successfully' })
        ),
    };

    routerMock = {
      navigate: jest.fn().mockResolvedValue(true),
    };

    dialogGatewayMock = {
      openFileUploadDialog: jest.fn().mockResolvedValue(null),
    };

    return TestBed.configureTestingModule({
      imports: [ProjectFilesComponent, NoopAnimationsModule],
      providers: [
        { provide: ProjectFileService, useValue: fileServiceMock },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        { provide: Router, useValue: routerMock },
        { provide: DialogGatewayService, useValue: dialogGatewayMock },
      ],
    });
  }

  beforeEach(async () => {
    await setupTest().compileComponents();
    fixture = TestBed.createComponent(ProjectFilesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    // Ensure cleanup after each test
    if (component) {
      component.ngOnDestroy();
    }
    jest.clearAllMocks();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load project files on init', () => {
    expect(fileServiceMock.getProjectFiles).toHaveBeenCalledWith(
      'testuser',
      'test-project'
    );
    expect(component.files()).toEqual(testFiles);
    expect(component.loading()).toBeFalsy();
    expect(component.error()).toBeNull();
  });

  it('should handle errors when loading files', fakeAsync(() => {
    // Set up error response
    const errorResponse = new HttpErrorResponse({
      error: 'test error',
      status: 500,
      statusText: 'Server Error',
    });

    (fileServiceMock.getProjectFiles as jest.Mock).mockReturnValue(
      throwError(() => errorResponse)
    );

    // Trigger loading again
    component.retryLoading();
    tick();

    expect(component.loading()).toBeFalsy();
    expect(component.error()).toBeTruthy();
    expect(component.files()).toBeNull();
  }));

  it('should navigate back to project details', () => {
    component.navigateToProject();
    expect(routerMock.navigate).toHaveBeenCalledWith([
      'testuser',
      'test-project',
    ]);
  });

  it('should retry loading files', fakeAsync(() => {
    component.error.set('Test error');
    component.retryLoading();
    tick();

    expect(component.loading()).toBeFalsy();
    expect(component.error()).toBeNull();
    expect(fileServiceMock.getProjectFiles).toHaveBeenCalled();
  }));

  it('should open file upload dialog when requested', fakeAsync(() => {
    // Just test that the dialog gateway is called
    void component.openUploadDialog();
    tick();

    expect(dialogGatewayMock.openFileUploadDialog).toHaveBeenCalled();
  }));

  it('should delete a file when requested', fakeAsync(() => {
    component.onDeleteFile(testFiles[0]);
    tick();

    expect(fileServiceMock.deleteFile).toHaveBeenCalledWith(
      'testuser',
      'test-project',
      testFiles[0].storedName
    );
    expect(component.snackbarMessage()).toContain('deleted successfully');
  }));

  it('should display empty state when no files exist', () => {
    component.files.set([]);
    fixture.detectChanges();

    const emptyContainer = fixture.debugElement.query(
      By.css('.empty-container')
    );
    expect(emptyContainer).toBeTruthy();
    expect(emptyContainer.nativeElement.textContent).toContain(
      'No files available'
    );
  });

  it('should properly clean up on destroy', () => {
    const destroySpy = jest.spyOn(component['destroy$'], 'next');
    const completeSpy = jest.spyOn(component['destroy$'], 'complete');

    component.ngOnDestroy();

    expect(destroySpy).toHaveBeenCalled();
    expect(completeSpy).toHaveBeenCalled();
  });
});
