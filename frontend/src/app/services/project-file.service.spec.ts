import { HttpEvent } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FileDeleteResponseDto, FileUploadResponseDto } from '@inkweld/index';
import { describe, it, expect, beforeEach } from 'vitest';
import { Observable, of } from 'rxjs';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';

import { ProjectAPIService } from '../../api-client/api/project-api.service';
import {
  FileDeleteResponse,
  ProjectFile,
  ProjectFileService,
} from './project-file.service';
import { XsrfService } from './xsrf.service';

describe('ProjectFileService', () => {

  const TEST_DATE = '2025-03-16T10:00:00.000Z';

  const uploadResp: FileUploadResponseDto = {
    originalName: 'test.jpg',
    storedName: 'stored-test.jpg',
    contentType: 'image/jpeg',
    size: 1024,
    uploadDate: TEST_DATE,
    fileUrl: 'http://example.com/test.jpg',
  };

  const deleteResp: FileDeleteResponseDto = {
    message: 'File deleted successfully',
  };

  type ApiMock = DeepMockProxy<ProjectAPIService>;
  type XsrfMock = DeepMockProxy<XsrfService>;

  let service: ProjectFileService;
  let api!: ApiMock;
  let xsrf!: XsrfMock;

  beforeEach(() => {
    // Create mock instances
    api = mockDeep<ProjectAPIService>();
    xsrf = mockDeep<XsrfService>();

    // Configure TestBed
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        ProjectFileService,
        { provide: ProjectAPIService, useValue: api },
        { provide: XsrfService, useValue: xsrf },
      ],
    });

    service = TestBed.inject(ProjectFileService);

    /* default stubbing for every test */
    api.projectFilesControllerListFiles.mockReturnValue(
      of([uploadResp]) as unknown as Observable<
        HttpEvent<FileUploadResponseDto[]>
      >
    );
    api.projectFilesControllerUploadFile.mockReturnValue(
      of(uploadResp) as unknown as Observable<HttpEvent<FileUploadResponseDto>>
    );
    api.projectFilesControllerDeleteFile.mockReturnValue(
      of(deleteResp) as unknown as Observable<HttpEvent<FileDeleteResponseDto>>
    );

    xsrf.getXsrfToken.mockReturnValue('test-token');
    xsrf.getToken.mockResolvedValue('test-token');

    /* basePath is just a POJO, not a method, so set it directly */
    (api as any).configuration = {
      basePath: 'http://localhost:3000',
      encodeParam: (p: any) => p.value,
    };
  });

  it('lists project files', () => {
    let files!: ProjectFile[];

    service
      .getProjectFiles('alice', 'proj')
      .subscribe((f: ProjectFile[]) => (files = f));

    expect(api.projectFilesControllerListFiles).toHaveBeenCalledWith(
      'alice',
      'proj'
    );
    expect(files[0]).toMatchObject({ originalName: 'test.jpg' });
    expect(files[0].uploadDate.toISOString()).toBe(TEST_DATE);
  });

  it('builds a file URL from the API basePath', () => {
    const url = service.getFileUrl(
      'alice',
      'proj',
      'stored-test.jpg'
    );

    expect(url).toBe(
      'http://localhost:3000/api/v1/projects/alice/proj/files/stored-test.jpg'
    );
  });

  it('uploads then deletes a file', () => {
    const testFile = new File(['x'], 'test.jpg', { type: 'image/jpeg' });

    /* upload */
    let uploaded!: ProjectFile;
    service
      .uploadFile('alice', 'proj', testFile)
      .subscribe((f: ProjectFile) => (uploaded = f));

    expect(api.projectFilesControllerUploadFile).toHaveBeenCalledWith(
      'alice',
      'proj',
      'test-token',
      testFile
    );
    expect(uploaded.uploadDate.toISOString()).toBe(TEST_DATE);

    /* delete */
    let delResp!: FileDeleteResponse;
    service
      .deleteFile('alice', 'proj', 'stored-test.jpg')
      .subscribe((r: FileDeleteResponse) => (delResp = r));

    expect(api.projectFilesControllerDeleteFile).toHaveBeenCalledWith(
      'alice',
      'proj',
      'stored-test.jpg',
      'test-token'
    );
    expect(delResp.message).toBe('File deleted successfully');
  });

  it.each([
    [0, '0 Bytes'],
    [1000, '1000 Bytes'],
    [1024, '1 KB'],
    [1048576, '1 MB'],
    [1073741824, '1 GB'],
  ])('formats %d bytes → %s', (bytes, expected) => {
    expect(service.formatFileSize(bytes)).toBe(expected);
  });
});
