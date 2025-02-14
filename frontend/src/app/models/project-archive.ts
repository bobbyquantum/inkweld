/**
 * Represents the structure of an exported project archive
 */
export interface ProjectArchive {
  /** Schema version for handling future format changes */
  version: number;
  /** Timestamp when the archive was created */
  exportedAt: string;
  /** Project metadata */
  project: {
    title: string;
    description?: string;
    slug: string;
  };
  /** Project elements/content */
  elements: Array<{
    id?: string;
    name: string;
    type: 'FOLDER' | 'ITEM';
    position: number;
    level: number;
    version?: number;
    expandable?: boolean;
    content?: unknown;
  }>;
}

/**
 * Error types that can occur during import/export operations
 */
export enum ProjectArchiveErrorType {
  InvalidFormat = 'INVALID_FORMAT',
  VersionMismatch = 'VERSION_MISMATCH',
  DuplicateProject = 'DUPLICATE_PROJECT',
  ValidationFailed = 'VALIDATION_FAILED',
  FileSystemError = 'FILE_SYSTEM_ERROR',
}

/**
 * Represents an error that occurred during import/export operations
 */
export class ProjectArchiveError extends Error {
  constructor(
    public type: ProjectArchiveErrorType,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ProjectArchiveError';
  }
}
