/**
 * Copying a project's Durable Object storage to another Durable Object, used
 * when a project is renamed on Cloudflare Workers.
 *
 * The Durable Object is named `username:slug`, and every row it stores is
 * keyed by the document id (`doc:username:slug:<docId>:…`), so a renamed
 * project needs both a new object and new keys. The Worker pages the rows out
 * of the old object (`readTransferPage`) and into the new one
 * (`writeTransferPage`), which rewrites each key's project prefix. Rows are
 * copied byte for byte: snapshots, update frames and revision markers keep
 * their stored format, so nothing is decoded or merged on the way.
 *
 * Pure (no `cloudflare:workers` import) so it runs under Bun's test runner.
 */

import {
  createEncoder,
  toUint8Array,
  writeVarString,
  writeVarUint,
  writeVarUint8Array,
} from 'lib0/encoding';
import { createDecoder, readVarString, readVarUint, readVarUint8Array } from 'lib0/decoding';
import { type DoStorage, type StoredBytes, toBytes } from './yjs-do-storage';

/** Every document row starts with this prefix; nothing else is copied. */
export const DOCUMENT_ROW_PREFIX = 'doc:';

/**
 * Storage key holding the rename lock's expiry (epoch ms). Outside the
 * `doc:` namespace, so it is never copied to the new object.
 */
export const RENAME_LOCK_KEY = 'rename:lock';

/**
 * How long a rename lock holds. A rename that dies half-way (Worker killed,
 * deploy) must not leave the project unusable, so the lock lapses on its own.
 */
export const RENAME_LOCK_TTL_MS = 5 * 60 * 1000;

/**
 * Rows read per `list` call. Each value can be up to ~2 MB (a snapshot), so
 * this also bounds the memory one page can take.
 */
export const TRANSFER_PAGE_ROWS = 128;

/**
 * Bytes of values carried per page. A page stops early once it reaches this,
 * but always carries at least one row.
 */
export const TRANSFER_PAGE_BYTES = 8 * 1024 * 1024;

/** Wire format version, so a mismatched pair of builds fails loudly. */
const TRANSFER_FORMAT_VERSION = 1;

export interface TransferRow {
  key: string;
  value: Uint8Array;
}

export interface TransferPage {
  rows: TransferRow[];
  /** Key to resume after, or null when this was the last page. */
  next: string | null;
}

/**
 * Read one page of document rows in key order, starting after `startAfter`.
 */
export async function readTransferPage(
  storage: DoStorage,
  startAfter: string | null,
  limits: { rows?: number; bytes?: number } = {}
): Promise<TransferPage> {
  const maxRows = limits.rows ?? TRANSFER_PAGE_ROWS;
  const maxBytes = limits.bytes ?? TRANSFER_PAGE_BYTES;
  const listed = await storage.list<StoredBytes>({
    prefix: DOCUMENT_ROW_PREFIX,
    limit: maxRows,
    ...(startAfter ? { startAfter } : {}),
  });

  const rows: TransferRow[] = [];
  let bytes = 0;
  for (const [key, stored] of listed) {
    if (rows.length > 0 && bytes >= maxBytes) {
      return { rows, next: rows.at(-1)?.key ?? null };
    }
    const value = toBytes(stored);
    rows.push({ key, value });
    bytes += value.byteLength;
  }
  const full = listed.size >= maxRows;
  return { rows, next: full ? (rows.at(-1)?.key ?? null) : null };
}

/** Serialize a page for the trip through the Worker. */
export function encodeTransferPage(page: TransferPage): Uint8Array {
  const encoder = createEncoder();
  writeVarUint(encoder, TRANSFER_FORMAT_VERSION);
  writeVarUint(encoder, page.rows.length);
  for (const row of page.rows) {
    writeVarString(encoder, row.key);
    writeVarUint8Array(encoder, row.value);
  }
  return toUint8Array(encoder);
}

/** Parse a page written by {@link encodeTransferPage}. Throws on a bad payload. */
export function decodeTransferRows(bytes: Uint8Array): TransferRow[] {
  const decoder = createDecoder(bytes);
  const version = readVarUint(decoder);
  if (version !== TRANSFER_FORMAT_VERSION) {
    throw new Error(`Unsupported transfer format ${version}`);
  }
  const count = readVarUint(decoder);
  const rows: TransferRow[] = [];
  for (let i = 0; i < count; i++) {
    rows.push({ key: readVarString(decoder), value: readVarUint8Array(decoder) });
  }
  if (decoder.pos !== bytes.byteLength) {
    throw new Error('Trailing bytes after transfer page');
  }
  return rows;
}

/**
 * Rewrite a document row key from one project id (`username:slug`) to
 * another, or return null for a key outside `from`'s documents.
 *
 * `doc:alice:old:elements:snapshot` → `doc:alice:new:elements:snapshot`. The
 * trailing-slash ghost rows (`doc:alice:old:elements/:…`) move the same way.
 */
export function rekeyDocumentRow(key: string, from: string, to: string): string | null {
  const fromPrefix = `${DOCUMENT_ROW_PREFIX}${from}:`;
  if (!key.startsWith(fromPrefix)) return null;
  return `${DOCUMENT_ROW_PREFIX}${to}:${key.slice(fromPrefix.length)}`;
}

/**
 * Write a page of rows into `storage`, moving each key from project `from`
 * to project `to`. Rows of any other project are skipped rather than written
 * under a key nothing would ever read.
 */
export async function writeTransferPage(
  storage: DoStorage,
  rows: TransferRow[],
  from: string,
  to: string
): Promise<{ written: number; skipped: number }> {
  const writes: Array<{ key: string; value: Uint8Array }> = [];
  for (const row of rows) {
    const key = rekeyDocumentRow(row.key, from, to);
    if (key) writes.push({ key, value: row.value });
  }
  // One page is bounded (TRANSFER_PAGE_ROWS); the Durable Object coalesces
  // these puts into a single atomic write.
  await Promise.all(writes.map(({ key, value }) => storage.put(key, value)));
  return { written: writes.length, skipped: rows.length - writes.length };
}

/** Whether a stored rename-lock expiry is still in the future. */
export function isRenameLockActive(expiresAt: unknown, now: number): boolean {
  return typeof expiresAt === 'number' && expiresAt > now;
}
