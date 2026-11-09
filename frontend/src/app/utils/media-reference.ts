/**
 * Helpers for working with media asset references used across the app.
 *
 * Media items are referenced as `media://<filename>` strings in persisted
 * data (worldbuilding identity, cover images, element images). These helpers
 * centralise parsing so each caller doesn't re-implement the same logic.
 */

import { encodePathSegment } from './url-path';

/**
 * Extract the filename from a media reference.
 * Returns the input unchanged when it isn't a `media://` reference.
 *
 * The result is not checked: use {@link safeMediaReferenceFilename} before
 * the filename names a file on the server.
 */
export function mediaReferenceFilename(reference: string): string {
  if (!reference.startsWith('media://')) return reference;
  return reference.substring('media://'.length);
}

/**
 * Path separators (`\` too: URL parsing treats it as `/`), the query and
 * fragment delimiters, percent-escapes (the server decodes them) and control
 * characters (URL parsing drops tab and newline).
 */
const UNSAFE_MEDIA_FILENAME = /[/\\?#]|%[\da-f]{2}|\p{Cc}/iu;

/**
 * Whether `filename` names one file of a project's media: a string that is a
 * single plain path segment, never `.` or `..`. Filenames the server and this
 * app create always pass. Takes `unknown` because values read from project
 * data are not type-checked at run time.
 */
export function isSafeMediaFilename(filename: unknown): filename is string {
  return (
    typeof filename === 'string' &&
    filename !== '' &&
    filename !== '.' &&
    filename !== '..' &&
    !UNSAFE_MEDIA_FILENAME.test(filename)
  );
}

/**
 * The filename of a `media://` reference when it names a single media file
 * ({@link isSafeMediaFilename}), or null. A reference that fails resolves to
 * no image, without a request.
 */
export function safeMediaReferenceFilename(reference: unknown): string | null {
  if (typeof reference !== 'string' || !reference.startsWith('media://')) {
    return null;
  }
  const filename = reference.substring('media://'.length);
  return isSafeMediaFilename(filename) ? filename : null;
}

/** Server path of a project's media, with each segment encoded. */
export function projectMediaPath(username: string, slug: string): string {
  return `/api/v1/media/${encodePathSegment(username)}/${encodePathSegment(slug)}`;
}

/** Server path of one project media file, with each segment encoded. */
export function mediaFilePath(
  username: string,
  slug: string,
  filename: string
): string {
  return `${projectMediaPath(username, slug)}/${encodePathSegment(filename)}`;
}

/**
 * Derive the mediaId used as the IndexedDB key from a media reference.
 * This strips the `media://` prefix and any file extension, since the
 * media library keys blobs by id without the extension.
 */
export function mediaIdFromReference(reference: string): string {
  const filename = mediaReferenceFilename(reference);
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? filename.substring(0, dot) : filename;
}

/**
 * Build a `media://` reference for a selected media item.
 *
 * The reference round-trips through {@link mediaReferenceFilename} (the part
 * used to fetch from the server) and {@link mediaIdFromReference} (the part
 * used to key the IndexedDB library). To keep all three aligned we derive it
 * from the item's **mediaId** plus a file extension (from the filename or MIME
 * type) rather than its display filename, which can drift from both the
 * library key and the server file name.
 */
export function buildMediaReference(media: {
  mediaId: string;
  filename?: string;
  mimeType?: string;
}): string {
  const extension =
    media.filename?.split('.').pop() ||
    extensionFromMime(media.mimeType) ||
    'png';
  const safeExtension =
    extension.length > 1 && /^[a-z0-9]+$/i.test(extension) ? extension : 'png';
  return `media://${media.mediaId}.${safeExtension}`;
}

/** Guess a file extension from a MIME type, or '' when unknown. */
function extensionFromMime(mimeType: string | undefined): string {
  if (!mimeType) return '';
  const extensions: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
  };
  return extensions[mimeType] ?? '';
}

/** Media types for the file extensions project media is stored under. */
const EXTENSION_MEDIA_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  pdf: 'application/pdf',
  epub: 'application/epub+zip',
  zip: 'application/zip',
  html: 'text/html',
  md: 'text/markdown',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

/**
 * The media type a file name's extension stands for, or null when the name
 * has no extension or one this table doesn't know.
 */
export function mediaTypeFromFilename(name: string | undefined): string | null {
  const ext = /\.([a-z0-9]+)$/i.exec(name ?? '')?.[1].toLowerCase();
  return ext ? (EXTENSION_MEDIA_TYPES[ext] ?? null) : null;
}
