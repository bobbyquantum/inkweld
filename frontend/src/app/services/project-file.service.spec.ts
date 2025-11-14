import { HttpClient, HttpEvent, provideHttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';

import { FilesService } from '../../api-client/api/files.service';
import { GetApiV1ProjectsUsernameSlugFiles200ResponseInner } from '../../api-client/model/get-api-v1-projects-username-slug-files200-response-inner';
import { PostApiV1ProjectsUsernameSlugFiles200Response } from '../../api-client/model/post-api-v1-projects-username-slug-files200-response';
import { PostApiV1UsersAvatar200Response } from '../../api-client/model/post-api-v1-users-avatar200-response';
import {
  FileDeleteResponse,
  ProjectFile,
  ProjectFileService,
} from './project-file.service';
import { XsrfService } from './xsrf.service';

describe('ProjectFileService', () => {
  const TEST_DATE = '2025-03-16T10:00:00.000Z';

  const uploadResp: GetApiV1ProjectsUsernameSlugFiles200ResponseInner = {
    name: 'stored-test.jpg',
    size: 1024,
    uploadDate: TEST_DATE,
  };

  const deleteResp: PostApiV1UsersAvatar200Response = {
    message: 'File deleted successfully',
  };

  type ApiMock = DeepMockProxy<FilesService>;
  type XsrfMock = DeepMockProxy<XsrfService>;
  type HttpMock = DeepMockProxy<HttpClient>;

  let service: ProjectFileService;
  let api!: ApiMock;
  let xsrf!: XsrfMock;
  let http!: HttpMock;

  beforeEach(() => {
    // Create mock instances
    api = mockDeep<FilesService>();
    xsrf = mockDeep<XsrfService>();
    http = mockDeep<HttpClient>();

    // Configure TestBed
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        ProjectFileService,
        { provide: FilesService, useValue: api },
        { provide: XsrfService, useValue: xsrf },
        { provide: HttpClient, useValue: http },
      ],
    });

    service = TestBed.inject(ProjectFileService);

    /* default stubbing for every test */
    api.getApiV1ProjectsUsernameSlugFiles.mockReturnValue(
      of([uploadResp]) as unknown as Observable<
        HttpEvent<GetApiV1ProjectsUsernameSlugFiles200ResponseInner[]>
      >
    );

    // Mock HttpClient.post for uploadFile
    http.post.mockReturnValue(
      of({
        name: 'stored-test.jpg',
        size: 1024,
        uploadDate: TEST_DATE,
      })
    );

    api.postApiV1ProjectsUsernameSlugFiles.mockReturnValue(
      of({
        storedName: 'stored-test.jpg',
        uploadDate: TEST_DATE,
        originalName: 'test.jpg',
        size: 1,
        mimeType: 'image/jpeg',
      }) as unknown as Observable<
        HttpEvent<PostApiV1ProjectsUsernameSlugFiles200Response>
      >
    );
    api.deleteApiV1ProjectsUsernameSlugFilesStoredName.mockReturnValue(
      of(deleteResp) as unknown as Observable<
        HttpEvent<PostApiV1UsersAvatar200Response>
      >
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

    expect(api.getApiV1ProjectsUsernameSlugFiles).toHaveBeenCalledWith(
      'alice',
      'proj'
    );
    expect(files[0]).toMatchObject({ originalName: 'stored-test.jpg' });
    expect(files[0].uploadDate.toISOString()).toBe(TEST_DATE);
  });

  it('builds a file URL from the API basePath', () => {
    const url = service.getFileUrl('alice', 'proj', 'stored-test.jpg');

    expect(url).toBe(
      'http://localhost:3000/api/v1/projects/alice/proj/files/stored-test.jpg'
    );
  });

  it('uploads then deletes a file', async () => {
    const testFile = new File(['x'], 'test.jpg', { type: 'image/jpeg' });

    /* upload */
    let uploaded!: ProjectFile;
    await new Promise<void>((resolve, reject) => {
      service.uploadFile('alice', 'proj', testFile).subscribe({
        next: (f: ProjectFile) => {
          uploaded = f;
          resolve();
        },
        error: err => reject(new Error(String(err))),
      });
    });

    expect(http.post).toHaveBeenCalled();
    expect(uploaded.uploadDate.toISOString()).toBe(TEST_DATE);

    /* delete */
    let delResp!: FileDeleteResponse;
    await new Promise<void>(resolve => {
      service
        .deleteFile('alice', 'proj', 'stored-test.jpg')
        .subscribe((r: FileDeleteResponse) => {
          delResp = r;
          resolve();
        });
    });

    expect(
      api.deleteApiV1ProjectsUsernameSlugFilesStoredName
    ).toHaveBeenCalledWith('alice', 'proj', 'stored-test.jpg');
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
