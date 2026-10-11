/**
 * Upload limits and filename sanitising shared by the upload routes.
 *
 * Every multipart handler used to call `c.req.parseBody()` with no size cap,
 * which buffers the whole request before any check runs (and the media route
 * then copied it again). Hono's `bodyLimit` middleware rejects an oversized
 * request with 413 before the body is read; the constants below feed it. The
 * small allowance on top of each cap covers multipart framing.
 *
 * Media filenames are client-controlled and were written into the storage
 * path verbatim, so `sub/dir/name.png` created nested keys inside the project
 * (arbitrary depth on R2, ENOENT locally). `sanitizeUploadFilename` keeps the
 * final path segment and strips anything that is not a plain filename
 * character.
 */

import type { Context, MiddlewareHandler } from 'hono';
import { BadRequestError } from '../errors';
import { logger } from '../services/logger.service';

/** Project media: images, audio, video, PDF/EPUB. */
export const MAX_MEDIA_UPLOAD_BYTES = 100 * 1024 * 1024;
/** Avatars and project covers; imageService.validateImage re-checks at 10 MB after decode. */
export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
/** Published output (PDF/EPUB/HTML bundles). */
export const MAX_PUBLISHED_FILE_UPLOAD_BYTES = 100 * 1024 * 1024;
/** Multipart headroom added to every bodyLimit so the cap applies to the file, not the framing. */
export const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

const MAX_FILENAME_LENGTH = 200;

/**
 * Reject an upload whose body is empty with a message that says so.
 *
 * Safari has sent uploads with a multipart `Content-Type` but a zero-byte body
 * (`Content-Length: 0`) when it could not read the Blob it was given. The
 * route's OpenAPI validator then answered with a multipart parse error, which
 * looked like a bug in the request rather than a file the browser never sent.
 * Mount this ahead of the validator, next to `bodyLimit`.
 */
export const rejectEmptyUpload: MiddlewareHandler = async (c, next) => {
  const contentLength = c.req.header('content-length');
  // Only uploads: these paths also serve GET and DELETE, which have no body.
  if ((c.req.method === 'POST' || c.req.method === 'PUT') && contentLength === '0') {
    logEmptyUpload(c, 'request body was empty', contentLength);
    throw new BadRequestError(
      'The upload arrived empty: no file data reached the server. The browser may not have been able to read the file; add it again and retry.'
    );
  }
  await next();
};

/**
 * Return the uploaded file, or throw a 400 that says why there is none. A
 * zero-byte file gets its own message for the same reason as
 * {@link rejectEmptyUpload}.
 */
export function requireUploadedFile(
  c: Context,
  value: unknown,
  missingMessage = 'No file provided'
): File {
  if (!(value instanceof File)) {
    throw new BadRequestError(missingMessage);
  }
  if (value.size === 0) {
    logEmptyUpload(c, 'uploaded file was 0 bytes', c.req.header('content-length'));
    throw new BadRequestError(
      'The uploaded file is empty (0 bytes). The browser may not have been able to read the file; add it again and retry.'
    );
  }
  return value;
}

function logEmptyUpload(c: Context, reason: string, contentLength: string | undefined): void {
  logger.warn('Upload', `Rejected upload: ${reason}`, {
    path: c.req.path,
    contentLength: contentLength ?? null,
    userAgent: c.req.header('user-agent') ?? null,
  });
}

/**
 * Reduce a client-supplied filename to a single safe path segment, or return
 * null when nothing usable remains (empty, `.`/`..`, only separators).
 */
export function sanitizeUploadFilename(raw: string): string | null {
  // Keep only the last path segment, whichever separator the client used.
  const segment = raw.split(/[\\/]/).pop() ?? '';
  // Drop control characters and anything outside a conservative allow-list;
  // spaces are kept, since they are common in user filenames.
  let name = segment
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[^\w.\- ()[\]]/g, '_')
    .trim();
  // A leading dot would make a hidden file; collapse runs of dots so `..` can
  // never survive.
  name = name.replace(/\.{2,}/g, '.').replace(/^\.+/, '');
  if (name.length > MAX_FILENAME_LENGTH) {
    const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
    name = name.slice(0, MAX_FILENAME_LENGTH - ext.length) + ext;
  }
  if (!name || name === '.' || name === '..') return null;
  return name;
}
