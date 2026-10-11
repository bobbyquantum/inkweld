import { describe, expect, it } from 'vitest';

import { toReadableBlob, UnreadableBlobError } from './readable-blob';

describe('toReadableBlob', () => {
  it('returns an in-memory copy with the same bytes and type', async () => {
    const source = new Blob(['hello world'], { type: 'image/png' });

    const copy = await toReadableBlob(source);

    expect(copy).not.toBe(source);
    expect(copy.type).toBe('image/png');
    expect(copy.size).toBe(source.size);
    expect(await copy.text()).toBe('hello world');
  });

  it('throws UnreadableBlobError when the blob cannot be read', async () => {
    const cause = new DOMException(
      'The I/O read operation failed.',
      'NotReadableError'
    );
    const broken = new Blob(['12345']);
    broken.arrayBuffer = () => Promise.reject(cause);

    const error = await toReadableBlob(broken).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UnreadableBlobError);
    expect((error as UnreadableBlobError).expectedBytes).toBe(5);
    expect((error as UnreadableBlobError).readBytes).toBeNull();
    expect((error as UnreadableBlobError).cause).toBe(cause);
  });

  it('throws UnreadableBlobError when fewer bytes come back than the blob reports', async () => {
    const truncated = new Blob(['12345']);
    truncated.arrayBuffer = () => Promise.resolve(new ArrayBuffer(0));

    const error = await toReadableBlob(truncated).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UnreadableBlobError);
    expect((error as UnreadableBlobError).readBytes).toBe(0);
    expect((error as UnreadableBlobError).message).toContain('0 of 5 bytes');
  });

  it('accepts an empty blob', async () => {
    const copy = await toReadableBlob(new Blob([], { type: 'text/plain' }));

    expect(copy.size).toBe(0);
    expect(copy.type).toBe('text/plain');
  });
});
