/**
 * Helpers for working with media asset references used across the app.
 *
 * Media items are referenced as `media://<filename>` strings in persisted
 * data (worldbuilding identity, cover images, element images). These helpers
 * centralise parsing so each caller doesn't re-implement the same logic.
 */

/**
 * Extract the filename from a media reference.
 * Returns the input unchanged when it isn't a `media://` reference.
 */
export function mediaReferenceFilename(reference: string): string {
  if (!reference.startsWith('media://')) return reference;
  return reference.substring('media://'.length);
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
