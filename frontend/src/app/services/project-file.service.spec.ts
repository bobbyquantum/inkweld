import { HttpEvent } from '@angular/common/http';
import { fakeAsync, flush } from '@angular/core/testing';
import { FileDeleteResponseDto, FileUploadResponseDto } from '@inkweld/index';
import { createServiceFactory, SpectatorService } from '@ngneat/spectator/jest';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { Observable, of } from 'rxjs';

import { ProjectAPIService } from '../../api-client/api/project-api.service';
import {
  FileDeleteResponse,
  ProjectFile,
  ProjectFileService,
} from './project-file.service';
import { XsrfService } from './xsrf.service';

describe('ProjectFileService (spectator flavour)', () => {
  const createService = createServiceFactory({
    service: ProjectFileService,
    providers: [
      {
        provide: ProjectAPIService,
        useFactory: () => mockDeep<ProjectAPIService>(),
      },
      { provide: XsrfService, useFactory: () => mockDeep<XsrfService>() },
    ],
  });

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

  let spectator: SpectatorService<ProjectFileService>;
  type ApiMock = DeepMockProxy<ProjectAPIService>;
  type XsrfMock = DeepMockProxy<XsrfService>;

  let api!: ApiMock;
  let xsrf!: XsrfMock;

  beforeEach(() => {
    spectator = createService();

    // Get the actual injected mock instances
    api = spectator.inject(ProjectAPIService) as ApiMock;
    xsrf = spectator.inject(XsrfService) as XsrfMock;

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

  it('lists project files', fakeAsync(() => {
    let files!: ProjectFile[];

    spectator.service
      .getProjectFiles('alice', 'proj')
      .subscribe((f: ProjectFile[]) => (files = f));
    flush();

    expect(api.projectFilesControllerListFiles).toHaveBeenCalledWith(
      'alice',
      'proj'
    );
    expect(files[0]).toMatchObject({ originalName: 'test.jpg' });
    expect(files[0].uploadDate.toISOString()).toBe(TEST_DATE);
  }));

  it('builds a file URL from the API basePath', () => {
    const url = spectator.service.getFileUrl(
      'alice',
      'proj',
      'stored-test.jpg'
    );

    expect(url).toBe(
      'http://localhost:3000/api/v1/projects/alice/proj/files/stored-test.jpg'
    );
  });

  it('uploads then deletes a file', fakeAsync(() => {
    const testFile = new File(['x'], 'test.jpg', { type: 'image/jpeg' });

    /* upload */
    let uploaded!: ProjectFile;
    spectator.service
      .uploadFile('alice', 'proj', testFile)
      .subscribe((f: ProjectFile) => (uploaded = f));
    flush();

    expect(api.projectFilesControllerUploadFile).toHaveBeenCalledWith(
      'alice',
      'proj',
      'test-token',
      testFile
    );
    expect(uploaded.uploadDate.toISOString()).toBe(TEST_DATE);

    /* delete */
    let delResp!: FileDeleteResponse;
    spectator.service
      .deleteFile('alice', 'proj', 'stored-test.jpg')
      .subscribe((r: FileDeleteResponse) => (delResp = r));
    flush();

    expect(api.projectFilesControllerDeleteFile).toHaveBeenCalledWith(
      'alice',
      'proj',
      'stored-test.jpg',
      'test-token'
    );
    expect(delResp.message).toBe('File deleted successfully');
  }));

  it.each([
    [0, '0 Bytes'],
    [1000, '1000 Bytes'],
    [1024, '1 KB'],
    [1048576, '1 MB'],
    [1073741824, '1 GB'],
  ])('formats %d bytes → %s', (bytes, expected) => {
    expect(spectator.service.formatFileSize(bytes)).toBe(expected);
  });
});
