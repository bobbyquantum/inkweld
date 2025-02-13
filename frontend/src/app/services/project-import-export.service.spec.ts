import { TestBed } from '@angular/core/testing';
import { ProjectDto, ProjectElementDto } from '@worm/index';

import {
  ProjectArchiveError,
  ProjectArchiveErrorType,
} from '../models/project-archive';
import { ProjectImportExportService } from './project-import-export.service';
import { ProjectStateService } from './project-state.service';

describe('ProjectImportExportService', () => {
  let service: ProjectImportExportService;
  let projectStateService: jest.Mocked<ProjectStateService>;

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

    TestBed.configureTestingModule({
      providers: [
        ProjectImportExportService,
        { provide: ProjectStateService, useValue: projectStateMock },
      ],
    });

    service = TestBed.inject(ProjectImportExportService);
    projectStateService = TestBed.inject(
      ProjectStateService
    ) as jest.Mocked<ProjectStateService>;

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
        elements: mockElements,
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

  describe('importProject', () => {
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
      };

      const fileContent = JSON.stringify(validArchive);
      const file = new File([fileContent], 'project.json', {
        type: 'application/json',
      });

      // Set up mock response for this test
      (file.text as jest.Mock).mockResolvedValue(fileContent);

      await service.importProject(file);

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
      expect(updatedElements).toHaveLength(validArchive.elements.length);
      expect(updatedElements[0].name).toBe(validArchive.elements[0].name);
    });

    it('should reject invalid JSON file', async () => {
      const file = new File(['invalid json'], 'project.json', {
        type: 'application/json',
      });

      (file.text as jest.Mock).mockResolvedValue('invalid json');

      await expect(service.importProject(file)).rejects.toThrow(
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

      const file = new File([JSON.stringify(invalidArchive)], 'project.json', {
        type: 'application/json',
      });

      (file.text as jest.Mock).mockResolvedValue(
        JSON.stringify(invalidArchive)
      );

      await expect(service.importProject(file)).rejects.toThrow(
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

      const file = new File([JSON.stringify(invalidArchive)], 'project.json', {
        type: 'application/json',
      });

      (file.text as jest.Mock).mockResolvedValue(
        JSON.stringify(invalidArchive)
      );

      await expect(service.importProject(file)).rejects.toThrow(
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

      const file = new File([JSON.stringify(invalidArchive)], 'project.json', {
        type: 'application/json',
      });

      (file.text as jest.Mock).mockResolvedValue(
        JSON.stringify(invalidArchive)
      );

      await expect(service.importProject(file)).rejects.toThrow(
        /invalid element/i
      );

      expect(service.isProcessing()).toBe(false);
      expect(service.error()).toBeTruthy();
    });
  });
});
