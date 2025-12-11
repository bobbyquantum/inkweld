import { ElementType } from '../../api-client';
import {
  ElementRelationship,
  RelationshipTypeDefinition,
} from '../components/element-ref/element-ref.model';
import { PublishPlan } from './publish-plan';
import { ElementTypeSchema } from './schema-types';

/**
 * Current archive format version.
 * Increment when making breaking changes to the archive structure.
 */
export const ARCHIVE_VERSION = 1;

/**
 * Minimum supported archive version for import.
 */
export const MIN_SUPPORTED_VERSION = 1;

// ─────────────────────────────────────────────────────────────────────────────
// Archive Structure
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Top-level manifest for a project archive.
 * Contains metadata about the archive itself.
 */
export interface ArchiveManifest {
  /** Archive format version */
  version: number;
  /** ISO timestamp when the archive was created */
  exportedAt: string;
  /** Inkweld version that created this archive (for debugging) */
  appVersion?: string;
  /** Project title (for display without parsing project.json) */
  projectTitle: string;
  /** Original project slug (may differ from imported slug) */
  originalSlug: string;
  /** Checksums for validation */
  checksums?: {
    project?: string;
    elements?: string;
    media?: string;
  };
}

/**
 * Project metadata stored in the archive.
 */
export interface ArchiveProject {
  /** Project title */
  title: string;
  /** Project description */
  description?: string;
  /** Original slug (user may choose different on import) */
  slug: string;
  /** Whether project has a cover image (stored in media/) */
  hasCover?: boolean;
}

/**
 * An element in the project tree.
 */
export interface ArchiveElement {
  /** Element ID (new IDs generated on import) */
  id: string;
  /** Display name */
  name: string;
  /** Element type */
  type: ElementType;
  /** Sort order within parent */
  order: number;
  /** Nesting level (0 = root) */
  level: number;
  /** Parent element ID (null for root elements) */
  parentId: string | null;
  /** Whether this element can contain children */
  expandable?: boolean;
  /** Element version (for optimistic locking) */
  version?: number;
  /** Additional metadata (e.g., schemaType for worldbuilding) */
  metadata: Record<string, string>;
}

/**
 * Document content for an ITEM element.
 * Stored as ProseMirror JSON.
 */
export interface ArchiveDocumentContent {
  /** Element ID this content belongs to */
  elementId: string;
  /** ProseMirror JSON content */
  content: unknown;
}

/**
 * Worldbuilding data for a worldbuilding element.
 * Stored as plain JSON (flattened from Yjs Y.Map).
 */
export interface ArchiveWorldbuildingData {
  /** Element ID this data belongs to */
  elementId: string;
  /** Schema type (e.g., 'CHARACTER', 'LOCATION') */
  schemaType: string;
  /** Flattened data from Y.Map */
  data: Record<string, unknown>;
}

/**
 * Media file reference in the archive.
 */
export interface ArchiveMediaFile {
  /** Media ID (e.g., 'cover', 'img-abc123') */
  mediaId: string;
  /** MIME type */
  mimeType: string;
  /** File size in bytes */
  size: number;
  /** Original filename if known */
  filename?: string;
  /** Path within the archive (e.g., 'media/cover.jpg') */
  archivePath: string;
}

/**
 * Complete project archive structure.
 * This is what gets serialized to JSON files within the ZIP.
 */
export interface ProjectArchive {
  /** Archive manifest */
  manifest: ArchiveManifest;
  /** Project metadata */
  project: ArchiveProject;
  /** Project elements tree */
  elements: ArchiveElement[];
  /** Document content for ITEM elements */
  documents: ArchiveDocumentContent[];
  /** Worldbuilding data for WB elements */
  worldbuilding: ArchiveWorldbuildingData[];
  /** Worldbuilding schemas/templates */
  schemas: ElementTypeSchema[];
  /** Element relationships */
  relationships: ElementRelationship[];
  /** Custom relationship types */
  customRelationshipTypes: RelationshipTypeDefinition[];
  /** Publish plans */
  publishPlans: PublishPlan[];
  /** Media file manifest */
  media: ArchiveMediaFile[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Export/Import Progress & State
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Progress phases for export operation.
 */
export enum ExportPhase {
  Initializing = 'initializing',
  SyncingDocuments = 'syncing-documents',
  DownloadingMedia = 'downloading-media',
  PackagingElements = 'packaging-elements',
  PackagingDocuments = 'packaging-documents',
  PackagingWorldbuilding = 'packaging-worldbuilding',
  PackagingMedia = 'packaging-media',
  CreatingArchive = 'creating-archive',
  Complete = 'complete',
}

/**
 * Progress phases for import operation.
 */
export enum ImportPhase {
  Initializing = 'initializing',
  LoadingArchive = 'loading-archive',
  ValidatingArchive = 'validating-archive',
  CheckingSlug = 'checking-slug',
  CreatingProject = 'creating-project',
  ImportingElements = 'importing-elements',
  ImportingDocuments = 'importing-documents',
  ImportingWorldbuilding = 'importing-worldbuilding',
  ImportingSchemas = 'importing-schemas',
  ImportingRelationships = 'importing-relationships',
  ImportingData = 'importing-data',
  ImportingMedia = 'importing-media',
  UploadingMedia = 'uploading-media',
  Finalizing = 'finalizing',
  Complete = 'complete',
}

/**
 * Progress update during export/import operations.
 */
export interface ArchiveProgress {
  /** Current phase */
  phase: ExportPhase | ImportPhase;
  /** Overall progress (0-100) */
  progress: number;
  /** Human-readable message */
  message: string;
  /** Detailed sub-message */
  detail?: string;
  /** Current item index */
  currentItem?: number;
  /** Total items in current phase */
  totalItems?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Error types that can occur during import/export operations.
 */
export enum ProjectArchiveErrorType {
  /** Archive format is invalid or corrupted */
  InvalidFormat = 'INVALID_FORMAT',
  /** Archive is corrupted (missing or invalid files) */
  CorruptedArchive = 'CORRUPTED_ARCHIVE',
  /** Archive version is not supported */
  VersionMismatch = 'VERSION_MISMATCH',
  /** Archive version is newer than we support */
  UnsupportedVersion = 'UNSUPPORTED_VERSION',
  /** Slug already exists (user needs to choose another) */
  SlugTaken = 'SLUG_TAKEN',
  /** Validation failed */
  ValidationFailed = 'VALIDATION_FAILED',
  /** File system or IndexedDB error */
  StorageError = 'STORAGE_ERROR',
  /** Network error (e.g., failed to upload media) */
  NetworkError = 'NETWORK_ERROR',
  /** Documents not synced (export in server mode) */
  SyncRequired = 'SYNC_REQUIRED',
  /** Media download failed */
  MediaDownloadFailed = 'MEDIA_DOWNLOAD_FAILED',
  /** Media upload failed */
  MediaUploadFailed = 'MEDIA_UPLOAD_FAILED',
  /** User cancelled operation */
  Cancelled = 'CANCELLED',
}

/**
 * Error that occurred during import/export operations.
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

// ─────────────────────────────────────────────────────────────────────────────
// Import Options
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Options for importing a project archive.
 */
export interface ImportOptions {
  /** Slug to use for the imported project */
  slug: string;
  /** Title override (defaults to archive's title) */
  title?: string;
  /** Whether to import in offline mode (no server sync) */
  offlineMode: boolean;
}

/**
 * Result of slug availability check.
 */
export interface SlugCheckResult {
  /** The slug that was checked */
  slug: string;
  /** Whether the slug is available */
  available: boolean;
  /** Suggested alternative if not available */
  suggestion?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates that an object is a valid ArchiveManifest.
 */
export function isValidManifest(obj: unknown): obj is ArchiveManifest {
  if (!obj || typeof obj !== 'object') return false;
  const m = obj as Partial<ArchiveManifest>;
  return (
    typeof m.version === 'number' &&
    typeof m.exportedAt === 'string' &&
    typeof m.projectTitle === 'string' &&
    typeof m.originalSlug === 'string'
  );
}

/**
 * Validates that an object is a valid ArchiveProject.
 */
export function isValidProject(obj: unknown): obj is ArchiveProject {
  if (!obj || typeof obj !== 'object') return false;
  const p = obj as Partial<ArchiveProject>;
  return (
    typeof p.title === 'string' &&
    typeof p.slug === 'string' &&
    (p.description === undefined || typeof p.description === 'string')
  );
}

/**
 * Validates that an object is a valid ArchiveElement.
 */
export function isValidElement(obj: unknown): obj is ArchiveElement {
  if (!obj || typeof obj !== 'object') return false;
  const e = obj as Partial<ArchiveElement>;
  return (
    typeof e.id === 'string' &&
    typeof e.name === 'string' &&
    typeof e.type === 'string' &&
    typeof e.order === 'number' &&
    typeof e.level === 'number' &&
    (e.parentId === null || typeof e.parentId === 'string') &&
    (e.metadata === undefined ||
      (typeof e.metadata === 'object' && e.metadata !== null))
  );
}
