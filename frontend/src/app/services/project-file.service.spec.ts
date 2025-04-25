import { TestBed } from '@angular/core/testing';
import {
  FileDeleteResponseDto,
  FileMetadataDto,
  FileUploadResponseDto,
} from '@inkweld/index';
import { of } from 'rxjs';

import { ProjectAPIService } from '../../api-client/api/project-api.service';
import { ProjectFileService } from './project-file.service';
import { XsrfService } from './xsrf.service';

describe('ProjectFileService', () => {
  let service: ProjectFileService;
  let projectApiServiceMock: jest.Mocked<ProjectAPIService>;
  let xsrfServiceMock: jest.Mocked<XsrfService>;

  // Simple ISO date string for testing
  const testDate = '2025-03-16T10:00:00.000Z';

  // Simplified test data
  const createMockData = () => {
    const fileBase = {
      originalName: 'test.jpg',
      storedName: 'stored-test.jpg',
      contentType: 'image/jpeg',
      size: 1024,
      uploadDate: testDate,
    };

    return {
      metadata: fileBase as FileMetadataDto,
      uploadResponse: {
        ...fileBase,
        fileUrl: 'http://example.com/test.jpg',
      } as FileUploadResponseDto,
      deleteResponse: {
        message: 'File deleted successfully',
      } as FileDeleteResponseDto,
    };
  };

  beforeEach(() => {
    const mockData = createMockData();

    // Create a simplified mock for ProjectAPIService
    projectApiServiceMock = {
      projectFilesControllerListFiles: jest
        .fn()
        .mockReturnValue(of([mockData.metadata])),
      projectFilesControllerUploadFile: jest
        .fn()
        .mockReturnValue(of(mockData.uploadResponse)),
      projectFilesControllerDeleteFile: jest
        .fn()
        .mockReturnValue(of(mockData.deleteResponse)),
      configuration: {
        basePath: 'http://localhost:3000',
        encodeParam: jest.fn(param => param.value),
      },
    } as unknown as jest.Mocked<ProjectAPIService>;

    // Create a mock for XsrfService
    xsrfServiceMock = {
      getXsrfToken: jest.fn().mockReturnValue('test-token'),
      getToken: jest.fn().mockResolvedValue('test-token'),
      refreshToken: jest.fn().mockResolvedValue('test-token'),
    } as unknown as jest.Mocked<XsrfService>;

    TestBed.configureTestingModule({
      providers: [
        ProjectFileService,
        { provide: ProjectAPIService, useValue: projectApiServiceMock },
        { provide: XsrfService, useValue: xsrfServiceMock },
      ],
    });

    service = TestBed.inject(ProjectFileService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be created and handle basic operations', done => {
    // Test service creation
    expect(service).toBeTruthy();

    // Test getProjectFiles
    service.getProjectFiles('user1', 'project1').subscribe(files => {
      expect(files[0].originalName).toBe('test.jpg');
      expect(files[0].uploadDate).toBeInstanceOf(Date);
      expect(files[0].uploadDate.toISOString()).toBe(testDate);
      expect(
        projectApiServiceMock.projectFilesControllerListFiles
      ).toHaveBeenCalledWith('user1', 'project1');

      // Test file URL generation in the same test
      const url = service.getFileUrl('user1', 'project1', 'stored-test.jpg');
      expect(url).toBe(
        'http://localhost:3000/api/v1/projects/user1/project1/files/stored-test.jpg'
      );

      done();
    });
  });

  it('should handle file operations correctly', done => {
    // Create a minimal test file
    const testFile = new File(['t'], 'test.jpg', { type: 'image/jpeg' });

    // Test upload
    service.uploadFile('user1', 'project1', testFile).subscribe(file => {
      expect(file.originalName).toBe('test.jpg');
      expect(file.uploadDate).toBeInstanceOf(Date);
      expect(
        projectApiServiceMock.projectFilesControllerUploadFile
      ).toHaveBeenCalledWith('user1', 'project1', 'test-token', testFile);

      // Test delete in the same test flow
      service
        .deleteFile('user1', 'project1', 'stored-test.jpg')
        .subscribe(response => {
          expect(response.message).toBe('File deleted successfully');
          expect(
            projectApiServiceMock.projectFilesControllerDeleteFile
          ).toHaveBeenCalledWith(
            'user1',
            'project1',
            'stored-test.jpg',
            'test-token'
          );
          done();
        });
    });
  });

  it('should format file sizes correctly', () => {
    // Test all size formats in a single test
    const sizes = [
      { input: 0, expected: '0 Bytes' },
      { input: 1000, expected: '1000 Bytes' },
      { input: 1024, expected: '1 KB' },
      { input: 1048576, expected: '1 MB' },
      { input: 1073741824, expected: '1 GB' },
    ];

    sizes.forEach(testCase => {
      expect(service.formatFileSize(testCase.input)).toBe(testCase.expected);
    });
  });
});
