import { ElementType } from '../../api-client';
import {
  ARCHIVE_VERSION,
  ArchiveElement,
  ArchiveManifest,
  ArchiveProject,
  MIN_SUPPORTED_VERSION,
  ProjectArchive,
  ProjectArchiveError,
  ProjectArchiveErrorType,
} from './project-archive';

describe('project-archive models', () => {
  describe('Constants', () => {
    it('should export ARCHIVE_VERSION', () => {
      expect(ARCHIVE_VERSION).toBe(1);
    });

    it('should export MIN_SUPPORTED_VERSION', () => {
      expect(MIN_SUPPORTED_VERSION).toBe(1);
    });
  });

  describe('ProjectArchiveErrorType enum', () => {
    it('should have InvalidFormat type', () => {
      expect(ProjectArchiveErrorType.InvalidFormat).toBe('INVALID_FORMAT');
    });

    it('should have VersionMismatch type', () => {
      expect(ProjectArchiveErrorType.VersionMismatch).toBe('VERSION_MISMATCH');
    });

    it('should have SlugTaken type', () => {
      expect(ProjectArchiveErrorType.SlugTaken).toBe('SLUG_TAKEN');
    });

    it('should have ValidationFailed type', () => {
      expect(ProjectArchiveErrorType.ValidationFailed).toBe(
        'VALIDATION_FAILED'
      );
    });

    it('should have StorageError type', () => {
      expect(ProjectArchiveErrorType.StorageError).toBe('STORAGE_ERROR');
    });

    it('should have NetworkError type', () => {
      expect(ProjectArchiveErrorType.NetworkError).toBe('NETWORK_ERROR');
    });

    it('should have SyncRequired type', () => {
      expect(ProjectArchiveErrorType.SyncRequired).toBe('SYNC_REQUIRED');
    });

    it('should have MediaDownloadFailed type', () => {
      expect(ProjectArchiveErrorType.MediaDownloadFailed).toBe(
        'MEDIA_DOWNLOAD_FAILED'
      );
    });

    it('should have MediaUploadFailed type', () => {
      expect(ProjectArchiveErrorType.MediaUploadFailed).toBe(
        'MEDIA_UPLOAD_FAILED'
      );
    });

    it('should have Cancelled type', () => {
      expect(ProjectArchiveErrorType.Cancelled).toBe('CANCELLED');
    });
  });

  describe('ProjectArchiveError', () => {
    it('should create error with type and message', () => {
      const error = new ProjectArchiveError(
        ProjectArchiveErrorType.InvalidFormat,
        'Invalid JSON format'
      );

      expect(error.type).toBe(ProjectArchiveErrorType.InvalidFormat);
      expect(error.message).toBe('Invalid JSON format');
      expect(error.name).toBe('ProjectArchiveError');
    });

    it('should create error with details', () => {
      const details = { field: 'elements', reason: 'missing required field' };
      const error = new ProjectArchiveError(
        ProjectArchiveErrorType.ValidationFailed,
        'Validation failed',
        details
      );

      expect(error.details).toEqual(details);
    });

    it('should be instanceof Error', () => {
      const error = new ProjectArchiveError(
        ProjectArchiveErrorType.StorageError,
        'Failed to write file'
      );

      expect(error).toBeInstanceOf(Error);
    });

    it('should be instanceof ProjectArchiveError', () => {
      const error = new ProjectArchiveError(
        ProjectArchiveErrorType.SlugTaken,
        'Project already exists'
      );

      expect(error).toBeInstanceOf(ProjectArchiveError);
    });

    it('should handle undefined details', () => {
      const error = new ProjectArchiveError(
        ProjectArchiveErrorType.VersionMismatch,
        'Unsupported version'
      );

      expect(error.details).toBeUndefined();
    });
  });

  describe('ArchiveManifest interface', () => {
    it('should allow creating a valid manifest object', () => {
      const manifest: ArchiveManifest = {
        version: 1,
        exportedAt: '2024-01-01T00:00:00Z',
        projectTitle: 'Test Project',
        originalSlug: 'test-project',
      };

      expect(manifest.version).toBe(1);
      expect(manifest.projectTitle).toBe('Test Project');
      expect(manifest.originalSlug).toBe('test-project');
    });

    it('should allow optional appVersion', () => {
      const manifest: ArchiveManifest = {
        version: 1,
        exportedAt: '2024-01-01T00:00:00Z',
        projectTitle: 'Test',
        originalSlug: 'test',
        appVersion: '1.0.0',
      };

      expect(manifest.appVersion).toBe('1.0.0');
    });
  });

  describe('ArchiveProject interface', () => {
    it('should allow creating a valid project object', () => {
      const project: ArchiveProject = {
        title: 'Test Project',
        slug: 'test-project',
      };

      expect(project.title).toBe('Test Project');
      expect(project.slug).toBe('test-project');
    });

    it('should allow optional description', () => {
      const project: ArchiveProject = {
        title: 'Test',
        slug: 'test',
        description: 'A test project',
      };

      expect(project.description).toBe('A test project');
    });
  });

  describe('ArchiveElement interface', () => {
    it('should allow creating a valid element', () => {
      const element: ArchiveElement = {
        id: 'elem-1',
        name: 'Chapter 1',
        type: ElementType.Folder,
        order: 0,
        level: 1,
        parentId: null,
        metadata: {},
      };

      expect(element.id).toBe('elem-1');
      expect(element.name).toBe('Chapter 1');
      expect(element.type).toBe(ElementType.Folder);
    });

    it('should allow optional expandable and version', () => {
      const element: ArchiveElement = {
        id: 'elem-2',
        name: 'Scene 1',
        type: ElementType.Item,
        order: 1,
        level: 2,
        parentId: 'elem-1',
        expandable: false,
        version: 3,
        metadata: { customKey: 'value' },
      };

      expect(element.expandable).toBe(false);
      expect(element.version).toBe(3);
      expect(element.metadata['customKey']).toBe('value');
    });
  });

  describe('ProjectArchive interface', () => {
    it('should allow creating a valid archive object', () => {
      const archive: ProjectArchive = {
        manifest: {
          version: 1,
          exportedAt: '2024-01-01T00:00:00Z',
          projectTitle: 'Test Project',
          originalSlug: 'test-project',
        },
        project: {
          title: 'Test Project',
          description: 'A test project',
          slug: 'test-project',
        },
        elements: [
          {
            id: 'elem-1',
            name: 'Chapter 1',
            type: ElementType.Folder,
            order: 0,
            level: 1,
            parentId: null,
            expandable: true,
            metadata: {},
          },
        ],
        documents: [],
        worldbuilding: [],
        schemas: [],
        relationships: [],
        customRelationshipTypes: [],
        publishPlans: [],
        media: [],
      };

      expect(archive.manifest.version).toBe(1);
      expect(archive.project.title).toBe('Test Project');
      expect(archive.elements).toHaveLength(1);
    });

    it('should allow empty arrays for optional collections', () => {
      const archive: ProjectArchive = {
        manifest: {
          version: 1,
          exportedAt: '2024-01-01T00:00:00Z',
          projectTitle: 'Minimal Project',
          originalSlug: 'minimal',
        },
        project: {
          title: 'Minimal',
          slug: 'minimal',
        },
        elements: [],
        documents: [],
        worldbuilding: [],
        schemas: [],
        relationships: [],
        customRelationshipTypes: [],
        publishPlans: [],
        media: [],
      };

      expect(archive.elements).toHaveLength(0);
      expect(archive.documents).toHaveLength(0);
      expect(archive.worldbuilding).toHaveLength(0);
      expect(archive.schemas).toHaveLength(0);
      expect(archive.relationships).toHaveLength(0);
      expect(archive.media).toHaveLength(0);
    });
  });
});
