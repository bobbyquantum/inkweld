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
