import { TestBed } from '@angular/core/testing';
import JSZip from '@progress/jszip-esm';
import { of } from 'rxjs';

import { DocumentService } from './document.service';
import { ProjectImportExportService } from './project-import-export.service';
import { ProjectStateService } from './project-state.service';

(global as any).URL.createObjectURL = jest.fn(() => 'dummy-url');
(global as any).URL.revokeObjectURL = jest.fn();

describe('ProjectImportExportService', () => {
  let service: ProjectImportExportService;
  let mockProjectStateService: any;
  let mockDocumentService: any;

  const dummyProject = {
    title: 'Test Project',
    slug: 'test-project',
    description: 'Test Description',
  };
  const dummyElements = [
    {
      id: 'folder1',
      name: 'Folder 1',
      type: 'FOLDER',
      position: 0,
      level: 0,
      version: 1,
      expandable: false,
      metadata: {},
    },
    {
      id: 'item1',
      name: 'Item 1',
      type: 'ITEM',
      position: 1,
      level: 0,
      version: 1,
      expandable: false,
      metadata: {},
    },
  ];

  beforeEach(() => {
    mockProjectStateService = {
      project: jest.fn(),
      elements: jest.fn(),
      updateProject: jest.fn(),
      updateElements: jest.fn(),
    };

    mockDocumentService = {
      exportDocument: jest.fn(),
      importDocument: jest.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        ProjectImportExportService,
        { provide: ProjectStateService, useValue: mockProjectStateService },
        { provide: DocumentService, useValue: mockDocumentService },
      ],
    });

    service = TestBed.inject(ProjectImportExportService);
    // Override private triggerDownload to avoid actual DOM manipulation in tests
    (service as any).triggerDownload = jest.fn(() => Promise.resolve());
  });

  describe('exportProject', () => {
    it('should throw error if no project is loaded', async () => {
      mockProjectStateService.project.mockReturnValue(null);
      await expect(service.exportProject()).rejects.toThrow(
        'No project is currently loaded'
      );
      expect(service.error()).toContain('No project is currently loaded');
    });

    it('should export project successfully', async () => {
      mockProjectStateService.project.mockReturnValue(dummyProject);
      mockProjectStateService.elements.mockReturnValue(dummyElements);
      // For ITEM element, return dummy content via observable
      mockDocumentService.exportDocument.mockReturnValue(of('dummy content'));

      await service.exportProject();
      expect((service as any).triggerDownload).toHaveBeenCalled();
      expect(service.progress()).toBe(100);
      expect(service.isProcessing()).toBe(false);
    });

    it('should handle error when createProjectArchive fails in exportProject', async () => {
      mockProjectStateService.project.mockReturnValue(dummyProject);
      // Force createProjectArchive to throw an error
      (service as any).createProjectArchive = jest.fn(() => {
        throw new Error('Test createProjectArchive error');
      });
      await expect(service.exportProject()).rejects.toThrow(
        'Test createProjectArchive error'
      );
      expect(service.error()).toContain('Test createProjectArchive error');
      expect(service.isProcessing()).toBe(false);
    });

    it('should handle error if triggerDownload fails in exportProject', async () => {
      mockProjectStateService.project.mockReturnValue(dummyProject);
      mockProjectStateService.elements.mockReturnValue(dummyElements);
      mockDocumentService.exportDocument.mockReturnValue(of('dummy content'));
      // Simulate failure in triggerDownload
      (service as any).triggerDownload = jest.fn(() =>
        Promise.reject(new Error('Download error'))
      );
      await expect(service.exportProject()).rejects.toThrow('Download error');
      expect(service.error()).toContain('Download error');
      expect(service.isProcessing()).toBe(false);
    });
  });

  describe('exportProjectZip', () => {
    it('should throw error if no project is loaded', async () => {
      mockProjectStateService.project.mockReturnValue(undefined);
      await expect(service.exportProjectZip()).rejects.toThrow(
        'No project is currently loaded'
      );
      expect(service.error()).toContain('No project is currently loaded');
    });

    it('should export project zip successfully', async () => {
      mockProjectStateService.project.mockReturnValue(dummyProject);
      mockProjectStateService.elements.mockReturnValue(dummyElements);
      mockDocumentService.exportDocument.mockReturnValue(of('dummy content'));

      await service.exportProjectZip();
      expect((service as any).triggerDownload).toHaveBeenCalled();
      expect(service.progress()).toBe(100);
      expect(service.isProcessing()).toBe(false);
    });

    it('should handle error when createProjectArchive fails in exportProjectZip', async () => {
      mockProjectStateService.project.mockReturnValue(dummyProject);
      // Force createProjectArchive to throw an error
      (service as any).createProjectArchive = jest.fn(() => {
        throw new Error('Test createProjectArchive error');
      });
      await expect(service.exportProjectZip()).rejects.toThrow(
        'Test createProjectArchive error'
      );
      expect(service.error()).toContain('Test createProjectArchive error');
      expect(service.isProcessing()).toBe(false);
    });

    it('should handle error if triggerDownload fails in exportProjectZip', async () => {
      mockProjectStateService.project.mockReturnValue(dummyProject);
      mockProjectStateService.elements.mockReturnValue(dummyElements);
      mockDocumentService.exportDocument.mockReturnValue(of('dummy content'));
      // Simulate failure in triggerDownload
      (service as any).triggerDownload = jest.fn(() =>
        Promise.reject(new Error('Download error'))
      );
      await expect(service.exportProjectZip()).rejects.toThrow(
        'Download error'
      );
      expect(service.error()).toContain('Download error');
      expect(service.isProcessing()).toBe(false);
    });
  });

  describe('importProject', () => {
    it('should import project from valid JSON file', async () => {
      const archive = {
        version: 1,
        exportedAt: new Date().toISOString(),
        project: {
          title: 'Imported Project',
          description: 'Desc',
          slug: 'imported-project',
        },
        elements: [],
      };
      const jsonContent = JSON.stringify(archive, null, 2);
      const fakeFile = {
        text: () => Promise.resolve(jsonContent),
      } as unknown as File;
      await service.importProject(fakeFile);
      expect(mockProjectStateService.updateProject).toHaveBeenCalled();
      expect(mockProjectStateService.updateElements).toHaveBeenCalled();
      expect(service.progress()).toBe(100);
      expect(service.isProcessing()).toBe(false);
    });

    it('should handle error when updateProjectState fails in importProject', async () => {
      const archive = {
        version: 1,
        exportedAt: new Date().toISOString(),
        project: {
          title: 'Imported Project',
          description: 'Desc',
          slug: 'imported-project',
        },
        elements: [],
      };
      const jsonContent = JSON.stringify(archive, null, 2);
      const fakeFile = {
        text: () => Promise.resolve(jsonContent),
      } as unknown as File;
      (service as any).updateProjectState = jest.fn(() => {
        throw new Error('Test updateProjectState error');
      });
      await expect(service.importProject(fakeFile)).rejects.toThrow(
        'Test updateProjectState error'
      );
      expect(service.error()).toContain('Test updateProjectState error');
      expect(service.isProcessing()).toBe(false);
    });

    it('should handle error for invalid JSON in importProject', async () => {
      const invalidContent = 'invalid json';
      const fakeFile = {
        text: () => Promise.resolve(invalidContent),
      } as unknown as File;
      await expect(service.importProject(fakeFile)).rejects.toThrow();
      expect(service.error()).toBeDefined();
      expect(service.isProcessing()).toBe(false);
    });

    it('should handle error for invalid archive structure in importProject', async () => {
      const invalidArchive = JSON.stringify({});
      const fakeFile = {
        text: () => Promise.resolve(invalidArchive),
      } as unknown as File;
      await expect(service.importProject(fakeFile)).rejects.toThrow(
        'Missing or invalid version number'
      );
      expect(service.error()).toContain('Missing or invalid version number');
      expect(service.isProcessing()).toBe(false);
    });
  });

  describe('importProjectZip', () => {
    it('should throw error if no file is provided', async () => {
      await expect(
        service.importProjectZip(null as unknown as File)
      ).rejects.toThrow('No file provided for import');
    });

    it('should import project from valid ZIP file', async () => {
      const archive = {
        version: 1,
        exportedAt: new Date().toISOString(),
        project: {
          title: 'Zip Project',
          description: 'Zip Desc',
          slug: 'zip-project',
        },
        elements: [],
      };
      const jsonContent = JSON.stringify(archive, null, 2);
      const zip = new JSZip();
      zip.file('project.json', jsonContent);
      const arrayBuffer = await zip.generateAsync({
        type: 'arraybuffer',
        compression: 'DEFLATE',
      });
      const fakeFile = {
        arrayBuffer: () => Promise.resolve(arrayBuffer),
      } as unknown as File;
      await service.importProjectZip(fakeFile);
      expect(mockProjectStateService.updateProject).toHaveBeenCalled();
      expect(mockProjectStateService.updateElements).toHaveBeenCalled();
      expect(service.progress()).toBe(100);
      expect(service.isProcessing()).toBe(false);
    });

    it('should handle error when updateProjectState fails in importProjectZip', async () => {
      const archive = {
        version: 1,
        exportedAt: new Date().toISOString(),
        project: {
          title: 'Zip Project',
          description: 'Zip Desc',
          slug: 'zip-project',
        },
        elements: [],
      };
      const jsonContent = JSON.stringify(archive, null, 2);
      const zip = new JSZip();
      zip.file('project.json', jsonContent);
      const arrayBuffer = await zip.generateAsync({
        type: 'arraybuffer',
        compression: 'DEFLATE',
      });
      const fakeFile = {
        arrayBuffer: () => Promise.resolve(arrayBuffer),
      } as unknown as File;
      (service as any).updateProjectState = jest.fn(() => {
        throw new Error('Test updateProjectState error');
      });
      await expect(service.importProjectZip(fakeFile)).rejects.toThrow(
        'Test updateProjectState error'
      );
      expect(service.error()).toContain('Test updateProjectState error');
      expect(service.isProcessing()).toBe(false);
    });

    it('should throw error if ZIP file does not contain project.json', async () => {
      const zip = new JSZip();
      // Do not add project.json
      const arrayBuffer = await zip.generateAsync({
        type: 'arraybuffer',
        compression: 'DEFLATE',
      });
      const fakeFile = {
        arrayBuffer: () => Promise.resolve(arrayBuffer),
      } as unknown as File;

      await expect(service.importProjectZip(fakeFile)).rejects.toThrow(
        'ZIP archive does not contain project.json'
      );
      expect(service.isProcessing()).toBe(false);
    });
  });
});
