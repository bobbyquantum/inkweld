import { type ArchiveMediaFile } from '@models/project-archive';
import { detectImageType } from '@services/publish/epub-utils';

const OCTET_STREAM = 'application/octet-stream';

/** Media types for the extensions export gives archive files. */
const EXTENSION_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
};

/**
 * The media type to store an archive file under. JSZip returns untyped
 * blobs, so the type comes from the archive's media index. When the index
 * has none (or only `application/octet-stream`, which archives re-exported
 * after an earlier import carry), the bytes are sniffed, then the file
 * extension is tried.
 */
export async function resolveMediaType(
  media: Pick<ArchiveMediaFile, 'mimeType' | 'archivePath' | 'filename'>,
  blob: Blob
): Promise<string> {
  const recorded = normalizeType(media.mimeType);
  if (recorded && recorded !== OCTET_STREAM) return recorded;

  const sniffed = (await detectImageType(blob)) ?? (await sniffPdf(blob));
  if (sniffed) return sniffed;

  return (
    typeFromExtension(media.archivePath) ??
    typeFromExtension(media.filename) ??
    OCTET_STREAM
  );
}

/**
 * How recent a cover media id is: the timestamp of `cover-<ms>`, or 0 for
 * an untimestamped cover (`cover`, or a named one such as a template's).
 * `null` when the id is not a cover.
 */
export function coverTimestamp(mediaId: string): number | null {
  if (mediaId === 'cover') return 0;
  if (!mediaId.startsWith('cover-')) return null;
  const stamp = Number(mediaId.slice('cover-'.length));
  return Number.isSafeInteger(stamp) && stamp > 0 ? stamp : 0;
}

function normalizeType(type: string | undefined): string | null {
  const normalized = type?.split(';')[0].trim().toLowerCase();
  if (!normalized) return null;
  return normalized === 'image/jpg' ? 'image/jpeg' : normalized;
}

async function sniffPdf(blob: Blob): Promise<string | null> {
  try {
    const head = await blob.slice(0, 5).text();
    return head === '%PDF-' ? 'application/pdf' : null;
  } catch {
    return null;
  }
}

function typeFromExtension(name: string | undefined): string | null {
  const ext = /\.([a-z0-9]+)$/i.exec(name ?? '')?.[1].toLowerCase();
  return ext ? (EXTENSION_TYPES[ext] ?? null) : null;
}
