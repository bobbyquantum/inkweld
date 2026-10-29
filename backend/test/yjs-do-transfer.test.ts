import { describe, expect, it } from 'bun:test';
import type { DoStorage } from '../src/durable-objects/yjs-do-storage';
import {
  RENAME_LOCK_KEY,
  decodeTransferRows,
  encodeTransferPage,
  isRenameLockActive,
  readTransferPage,
  rekeyDocumentRow,
  writeTransferPage,
} from '../src/durable-objects/yjs-do-transfer';

/** In-memory Durable Object storage with the real `list` ordering and paging. */
function memoryStorage(entries: Record<string, unknown> = {}): DoStorage & {
  data: Map<string, unknown>;
} {
  const data = new Map<string, unknown>(Object.entries(entries));
  return {
    data,
    async get<T>(key: string) {
      return data.get(key) as T | undefined;
    },
    async list<T>(opts: { prefix: string; limit?: number; startAfter?: string }) {
      const keys = [...data.keys()]
        .filter((k) => k.startsWith(opts.prefix) && (!opts.startAfter || k > opts.startAfter))
        .sort()
        .slice(0, opts.limit ?? Infinity);
      return new Map(keys.map((k) => [k, data.get(k) as T]));
    },
    async put<T>(key: string, value: T) {
      data.set(key, value);
    },
    async delete(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) data.delete(key);
    },
  };
}

const bytes = (...values: number[]) => new Uint8Array(values);

/** Read every page from `storage`, as the Worker does. */
async function readAll(storage: DoStorage, limits: { rows?: number; bytes?: number }) {
  const pages = [];
  let cursor: string | null = null;
  do {
    const page = await readTransferPage(storage, cursor, limits);
    pages.push(page);
    cursor = page.next;
  } while (cursor);
  return pages;
}

describe('readTransferPage', () => {
  it('pages every document row in key order and leaves other keys out', async () => {
    const storage = memoryStorage({
      'doc:alice:old:a:snapshot': bytes(1),
      'doc:alice:old:a:update:1:00000000:x': bytes(2),
      'doc:alice:old:b:revision': bytes(3),
      'doc:alice:old:elements:snapshot': [4, 5], // legacy number[] row
      'doc:alice:old:elements/:update:1:00000001:y': bytes(6), // trailing-slash ghost row
      [RENAME_LOCK_KEY]: 123,
    });

    const pages = await readAll(storage, { rows: 2 });

    expect(pages.map((p) => p.rows.length)).toEqual([2, 2, 1]);
    const rows = pages.flatMap((p) => p.rows);
    expect(rows.map((r) => r.key)).toEqual([
      'doc:alice:old:a:snapshot',
      'doc:alice:old:a:update:1:00000000:x',
      'doc:alice:old:b:revision',
      'doc:alice:old:elements/:update:1:00000001:y',
      'doc:alice:old:elements:snapshot',
    ]);
    expect(rows.at(-1)?.value).toEqual(bytes(4, 5));
    expect(pages.at(-1)?.next).toBeNull();
  });

  it('ends a page early once it carries the byte budget, but always takes one row', async () => {
    const storage = memoryStorage({
      'doc:p:x:a': new Uint8Array(10),
      'doc:p:x:b': new Uint8Array(10),
      'doc:p:x:c': new Uint8Array(10),
    });

    const pages = await readAll(storage, { rows: 10, bytes: 5 });

    expect(pages.map((p) => p.rows.map((r) => r.key))).toEqual([
      ['doc:p:x:a'],
      ['doc:p:x:b'],
      ['doc:p:x:c'],
    ]);
  });

  it('returns a single empty last page for an empty object', async () => {
    const page = await readTransferPage(memoryStorage(), null);
    expect(page).toEqual({ rows: [], next: null });
  });
});

describe('transfer page encoding', () => {
  it('round-trips keys and bytes', () => {
    const rows = [
      { key: 'doc:alice:old:a:snapshot', value: bytes(0, 255, 7) },
      { key: 'doc:alice:old:ü:update', value: new Uint8Array(0) },
    ];
    expect(decodeTransferRows(encodeTransferPage({ rows, next: 'x' }))).toEqual(rows);
  });

  it('rejects an unknown version and trailing bytes', () => {
    expect(() => decodeTransferRows(bytes(9, 0))).toThrow('Unsupported transfer format 9');
    const encoded = encodeTransferPage({ rows: [], next: null });
    expect(() => decodeTransferRows(new Uint8Array([...encoded, 1]))).toThrow('Trailing bytes');
  });
});

describe('rekeyDocumentRow', () => {
  it("moves a row from one project's prefix to another's", () => {
    expect(rekeyDocumentRow('doc:alice:old:el:snapshot', 'alice:old', 'alice:new')).toBe(
      'doc:alice:new:el:snapshot'
    );
    expect(rekeyDocumentRow('doc:alice:old:el/:update:1', 'alice:old', 'alice:new')).toBe(
      'doc:alice:new:el/:update:1'
    );
  });

  it('refuses rows of another project, including one whose slug merely starts the same', () => {
    expect(rekeyDocumentRow('doc:alice:old-two:el:snapshot', 'alice:old', 'alice:new')).toBeNull();
    expect(rekeyDocumentRow('doc:bob:old:el:snapshot', 'alice:old', 'alice:new')).toBeNull();
    expect(rekeyDocumentRow(RENAME_LOCK_KEY, 'alice:old', 'alice:new')).toBeNull();
  });
});

describe('writeTransferPage', () => {
  it('writes rows under the new project and skips foreign rows', async () => {
    const storage = memoryStorage();

    const result = await writeTransferPage(
      storage,
      [
        { key: 'doc:alice:old:a:snapshot', value: bytes(1) },
        { key: 'doc:bob:old:a:snapshot', value: bytes(2) },
      ],
      'alice:old',
      'alice:new'
    );

    expect(result).toEqual({ written: 1, skipped: 1 });
    expect([...storage.data.entries()]).toEqual([['doc:alice:new:a:snapshot', bytes(1)]]);
  });
});

describe('isRenameLockActive', () => {
  it('holds only for a numeric expiry in the future', () => {
    expect(isRenameLockActive(2000, 1000)).toBe(true);
    expect(isRenameLockActive(1000, 1000)).toBe(false);
    expect(isRenameLockActive(undefined, 1000)).toBe(false);
    expect(isRenameLockActive('2000', 1000)).toBe(false);
  });
});
