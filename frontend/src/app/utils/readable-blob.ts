/**
 * Raised when a stored Blob can no longer be read, so uploading it would send
 * an empty file.
 */
export class UnreadableBlobError extends Error {
  constructor(
    readonly expectedBytes: number,
    readonly readBytes: number | null,
    options?: ErrorOptions
  ) {
    super(
      readBytes === null
        ? `The local copy of this file (${expectedBytes} bytes) could not be read`
        : `The local copy of this file could only be partly read (${readBytes} of ${expectedBytes} bytes)`,
      options
    );
    this.name = 'UnreadableBlobError';
  }
}

/**
 * Copy a Blob's bytes into memory before it goes into a request body.
 *
 * Safari can return a Blob from IndexedDB whose backing file it can no longer
 * read. Put straight into `FormData`, that Blob is sent as a zero-byte part
 * (`Content-Length: 0`) and the server only sees "no file". Reading it here
 * either yields a Blob that really holds the file, or fails with
 * {@link UnreadableBlobError} before anything is sent.
 */
export async function toReadableBlob(blob: Blob): Promise<Blob> {
  let bytes: ArrayBuffer;
  try {
    bytes = await blob.arrayBuffer();
  } catch (error) {
    throw new UnreadableBlobError(blob.size, null, { cause: error });
  }
  if (bytes.byteLength !== blob.size) {
    throw new UnreadableBlobError(blob.size, bytes.byteLength);
  }
  return new Blob([bytes], { type: blob.type });
}
