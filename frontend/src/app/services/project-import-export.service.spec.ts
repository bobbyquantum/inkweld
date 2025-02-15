import { TestBed } from '@angular/core/testing';
import JSZip from '@progress/jszip-esm';
import { ProjectDto, ProjectElementDto } from '@worm/index';
import { of } from 'rxjs';

import {
  ProjectArchive,
  ProjectArchiveError,
  ProjectArchiveErrorType,
} from '../models/project-archive';
import { DocumentService } from './document.service';
import { ProjectImportExportService } from './project-import-export.service';
import { ProjectStateService } from './project-state.service';

describe('ProjectImportExportService', () => {
  let service: ProjectImportExportService;
  let projectStateService: jest.Mocked<ProjectStateService>;
  let documentService: jest.Mocked<DocumentService>; // Mock DocumentService

  const mockProject: ProjectDto = {
    id: '123',
    title: 'Test Project',
    description: 'Test Description',
    slug: 'test-project',
    createdDate: '2025-02-12T15:30:00.000Z',
    updatedDate: '2025-02-12T15:30:00.000Z',
  };

  const mockElements: ProjectElementDto[] = [
    {
      id: 'elem1',
      name: 'Root Folder',
      type: 'FOLDER',
      position: 0,
      level: 0,
      expandable: true,
    },
    {
      id: 'elem2',
      name: 'Test File',
      type: 'ITEM',
      position: 1,
      level: 1,
    },
  ];

  beforeEach(() => {
    const projectStateMock = {
      project: jest.fn().mockReturnValue(mockProject),
      elements: jest.fn().mockReturnValue(mockElements),
      updateProject: jest.fn().mockResolvedValue(undefined),
      updateElements: jest.fn(),
    };

    const documentServiceMock = {
      exportDocument: jest.fn().mockReturnValue(of('mock document content')), // Mock exportDocument to return Observable<string>
      importDocument: jest.fn().mockResolvedValue(undefined),
    };

    TestBed.configureTestingModule({
      providers: [
        ProjectImportExportService,
        { provide: ProjectStateService, useValue: projectStateMock },
        { provide: DocumentService, useValue: documentServiceMock }, // Add DocumentService mock
      ],
    });

    service = TestBed.inject(ProjectImportExportService);
    projectStateService = TestBed.inject(
      ProjectStateService
    ) as jest.Mocked<ProjectStateService>;
    documentService = TestBed.inject(
      // Inject DocumentService mock
      DocumentService
    ) as jest.Mocked<DocumentService>;

    // Mock URL methods
    global.URL.createObjectURL = jest.fn().mockReturnValue('blob-url');
    global.URL.revokeObjectURL = jest.fn();

    // Mock document methods
    document.body.appendChild = jest.fn();
    document.body.removeChild = jest.fn();
    HTMLAnchorElement.prototype.click = jest.fn();

    // Mock Response.json for Blob testing
    global.Response = jest.fn().mockImplementation(function (this: any) {
      this.json = jest.fn().mockResolvedValue({
        version: 1,
        project: mockProject,
        elements: mockElements.map(elem =>
          elem.type === 'ITEM'
            ? { ...elem, content: 'mock document content' }
            : elem
        ),
      });
      return this;
    }) as any;

    // Mock File.prototype.text
    Object.defineProperty(File.prototype, 'text', {
      configurable: true,
      value: jest.fn(),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('exportProject', () => {
    it('should export project as JSON file', async () => {
      await service.exportProject();

      expect(service.isProcessing()).toBe(false);
      expect(service.progress()).toBe(100);
      expect(service.error()).toBeUndefined();

      // Verify file creation and download
      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(document.body.appendChild).toHaveBeenCalled();
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
      expect(document.body.removeChild).toHaveBeenCalled();
      expect(URL.revokeObjectURL).toHaveBeenCalled();

      // Verify the created blob contains correct data
      const blobArg = (URL.createObjectURL as jest.Mock).mock
        .calls[0][0] as Blob;
      const blobData = await new Response(blobArg).json();

      expect(blobData.version).toBe(1);
      expect(blobData.project.title).toBe(mockProject.title);
      expect(blobData.elements).toHaveLength(mockElements.length);
      expect(blobData.elements[0].id).toBe(mockElements[0].id);

      // Verify document content for ITEM elements
      const itemElement = blobData.elements.find((e: any) => e.type === 'ITEM');
      expect(itemElement).toBeDefined();
      expect(itemElement.content).toBe('mock document content');

      // Verify documentService.exportDocument was called
      expect(documentService.exportDocument).toHaveBeenCalledTimes(1);
      expect(documentService.exportDocument).toHaveBeenCalledWith('elem2'); // elem2 is the id of the ITEM element
    });

    it('should throw error if no project is loaded', async () => {
      projectStateService.project.mockReturnValue(undefined);

      await expect(service.exportProject()).rejects.toThrow(
        new ProjectArchiveError(
          ProjectArchiveErrorType.ValidationFailed,
          'No project is currently loaded'
        )
      );

      expect(service.isProcessing()).toBe(false);
      expect(service.error()).toBe('No project is currently loaded');
    });
  });

  describe('importProjectZip', () => {
    it('should import valid project file', async () => {
      const validArchive = {
        version: 1,
        exportedAt: new Date().toISOString(),
        project: {
          title: 'Imported Project',
          description: 'Imported Description',
          slug: 'imported-project',
        },
        elements: [
          {
            id: 'import1',
            name: 'Imported Folder',
            type: 'FOLDER',
            position: 0,
            level: 0,
            expandable: true,
          },
        ],
      } as ProjectArchive; // Explicitly type validArchive
      validArchive.elements.push({
        // Add ITEM element with content
        id: 'import2',
        name: 'Imported Item',
        type: 'ITEM',
        position: 1,
        level: 1,
        content: 'imported document content',
      }); // Cast element to any to avoid type error

      const fileContent = JSON.stringify(validArchive);

      const zip = new JSZip();
      zip.file('project.json', fileContent);
      const zipBlob = await zip.generateAsync({ type: 'blob' });

      const file = new File([zipBlob as BlobPart], 'project.zip', {
        // Type cast zipBlob to Blob
        type: 'application/zip',
      });

      await service.importProjectZip(file);

      expect(service.isProcessing()).toBe(false);
      expect(service.progress()).toBe(100);
      expect(service.error()).toBeUndefined();

      expect(projectStateService.updateProject).toHaveBeenCalled();
      expect(projectStateService.updateElements).toHaveBeenCalled();

      const updatedProject = projectStateService.updateProject.mock.calls[0][0];
      expect(updatedProject.title).toBe(validArchive.project.title);
      expect(updatedProject.slug).toBe(validArchive.project.slug);

      const updatedElements =
        projectStateService.updateElements.mock.calls[0][0];
      expect(updatedElements).toHaveLength(validArchive.elements.length); // Corrected expected length
      expect(updatedElements[0].name).toBe(validArchive.elements[0].name);
      expect(updatedElements[1].name).toBe('Imported Item'); // Verify imported item name
      expect(updatedElements[1].type).toBe('ITEM'); // Verify imported item type

      // Verify documentService.importDocument call
      expect(documentService.importDocument).toHaveBeenCalledTimes(1);
      expect(documentService.importDocument).toHaveBeenCalledWith(
        'import2', // documentId should be the id of the imported ITEM element
        JSON.stringify('imported document content') // Content should be the content from archive
      );
    });

    it('should reject invalid JSON file', async () => {
      const zip = new JSZip();
      zip.file('project.json', 'invalid json');
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const file = new File([zipBlob as BlobPart], 'project.zip', {
        // Type cast zipBlob to Blob
        type: 'application/zip',
      });

      await expect(service.importProjectZip(file)).rejects.toThrow(
        ProjectArchiveError
      );

      expect(service.isProcessing()).toBe(false);
      expect(service.error()).toBeTruthy();
      expect(projectStateService.updateProject).not.toHaveBeenCalled();
      expect(projectStateService.updateElements).not.toHaveBeenCalled();
    });

    it('should reject archive with invalid version', async () => {
      const invalidArchive = {
        version: 999,
        project: { title: 'Test', slug: 'test' },
        elements: [],
      };

      const zip = new JSZip();
      zip.file('project.json', JSON.stringify(invalidArchive));
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const file = new File([zipBlob as BlobPart], 'project.zip', {
        // Type cast zipBlob to Blob
        type: 'application/zip',
      });

      await expect(service.importProjectZip(file)).rejects.toThrow(
        /version.*not supported/i
      );

      expect(service.isProcessing()).toBe(false);
      expect(service.error()).toBeTruthy();
    });

    it('should reject archive with missing required fields', async () => {
      const invalidArchive = {
        version: 1,
        project: { title: 'Test' }, // missing slug
        elements: [],
      };

      const zip = new JSZip();
      zip.file('project.json', JSON.stringify(invalidArchive));
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const file = new File([zipBlob as BlobPart], 'project.zip', {
        // Type cast zipBlob to Blob
        type: 'application/zip',
      });

      await expect(service.importProjectZip(file)).rejects.toThrow(
        /missing.*slug/i
      );

      expect(service.isProcessing()).toBe(false);
      expect(service.error()).toBeTruthy();
    });

    it('should reject archive with invalid element structure', async () => {
      const invalidArchive = {
        version: 1,
        project: { title: 'Test', slug: 'test' },
        elements: [
          {
            id: 'test',
            name: 'Test',
            type: 'INVALID_TYPE', // invalid type
            position: 0,
            level: 0,
          },
        ],
      };

      const zip = new JSZip();
      zip.file('project.json', JSON.stringify(invalidArchive));
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const file = new File([zipBlob as BlobPart], 'project.zip', {
        // Type cast zipBlob to Blob
        type: 'application/zip',
      });

      await expect(service.importProjectZip(file)).rejects.toThrow(
        /invalid element/i
      );

      expect(service.isProcessing()).toBe(false);
      expect(service.error()).toBeTruthy();
    });
  });
});
