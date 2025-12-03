/**
 * Published Files Models
 *
 * Defines the structure for persisted published outputs (EPUB, PDF, HTML, Markdown).
 * Published files can be:
 * - Stored offline (IndexedDB) for local access
 * - Stored online (backend) for sharing and persistence
 * - Shared with different permission levels
 */

import { PublishFormat } from './publish-plan';

/**
 * Sharing permission levels for published files
 */
export enum SharePermission {
  /** Only the owner can access */
  Private = 'private',
  /** Project collaborators can access (future feature) */
  Collaborators = 'collaborators',
  /** Anyone with the share link can access */
  Link = 'link',
  /** Publicly discoverable */
  Public = 'public',
}

/**
 * Metadata for a published file
 */
export interface PublishedFile {
  /** Unique identifier */
  id: string;

  /** Project this file belongs to */
  projectId: string;

  /** Original filename */
  filename: string;

  /** File format */
  format: PublishFormat;

  /** MIME type */
  mimeType: string;

  /** File size in bytes */
  size: number;

  /** Name of the publish plan used */
  planName: string;

  /** Sharing permission level */
  sharePermission: SharePermission;

  /** Share token for link-based sharing (generated when permission >= Link) */
  shareToken?: string;

  /** Creation timestamp */
  createdAt: string;

  /** Last modified timestamp */
  updatedAt: string;

  /** Publishing metadata snapshot */
  metadata: PublishedFileMetadata;
}

/**
 * Snapshot of metadata at time of publishing
 */
export interface PublishedFileMetadata {
  title: string;
  author: string;
  subtitle?: string;
  language?: string;
  /** Number of content items (chapters/sections) included */
  itemCount: number;
  /** Word count if available */
  wordCount?: number;
}

/**
 * Request to create a new published file
 */
export interface CreatePublishedFileRequest {
  filename: string;
  format: PublishFormat;
  mimeType: string;
  planName: string;
  sharePermission?: SharePermission;
  metadata: PublishedFileMetadata;
}

/**
 * Request to update published file sharing settings
 */
export interface UpdatePublishedFileRequest {
  sharePermission?: SharePermission;
  filename?: string;
}

/**
 * Response for share link generation
 */
export interface ShareLinkResponse {
  shareToken: string;
  shareUrl: string;
  expiresAt?: string;
}

/**
 * Offline storage record for published files
 * Extends PublishedFile with the actual blob data
 */
export interface OfflinePublishedFile extends PublishedFile {
  /** The actual file blob */
  blob: Blob;

  /** Whether this has been synced to the server */
  synced: boolean;

  /** Pending sync action if any */
  pendingAction?: 'create' | 'update' | 'delete';
}

/**
 * Get MIME type for a publish format
 */
export function getMimeTypeForFormat(format: PublishFormat): string {
  switch (format) {
    case PublishFormat.EPUB:
      return 'application/epub+zip';
    case PublishFormat.PDF_SIMPLE:
      return 'application/pdf';
    case PublishFormat.HTML:
      return 'text/html';
    case PublishFormat.MARKDOWN:
      return 'text/markdown';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Get file extension for a publish format
 */
export function getExtensionForFormat(format: PublishFormat): string {
  switch (format) {
    case PublishFormat.EPUB:
      return '.epub';
    case PublishFormat.PDF_SIMPLE:
      return '.pdf';
    case PublishFormat.HTML:
      return '.html';
    case PublishFormat.MARKDOWN:
      return '.md';
    default:
      return '';
  }
}

/**
 * Generate a display-friendly format name
 */
export function getFormatDisplayName(format: PublishFormat): string {
  switch (format) {
    case PublishFormat.EPUB:
      return 'EPUB';
    case PublishFormat.PDF_SIMPLE:
      return 'PDF';
    case PublishFormat.HTML:
      return 'HTML';
    case PublishFormat.MARKDOWN:
      return 'Markdown';
    default:
      return format;
  }
}

/**
 * Get icon name for a publish format
 */
export function getFormatIcon(format: PublishFormat): string {
  switch (format) {
    case PublishFormat.EPUB:
      return 'book';
    case PublishFormat.PDF_SIMPLE:
      return 'picture_as_pdf';
    case PublishFormat.HTML:
      return 'code';
    case PublishFormat.MARKDOWN:
      return 'description';
    default:
      return 'insert_drive_file';
  }
}
