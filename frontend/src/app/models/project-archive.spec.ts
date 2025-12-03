import { ElementType } from '../../api-client';
import {
  ProjectArchive,
  ProjectArchiveError,
  ProjectArchiveErrorType,
} from './project-archive';

describe('project-archive models', () => {
  describe('ProjectArchiveErrorType enum', () => {
    it('should have InvalidFormat type', () => {
      expect(ProjectArchiveErrorType.InvalidFormat).toBe('INVALID_FORMAT');
    });

    it('should have VersionMismatch type', () => {
      expect(ProjectArchiveErrorType.VersionMismatch).toBe('VERSION_MISMATCH');
    });

    it('should have DuplicateProject type', () => {
      expect(ProjectArchiveErrorType.DuplicateProject).toBe(
        'DUPLICATE_PROJECT'
      );
    });

    it('should have ValidationFailed type', () => {
      expect(ProjectArchiveErrorType.ValidationFailed).toBe(
        'VALIDATION_FAILED'
      );
    });

    it('should have FileSystemError type', () => {
      expect(ProjectArchiveErrorType.FileSystemError).toBe('FILE_SYSTEM_ERROR');
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
        ProjectArchiveErrorType.FileSystemError,
        'Failed to write file'
      );

      expect(error).toBeInstanceOf(Error);
    });

    it('should be instanceof ProjectArchiveError', () => {
      const error = new ProjectArchiveError(
        ProjectArchiveErrorType.DuplicateProject,
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

  describe('ProjectArchive interface', () => {
    it('should allow creating a valid archive object', () => {
      const archive: ProjectArchive = {
        version: 1,
        exportedAt: '2024-01-01T00:00:00Z',
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
            version: 1,
            expandable: true,
            metadata: { customKey: 'customValue' },
          },
        ],
      };

      expect(archive.version).toBe(1);
      expect(archive.project.title).toBe('Test Project');
      expect(archive.elements).toHaveLength(1);
    });

    it('should allow optional description in project', () => {
      const archive: ProjectArchive = {
        version: 1,
        exportedAt: '2024-01-01T00:00:00Z',
        project: {
          title: 'Test',
          slug: 'test',
        },
        elements: [],
      };

      expect(archive.project.description).toBeUndefined();
    });

    it('should allow optional fields in elements', () => {
      const archive: ProjectArchive = {
        version: 1,
        exportedAt: '2024-01-01T00:00:00Z',
        project: {
          title: 'Test',
          slug: 'test',
        },
        elements: [
          {
            name: 'Minimal Element',
            type: ElementType.Item,
            order: 0,
            level: 0,
            metadata: {},
          },
        ],
      };

      expect(archive.elements[0].id).toBeUndefined();
      expect(archive.elements[0].version).toBeUndefined();
      expect(archive.elements[0].expandable).toBeUndefined();
      expect(archive.elements[0].content).toBeUndefined();
    });
  });
});
